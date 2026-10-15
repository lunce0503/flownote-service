import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { request } from "node:https";
import test from "node:test";
import { authenticateToken, initializeHost, loadConfig, readCertificateFingerprint, controlSocketPathFor } from "../src/config.js";
import { PairingManager, PAIRING_TTL_MS } from "../src/pairing.js";
import { HostServer } from "../src/server.js";
import { sendControlRequest } from "../src/control.js";

test("pairing invitations expire, replace old invitations and redeem once without disturbing existing devices", async () => {
  const directory = await mkdtemp(join(tmpdir(), "remote-pairing-"));
  try {
    const initialized = await initializeHost({ configDir: directory, advertisedHost: "127.0.0.1" });
    let now = Date.now();
    const manager = new PairingManager(directory, initialized.config, () => now);
    const fingerprint = await readCertificateFingerprint(initialized.config.certPath);
    const first = manager.issue("PC", fingerprint, 7443);
    assert.equal("token" in first, false);
    const current = manager.issue("PC", fingerprint, 7443);
    await assert.rejects(manager.redeem(first.pairingCode));
    await assert.rejects(manager.redeem("x".repeat(43)));
    const results = await Promise.allSettled([manager.redeem(current.pairingCode), manager.redeem(current.pairingCode)]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const issued = results.find(result => result.status === "fulfilled")!;
    assert.equal(issued.status, "fulfilled");
    if (issued.status !== "fulfilled") return;
    const config = await loadConfig(directory);
    assert.equal(config.devices.length, 2);
    assert.equal((await authenticateToken(config, issued.value.token))?.id, issued.value.deviceId);
    assert.equal((await authenticateToken(config, initialized.token))?.id, "phone-01");
    const expired = manager.issue("PC", fingerprint, 7443);
    now += PAIRING_TTL_MS;
    await assert.rejects(manager.redeem(expired.pairingCode));
    assert.equal((await loadConfig(directory)).devices.length, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("pair IPC and bounded TLS enrollment return a usable token and reject reuse and extra fields", async () => {
  const directory = await mkdtemp(join(tmpdir(), "remote-pairing-api-"));
  const initialized = await initializeHost({ configDir: directory, advertisedHost: "127.0.0.1" });
  const server = new HostServer({ configDir: directory, config: initialized.config, port: 0, logger: { info() {}, warn() {}, error() {} } });
  await server.start();
  const cert = await readFile(initialized.config.certPath);
  const post = (body: object) => new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const call = request({ hostname: "127.0.0.1", port: server.port, path: "/v1/pair", method: "POST", ca: cert, headers: { "Content-Type": "application/json" } }, reply => {
      let text = "";
      reply.on("data", value => { text += value; });
      reply.on("end", () => resolve({ status: reply.statusCode!, body: JSON.parse(text) }));
    });
    call.on("error", reject); call.end(JSON.stringify(body));
  });
  try {
    const invitation = await sendControlRequest(controlSocketPathFor(directory), { action: "pair", name: "Work PC" }) as { pairingCode: string };
    assert.equal((await post({ pairingCode: invitation.pairingCode, extra: true })).status, 400);
    const response = await post({ pairingCode: invitation.pairingCode });
    assert.equal(response.status, 200);
    assert.equal(typeof response.body.token, "string");
    assert.ok(await authenticateToken(await loadConfig(directory), response.body.token as string));
    assert.equal((await post({ pairingCode: invitation.pairingCode })).status, 401);
    assert.equal((server.status().devices).length, 2);
    assert.equal(server.status().session, null);
  } finally { await server.close(); await rm(directory, { recursive: true, force: true }); }
});
