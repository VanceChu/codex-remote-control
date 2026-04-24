import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DoctorResult {
  codexVersion?: string;
  ok: boolean;
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
