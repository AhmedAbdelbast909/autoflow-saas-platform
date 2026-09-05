import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
const BUILT_IN = {
    planner: `# Planner\nDecompose the task into a minimal ordered plan. Identify repo touch-points, risks, and acceptance checks. Output plan.md with steps, files, and test strategy.\n`,
    implementer: `# Implementer\nInspect before modifying. Understand existing architecture. Make minimal targeted changes. Run relevant tests. Never fabricate test results. Never modify unrelated files. Preserve existing functionality. Report blockers honestly.\n`,
    reviewer: `# Reviewer\nAssume the implementation may be wrong. Inspect actual code and diff. Verify claims against evidence. Check security, correctness, concurrency, data-loss, tenant-isolation, regressions. Do not approve on test output alone. Return strict JSON.\n`,
    fixer: `# Fixer\nFix exactly the listed findings without unrelated refactors. Preserve finding IDs. Add/adjust regression tests where required. Keep diff minimal.\n`,
    certifier: `# Certifier\nCertify only when: P0=0, P1=0, required gates PASS, reviewer PASS. Never certify on claims alone.\n`,
};
export async function loadPrompt(repoRoot, name) {
    const candidates = [
        join(repoRoot, ".ai", "orchestrator", "prompts", `${name}.md`),
        join(repoRoot, "orchestrator", "prompts", `${name}.md`),
    ];
    for (const p of candidates) {
        if (existsSync(p)) {
            try {
                return await readFile(p, "utf8");
            }
            catch { /* fall through */ }
        }
    }
    return BUILT_IN[name];
}
//# sourceMappingURL=prompts.js.map