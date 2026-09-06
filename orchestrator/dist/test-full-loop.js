import { resolve } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { runAutonomousTask } from "./src/orchestrator.js";
import { runPaths, ensureRunDirs, readState } from "./src/state-store.js";
import { ModelRouter } from "./src/model-router.js";
import { OpenCodeAdapter, detectOpenCode } from "./src/opencode.js";
import { applyEnvOverrides, loadConfig } from "./src/config.js";
// Mock reviewer that returns FAIL first then PASS
class MockFailThenPassReviewer {
    callCount = 0;
    async review(_input) {
        this.callCount++;
        if (this.callCount === 1) {
            return {
                status: "FAIL",
                summary: "Missing error handling in file creation",
                findings: [
                    { id: "ERR-001", severity: "P1", file: "test-output/test.txt", line: 1, problem: "File creation lacks error handling", required_fix: "Add try-catch around file operations" }
                ],
                required_actions: ["Fix ERR-001: Add error handling"],
                rawOutput: "",
            };
        }
        return {
            status: "PASS",
            summary: "Error handling added, implementation correct",
            findings: [],
            required_actions: [],
            rawOutput: "",
        };
    }
}
async function main() {
    const repoRoot = resolve(process.argv[2] ?? process.cwd());
    console.log(`Testing full loop at: ${repoRoot}`);
    const { config } = await loadConfig(undefined, repoRoot);
    const finalConfig = applyEnvOverrides(config);
    const workdir = resolve(repoRoot, ".ai", "orchestrator", "test-full-loop");
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
    const caps = {
        openCode: await detectOpenCode(),
        reviewer: { executableFound: true, executable: "mock" },
    };
    if (!caps.openCode.installed) {
        console.error("OpenCode not installed");
        process.exit(1);
    }
    const runId = "test-full-loop-" + Date.now();
    const paths = runPaths(repoRoot, runId);
    await ensureRunDirs(paths);
    const router = new ModelRouter(finalConfig.coding.models, { cooldownMs: finalConfig.orchestrator.modelCooldownMs });
    const codingAgentFactory = (model) => new OpenCodeAdapter({
        timeoutMs: 60000, // Shorter timeout
        logDir: paths.opencodeDir,
        repoRoot,
        caps: caps.openCode,
    });
    const reviewer = new MockFailThenPassReviewer();
    console.log("Starting autonomous task (expecting FAIL -> FIX -> PASS)...");
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
    if (existsSync(outcome.reportPath)) {
        console.log("\n--- Report ---");
        console.log(readFileSync(outcome.reportPath, "utf8"));
    }
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
        state.findings.forEach(f => console.log(`  - [${f.severity}] ${f.id}: ${f.problem}`));
    }
    const outputFile = resolve(repoRoot, "integration-output", "test.txt");
    if (existsSync(outputFile)) {
        const content = readFileSync(outputFile, "utf8").trim();
        console.log(`\n--- Output File ---`);
        console.log(`Exists: YES`);
        console.log(`Content: "${content}"`);
        console.log(`Match: ${content === "orchestrator works" ? "YES" : "NO"}`);
    }
    if (outcome.finalStatus === "CERTIFIED") {
        console.log("\n=== ALL TESTS PASSED ===");
        process.exit(0);
    }
    else {
        console.log("\n=== TEST FAILED - NOT CERTIFIED ===");
        process.exit(1);
    }
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
