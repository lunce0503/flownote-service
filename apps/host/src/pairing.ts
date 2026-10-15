import { createHash, randomBytes, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { scrypt as scryptCallback } from "node:crypto";
import { saveConfig, type HostConfig } from "./config.js";

const scrypt = promisify(scryptCallback);
export const PAIRING_TTL_MS = 5 * 60 * 1000;
export class PairingError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export class PairingManager {
  private pending: { hash: string; expiresAt: number } | null = null;
  constructor(private readonly configDir: string, private readonly config: HostConfig, private readonly now = Date.now) {}

  issue(name: string, fingerprint: string, port: number) {
    if (!name.trim() || name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) throw new Error("PC 이름을 확인하세요.");
    const pairingCode = randomBytes(32).toString("base64url");
    const expiresAt = this.now() + PAIRING_TTL_MS;
    this.pending = { hash: this.hash(pairingCode), expiresAt };
    const host = this.config.advertisedHost.includes(":") ? `[${this.config.advertisedHost}]` : this.config.advertisedHost;
    return { type: "flownote-remote-pairing", version: 1, name: name.trim(), endpoint: `wss://${host}:${port}/v1/connect`, certificateFingerprint: fingerprint.replaceAll(":", ""), pairingCode, expiresAt: new Date(expiresAt).toISOString() };
  }

  async redeem(code: string) {
    const pending = this.pending;
    if (!/^[A-Za-z0-9_-]{43}$/.test(code) || !pending || pending.hash !== this.hash(code) || pending.expiresAt <= this.now()) {
      throw new PairingError(401, "등록 코드가 만료되었거나 이미 사용되었습니다.");
    }
    if (this.config.devices.length >= 16) throw new PairingError(409, "등록 가능한 기기 수를 초과했습니다.");
    this.pending = null;
    const token = randomBytes(32).toString("base64url");
    const salt = randomBytes(16);
    const device = {
      id: `phone-${randomUUID()}`, name: "QR paired phone", tokenSalt: salt.toString("base64"),
      tokenHash: (await scrypt(token, salt, 32) as Buffer).toString("base64"),
      createdAt: new Date(this.now()).toISOString(), revokedAt: null,
    };
    this.config.devices.push(device);
    try { await saveConfig(this.configDir, this.config); }
    catch (error) { this.config.devices.splice(this.config.devices.indexOf(device), 1); throw error; }
    return { version: 1, deviceId: device.id, token };
  }
  private hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
}
