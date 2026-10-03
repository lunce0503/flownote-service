import { randomUUID } from "node:crypto";
import type { IPty } from "node-pty";
import * as pty from "node-pty";
import {
  MAX_OUTPUT_CHUNK_BYTES,
  MAX_REPLAY_BYTES,
  PROTOCOL_VERSION,
  SESSION_GRACE_MS,
} from "./constants.js";
import type { ErrorCode, ServerMessage } from "./protocol.js";

type OutputRecord = { seq: number; data: string; bytes: number };
export type OutputSink = (message: ServerMessage) => void;

export class SessionError extends Error {
  constructor(public readonly code: ErrorCode, message: string) {
    super(message);
  }
}

const splitUtf8 = (value: string, maxBytes: number) => {
  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes && current) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += character;
    bytes += characterBytes;
  }
  if (current) chunks.push(current);
  return chunks;
};

class TerminalSession {
  readonly id = randomUUID();
  private readonly process: IPty;
  private records: OutputRecord[] = [];
  private recordBytes = 0;
  private sequence = 0;
  private sink: OutputSink | null;
  private expiryTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    readonly ownerDeviceId: string,
    shell: string,
    cwd: string,
    cols: number,
    rows: number,
    sink: OutputSink,
    private readonly onEnded: (sessionId: string) => void,
  ) {
    this.sink = sink;
    this.process = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
    });
    this.process.onData((data) => this.captureOutput(data));
    this.process.onExit(({ exitCode, signal }) => {
      this.closed = true;
      this.clearExpiry();
      this.sink?.({
        version: PROTOCOL_VERSION,
        type: "terminal.exited",
        payload: { sessionId: this.id, exitCode, signal },
      });
      this.onEnded(this.id);
    });
  }

  private captureOutput(data: string) {
    for (const chunk of splitUtf8(data, MAX_OUTPUT_CHUNK_BYTES)) {
      const record = { seq: ++this.sequence, data: chunk, bytes: Buffer.byteLength(chunk, "utf8") };
      this.records.push(record);
      this.recordBytes += record.bytes;
      while (this.recordBytes > MAX_REPLAY_BYTES && this.records.length > 1) {
        const removed = this.records.shift();
        if (removed) this.recordBytes -= removed.bytes;
      }
      this.sink?.({
        version: PROTOCOL_VERSION,
        type: "terminal.output",
        payload: { sessionId: this.id, seq: record.seq, data: record.data },
      });
    }
  }

  attach(deviceId: string, lastSeq: number, sink: OutputSink) {
    this.assertOwner(deviceId);
    if (this.closed) throw new SessionError("SESSION_NOT_FOUND", "터미널 세션이 종료되었습니다.");
    const oldestSequence = this.records[0]?.seq ?? this.sequence + 1;
    if (lastSeq < oldestSequence - 1) {
      throw new SessionError("REPLAY_UNAVAILABLE", "출력 재생 버퍼의 시작보다 오래된 위치입니다.");
    }
    this.clearExpiry();
    this.sink = sink;
    const replay = this.records
      .filter((record) => record.seq > lastSeq)
      .map((record): ServerMessage => ({
          version: PROTOCOL_VERSION,
          type: "terminal.output",
          payload: { sessionId: this.id, seq: record.seq, data: record.data },
      }));
    return { currentSeq: this.sequence, replay };
  }

  detach() {
    this.sink = null;
    this.clearExpiry();
    this.expiryTimer = setTimeout(() => this.close(), SESSION_GRACE_MS);
    this.expiryTimer.unref();
  }

  write(deviceId: string, data: string) {
    this.assertOwner(deviceId);
    if (this.closed) throw new SessionError("SESSION_NOT_FOUND", "터미널 세션이 종료되었습니다.");
    this.process.write(data);
  }

  resize(deviceId: string, cols: number, rows: number) {
    this.assertOwner(deviceId);
    if (this.closed) throw new SessionError("SESSION_NOT_FOUND", "터미널 세션이 종료되었습니다.");
    this.process.resize(cols, rows);
  }

  close(deviceId?: string) {
    if (deviceId) this.assertOwner(deviceId);
    if (this.closed) return;
    this.closed = true;
    this.clearExpiry();
    this.sink = null;
    this.process.kill();
  }

  status() {
    return { sessionId: this.id, ownerDeviceId: this.ownerDeviceId, lastSeq: this.sequence, attached: Boolean(this.sink) };
  }

  private assertOwner(deviceId: string) {
    if (deviceId !== this.ownerDeviceId) throw new SessionError("SESSION_OWNERSHIP", "이 기기가 소유한 세션이 아닙니다.");
  }

  private clearExpiry() {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
  }
}

export class SessionManager {
  private session: TerminalSession | null = null;

  constructor(private readonly shell: string, private readonly cwd: string) {}

  create(deviceId: string, cols: number, rows: number, sink: OutputSink) {
    if (this.session) throw new SessionError("SESSION_CONFLICT", "동시에 하나의 터미널만 열 수 있습니다.");
    const session = new TerminalSession(deviceId, this.shell, this.cwd, cols, rows, sink, (sessionId) => {
      if (this.session?.id === sessionId) this.session = null;
    });
    this.session = session;
    return session.status();
  }

  attach(deviceId: string, sessionId: string, lastSeq: number, sink: OutputSink) {
    const session = this.requireSession(sessionId);
    const { currentSeq, replay } = session.attach(deviceId, lastSeq, sink);
    return { ...session.status(), currentSeq, replay };
  }

  write(deviceId: string, sessionId: string, data: string) {
    this.requireSession(sessionId).write(deviceId, data);
  }

  resize(deviceId: string, sessionId: string, cols: number, rows: number) {
    this.requireSession(sessionId).resize(deviceId, cols, rows);
  }

  close(deviceId: string, sessionId: string) {
    const session = this.requireSession(sessionId);
    session.close(deviceId);
    if (this.session?.id === sessionId) this.session = null;
  }

  detachDevice(deviceId: string) {
    if (this.session?.ownerDeviceId === deviceId) this.session.detach();
  }

  revokeDevice(deviceId: string) {
    if (this.session?.ownerDeviceId === deviceId) {
      this.session.close(deviceId);
      this.session = null;
    }
  }

  shutdown() {
    this.session?.close();
    this.session = null;
  }

  status() {
    return this.session?.status() ?? null;
  }

  private requireSession(sessionId: string) {
    if (!this.session || this.session.id !== sessionId) throw new SessionError("SESSION_NOT_FOUND", "터미널 세션을 찾을 수 없습니다.");
    return this.session;
  }
}
