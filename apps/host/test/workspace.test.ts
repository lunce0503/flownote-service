import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, link, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { request } from "node:https";
import test from "node:test";
import { Workspace, WorkspaceError, MAX_FILE_BYTES } from "../src/workspace.js";
import { initializeHost, revokeDevice } from "../src/config.js";
import { HostServer } from "../src/server.js";

test("workspace lists, reads UTF-8 and atomically saves with revision conflicts and mode preserved", async () => {
  const root = await mkdtemp(join(tmpdir(), "remote-workspace-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "hello.ts"), "// 한글\r\nconst value = 1;\r\n", { mode: 0o640 });
    await writeFile(join(root, ".env"), "not-for-listing");
    const workspace = new Workspace(root);
    const list = await workspace.execute("list", { path: "" }) as { entries: { name: string }[] };
    assert.deepEqual(list.entries.map(e => e.name), ["src"]);
    const file = await workspace.execute("read", { path: "src/hello.ts" }) as { content: string; revision: string };
    assert.ok(file.content.includes("한글\r\n"));
    const changed = "// 수정\r\nconst value = 2;\r\n";
    const saved = await workspace.execute("write", { path: "src/hello.ts", content: changed, revision: file.revision }) as { revision: string };
    assert.notEqual(saved.revision, file.revision);
    assert.equal(await readFile(join(root, "src/hello.ts"), "utf8"), changed);
    if (process.platform !== "win32") assert.equal((await stat(join(root, "src/hello.ts"))).mode & 0o777, 0o640);
    await assert.rejects(workspace.execute("write", { path: "src/hello.ts", content: "stale", revision: file.revision }), (e: unknown) => e instanceof WorkspaceError && e.status === 409);
    const results = await Promise.allSettled([1, 2].map(i => workspace.execute("write", { path: "src/hello.ts", content: `concurrent ${i}`, revision: saved.revision })));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.deepEqual((await readdir(join(root, "src"))).filter(x => x.startsWith(".flownote-")), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("workspace rejects traversal, secret files, links, binaries, oversized and malformed operations", async () => {
  const root = await mkdtemp(join(tmpdir(), "remote-workspace-guard-"));
  try {
    await writeFile(join(root, "plain.txt"), "plain");
    await writeFile(join(root, ".env.local"), "private");
    await writeFile(join(root, "binary.bin"), Buffer.from([0, 255]));
    await writeFile(join(root, "large.txt"), "x".repeat(MAX_FILE_BYTES + 1));
    const workspace = new Workspace(root);
    for (const path of ["../outside", "/etc/passwd", "C:/Windows/file", "src/../plain.txt", "src\\file", ".env.local", ".ssh/id_rsa", "plain.txt:stream"]) {
      await assert.rejects(workspace.execute("read", { path }), (e: unknown) => e instanceof WorkspaceError && e.status === 403);
    }
    await assert.rejects(workspace.execute("read", { path: "binary.bin" }), (e: unknown) => e instanceof WorkspaceError && e.status === 415);
    await assert.rejects(workspace.execute("read", { path: "large.txt" }), (e: unknown) => e instanceof WorkspaceError && e.status === 413);
    await assert.rejects(workspace.execute("read", { path: "plain.txt", extra: true }));
    await assert.rejects(workspace.execute("read", { path: "missing.txt" }), (e: unknown) => e instanceof WorkspaceError && e.status === 404);
    await link(join(root, "plain.txt"), join(root, "hard.txt"));
    await assert.rejects(workspace.execute("read", { path: "hard.txt" }), (e: unknown) => e instanceof WorkspaceError && e.status === 403);
    if (process.platform !== "win32") {
      await symlink(tmpdir(), join(root, "outside"), "dir");
      await assert.rejects(workspace.execute("list", { path: "outside" }), (e: unknown) => e instanceof WorkspaceError && e.status === 403);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("workspace HTTPS API requires a live device token and exposes no file contents in logs", async () => {
  const root = await mkdtemp(join(tmpdir(), "remote-workspace-api-"));
  const configDir = await mkdtemp(join(tmpdir(), "remote-workspace-config-"));
  await writeFile(join(root, "code.ts"), "export const answer = 42;\n");
  const initialized = await initializeHost({ configDir, advertisedHost: "127.0.0.1", cwd: root });
  const logs: string[] = [];
  const logger = { info: (x: string) => { logs.push(x); }, warn: (x: string) => { logs.push(x); }, error: (x: string) => { logs.push(x); } };
  const server = new HostServer({ configDir, config: initialized.config, port: 0, logger });
  await server.start();
  const ca = await readFile(initialized.config.certPath);
  const call = (op: string, body: object, token = initialized.token) => new Promise<{ status: number; data: any }>((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: server.port, path: `/v1/workspace/${op}`, method: "POST", ca,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` } }, res => {
      let text = ""; res.on("data", value => { text += value; });
      res.on("end", () => resolve({ status: res.statusCode!, data: JSON.parse(text) }));
    });
    req.on("error", reject); req.end(JSON.stringify(body));
  });
  try {
    assert.equal((await call("list", { path: "" }, "invalid-token-long-enough")).status, 401);
    assert.equal((await call("list", { path: "" })).data.entries[0].name, "code.ts");
    const file = await call("read", { path: "code.ts" });
    assert.equal(file.status, 200);
    assert.equal((await call("write", { path: "code.ts", revision: file.data.revision, content: "saved\n" })).status, 200);
    assert.equal((await call("write", { path: "code.ts", revision: file.data.revision, content: "stale" })).status, 409);
    await revokeDevice(configDir, initialized.config, "phone-01");
    assert.equal((await call("read", { path: "code.ts" })).status, 401);
    assert.ok(!logs.join("").includes(initialized.token));
    assert.ok(!logs.join("").includes("export const answer"));
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); await rm(configDir, { recursive: true, force: true }); }
});
