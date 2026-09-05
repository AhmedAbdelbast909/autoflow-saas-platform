import { execFileSafe } from "./proc.js";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { redactSecrets } from "./secrets.js";
import type { GateResult, QualityConfig } from "./types.js";

export interface DiscoveredCommands {
  pkgDir: string | null;
  scripts: Record<string, string>;
  hasTsc: boolean;
  hasEslint: boolean;
}

export async function discoverRepoCommands(repoRoot: string, projectDir?: string): Promise<DiscoveredCommands> {
  const candidates = [
    projectDir ? join(repoRoot, projectDir) : null,
    join(repoRoot, "taskflow-saas"),
    repoRoot,
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    const pkg = join(dir, "package.json");
    if (!existsSync(pkg)) continue;
    try {
      const raw = JSON.parse(await readFile(pkg, "utf8")) as { scripts?: Record<string, string>; devDependencies?: Record<string, string>; dependencies?: Record<string, string> };
      const scripts = raw.scripts ?? {};
      const deps = { ...(raw.devDependencies ?? {}), ...(raw.dependencies ?? {}) };
      return {
        pkgDir: dir,
        scripts,
        hasTsc: "typescript" in deps || existsSync(join(dir, "tsconfig.json")),
        hasEslint: Object.keys(deps).some((k) => k.includes("eslint")) || existsSync(join(dir, "eslint.config.js")) || existsSync(join(dir, ".eslintrc.json")),
      };
    } catch { /* continue */ }
  }
  return { pkgDir: null, scripts: {}, hasTsc: false, hasEslint: false };
}

function execCmd(cmd: string[], cwd: string, timeoutMs: number): Promise<{ code: number | null; out: string; ms: number }> {
  const started = Date.now();
  return (async () => {
    const [bin, ...rest] = cmd;
    const r = await execFileSafe(bin, rest, { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
    return { code: r.code, out: r.stdout + r.stderr, ms: Date.now() - started };
  })();
}

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

export async function runQualityGates(repoRoot: string, quality: QualityConfig, timeoutPerGateMs = 10 * 60 * 1000): Promise<GateResult[]> {
  const discovered = await discoverRepoCommands(repoRoot, quality.projectDir);
  const results: GateResult[] = [];
  const gates: Array<{ name: string; run: () => Promise<GateResult> }> = [];

  if (quality.typecheck) {
    gates.push({ name: "typecheck", run: async () => {
      if (!discovered.pkgDir) return skip("typecheck", "no package.json found");
      if (discovered.scripts["typecheck"]) {
        return await runGate("typecheck", [NPM, "run", "typecheck"], discovered.pkgDir, timeoutPerGateMs);
      }
      if (discovered.hasTsc) {
        const localTsc = join(discovered.pkgDir, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
        if (existsSync(localTsc)) return await runGate("typecheck", [localTsc, "--noEmit", "-p", "tsconfig.json"], discovered.pkgDir, timeoutPerGateMs);
        return await runGate("typecheck", ["npx", "--no-install", "tsc", "--noEmit"], discovered.pkgDir, timeoutPerGateMs);
      }
      return skip("typecheck", "no typescript setup detected");
    }});
  }
  if (quality.lint) {
    gates.push({ name: "lint", run: async () => {
      if (!discovered.pkgDir) return skip("lint", "no package.json found");
      if (discovered.scripts["lint"]) return await runGate("lint", [NPM, "run", "lint"], discovered.pkgDir, timeoutPerGateMs);
      if (discovered.hasEslint) return await runGate("lint", ["npx", "--no-install", "eslint", "."], discovered.pkgDir, timeoutPerGateMs);
      return skip("lint", "no eslint setup detected");
    }});
  }
  if (quality.tests) {
    gates.push({ name: "tests", run: async () => {
      if (!discovered.pkgDir) return skip("tests", "no package.json found");
      if (discovered.scripts["test"]) return await runGate("tests", [NPM, "test", "--silent"], discovered.pkgDir, timeoutPerGateMs);
      return skip("tests", "no test script detected");
    }});
  }
  if (quality.build) {
    gates.push({ name: "build", run: async () => {
      if (!discovered.pkgDir) return skip("build", "no package.json found");
      if (discovered.scripts["build"]) return await runGate("build", [NPM, "run", "build"], discovered.pkgDir, timeoutPerGateMs);
      return skip("build", "no build script detected");
    }});
  }
  for (const extra of quality.extraGates ?? []) {
    if (!extra.enabled) continue;
    gates.push({ name: extra.name, run: () => runGate(extra.name, extra.command, extra.workdir ? join(repoRoot, extra.workdir) : (discovered.pkgDir ?? repoRoot), timeoutPerGateMs) });
  }

  for (const g of gates) {
    try {
      results.push(await g.run());
    } catch (err) {
      results.push({ name: g.name, command: [], exitCode: 1, status: "FAIL", durationMs: 0, outputTail: redactSecrets(String((err as Error)?.message ?? err)).slice(-4000) });
    }
  }
  return results;
}

async function runGate(name: string, command: string[], cwd: string, timeoutMs: number): Promise<GateResult> {
  const r = await execCmd(command, cwd, timeoutMs);
  const redacted = redactSecrets(r.out);
  const timedOut = /ETIMEDOUT|timed out|timeout/i.test(redacted) && r.code !== 0 && r.ms >= timeoutMs - 1000;
  void timedOut;
  return {
    name, command, exitCode: r.code,
    status: r.code === 0 ? "PASS" : "FAIL",
    durationMs: r.ms,
    outputTail: redacted.slice(-6000),
  };
}

function skip(name: string, reason: string): GateResult {
  return { name, command: [], exitCode: null, status: "SKIPPED", durationMs: 0, outputTail: "", skippedReason: reason };
}
