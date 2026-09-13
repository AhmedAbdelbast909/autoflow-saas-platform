import { execFileSafe, spawnSafe } from "./proc.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redactSecrets } from "./secrets.js";
export function reviewerPrompt(input) {
    return `# Independent code review (orchestrated)

You are the REVIEWER. Assume the implementation may be wrong. Inspect actual code and diff. Verify claims against evidence.

## Task
${input.taskText}

## Acceptance criteria
${input.acceptanceCriteria.map((a, i) => `${i + 1}. ${a}`).join("\n")}

## Changed files
${input.changedFiles.join("\n") || "(none)"}

## Git diff (truncated)
${input.gitDiff.slice(0, 30000) || "(empty diff)"}

## Test/build results
${input.testResults.map((t) => `- ${t.name}: ${t.status} (exit ${t.exitCode ?? "n/a"}) ${t.skippedReason ?? ""}`).join("\n")}
${input.buildResults.length > 0 ? input.buildResults.map((t) => `- ${t.name}: ${t.status}`).join("\n") : ""}

## Previous findings still tracked
${input.previousFindings.map((f) => `- [${f.severity}] ${f.id}: ${f.problem}`).join("\n") || "(none)"}

## Implementation status
${input.implementationStatus}

## Instructions
- Look for security, correctness, concurrency, data-loss, tenant-isolation and regression issues.
- Do NOT approve based only on test output.
- Return STRICT JSON only, no markdown fences, matching this schema:
{"status":"PASS"|"FAIL","summary":string,"findings":[{"id":string,"severity":"P0"|"P1"|"P2"|"P3","file":string,"line":number,"problem":string,"required_fix":string}],"required_actions":[string]}
`;
}
export function parseReviewJson(raw) {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
        throw new Error("Reviewer did not return JSON object");
    }
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    const validStatuses = ["PASS", "FAIL", "UNAVAILABLE"];
    if (!validStatuses.includes(obj["status"])) {
        throw new Error(`Reviewer JSON missing valid status "PASS"|"FAIL"|"UNAVAILABLE", got: ${String(obj["status"])}`);
    }
    const findingsRaw = Array.isArray(obj["findings"]) ? obj["findings"] : [];
    const findings = findingsRaw.map((f, i) => {
        const r = f;
        const sev = r["severity"];
        const severity = sev === "P0" || sev === "P1" || sev === "P2" || sev === "P3" ? sev : "P1";
        return {
            id: String(r["id"] ?? `REV-${i + 1}`),
            severity,
            file: typeof r["file"] === "string" ? r["file"] : undefined,
            line: typeof r["line"] === "number" ? r["line"] : undefined,
            problem: String(r["problem"] ?? "unspecified problem"),
            required_fix: String(r["required_fix"] ?? r["requiredFix"] ?? "fix required"),
        };
    });
    return {
        status: obj["status"],
        summary: String(obj["summary"] ?? ""),
        findings,
        required_actions: Array.isArray(obj["required_actions"]) ? obj["required_actions"].map(String) : [],
        rawOutput: raw.slice(0, 20000),
    };
}
export class DeepSeekHarnessReviewer {
    opts;
    constructor(opts) {
        this.opts = opts;
    }
    async review(input) {
        const executableFound = await reviewerExecutableExists(this.opts.executable);
        if (!executableFound) {
            if (this.opts.failOnUnavailable) {
                throw new Error(`Reviewer executable not found: "${this.opts.executable}". Install/configure the reviewer executable (default: opencode) or set review.executable (ORCH_REVIEW_EXEC).`);
            }
            return {
                status: "UNAVAILABLE",
                summary: `Reviewer executable "${this.opts.executable}" not found in PATH. Review skipped.`,
                findings: [],
                required_actions: [`Install/configure reviewer executable (default: opencode, got: ${this.opts.executable})`],
                rawOutput: "",
            };
        }
        const prompt = reviewerPrompt(input);
        const promptFile = join(this.opts.reviewDir, `review-prompt-${input.changedFiles.length}files.md`);
        await writeFile(promptFile, prompt, "utf8").catch(() => undefined);
        const args = [...this.opts.args];
        if (this.opts.model && !args.some((a) => a.includes(this.opts.model))) {
            args.push("--model", this.opts.model);
        }
        const raw = await this.spawnReviewer(args, prompt);
        const outFile = join(this.opts.reviewDir, `review-raw-${Date.now()}.txt`);
        await writeFile(outFile, redactSecrets(raw), "utf8").catch(() => undefined);
        return parseReviewJson(raw);
    }
    spawnReviewer(args, prompt) {
        return new Promise((resolve, reject) => {
            const child = spawnSafe(this.opts.executable, args, { timeout: this.opts.timeoutMs });
            let out = "";
            child.stdout?.on("data", (d) => { out += String(d); });
            child.stderr?.on("data", (d) => { out += String(d); });
            const timer = setTimeout(() => {
                try {
                    child.kill("SIGTERM");
                }
                catch { /* noop */ }
                reject(new Error(`Reviewer timed out after ${this.opts.timeoutMs}ms`));
            }, this.opts.timeoutMs);
            child.on("error", (err) => {
                clearTimeout(timer);
                reject(new Error(`Reviewer executable failed to start: "${this.opts.executable}" (${err.message}). Please install/configure the reviewer executable (e.g. DeepSeek Harness or OpenCode).`));
            });
            child.on("close", (code) => {
                clearTimeout(timer);
                if (code === 0) {
                    resolve(out);
                    return;
                }
                reject(new Error(`Reviewer failed (exit ${code}): ${redactSecrets(out).slice(-2000)}`));
            });
            try {
                child.stdin.write(prompt);
                child.stdin.end();
            }
            catch { /* reviewer may ignore stdin */ }
        });
    }
}
export async function reviewerExecutableExists(executable) {
    if (process.platform === "win32") {
        const r = await execFileSafe("where", [executable], { timeout: 8000 });
        return r.code === 0;
    }
    const r = await execFileSafe("which", [executable], { timeout: 8000 });
    return r.code === 0;
}
//# sourceMappingURL=reviewer.js.map