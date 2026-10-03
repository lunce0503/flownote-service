import { execFileSync } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, chmod, lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import { generate } from "selfsigned";
import { z } from "zod";
import { CONFIG_FILE_NAME, CONTROL_SOCKET_NAME, DEFAULT_BIND, DEFAULT_PORT } from "./constants.js";

const scrypt = promisify(scryptCallback);

const deviceSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/),
  name: z.string().min(1).max(120),
  tokenSalt: z.string().min(16),
  tokenHash: z.string().min(32),
  createdAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
}).strict();

const configSchema = z.object({
  version: z.literal(1),
  hostId: z.string().uuid(),
  bind: z.string().min(1).max(255),
  advertisedHost: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  shell: z.string().min(1),
  cwd: z.string().min(1),
  certPath: z.string().min(1),
  keyPath: z.string().min(1),
  createdAt: z.string().datetime(),
  devices: z.array(deviceSchema).min(1).max(16),
}).strict();

export type HostConfig = z.infer<typeof configSchema>;
export type DeviceConfig = z.infer<typeof deviceSchema>;

export const defaultConfigDir = () => process.platform === "win32"
  ? join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Flownote", "RemoteHost")
  : join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "flownote-remote-host");
export const resolveConfigDir = (input?: string) => resolve(input || defaultConfigDir());
export const configPathFor = (configDir: string) => join(configDir, CONFIG_FILE_NAME);
export const controlSocketPathFor = (configDir: string) => {
  if (process.platform !== "win32") return join(configDir, CONTROL_SOCKET_NAME);
  const suffix = createHash("sha256").update(resolve(configDir).toLowerCase()).digest("hex").slice(0, 32);
  return `\\\\.\\pipe\\flownote-remote-host-${suffix}`;
};

export const defaultShell = () => process.platform === "win32"
  ? join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : (process.env.SHELL || "/bin/bash");

const executableAccessMode = () => process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK;

const hashToken = async (token: string, salt: Buffer) => {
  const derived = await scrypt(token, salt, 32) as Buffer;
  return derived.toString("base64");
};

const validateHost = (value: string) => {
  const dnsName = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value) && !value.includes("..");
  if (!isIP(value) && !dnsName) throw new Error("Host에는 IP 주소나 DNS 이름만 사용할 수 있습니다.");
  return value;
};

const secureWindowsAcl = (path: string, directory: boolean) => {
  const sid = execFileSync("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
    "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
  ], { encoding: "utf8", windowsHide: true }).trim();
  const inheritance = directory ? "(OI)(CI)F" : "F";
  execFileSync("icacls.exe", [
    path,
    "/inheritance:r",
    "/grant:r",
    `*${sid}:${inheritance}`,
    `*S-1-5-18:${inheritance}`,
  ], { stdio: "ignore", windowsHide: true });
};

