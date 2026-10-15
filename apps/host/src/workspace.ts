import { constants } from "node:fs";
import { lstat, open, opendir, realpath, rename, unlink, chmod } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const MAX_FILE_BYTES = 256 * 1024;
const pathSchema = z.string().max(2048);
const schemas = {
  list: z.object({ path: pathSchema, offset: z.number().int().min(0).max(5000).default(0) }).strict(),
  read: z.object({ path: pathSchema.min(1) }).strict(),
  write: z.object({ path: pathSchema.min(1), content: z.string().max(MAX_FILE_BYTES), revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
};
export type WorkspaceOperation = keyof typeof schemas;
export class WorkspaceError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const denied = new Set([".git", "node_modules", ".venv", ".next", "dist", "build", ".gradle", "__pycache__", ".ssh", ".aws", ".config", ".codex", ".gnupg", ".kube"]);
function allowed(name: string) {
  const value = name.toLowerCase();
  return !denied.has(value) && !/[\x00-\x1f\x7f\\:]/.test(name) &&
    !/^\.env(?:\.|$)|^\.flownote-|^\.npmrc$|^credentials(?:\.|$)|^secrets?(?:\.|$)|^id_(?:rsa|ed25519)(?:\.|$)|\.(?:pem|key|p12|pfx|jks|keystore|sqlite|db)$/i.test(value);
}
const digest = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

export class Workspace {
  private readonly root: Promise<string>;
  private writes: Promise<unknown> = Promise.resolve();
  constructor(cwd: string) { this.root = realpath(cwd); }
  async execute(operation: WorkspaceOperation, input: unknown): Promise<object> {
    const parsed = schemas[operation].safeParse(input);
    if (!parsed.success) throw new WorkspaceError(400, "BAD_REQUEST", "파일 요청 형식을 확인하세요.");
    try {
      if (operation === "list") return await this.list(parsed.data as z.infer<typeof schemas.list>);
      if (operation === "read") return { version: 1, ...await this.read(parsed.data.path) };
      const value = parsed.data as z.infer<typeof schemas.write>;
      const task = this.writes.then(() => this.write(value));
      this.writes = task.catch(() => undefined);
      return await task;
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      throw new WorkspaceError(code === "ENOENT" ? 404 : ["EACCES", "EPERM", "ELOOP"].includes(code || "") ? 403 : 500,
        "FILE_UNAVAILABLE", "파일에 접근할 수 없습니다.");
    }
  }
  private async resolve(path: string, directory = false) {
    const parts = path === "" ? [] : path.split("/");
    if ((!directory && !parts.length) || parts.some(p => !p || p === "." || p === ".." || !allowed(p))) {
      throw new WorkspaceError(403, "PATH_DENIED", "허용되지 않은 파일 경로입니다.");
    }
    const root = await this.root;
    let target = root;
    for (const part of parts) {
      target = join(target, part);
      if ((await lstat(target)).isSymbolicLink()) throw new WorkspaceError(403, "PATH_DENIED", "심볼릭 링크는 열 수 없습니다.");
    }
    const resolved = await realpath(target);
    const inside = relative(root, resolved);
    if (inside === ".." || inside.startsWith(`..${sep}`) || inside.startsWith(sep)) throw new WorkspaceError(403, "PATH_DENIED", "프로젝트 밖의 파일은 열 수 없습니다.");
    return resolved;
  }
  private async list({ path, offset }: z.infer<typeof schemas.list>) {
    const target = await this.resolve(path, true);
    const entries: { name: string; path: string; kind: "directory" | "file" }[] = [];
    const directory = await opendir(target);
    let scanned = 0;
    for await (const entry of directory) {
      if (++scanned > 5000) throw new WorkspaceError(413, "DIRECTORY_TOO_LARGE", "이 폴더의 항목이 너무 많습니다.");
      if (!allowed(entry.name) || entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) continue;
      entries.push({ name: entry.name, path: path ? `${path}/${entry.name}` : entry.name, kind: entry.isDirectory() ? "directory" : "file" });
    }
    entries.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1);
    return { version: 1, rootName: basename(await this.root) || "workspace", path, entries: entries.slice(offset, offset + 200), nextOffset: offset + 200 < entries.length ? offset + 200 : null };
  }
  private async read(path: string) {
    const target = await this.resolve(path);
    const file = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.nlink !== 1) throw new WorkspaceError(403, "FILE_DENIED", "일반 프로젝트 파일만 열 수 있습니다.");
      if (stat.size > MAX_FILE_BYTES) throw new WorkspaceError(413, "FILE_TOO_LARGE", "256 KiB 이하의 파일만 열 수 있습니다.");
      const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > MAX_FILE_BYTES) throw new WorkspaceError(413, "FILE_TOO_LARGE", "256 KiB 이하의 파일만 열 수 있습니다.");
      const data = buffer.subarray(0, length);
      let content: string;
      try { content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data); }
      catch { throw new WorkspaceError(415, "BINARY_FILE", "UTF-8 텍스트 파일만 열 수 있습니다."); }
      if (content.includes("\0")) throw new WorkspaceError(415, "BINARY_FILE", "바이너리 파일은 열 수 없습니다.");
      return { path, content, revision: digest(data), mode: stat.mode };
    } finally { await file.close(); }
  }
  private async write({ path, content, revision }: z.infer<typeof schemas.write>) {
    const data = Buffer.from(content, "utf8");
    if (data.length > MAX_FILE_BYTES || content.includes("\0")) throw new WorkspaceError(413, "FILE_TOO_LARGE", "저장할 텍스트 크기를 확인하세요.");
    const previous = await this.read(path);
    if (previous.revision !== revision) throw new WorkspaceError(409, "CONFLICT", "PC에서 파일이 변경되었습니다. 다시 불러온 뒤 수정하세요.");
    const target = await this.resolve(path);
    const temporary = join(dirname(target), `.flownote-${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        if (process.platform === "win32") {
          // Literal paths travel through the environment, never interpolated PowerShell code.
          await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; Set-Acl -LiteralPath $env:FLOWNOTE_ACL_TARGET -AclObject (Get-Acl -LiteralPath $env:FLOWNOTE_ACL_SOURCE)"],
            { env: { ...process.env, FLOWNOTE_ACL_SOURCE: target, FLOWNOTE_ACL_TARGET: temporary }, timeout: 10_000 });
        }
        await file.writeFile(data); await file.sync();
      }
      finally { await file.close(); }
      await chmod(temporary, previous.mode & 0o777);
      if ((await this.read(path)).revision !== revision || await this.resolve(path) !== target) throw new WorkspaceError(409, "CONFLICT", "파일이 변경되어 저장하지 않았습니다.");
      await rename(temporary, target);
      return { version: 1, path, revision: digest(data) };
    } finally { await unlink(temporary).catch(() => undefined); }
  }
}
