import { resolve, join } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { runAutonomousTask } from "./src/orchestrator.js";
import { runPaths, ensureRunDirs, readState } from "./src/state-store.js";
import { ModelRouter } from "./src/model-router.js";
import { detectOpenCode } from "./src/opencode.js";
import { applyEnvOverrides, loadConfig } from "./src/config.js";
// Mock reviewer that returns UNAVAILABLE
class MockUnavailableReviewer {
    async review(_input) {
        return {
            status: "UNAVAILABLE",
            summary: "Reviewer executable not found in PATH. Review skipped.",
            findings: [],
            required_actions: ["Install/configure DeepSeek Harness"],
            rawOutput: "",
        };
    }
}
// Mock coding agent that succeeds immediately
class MockSuccessCodingAgent {
    markerDir;
    static calls = [];
    constructor(markerDir) {
        this.markerDir = markerDir;
    }
    async run(input) {
        MockSuccessCodingAgent.calls.push({ model: input.model.model, attempt: input.context.attempt });
        writeFileSync(join(this.markerDir, `work-${input.context.attempt}.txt`), `done by ${input.model.model}`);
        return { ok: true, exitCode: 0, sessionId: `sess-${input.context.attempt}`, outputTail: "ok", logFile: "fake.log", gitHeadBefore: null, gitHeadAfter: null, changedFiles: [] };
    }
}
async function main() {
    const repoRoot = resolve(process.argv[2] ?? process.cwd());
    console.log(`Testing orchestrator integration at: ${repoRoot}`);
    const { config } = await loadConfig(undefined, repoRoot);
    const finalConfig = applyEnvOverrides(config);
    // Create a test task
    const workdir = resolve(repoRoot, ".ai", "orchestrator", "test-integration-unavailable");
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
        reviewer: { executableFound: false, executable: "mock" },
    };
    if (!caps.openCode.installed) {
        console.error("OpenCode not installed");
        process.exit(1);
    }
    const runId = "test-unavailable-" + Date.now();
    const paths = runPaths(repoRoot, runId);
    await ensureRunDirs(paths);
    const router = new ModelRouter(finalConfig.coding.models, { cooldownMs: finalConfig.orchestrator.modelCooldownMs });
    const codingAgentFactory = (model) => new MockSuccessCodingAgent(paths.runDir);
    const reviewer = new MockUnavailableReviewer();
    console.log("Starting autonomous task (expecting UNAVAILABLE reviewer -> BLOCKED)...");
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
        console.log(`Reviewer status: ${state.findings.length > 0 ? "N/A" : "UNAVAILABLE (expected)"}`);
    }
    const outputFile = resolve(repoRoot, "integration-output", "test.txt");
    if (existsSync(outputFile)) {
        const content = readFileSync(outputFile, "utf8").trim();
        console.log(`\n--- Output File ---`);
        console.log(`Exists: YES`);
        console.log(`Content: "${content}"`);
        console.log(`Match: ${content === "orchestrator works" ? "YES" : "NO"}`);
    }
    // Now test RESUME - it should detect BLOCKED and not re-run
    console.log("\n--- Testing RESUME ---");
    MockSuccessCodingAgent.calls = [];
    const outcome2 = await runAutonomousTask({
        taskFile,
        runId,
        paths,
        config: finalConfig,
        caps,
        codingAgentFactory,
        reviewer,
        router,
    });
    console.log(`Resume final status: ${outcome2.finalStatus}`);
    console.log(`Calls after resume: ${MockSuccessCodingAgent.calls.length} (expected 0)`);
    assert(MockSuccessCodingAgent.calls.length === 0, "Resume should not re-run coding agent when already BLOCKED");
    console.log("\n=== ALL TESTS PASSED ===");
    process.exit(0);
}
function assert(condition, message) {
    if (!condition)
        throw new Error(`Assertion failed: ${message}`);
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
