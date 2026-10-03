import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { WebSocket } from "ws";
import { controlSocketPathFor, initializeHost } from "../src/config.js";
import { sendControlRequest } from "../src/control.js";
import { HostServer } from "../src/server.js";
import type { ServerMessage } from "../src/protocol.js";

const quietLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

class MessageCollector {
  private messages: ServerMessage[] = [];
  private waiters: Array<() => void> = [];

  constructor(socket: WebSocket) {
    socket.on("message", (raw) => {
      this.messages.push(JSON.parse(raw.toString()) as ServerMessage);
      this.waiters.splice(0).forEach((resolve) => resolve());
    });
  }

  async take(predicate: (message: ServerMessage) => boolean, timeoutMs = 10_000): Promise<ServerMessage> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const index = this.messages.findIndex(predicate);
      if (index >= 0) return this.messages.splice(index, 1)[0]!;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("message timeout")), Math.min(250, deadline - Date.now()));
        this.waiters.push(() => { clearTimeout(timer); resolve(); });
      }).catch(() => undefined);
    }
    throw new Error("message timeout");
  }
}

const openSocket = (url: string, token: string) => new Promise<WebSocket>((resolve, reject) => {
  const socket = new WebSocket(url, { rejectUnauthorized: false, headers: { Authorization: `Bearer ${token}` } });
  socket.once("open", () => resolve(socket));
  socket.once("error", reject);
});

test("authenticated WSS client can create, drive, reattach and close a PTY", async () => {
  const root = await mkdtemp(join(tmpdir(), "remote-host-server-"));
  const initialized = await initializeHost({ configDir: root, advertisedHost: "127.0.0.1" });
  const server = new HostServer({ configDir: root, config: initialized.config, bind: "127.0.0.1", port: 0, logger: quietLogger });
  await server.start();
  const url = `wss://127.0.0.1:${server.port}/v1/connect`;

  try {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url, { rejectUnauthorized: false, headers: { Authorization: "Bearer invalid-token-value-that-is-long-enough" } });
      socket.once("unexpected-response", (_request, response) => {
        assert.equal(response.statusCode, 401);
        socket.terminate();
        resolve();
      });
      socket.once("open", () => reject(new Error("invalid token connected")));
      socket.once("error", () => undefined);
    });

    const first = await openSocket(url, initialized.token);
    const firstMessages = new MessageCollector(first);
    await new Promise<void>((resolve, reject) => {
      const competing = new WebSocket(url, { rejectUnauthorized: false, headers: { Authorization: `Bearer ${initialized.token}` } });
      competing.once("unexpected-response", (_request, response) => {
        assert.equal(response.statusCode, 409);
        competing.terminate();
        resolve();
      });
      competing.once("open", () => reject(new Error("competing writer connected")));
      competing.once("error", () => undefined);
    });
    first.send(JSON.stringify({ version: 1, type: "hello", requestId: "hello-1", payload: { clientName: "integration" } }));
    assert.equal((await firstMessages.take((message) => message.type === "hello.result")).payload.protocolVersion, 1);

    first.send(JSON.stringify({ version: 1, type: "terminal.create", requestId: "create-1", payload: { cols: 80, rows: 24 } }));
    const created = await firstMessages.take((message) => message.type === "terminal.created");
    const sessionId = created.payload.sessionId as string;
    assert.match(sessionId, /^[0-9a-f-]{36}$/);

    const terminalCommand = process.platform === "win32"
      ? "Write-Output '__REMOTE_HOST_OK__'\r"
      : "printf '__REMOTE_HOST_OK__\\n'\r";
    first.send(JSON.stringify({ version: 1, type: "terminal.input", requestId: "input-1", payload: { sessionId, data: terminalCommand } }));
    const output = await firstMessages.take((message) => message.type === "terminal.output" && String(message.payload.data).includes("__REMOTE_HOST_OK__"));
    const lastSeq = output.payload.seq as number;
    first.close();
    await new Promise<void>((resolve) => first.once("close", () => resolve()));

    const second = await openSocket(url, initialized.token);
    const secondMessages = new MessageCollector(second);
    second.send(JSON.stringify({ version: 1, type: "terminal.attach", requestId: "attach-1", payload: { sessionId, lastSeq } }));
    assert.equal((await secondMessages.take((message) => message.type === "terminal.attached")).payload.sessionId, sessionId);

    second.send(JSON.stringify({ version: 1, type: "terminal.resize", requestId: "resize-1", payload: { sessionId, cols: 100, rows: 30 } }));
    assert.equal((await secondMessages.take((message) => message.type === "terminal.resized")).payload.cols, 100);
    second.send(JSON.stringify({ version: 1, type: "terminal.close", requestId: "close-1", payload: { sessionId } }));
    assert.equal((await secondMessages.take((message) => message.type === "terminal.closed")).payload.sessionId, sessionId);
    const revokedClose = new Promise<number>((resolve) => second.once("close", (code) => resolve(code)));
    const revoked = await sendControlRequest(controlSocketPathFor(root), { action: "revoke", deviceId: "phone-01" }) as { deviceId: string };
    assert.equal(revoked.deviceId, "phone-01");
    assert.equal(await revokedClose, 4403);

    await new Promise<void>((resolve, reject) => {
      const revokedSocket = new WebSocket(url, { rejectUnauthorized: false, headers: { Authorization: `Bearer ${initialized.token}` } });
      revokedSocket.once("unexpected-response", (_request, response) => {
        assert.equal(response.statusCode, 401);
        revokedSocket.terminate();
        resolve();
      });
      revokedSocket.once("open", () => reject(new Error("revoked token connected")));
      revokedSocket.once("error", () => undefined);
    });
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
