import { createServer } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localRoot = path.resolve(process.env.SONAR_LOCAL_ROOT || path.join(projectRoot, "data"));
const importRoot = path.resolve(process.env.SONAR_IMPORT_ROOT || path.join(projectRoot, "data", "imports"));
const port = Number(process.env.SONAR_FILE_PORT || 4711);
const bucket = process.env.SONAR_S3_BUCKET || "";
const basePrefix = cleanPrefix(process.env.SONAR_S3_PREFIX || "");
const allowedExtensions = new Set([
  ".db", ".duckdb", ".sqlite", ".sqlite3", ".json", ".yaml", ".yml", ".toml",
  ".ini", ".conf", ".cfg", ".csv", ".tsv", ".parquet", ".feather", ".txt",
]);
const previewExtensions = new Set([".json", ".yaml", ".yml", ".toml", ".ini", ".conf", ".cfg", ".csv", ".tsv", ".txt"]);

const s3 = new S3Client({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-northeast-2",
  endpoint: process.env.SONAR_S3_ENDPOINT || undefined,
  forcePathStyle: process.env.SONAR_S3_FORCE_PATH_STYLE === "true",
});

function cleanPrefix(value) {
  return value.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
}

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveLocal(relative = "") {
  const target = path.resolve(localRoot, relative.replaceAll("/", path.sep));
  if (!within(localRoot, target)) throw new Error("허용된 로컬 루트 밖의 경로입니다.");
  return target;
}

function json(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  response.end(JSON.stringify(value));
}

async function bodyJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("요청이 너무 큽니다.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function listLocal(relative) {
  const target = resolveLocal(relative);
  const entries = await readdir(target, { withFileTypes: true });
  const items = await Promise.all(entries
    .filter((entry) => !entry.name.startsWith("."))
    .map(async (entry) => {
      const full = path.join(target, entry.name);
      const info = await stat(full);
      const rel = path.relative(localRoot, full).split(path.sep).join("/");
      return {
        name: entry.name,
        path: rel,
        type: entry.isDirectory() ? "folder" : "file",
        size: entry.isFile() ? info.size : null,
        modified: info.mtime.toISOString(),
        supported: entry.isDirectory() || allowedExtensions.has(path.extname(entry.name).toLowerCase()),
      };
    }));
  return items.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

async function listS3(relative) {
  if (!bucket) throw new Error("SONAR_S3_BUCKET이 설정되지 않았습니다.");
  const requested = cleanPrefix(relative);
  const prefix = cleanPrefix(`${basePrefix}${basePrefix && requested ? "/" : ""}${requested}`);
  const folderPrefix = prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
  const result = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: folderPrefix, Delimiter: "/", MaxKeys: 500 }));
  const folders = (result.CommonPrefixes || []).map(({ Prefix = "" }) => {
    const rel = Prefix.slice(basePrefix ? basePrefix.length + 1 : 0).replace(/\/$/, "");
    return { name: rel.split("/").pop() || rel, path: rel, type: "folder", size: null, modified: null, supported: true };
  });
  const files = (result.Contents || [])
    .filter(({ Key }) => Key && Key !== folderPrefix)
    .map(({ Key = "", Size = 0, LastModified }) => {
      const rel = Key.slice(basePrefix ? basePrefix.length + 1 : 0);
      const name = rel.split("/").pop() || rel;
      return { name, path: rel, type: "file", size: Size, modified: LastModified?.toISOString() || null, supported: allowedExtensions.has(path.extname(name).toLowerCase()) };
    });
  return [...folders, ...files].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

async function preview(provider, relative) {
  const extension = path.extname(relative).toLowerCase();
  if (!previewExtensions.has(extension)) throw new Error("이 형식은 미리보기를 지원하지 않습니다.");
  if (provider === "local") {
    const target = resolveLocal(relative);
    const info = await stat(target);
    if (info.size > 256 * 1024) throw new Error("256KB 이하 텍스트 파일만 미리볼 수 있습니다.");
    return (await readFile(target, "utf8")).slice(0, 12000);
  }
  if (!bucket) throw new Error("SONAR_S3_BUCKET이 설정되지 않았습니다.");
  const key = cleanPrefix(`${basePrefix}${basePrefix ? "/" : ""}${relative}`);
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-262143" }));
  return (await result.Body.transformToString("utf8")).slice(0, 12000);
}

async function importFile(provider, relative) {
  const extension = path.extname(relative).toLowerCase();
  if (!allowedExtensions.has(extension)) throw new Error("DB·설정·데이터 파일만 가져올 수 있습니다.");
  await mkdir(importRoot, { recursive: true });
  const safeName = path.basename(relative).replace(/[^a-zA-Z0-9._-]/g, "_");
  const destination = path.join(importRoot, `${Date.now()}-${safeName}`);
  if (!within(importRoot, destination)) throw new Error("잘못된 대상 경로입니다.");
  if (provider === "local") {
    await pipeline(createReadStream(resolveLocal(relative)), createWriteStream(destination, { flags: "wx" }));
  } else {
    if (!bucket) throw new Error("SONAR_S3_BUCKET이 설정되지 않았습니다.");
    const key = cleanPrefix(`${basePrefix}${basePrefix ? "/" : ""}${relative}`);
    const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) throw new Error("S3 object body가 없습니다.");
    await pipeline(result.Body, createWriteStream(destination, { flags: "wx" }));
  }
  const info = await stat(destination);
  return {
    importedPath: destination,
    sourceUri: provider === "s3" ? `s3://${bucket}/${cleanPrefix(`${basePrefix}${basePrefix ? "/" : ""}${relative}`)}` : resolveLocal(relative),
    size: info.size,
  };
}

await mkdir(localRoot, { recursive: true });
await mkdir(importRoot, { recursive: true });

createServer(async (request, response) => {
  if (request.method === "OPTIONS") return json(response, 204, {});
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname === "/health") return json(response, 200, { ok: true, localRoot, importRoot, bucket: bucket || null, prefix: basePrefix });
    if (url.pathname === "/api/files" && request.method === "GET") {
      const provider = url.searchParams.get("provider") === "s3" ? "s3" : "local";
      const currentPath = url.searchParams.get("path") || "";
      const items = provider === "s3" ? await listS3(currentPath) : await listLocal(currentPath);
      return json(response, 200, { provider, path: currentPath, bucket: provider === "s3" ? bucket : null, items });
    }
    if (url.pathname === "/api/preview" && request.method === "GET") {
      const provider = url.searchParams.get("provider") === "s3" ? "s3" : "local";
      const currentPath = url.searchParams.get("path") || "";
      return json(response, 200, { text: await preview(provider, currentPath) });
    }
    if (url.pathname === "/api/import" && request.method === "POST") {
      const input = await bodyJson(request);
      const provider = input.provider === "s3" ? "s3" : "local";
      if (!input.path || typeof input.path !== "string") throw new Error("파일 경로가 필요합니다.");
      return json(response, 200, await importFile(provider, input.path));
    }
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    return json(response, 400, { error: error instanceof Error ? error.message : "Unknown error" });
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`[Sonar files] http://127.0.0.1:${port}`);
  console.log(`[Local root] ${localRoot}`);
  console.log(`[Import root] ${importRoot}`);
  console.log(`[S3] ${bucket ? `s3://${bucket}/${basePrefix}` : "not configured"}`);
});
