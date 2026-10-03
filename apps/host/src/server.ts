import { readFile } from "node:fs/promises";
import { createServer, type Server as HttpsServer } from "node:https";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  MAX_MESSAGE_BYTES,
  MAX_SOCKET_BUFFER_BYTES,
  PROTOCOL_VERSION,
  REQUEST_CACHE_MS,
} from "./constants.js";
import {
  assertRuntimeFiles,
  authenticateToken,
  controlSocketPathFor,
  readCertificateFingerprint,
  revokeDevice,
  type DeviceConfig,
  type HostConfig,
} from "./config.js";
import { startControlServer } from "./control.js";
import { clientMessageSchema, errorResponse, response, type ClientMessage, type ServerMessage } from "./protocol.js";
import { SessionError, SessionManager } from "./session.js";

type Logger = Pick<Console, "info" | "warn" | "error">;
type AuthFailure = { failures: number[]; blockedUntil: number };
type CachedResponse = { expiresAt: number; message: ServerMessage; socket: WebSocket };

const authHeaderToken = (header: string | string[] | undefined) => {
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer ([A-Za-z0-9_-]{20,256})$/);
  return match?.[1] ?? null;
};

const writeUpgradeError = (socket: Duplex, status: number, reason: string) => {
  const body = `${reason}\n`;
  socket.end([
    `HTTP/1.1 ${status} ${reason}`,
    "Connection: close",
    "Content-Type: text/plain; charset=utf-8",
    `Content-Length: ${Buffer.byteLength(body)}`,
    "",
    body,
  ].join("\r\n"));
};

export type HostServerOptions = {
  configDir: string;
  config: HostConfig;
  bind?: string;
  port?: number;
  logger?: Logger;
};

export class HostServer {
  private readonly websocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  private readonly sessions: SessionManager;
  private readonly logger: Logger;
  private readonly authFailures = new Map<string, AuthFailure>();
  private readonly responseCache = new Map<string, CachedResponse>();
  private readonly sockets = new Set<WebSocket>();
  private httpsServer: HttpsServer | null = null;
  private controlServer: import("node:net").Server | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private activeWriter: { socket: WebSocket; deviceId: string; lastPongAt: number } | null = null;
  private fingerprint = "";

  constructor(private readonly options: HostServerOptions) {
    this.sessions = new SessionManager(options.config.shell, options.config.cwd);
    this.logger = options.logger || console;
  }

  async start() {
    if (this.httpsServer) throw new Error("원격 허브가 이미 시작되었습니다.");
    await assertRuntimeFiles(this.options.config);
    this.fingerprint = await readCertificateFingerprint(this.options.config.certPath);
    const [cert, key] = await Promise.all([
      readFile(this.options.config.certPath),
      readFile(this.options.config.keyPath),
    ]);

    this.httpsServer = createServer({ cert, key, minVersion: "TLSv1.2", maxHeaderSize: 16 * 1024 }, (request, reply) => {
      if (request.method === "GET" && request.url === "/health") {
        reply.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        reply.end(JSON.stringify({ status: "ok", protocolVersion: PROTOCOL_VERSION }));
        return;
      }
      reply.writeHead(404, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      reply.end("Not found\n");
    });

    this.httpsServer.on("upgrade", (request, socket, head) => {
      void this.handleUpgrade(request, socket, head).catch((error) => {
        this.logger.warn(JSON.stringify({ event: "upgrade_error", message: error instanceof Error ? error.message : String(error) }));
        if (!socket.destroyed) writeUpgradeError(socket, 500, "Internal Server Error");
      });
    });
    this.websocketServer.on("connection", (socket: WebSocket, _request: IncomingMessage, device: DeviceConfig) => this.handleConnection(socket, device));

    const bind = this.options.bind || this.options.config.bind;
    const port = this.options.port ?? this.options.config.port;
    await new Promise<void>((resolve, reject) => {
      this.httpsServer?.once("error", reject);
      this.httpsServer?.listen(port, bind, resolve);
    });

    try {
      this.controlServer = await startControlServer(controlSocketPathFor(this.options.configDir), async (request) => {
        if (request.action === "status") return this.status();
        const revoked = await revokeDevice(this.options.configDir, this.options.config, request.deviceId);
        if (this.activeWriter?.deviceId === revoked.id) this.activeWriter.socket.close(4403, "Device revoked");
        this.sessions.revokeDevice(revoked.id);
        this.logger.info(JSON.stringify({ event: "device_revoked", deviceId: revoked.id }));
        return { deviceId: revoked.id, revokedAt: revoked.revokedAt };
      });
    } catch (error) {
      await new Promise<void>((resolve) => this.httpsServer?.close(() => resolve()));
      this.httpsServer = null;
      throw error;
    }

    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref();
    this.logger.info(JSON.stringify({ event: "host_started", bind, port: this.port, protocolVersion: PROTOCOL_VERSION }));
    return this.status();
  }

  async close() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.sessions.shutdown();
    for (const socket of this.sockets) socket.terminate();
    this.sockets.clear();
    this.activeWriter = null;
    this.websocketServer.close();
    await Promise.all([
      this.controlServer ? new Promise<void>((resolve) => this.controlServer?.close(() => resolve())) : Promise.resolve(),
      this.httpsServer ? new Promise<void>((resolve) => this.httpsServer?.close(() => resolve())) : Promise.resolve(),
    ]);
    this.controlServer = null;
    this.httpsServer = null;
    this.logger.info(JSON.stringify({ event: "host_stopped" }));
  }