const ensurePrivateDirectory = async (path: string) => {
  try {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`설정 경로가 일반 디렉터리가 아닙니다: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(path, { recursive: true, mode: 0o700 });
  }
  if (process.platform === "win32") secureWindowsAcl(path, true);
  else await chmod(path, 0o700);
};

const ensureRegularFile = async (path: string, requirePrivate = false) => {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`일반 파일이 아닙니다: ${path}`);
  if (requirePrivate) {
    if (process.platform === "win32") secureWindowsAcl(path, false);
    else if ((stat.mode & 0o077) !== 0) throw new Error(`파일 권한이 너무 넓습니다. 0600으로 변경하세요: ${path}`);
  }
};

const rejectUnsafeExistingFile = async (path: string) => {
  try {
    await ensureRegularFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

export const saveConfig = async (configDir: string, config: HostConfig) => {
  const parsed = configSchema.parse(config);
  await ensurePrivateDirectory(configDir);
  const target = configPathFor(configDir);
  const temporary = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  if (process.platform !== "win32") await chmod(temporary, 0o600);
  await rename(temporary, target);
  await ensureRegularFile(target, true);
};

export const loadConfig = async (configDir: string): Promise<HostConfig> => {
  const target = configPathFor(configDir);
  await ensurePrivateDirectory(configDir);
  await ensureRegularFile(target, true);
  const parsed = configSchema.parse(JSON.parse(await readFile(target, "utf8")));
  if (!isAbsolute(parsed.certPath) || !isAbsolute(parsed.keyPath) || !isAbsolute(parsed.shell) || !isAbsolute(parsed.cwd)) {
    throw new Error("인증서, 키, 셸과 작업 디렉터리는 절대 경로여야 합니다.");
  }
  await Promise.all([ensureRegularFile(parsed.certPath), ensureRegularFile(parsed.keyPath, true)]);
  await access(parsed.shell, executableAccessMode());
  return parsed;
};

export type InitOptions = {
  configDir: string;
  bind?: string;
  advertisedHost?: string;
  port?: number;
  deviceId?: string;
  deviceName?: string;
  shell?: string;
  cwd?: string;
  force?: boolean;
};

export type InitResult = { config: HostConfig; token: string; fingerprint: string };

export const initializeHost = async (options: InitOptions): Promise<InitResult> => {
  const configDir = resolve(options.configDir);
  await ensurePrivateDirectory(configDir);
  const target = configPathFor(configDir);
  if (!options.force) {
    let configExists = false;
    try {
      await access(target);
      configExists = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (configExists) throw new Error(`이미 초기화되어 있습니다: ${target}`);
  }

  const advertisedHost = validateHost(options.advertisedHost || options.bind || DEFAULT_BIND);
  const certPath = join(configDir, "host-cert.pem");
  const keyPath = join(configDir, "host-key.pem");
  await Promise.all([rejectUnsafeExistingFile(certPath), rejectUnsafeExistingFile(keyPath)]);
  const shell = resolve(options.shell || defaultShell());
  const cwd = resolve(options.cwd || homedir());
  await Promise.all([access(shell, executableAccessMode()), access(cwd, fsConstants.R_OK)]);
  const notBeforeDate = new Date(Date.now() - 5 * 60 * 1000);
  const notAfterDate = new Date(notBeforeDate);
  notAfterDate.setUTCDate(notAfterDate.getUTCDate() + 825);
  const advertisedAltName = isIP(advertisedHost)
    ? { type: 7 as const, ip: advertisedHost }
    : { type: 2 as const, value: advertisedHost };
  const certificate = await generate([{ name: "commonName", value: advertisedHost }], {
    keyType: "rsa",
    keySize: 3072,
    algorithm: "sha256",
    notBeforeDate,
    notAfterDate,
    extensions: [
      { name: "basicConstraints", cA: false, critical: true },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
      { name: "extKeyUsage", serverAuth: true },
      {
        name: "subjectAltName",
        altNames: [advertisedAltName, { type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }],
      },
    ],
  });
  const certTemporary = `${certPath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const keyTemporary = `${keyPath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await Promise.all([
    writeFile(certTemporary, certificate.cert, { mode: 0o600, flag: "wx" }),
    writeFile(keyTemporary, certificate.private, { mode: 0o600, flag: "wx" }),
  ]);
  if (process.platform !== "win32") await Promise.all([chmod(certTemporary, 0o600), chmod(keyTemporary, 0o600)]);
  await Promise.all([rename(certTemporary, certPath), rename(keyTemporary, keyPath)]);
  await ensureRegularFile(keyPath, true);

  const token = randomBytes(32).toString("base64url");
  const salt = randomBytes(16);
  const now = new Date().toISOString();
  const config: HostConfig = {
    version: 1,
    hostId: randomUUID(),
    bind: validateHost(options.bind || DEFAULT_BIND),
    advertisedHost,
    port: options.port || DEFAULT_PORT,
    shell,
    cwd,
    certPath,
    keyPath,
    createdAt: now,
    devices: [{
      id: options.deviceId || "phone-01",
      name: options.deviceName || "Android phone",
      tokenSalt: salt.toString("base64"),
      tokenHash: await hashToken(token, salt),
      createdAt: now,
      revokedAt: null,
    }],
  };
  await saveConfig(configDir, config);
  return { config, token, fingerprint: await readCertificateFingerprint(certPath) };
};

export const readCertificateFingerprint = async (certPath: string) => {
  const certificate = new X509Certificate(await readFile(certPath));
  return certificate.fingerprint256;
};

export const authenticateToken = async (config: HostConfig, token: string): Promise<DeviceConfig | null> => {
  if (!token || Buffer.byteLength(token, "utf8") > 256) return null;
  for (const device of config.devices) {
    if (device.revokedAt) continue;
    const expected = Buffer.from(device.tokenHash, "base64");
    const actual = await scrypt(token, Buffer.from(device.tokenSalt, "base64"), expected.length) as Buffer;
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) return device;
  }
  return null;
};

export const revokeDevice = async (configDir: string, config: HostConfig, deviceId: string) => {
  const device = config.devices.find((candidate) => candidate.id === deviceId);
  if (!device) throw new Error(`기기를 찾을 수 없습니다: ${deviceId}`);
  if (!device.revokedAt) device.revokedAt = new Date().toISOString();
  await saveConfig(configDir, config);
  return device;
};

export const assertRuntimeFiles = async (config: HostConfig) => {
  await access(config.shell, executableAccessMode());
  await access(config.cwd, fsConstants.R_OK);
  await Promise.all([ensureRegularFile(config.certPath), ensureRegularFile(config.keyPath, true)]);
  if (dirname(config.certPath) !== dirname(config.keyPath)) throw new Error("인증서와 키는 같은 설정 디렉터리에 있어야 합니다.");
};
