import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

const outDir = resolve("packages/codex-client/generated");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await run("codex", ["app-server", "generate-json-schema", "--out", outDir]);
await run("npx", ["prettier", "--write", outDir]);
await stabilizeSchemaBundle(join(outDir, "codex_app_server_protocol.schemas.json"));
await stabilizeSchemaBundle(join(outDir, "codex_app_server_protocol.v2.schemas.json"));
await run("npx", ["prettier", "--write", outDir]);
const codexVersion = await capture("codex", ["--version"]);
const schemaBundle = await readFile(join(outDir, "codex_app_server_protocol.v2.schemas.json"));
const schemaSha256 = createHash("sha256").update(schemaBundle).digest("hex");
await writeFile(
  join(outDir, "schema-manifest.json"),
  `${JSON.stringify({ codexVersion: codexVersion.trim(), schemaSha256 }, null, 2)}\n`
);

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${command} exited with ${code}`));
      }
    });
  });
}

function capture(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(stdout);
      } else {
        reject(new Error(`${command} exited with ${code}: ${stderr}`));
      }
    });
  });
}

async function stabilizeSchemaBundle(path) {
  const schema = JSON.parse(await readFile(path, "utf8"));
  if (schema && typeof schema === "object" && schema.definitions) {
    schema.definitions = sortRecord(schema.definitions);
  }
  await writeFile(path, `${JSON.stringify(schema, null, 2)}\n`);
}

function sortRecord(value) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  );
}
