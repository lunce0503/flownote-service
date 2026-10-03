#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { access } from "node:fs/promises";
import { parseArgs } from "node:util";
import { constants as fsConstants } from "node:fs";
import process from "node:process";
import {
  controlSocketPathFor,
  initializeHost,
  loadConfig,
  readCertificateFingerprint,
  resolveConfigDir,
} from "./config.js";
import { sendControlRequest } from "./control.js";
import { DEFAULT_BIND, DEFAULT_PORT } from "./constants.js";
import { HostServer } from "./server.js";

const VERSION = "0.1.0";

const help = `Flownote Remote Host ${VERSION}

Usage:
  remote-host doctor [--config PATH] [--json]
  remote-host init [--config PATH] [--host HOST] [--bind ADDRESS] [--port PORT]
                   [--device ID] [--device-name NAME] [--shell PATH] [--cwd PATH] [--force]
  remote-host serve [--config PATH] [--bind ADDRESS] [--port PORT]
  remote-host status [--config PATH] [--json]
  remote-host revoke --device ID [--config PATH] [--json]

The host grants a remote client the full permissions of the local OS user running it.
Use it only on a trusted LAN or an existing VPN. Do not expose port ${DEFAULT_PORT} directly to the internet.
`;

const parsePort = (value: string | undefined) => {
  if (value === undefined) return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("포트는 1~65535 범위의 정수여야 합니다.");
  return port;
};

const output = (value: unknown, json: boolean) => {
  if (json) console.log(JSON.stringify(value, null, 2));
  else if (typeof value === "string") console.log(value);
  else console.log(JSON.stringify(value, null, 2));
};

const main = async () => {
  const command = process.argv[2];
  const { values } = parseArgs({
    args: process.argv.slice(3),
    strict: true,
    allowPositionals: false,
    options: {
      config: { type: "string" },
      json: { type: "boolean", default: false },
      host: { type: "string" },
      bind: { type: "string" },
      port: { type: "string" },
      device: { type: "string" },
      "device-name": { type: "string" },
      shell: { type: "string" },
      cwd: { type: "string" },
      force: { type: "boolean", default: false },
    },
  });
  const configDir = resolveConfigDir(values.config);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(help);
    return;
  }
  if (command === "version" || command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }

  switch (command) {
    case "doctor": {
      const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
      checks.push({ name: "platform", ok: process.platform === "linux", detail: `${process.platform} ${process.arch}` });
      checks.push({ name: "node", ok: Number(process.versions.node.split(".")[0]) >= 20, detail: process.versions.node });
      try {
        checks.push({ name: "openssl", ok: true, detail: execFileSync("openssl", ["version"], { encoding: "utf8" }).trim() });
      } catch {
        checks.push({ name: "openssl", ok: false, detail: "openssl을 실행할 수 없습니다." });
      }
      try {
        const config = await loadConfig(configDir);
        await access(config.shell, fsConstants.X_OK);
        checks.push({ name: "config", ok: true, detail: configDir });
      } catch (error) {
        checks.push({ name: "config", ok: false, detail: error instanceof Error ? error.message : String(error) });
      }
      output({ ok: checks.every((check) => check.ok || check.name === "config"), checks }, Boolean(values.json));
      if (checks.some((check) => !check.ok && check.name !== "config")) process.exitCode = 1;
      return;
    }
    case "init": {
      const result = await initializeHost({
        configDir,
        bind: values.bind || DEFAULT_BIND,
        advertisedHost: values.host || values.bind || DEFAULT_BIND,
        port: parsePort(values.port) || DEFAULT_PORT,
        deviceId: values.device,
        deviceName: values["device-name"],
        shell: values.shell,
        cwd: values.cwd,
        force: values.force,
      });
      const registration = {
        hostId: result.config.hostId,
        deviceId: result.config.devices[0]?.id,
        endpoint: `wss://${result.config.advertisedHost}:${result.config.port}/v1/connect`,
        token: result.token,
        certificateFingerprint: result.fingerprint,
        configDir,
      };
      if (values.json) output(registration, true);
      else {
        console.log("원격 허브를 초기화했습니다. 아래 토큰은 다시 표시되지 않습니다.\n");
        output(registration, false);
        console.log("\n휴대폰에서 인증서 지문을 별도로 대조한 뒤 등록하세요.");
      }
      return;
    }
    case "serve": {
      const config = await loadConfig(configDir);
      const server = new HostServer({ configDir, config, bind: values.bind, port: parsePort(values.port) });
      const status = await server.start();
      if (!values.json) {
        console.log(`접속 주소: wss://${config.advertisedHost}:${status.port}/v1/connect`);
        console.log(`인증서 SHA-256: ${status.fingerprint}`);
        console.log("Ctrl+C로 종료합니다.");
      }
      let stopping = false;
      const stop = async () => {
        if (stopping) return;
        stopping = true;
        await server.close();
        process.exit(0);
      };
      process.once("SIGINT", () => { void stop(); });
      process.once("SIGTERM", () => { void stop(); });
      return;
    }
    case "status": {
      try {
        output(await sendControlRequest(controlSocketPathFor(configDir), { action: "status" }), Boolean(values.json));
      } catch (error) {
        const config = await loadConfig(configDir);
        output({ running: false, hostId: config.hostId, fingerprint: await readCertificateFingerprint(config.certPath) }, Boolean(values.json));
        if (!(error instanceof Error && ["ENOENT", "ECONNREFUSED"].some((code) => error.message.includes(code)))) {
          process.exitCode = 1;
        }
      }
      return;
    }
    case "revoke": {
      if (!values.device) throw new Error("revoke에는 --device ID가 필요합니다.");
      output(await sendControlRequest(controlSocketPathFor(configDir), { action: "revoke", deviceId: values.device }), Boolean(values.json));
      return;
    }
    default:
      throw new Error(`알 수 없는 명령입니다: ${command}\n\n${help}`);
  }
};

void main().catch((error) => {
  console.error(`remote-host: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
