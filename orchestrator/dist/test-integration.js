import { resolve } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { runAutonomousTask } from "./src/orchestrator.js";
import { runPaths, ensureRunDirs, readState } from "./src/state-store.js";
import { ModelRouter } from "./src/model-router.js";
import { OpenCodeAdapter, detectOpenCode } from "./src/opencode.js";
import { applyEnvOverrides, loadConfig } from "./src/config.js";
// Mock reviewer that returns PASS
class MockReviewer {
    shouldPass;
    constructor(shouldPass = true) {
        this.shouldPass = shouldPass;
    }
    async review(_input) {
        if (this.shouldPass) {
            return { status: "PASS", summary: "All good", findings: [], required_actions: [], rawOutput: "{}" };
        }
        return {
            status: "FAIL", summary: "P1 issue",
            findings: [{ id: "SEC-001", severity: "P1", file: "test.ts", line: 1, problem: "test", required_fix: "fix it" }],
            required_actions: ["Fix SEC-001"], rawOutput: "{}",
        };
    }
}
async function main() {
    const repoRoot = resolve(process.argv[2] ?? process.cwd());
    console.log(`Testing orchestrator integration at: ${repoRoot}`);
    // Load config
    const { config } = await loadConfig(undefined, repoRoot);
    const finalConfig = applyEnvOverrides(config);
    // Create a test task
    const workdir = resolve(repoRoot, ".ai", "orchestrator", "test-integration");
    if (existsSync(workdir))
        rmSync(workdir, { recursive: true, force: true });
    mkdirSync(workdir, { recursive: true });
    const taskFile = resolve(workdir, "task.md");
    writeFileSync(taskFile, `# Integration Test Task

Create a file at integration-output/test.txt with content "orchestrator works".

## Acceptance Criteria

- [ ] File created at integration-output/test.txt
- [ ] Content is exactly "orchestrator works"
---

Simple task: just create the file and verify it exists.
`);
    // Detect OpenCode
    const caps = {
        openCode: await detectOpenCode(),
        reviewer: { executableFound: false, executable: "mock" },
    };
    if (!caps.openCode.installed) {
        console.error("OpenCode not installed");
        process.exit(1);
    }
    // Create run
    const runId = "test-integration-" + Date.now();
    const paths = runPaths(repoRoot, runId);
    await ensureRunDirs(paths);
    // Create router
    const router = new ModelRouter(finalConfig.coding.models, { cooldownMs: finalConfig.orchestrator.modelCooldownMs });
    // Create coding agent factory with real OpenCode
    const codingAgentFactory = (model) => new OpenCodeAdapter({
        timeoutMs: 60000, // Shorter timeout for testing
        logDir: paths.opencodeDir,
        repoRoot,
        caps: caps.openCode,
    });
    // Create mock reviewer
    const reviewer = new MockReviewer(true);
    console.log("Starting autonomous task...");
    const outcome = await runAutonomousTask({
        taskFile,
        runId,
        paths,
        config: finalConfig,
        caps,
        codingAgentFactory,
        reviewer,
        router,
    });
    console.log(`\n=== RESULT ===`);
    console.log(`Final status: ${outcome.finalStatus}`);
    console.log(`Report: ${outcome.reportPath}`);
    // Print report
    if (existsSync(outcome.reportPath)) {
        console.log("\n--- Report ---");
        console.log(readFileSync(outcome.reportPath, "utf8"));
    }
    // Print state
    const state = await readState(paths);
    if (state) {
        console.log("\n--- Final State ---");
        console.log(`State: ${state.state}`);
        console.log(`Attempts: ${state.attempt}`);
        console.log(`Fix cycles: ${state.fixCycle}`);
        console.log(`Models used: ${state.modelsUsed.join(", ")}`);
        console.log(`Fallbacks: ${state.fallbacks.length}`);
        console.log(`Tests: ${state.tests.map(t => `${t.name}=${t.status}`).join(", ")}`);
        console.log(`Findings: ${state.findings.length}`);
    }
    // Check if output file was created
    const outputFile = resolve(repoRoot, "integration-output", "test.txt");
    if (existsSync(outputFile)) {
        const content = readFileSync(outputFile, "utf8").trim();
        console.log(`\n--- Output File ---`);
        console.log(`Exists: YES`);
        console.log(`Content: "${content}"`);
        console.log(`Match: ${content === "orchestrator works" ? "YES" : "NO"}`);
    }
    else {
        console.log(`\n--- Output File ---`);
        console.log(`Exists: NO`);
    }
    process.exit(outcome.finalStatus === "CERTIFIED" ? 0 : 1);
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
