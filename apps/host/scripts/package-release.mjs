import { createHash } from "node:crypto";
import { cp, chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const version = packageJson.version;
const tag = `remote-host-v${version}`;
const outputArgument = process.argv.find((argument) => argument.startsWith("--out="));
const outputDir = resolve(outputArgument?.slice("--out=".length) || join(repositoryRoot, "release"));
const temporaryRoot = await mkdtemp(join(tmpdir(), "remote-host-release-"));
const bundleName = tag;
const bundleRoot = join(temporaryRoot, bundleName);
const archiveName = `${bundleName}.tar.gz`;
const archivePath = join(outputDir, archiveName);

const run = (command, args, cwd = packageRoot) => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
};

try {
  run("npm", ["run", "build"]);
  await mkdir(bundleRoot, { recursive: true });
  for (const path of ["dist", "package.json", "package-lock.json", "README.md"]) {
    await cp(join(packageRoot, path), join(bundleRoot, basename(path)), { recursive: true });
  }
  await chmod(join(bundleRoot, "dist", "cli.js"), 0o755);
  await writeFile(join(bundleRoot, "VERSION"), `${version}\n`);
  await mkdir(outputDir, { recursive: true });
  run("tar", [
    "--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner",
    "-czf", archivePath, bundleName,
  ], temporaryRoot);

  const digest = createHash("sha256").update(await readFile(archivePath)).digest("hex");
  await writeFile(`${archivePath}.sha256`, `${digest}  ${archiveName}\n`);
  const installerPath = join(outputDir, "install-remote-host.sh");
  await cp(join(packageRoot, "install.sh"), installerPath);
  await chmod(installerPath, 0o755);
  console.log(JSON.stringify({ version, tag, archivePath, installerPath, sha256: digest }, null, 2));
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