  status() {
    return {
      running: Boolean(this.httpsServer?.listening),
      hostId: this.options.config.hostId,
      bind: this.options.bind || this.options.config.bind,
      advertisedHost: this.options.config.advertisedHost,
      port: this.port,
      fingerprint: this.fingerprint,
      activeDeviceId: this.activeWriter?.deviceId ?? null,
      session: this.sessions.status(),
      devices: this.options.config.devices.map(({ id, name, createdAt, revokedAt }) => ({ id, name, createdAt, revokedAt })),
    };
  }

  get port() {
    const address = this.httpsServer?.address();
    return typeof address === "object" && address ? address.port : (this.options.port ?? this.options.config.port);
  }

  private async handleUpgrade(request: import("node:http").IncomingMessage, socket: Duplex, head: Buffer) {
    const requestPath = new URL(request.url || "/", "https://remote-host.invalid").pathname;
    if (requestPath !== "/v1/connect") {
      writeUpgradeError(socket, 404, "Not Found");
      return;
    }
    const remoteAddress = request.socket.remoteAddress || "unknown";
    if (this.isAuthBlocked(remoteAddress)) {
      writeUpgradeError(socket, 429, "Too Many Requests");
      return;
    }
    const token = authHeaderToken(request.headers.authorization);
    const device = token ? await authenticateToken(this.options.config, token) : null;
    if (!device) {
      this.recordAuthFailure(remoteAddress);
      this.logger.warn(JSON.stringify({ event: "authentication_failed", remoteAddress }));
      writeUpgradeError(socket, 401, "Unauthorized");
      return;
    }
    this.authFailures.delete(remoteAddress);
    if (this.activeWriter?.socket.readyState === WebSocket.OPEN) {
      writeUpgradeError(socket, 409, "Writer Already Connected");
      return;
    }
    this.websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      this.websocketServer.emit("connection", websocket, request, device);
    });
  }

  private handleConnection(socket: WebSocket, device: DeviceConfig) {
    if (this.activeWriter?.socket.readyState === WebSocket.OPEN) {
      socket.close(4409, "Writer already connected");
      return;
    }
    this.sockets.add(socket);
    this.activeWriter = { socket, deviceId: device.id, lastPongAt: Date.now() };
    this.logger.info(JSON.stringify({ event: "client_connected", deviceId: device.id }));
    socket.on("pong", () => {
      if (this.activeWriter?.socket === socket) this.activeWriter.lastPongAt = Date.now();
    });
    socket.on("message", (raw, isBinary) => {
      if (isBinary) {
        this.send(socket, errorResponse(undefined, "BAD_MESSAGE", "바이너리 메시지는 지원하지 않습니다."));
        return;
      }
      void this.handleMessage(socket, device, raw.toString("utf8"));
    });
    socket.on("close", () => {
      this.sockets.delete(socket);
      if (this.activeWriter?.socket === socket) {
        this.activeWriter = null;
        this.sessions.detachDevice(device.id);
      }
      this.logger.info(JSON.stringify({ event: "client_disconnected", deviceId: device.id }));
    });
    socket.on("error", (error) => {
      this.logger.warn(JSON.stringify({ event: "websocket_error", deviceId: device.id, message: error.message }));
    });
  }

  private async handleMessage(socket: WebSocket, device: DeviceConfig, raw: string) {
    let message: ClientMessage;
    try {
      if (Buffer.byteLength(raw, "utf8") > MAX_MESSAGE_BYTES) throw new Error("메시지가 64 KiB를 초과했습니다.");
      message = clientMessageSchema.parse(JSON.parse(raw));
    } catch (error) {
      this.send(socket, errorResponse(undefined, "BAD_MESSAGE", error instanceof Error ? error.message : "잘못된 메시지입니다."));
      return;
    }

    const cacheKey = `${device.id}:${message.requestId}`;
    const sink = (event: ServerMessage) => this.send(socket, event);
    const cached = this.responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.socket !== socket && cached.message.type === "terminal.created") {
        const sessionId = cached.message.payload.sessionId;
        if (typeof sessionId === "string") {
          try {
            const { replay, ...status } = this.sessions.attach(device.id, sessionId, 0, sink);
            const restored = response("terminal.created", message.requestId, status);
            this.send(socket, restored);
            replay.forEach(sink);
            return;
          } catch (error) {
            if (error instanceof SessionError) {
              this.send(socket, errorResponse(message.requestId, error.code, error.message));
              return;
            }
          }
        }
      }
      this.send(socket, cached.message);
      return;
    }

    try {
      let result: ServerMessage | null = null;
      switch (message.type) {
        case "hello":
          result = response("hello.result", message.requestId, {
            hostId: this.options.config.hostId,
            protocolVersion: PROTOCOL_VERSION,
            features: ["terminal", "resize", "reattach", "replay"],
          });
          break;
        case "terminal.create": {
          const status = this.sessions.create(device.id, message.payload.cols, message.payload.rows, sink);
          result = response("terminal.created", message.requestId, status);
          break;
        }
        case "terminal.input":
          this.sessions.write(device.id, message.payload.sessionId, message.payload.data);
          break;
        case "terminal.resize":
          this.sessions.resize(device.id, message.payload.sessionId, message.payload.cols, message.payload.rows);
          result = response("terminal.resized", message.requestId, {
            sessionId: message.payload.sessionId,
            cols: message.payload.cols,
            rows: message.payload.rows,
          });
          break;
        case "terminal.attach": {
          const { replay, ...status } = this.sessions.attach(device.id, message.payload.sessionId, message.payload.lastSeq, sink);
          this.send(socket, response("terminal.attached", message.requestId, status));
          replay.forEach(sink);
          break;
        }
        case "terminal.close":
          this.sessions.close(device.id, message.payload.sessionId);
          result = response("terminal.closed", message.requestId, { sessionId: message.payload.sessionId });
          break;
      }
      if (result) {
        if (message.type === "terminal.create") {
          this.responseCache.set(cacheKey, { expiresAt: Date.now() + REQUEST_CACHE_MS, message: result, socket });
          setTimeout(() => this.responseCache.delete(cacheKey), REQUEST_CACHE_MS).unref();
        }
        this.send(socket, result);
      }
    } catch (error) {
      if (error instanceof SessionError) this.send(socket, errorResponse(message.requestId, error.code, error.message));
      else {
        this.logger.error(JSON.stringify({ event: "message_error", type: message.type, message: error instanceof Error ? error.message : String(error) }));
        this.send(socket, errorResponse(message.requestId, "INTERNAL_ERROR", "요청 처리 중 오류가 발생했습니다."));
      }
    }
  }

  private send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > MAX_SOCKET_BUFFER_BYTES) {
      socket.close(1013, "Output backpressure");
      return;
    }
    socket.send(JSON.stringify(message));
  }

  private heartbeat() {
    const active = this.activeWriter;
    if (!active) return;
    if (Date.now() - active.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
      active.socket.terminate();
      return;
    }
    if (active.socket.readyState === WebSocket.OPEN) active.socket.ping();
  }

  private isAuthBlocked(remoteAddress: string) {
    const state = this.authFailures.get(remoteAddress);
    return Boolean(state && state.blockedUntil > Date.now());
  }

  private recordAuthFailure(remoteAddress: string) {
    const now = Date.now();
    const state = this.authFailures.get(remoteAddress) || { failures: [], blockedUntil: 0 };
    state.failures = state.failures.filter((timestamp) => now - timestamp < 60_000);
    state.failures.push(now);
    if (state.failures.length >= 5) state.blockedUntil = now + 60_000;
    this.authFailures.set(remoteAddress, state);
  }
}
