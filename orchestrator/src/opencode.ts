import { execFileSafe, spawnSafe } from "./proc.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { classifyFailure } from "./failure-classifier.js";
import { gitChangedFiles, gitSnapshot } from "./git.js";
import { redactSecrets, sanitizeArgsForLog } from "./secrets.js";
import type { CodingAgent, CodingInput, CodingResult, OrchestratorCapabilities } from "./types.js";

export async function detectOpenCode(): Promise<OrchestratorCapabilities["openCode"]> {
  const base = { installed: false, version: null as string | null, supportsRun: false, supportsModelFlag: false, supportsSessionFlag: false, supportsContinueFlag: false, supportsFormatJson: false };
  const ver = await (async () => {
    const r = await execFileSafe("opencode", ["--version"], { timeout: 15000 });
    if (r.error || (r.code !== 0 && !r.stdout.trim() && !r.stderr.trim())) return null;
    return (r.stdout || r.stderr).trim().split("\n")[0] || null;
  })();
  if (!ver) return base;
  const help = await (async () => {
    const r = await execFileSafe("opencode", ["--help"], { timeout: 15000 });
    return r.stdout + r.stderr;
  })();
  const runHelp = await (async () => {
    const r = await execFileSafe("opencode", ["run", "--help"], { timeout: 15000 });
    return r.stdout + r.stderr;
  })();
  const combined = help + "\n" + runHelp;
  return {
    installed: true,
    version: ver,
    supportsRun: /opencode run/.test(combined),
    supportsModelFlag: /--model/.test(combined),
    supportsSessionFlag: /--session/.test(combined),
    supportsContinueFlag: /--continue/.test(combined),
    supportsFormatJson: /--format/.test(combined),
  };
}

function extractSessionId(output: string): string | null {
  const m = output.match(/session[s]?[ Moll]*:?[\s"']*([0-9a-fA-F-]{8,})/i)
    ?? output.match(/"session(?:ID|Id|_id)"?\s*:\s*"([^"]+)"/)
    ?? output.match(/ses_[A-Za-z0-9]+/);
  return m ? m[1] : null;
}

export interface OpenCodeAdapterOptions {
  timeoutMs: number;
  logDir: string;
  repoRoot: string;
  caps: OrchestratorCapabilities["openCode"];
}

export class OpenCodeAdapter implements CodingAgent {
  constructor(private opts: OpenCodeAdapterOptions) {}

  async run(input: CodingInput): Promise<CodingResult> {
    const before = await gitSnapshot(this.opts.repoRoot);
    const prompt = buildPrompt(input);
    const promptFile = join(this.opts.logDir, `prompt-${input.context.runId}-${input.context.attempt}.md`);
    await writeFile(promptFile, prompt, "utf8").catch(() => undefined);

    const args = ["run", "--model", input.model.model];
    if (this.opts.caps.supportsFormatJson) args.push("--format", "json");
    if (input.context.sessionId && this.opts.caps.supportsSessionFlag) {
      args.push("--session", input.context.sessionId);
    }
    args.push(prompt);

    const logFile = join(this.opts.logDir, `opencode-${input.context.runId}-${input.model.id}-attempt${input.context.attempt}.log`);
    const startedAt = Date.now();
    const { code, output, pid } = await this.spawnOpencode(args, this.opts.timeoutMs, logFile);
    void startedAt; void pid;
    const redacted = redactSecrets(output);
    const after = await gitSnapshot(this.opts.repoRoot);
    const changedFiles = await gitChangedFiles(this.opts.repoRoot);
    const sessionId = extractSessionId(redacted) ?? input.context.sessionId;

    if (code === 0) {
      return {
        ok: true, exitCode: 0, sessionId,
        outputTail: redacted.slice(-6000), logFile,
        gitHeadBefore: before.head, gitHeadAfter: after.head, changedFiles,
      };
    }
    const failure = classifyFailure(code, redacted);
    return {
      ok: false, exitCode: code, sessionId,
      outputTail: redacted.slice(-6000), logFile, failure,
      gitHeadBefore: before.head, gitHeadAfter: after.head, changedFiles,
    };
  }

  private spawnOpencode(args: string[], timeoutMs: number, logFile: string): Promise<{ code: number | null; output: string; pid: number | null }> {
    return new Promise((resolve) => {
      const child = spawnSafe("opencode", args, { cwd: this.opts.repoRoot, timeout: timeoutMs });
      let output = "";
      const onData = (d: Buffer | string) => {
        output += String(d);
        if (output.length > 400000) output = output.slice(-400000);
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      const timer = setTimeout(() => {
        output += "\n[orchestrator] TIMEOUT killing opencode process\n";
        try { child.kill("SIGTERM"); } catch { /* noop */ }
        setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* noop */ } }, 5000).unref?.();
      }, timeoutMs);
      child.on("error", (err) => {
        clearTimeout(timer);
        const msg = `spawn error: ${(err as Error).message}\nargs: ${sanitizeArgsForLog(args).join(" ")}`;
        void logFile;
        resolve({ code: 1, output: output + "\n" + msg, pid: null });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        writeFile(logFile, redactSecrets(output), "utf8").catch(() => undefined);
        resolve({ code, output, pid: null });
      });
    });
  }
}

export function buildPrompt(input: CodingInput): string {
  const findings = input.context.previousFindings.length > 0
    ? `\n\n## Previous review findings (must fix all P0/P1):\n${input.context.previousFindings.map((f) => `- [${f.severity}] ${f.id} ${f.file ?? ""}${f.line ? ":" + f.line : ""} :: ${f.problem} => FIX: ${f.required_fix}`).join("\n")}`
    : "";
  return `# Autonomous coding task (orchestrated)

You are the IMPLEMENTER. Inspect before modifying. Make minimal targeted changes.

## Task
${input.taskText}

## Acceptance criteria
${input.acceptanceCriteria.map((a, i) => `${i + 1}. ${a}`).join("\n")}

## Context
- run: ${input.context.runId} | attempt ${input.context.attempt} | cycle ${input.context.cycle}
- repo root: ${input.context.repoRoot}
- files changed so far: ${input.context.changedFilesSoFar.join(", ") || "(none yet)"}
${findings}

## Extra instructions
${input.context.extraInstructions || "(none)"}

## Rules
- Understand existing architecture before editing; reuse existing scripts/config.
- Never fabricate test results; run relevant tests yourself with repo commands.
- Never modify unrelated files; preserve existing functionality.
- Do not commit unless asked; leave changes in working tree.
- Report blockers honestly at the end under "## IMPLEMENTER REPORT".
`;
}
