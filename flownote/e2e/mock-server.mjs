import { createServer } from "node:http";
import { Server } from "socket.io";

const port = 4174;
const user = {
  id: "e2e-user",
  username: "e2e",
  email: "e2e@flownote.local",
  nickname: "E2E",
  role: "USER",
};
const state = { saves: [] };

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
};

const httpServer = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }
  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }
  if (request.method === "GET" && url.pathname === "/__e2e/state") {
    sendJson(response, 200, state);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/users/login") {
    sendJson(response, 200, { token: "e2e-token", user });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/users/me") {
    sendJson(response, 200, user);
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/canvas/documents") {
    sendJson(response, 200, [{ id: "e2e-canvas", title: "E2E Canvas" }]);
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/canvas/folders") {
    sendJson(response, 200, []);
    return;
  }

  sendJson(response, 404, { error: "not found" });
});

const io = new Server(httpServer, {
  cors: {
    origin: "http://127.0.0.1:4173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  socket.on("canvas:join", (_payload, acknowledge) => acknowledge?.({ ok: true, data: {} }));
  socket.on("canvas:leave", () => undefined);
  socket.on("canvas:load-cancel", () => undefined);
  socket.on("canvas:load", (payload, acknowledge) => {
    acknowledge?.({
      ok: true,
      data: {
        id: payload.canvasId,
        title: "E2E Canvas",
        revision: state.saves.length,
        loadStatus: "COMPLETE",
        lines: [],
        images: [],
        textBoxes: [],
      },
    });
  });
  socket.on("canvas:save", (payload, acknowledge) => {
    state.saves.push(payload);
    acknowledge?.({
      ok: true,
      data: {
        mutationId: payload.mutationId,
        revision: state.saves.length,
        duplicate: false,
        storageStatus: "READY",
      },
    });
  });
});

httpServer.listen(port, "127.0.0.1");

const shutdown = () => {
  io.close();
  httpServer.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
