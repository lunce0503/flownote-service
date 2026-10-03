import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const protocolRoot = resolve(import.meta.dirname, "../../../protocol/remote-host/v1");
const readJson = async (path: string) => JSON.parse(await readFile(resolve(protocolRoot, path), "utf8"));

test("shared JSON schemas accept examples and reject unknown client fields", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const clientSchema = await readJson("protocol.schema.json");
  const serverSchema = await readJson("server-message.schema.json");
  const validateClient = ajv.compile(clientSchema);
  const validateServer = ajv.compile(serverSchema);

  assert.equal(validateClient(await readJson("examples/hello.json")), true, JSON.stringify(validateClient.errors));
  assert.equal(validateClient(await readJson("examples/terminal-create.json")), true, JSON.stringify(validateClient.errors));
  assert.equal(validateClient({
    version: 1,
    type: "hello",
    requestId: "hello-unknown",
    payload: { clientName: "Android" },
    unknown: true,
  }), false);
  assert.equal(validateServer(await readJson("examples/error.json")), true, JSON.stringify(validateServer.errors));
  assert.equal(validateServer({
    version: 1,
    type: "terminal.output",
    payload: { sessionId: "00000000-0000-4000-8000-000000000000", seq: 1, data: "ok" },
  }), true, JSON.stringify(validateServer.errors));
});
