import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { authenticateToken, configPathFor, controlSocketPathFor, initializeHost, loadConfig } from "../src/config.js";
import { clientMessageSchema } from "../src/protocol.js";

test("init stores only a token hash in private files", async () => {
  const root = await mkdtemp(join(tmpdir(), "remote-host-config-"));
  try {
    const initialized = await initializeHost({ configDir: root, advertisedHost: "127.0.0.1" });
    const rawConfig = await readFile(configPathFor(root), "utf8");
    assert.equal(rawConfig.includes(initialized.token), false);
    if (process.platform === "win32") {
      assert.match(controlSocketPathFor(root), /^\\\\\.\\pipe\\flownote-remote-host-[a-f0-9]{32}$/);
    } else {
      assert.equal((await stat(root)).mode & 0o777, 0o700);
      assert.equal((await stat(configPathFor(root))).mode & 0o777, 0o600);
      assert.equal((await stat(initialized.config.keyPath)).mode & 0o777, 0o600);
    }
    const certificate = new X509Certificate(await readFile(initialized.config.certPath));
    assert.match(certificate.subjectAltName || "", /IP Address:127\.0\.0\.1/);

    const config = await loadConfig(root);
    assert.equal((await authenticateToken(config, initialized.token))?.id, "phone-01");
    assert.equal(await authenticateToken(config, "wrong-token-value-that-is-long-enough"), null);
    await assert.rejects(() => initializeHost({ configDir: root }), /이미 초기화/);

    if (process.platform !== "win32") {
      await chmod(configPathFor(root), 0o644);
      await assert.rejects(() => loadConfig(root), /권한이 너무 넓습니다/);
      await chmod(configPathFor(root), 0o600);

      const victim = join(root, "victim.txt");
      await writeFile(victim, "must-not-change");
      await unlink(initialized.config.keyPath);
      await symlink(victim, initialized.config.keyPath);
      await assert.rejects(() => initializeHost({ configDir: root, force: true }), /일반 파일이 아닙니다/);
      assert.equal(await readFile(victim, "utf8"), "must-not-change");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("protocol rejects oversized input and unknown fields", () => {
  const base = {
    version: 1,
    type: "terminal.input",
    requestId: "req-1",
    payload: { sessionId: "00000000-0000-4000-8000-000000000000", data: "x".repeat(16 * 1024 + 1) },
  };
  assert.equal(clientMessageSchema.safeParse(base).success, false);
  assert.equal(clientMessageSchema.safeParse({
    version: 1,
    type: "hello",
    requestId: "req-2",
    payload: { clientName: "test" },
    unexpected: true,
  }).success, false);
});
