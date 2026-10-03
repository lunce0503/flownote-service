import { createConnection, createServer, type Server, type Socket } from "node:net";
import { chmod, lstat, unlink } from "node:fs/promises";

type ControlRequest = { action: "status" } | { action: "revoke"; deviceId: string };
type ControlResponse = { ok: boolean; data?: unknown; error?: string };

const MAX_CONTROL_REQUEST_BYTES = 4096;

const readJsonLine = (socket: Socket) => new Promise<unknown>((resolve, reject) => {
  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    if (Buffer.byteLength(buffer, "utf8") > MAX_CONTROL_REQUEST_BYTES) {
      reject(new Error("제어 요청이 너무 큽니다."));
      socket.destroy();
      return;
    }
    const newline = buffer.indexOf("\n");
    if (newline < 0) return;
    try {
      resolve(JSON.parse(buffer.slice(0, newline)));
    } catch {
      reject(new Error("잘못된 제어 응답입니다."));
    }
  });
  socket.once("error", reject);
  socket.once("end", () => {
    if (!buffer.includes("\n")) reject(new Error("제어 연결이 응답 전에 종료되었습니다."));
  });
});

const removeStaleSocket = async (socketPath: string) => {
  try {
    const stat = await lstat(socketPath);
    if (!stat.isSocket()) throw new Error(`제어 소켓 경로가 소켓이 아닙니다: ${socketPath}`);
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection(socketPath);
      socket.once("connect", () => {
        socket.destroy();
        reject(new Error("원격 허브가 이미 실행 중입니다."));
      });
      socket.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "ECONNREFUSED" || error.code === "ENOENT") resolve();
        else reject(error);
      });
    });
    await unlink(socketPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

export const startControlServer = async (
  socketPath: string,
  handler: (request: ControlRequest) => Promise<unknown>,
): Promise<Server> => {
  await removeStaleSocket(socketPath);
  const server = createServer((socket) => {
    void readJsonLine(socket).then(async (value) => {
      const request = value as Partial<ControlRequest>;
      if (request.action !== "status" && request.action !== "revoke") throw new Error("지원하지 않는 제어 요청입니다.");
      if (request.action === "revoke" && (typeof request.deviceId !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(request.deviceId))) {
        throw new Error("올바른 deviceId가 필요합니다.");
      }
      const data = await handler(request as ControlRequest);
      socket.end(`${JSON.stringify({ ok: true, data } satisfies ControlResponse)}\n`);
    }).catch((error) => {
      socket.end(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies ControlResponse)}\n`);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  await chmod(socketPath, 0o600);
  server.on("close", () => { void unlink(socketPath).catch(() => undefined); });
  return server;
};

export const sendControlRequest = async (socketPath: string, request: ControlRequest) => {
  const socket = createConnection(socketPath);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  socket.write(`${JSON.stringify(request)}\n`);
  const response = await readJsonLine(socket) as ControlResponse;
  socket.destroy();
  if (!response.ok) throw new Error(response.error || "제어 요청이 실패했습니다.");
  return response.data;
};
