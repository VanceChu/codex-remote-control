import { execFile } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const wranglerTimeoutMs = 3_000;

export interface DoctorResult {
  codexVersion?: string;
  ok: boolean;
  errors: string[];
}

export interface RelayDoctorResult {
  ok: boolean;
  wranglerAvailable: boolean;
  wranglerVersion?: string;
  wranglerLoggedIn: "yes" | "no" | "unknown";
  relayConfigFound: boolean;
  durableObjectBindingFound: boolean;
  assetsConfigFound: boolean;
  pwaBuildFound: boolean;
  pwaBuildAgeMs?: number;
  cloudflareApiTokenPresent: boolean;
  provisionalSecretNameConfigured: boolean;
  remoteSecretPresenceChecked: boolean;
  remoteSecretPresent?: boolean;
  warnings: string[];
  errors: string[];
}

export async function runBridgeDoctor(): Promise<DoctorResult> {
  const errors: string[] = [];
  let codexVersion: string | undefined;
  try {
    const result = await execFileAsync("codex", ["--version"]);
    codexVersion = result.stdout.trim();
  } catch {
    errors.push("codex CLI not found or not executable");
  }
  return { ok: errors.length === 0, errors, ...(codexVersion ? { codexVersion } : {}) };
}

export async function runRelayDoctor(startDir = process.cwd()): Promise<RelayDoctorResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const repoRoot = await findRepoRoot(startDir);
  const relayConfigPath = join(repoRoot, "apps", "relay", "wrangler.toml");
  const pwaDistPath = join(repoRoot, "apps", "pwa", "dist");
  const pwaSourcePath = join(repoRoot, "apps", "pwa", "src");
  const wrangler = join(repoRoot, "node_modules", ".bin", "wrangler");

  let relayConfigFound = false;
  let durableObjectBindingFound = false;
  let assetsConfigFound = false;
  let pwaBuildFound = false;
  let pwaBuildAgeMs: number | undefined;
  let configText = "";

  try {
    configText = await readFile(relayConfigPath, "utf8");
    relayConfigFound = true;
    durableObjectBindingFound =
      configText.includes("[[durable_objects.bindings]]") &&
      configText.includes('name = "ROOM"') &&
      configText.includes('class_name = "RemoteControlRoom"') &&
      configText.includes('new_sqlite_classes = ["RemoteControlRoom"]');
    assetsConfigFound =
      configText.includes("[assets]") &&
      configText.includes('directory = "../pwa/dist"') &&
      configText.includes('binding = "ASSETS"') &&
      configText.includes("run_worker_first = true") &&
      configText.includes('not_found_handling = "single-page-application"');
  } catch {
    errors.push(`relay wrangler.toml not found at ${relayConfigPath}`);
  }

  if (relayConfigFound && !durableObjectBindingFound) {
    errors.push("relay wrangler.toml is missing the ROOM SQLite Durable Object binding");
  }
  if (relayConfigFound && !assetsConfigFound) {
    errors.push("relay wrangler.toml is missing Worker-first static assets configuration");
  }

  try {
    const distStat = await stat(pwaDistPath);
    pwaBuildFound = distStat.isDirectory();
    const sourceStat = await stat(pwaSourcePath);
    pwaBuildAgeMs = Math.max(0, sourceStat.mtimeMs - distStat.mtimeMs);
    if (pwaBuildAgeMs > 0) {
      warnings.push("PWA dist is older than apps/pwa/src; rebuild before deploy");
    }
  } catch {
    errors.push("PWA dist is missing; run npm run build --workspace @crc/pwa before deploy");
  }

  let wranglerAvailable = false;
  let wranglerVersion: string | undefined;
  try {
    await access(wrangler);
    const result = await execFileAsync(wrangler, ["--version"], { timeout: wranglerTimeoutMs });
    wranglerAvailable = true;
    wranglerVersion = result.stdout.trim();
  } catch {
    errors.push("wrangler is not available from node_modules/.bin/wrangler");
  }

  let wranglerLoggedIn: RelayDoctorResult["wranglerLoggedIn"] = "unknown";
  let remoteSecretPresenceChecked = false;
  let remoteSecretPresent: boolean | undefined;
  const cloudflareApiTokenPresent = process.env.CLOUDFLARE_API_TOKEN !== undefined;
  if (!cloudflareApiTokenPresent) {
    warnings.push("CLOUDFLARE_API_TOKEN is not set; non-interactive wrangler deploy will fail");
  }
  if (wranglerAvailable) {
    try {
      await execFileAsync(wrangler, ["whoami"], { timeout: wranglerTimeoutMs });
      wranglerLoggedIn = "yes";
    } catch {
      wranglerLoggedIn = "unknown";
      warnings.push("wrangler whoami failed or timed out; remote account checks are unknown");
    }
    try {
      const result = await execFileAsync(
        wrangler,
        ["secret", "list", "--config", relayConfigPath],
        {
          timeout: wranglerTimeoutMs
        }
      );
      remoteSecretPresenceChecked = true;
      remoteSecretPresent = result.stdout.includes("CRC_DEV_WS_SECRET");
    } catch {
      warnings.push("could not check remote CRC_DEV_WS_SECRET presence");
    }
  }

  const provisionalSecretNameConfigured =
    process.env.CRC_DEV_WS_SECRET !== undefined || remoteSecretPresent === true;
  if (!provisionalSecretNameConfigured) {
    warnings.push("CRC_DEV_WS_SECRET is not visible locally and was not confirmed remotely");
  }

  return {
    ok: errors.length === 0,
    wranglerAvailable,
    ...(wranglerVersion ? { wranglerVersion } : {}),
    wranglerLoggedIn,
    relayConfigFound,
    durableObjectBindingFound,
    assetsConfigFound,
    pwaBuildFound,
    ...(pwaBuildAgeMs !== undefined ? { pwaBuildAgeMs } : {}),
    cloudflareApiTokenPresent,
    provisionalSecretNameConfigured,
    remoteSecretPresenceChecked,
    ...(remoteSecretPresent !== undefined ? { remoteSecretPresent } : {}),
    warnings,
    errors
  };
}

async function findRepoRoot(startDir: string): Promise<string> {
  let current = startDir;
  while (true) {
    try {
      const packageJson = JSON.parse(await readFile(join(current, "package.json"), "utf8")) as {
        name?: string;
      };
      if (packageJson.name === "codex-remote-control") {
        return current;
      }
    } catch {
      // Continue walking upward.
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`Could not find codex-remote-control repo root from ${startDir}`);
    }
    current = parent;
  }
}
