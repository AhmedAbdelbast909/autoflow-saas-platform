import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRouter } from "../src/model-router.js";
import { runAutonomousTask } from "../src/orchestrator.js";
import { runPaths, readState, readEvents, writeState } from "../src/state-store.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import type { CodingAgent, CodingResult, ModelEntry, Reviewer, ReviewInput, ReviewResult, OrchestratorConfig, RunStateDoc } from "../src/types.js";

let workdir = "";

function makeConfig(): OrchestratorConfig {
  const c = structuredClone(DEFAULT_CONFIG) as OrchestratorConfig;
  c.orchestrator.maxModelAttempts = 3;
  c.orchestrator.maxFixCycles = 3;
  c.orchestrator.maxReviewCycles = 5;
  c.orchestrator.maxConsecutiveFailures = 10;
  c.orchestrator.modelCooldownMs = 60000;
  c.quality = { typecheck: false, lint: false, tests: false, build: false };
  c.certification = { maxP0: 0, maxP1: 0, requireTestsPass: false, requireTypecheckPass: false, requireLintPass: false, requireBuildPass: false };
  c.git.autoCommit = false; c.orchestrator.autoCommit = false;
  return c;
}

/** Fake coding agent with a programmed script: model -> queue of outcomes. Records every invocation. */
class FakeCodingAgent implements CodingAgent {
  static calls: Array<{ model: string; attempt: number }> = [];
  constructor(private script: Map<string, Array<{ ok: boolean; kind?: "QUOTA_EXCEEDED" | "RATE_LIMITED" | "TRANSIENT" }>>, private markerDir: string) {}
  async run(input: CodingAgent extends never ? never : import("../src/types.js").CodingInput): Promise<CodingResult> {
    FakeCodingAgent.calls.push({ model: input.model.model, attempt: input.context.attempt });
    const q = this.script.get(input.model.model) ?? [{ ok: true }];
    const step = q.length > 1 ? (q.shift() as { ok: boolean; kind?: "QUOTA_EXCEEDED" }) : (q[0] as { ok: boolean; kind?: "QUOTA_EXCEEDED" });
    if (step.ok) {
      // Simulate real filesystem work that must survive model switches.
      writeFileSync(join(this.markerDir, `work-${input.context.attempt}.txt`), `done by ${input.model.model}`);
      return { ok: true, exitCode: 0, sessionId: `sess-${input.context.attempt}`, outputTail: "ok", logFile: "fake.log", gitHeadBefore: null, gitHeadAfter: null, changedFiles: [] };
    }
    const kind = (step.kind ?? "QUOTA_EXCEEDED") as CodingResult["failure"] extends never ? never : "QUOTA_EXCEEDED";
    return {
      ok: false, exitCode: 1, sessionId: null, outputTail: `Error: ${String(step.kind).toLowerCase().replace("_", " ")}`, logFile: "fake.log",
      failure: { kind: step.kind ?? "QUOTA_EXCEEDED", retryableWithNextModel: true, permanent: false, evidence: "fake" },
      gitHeadBefore: null, gitHeadAfter: null, changedFiles: [],
    };
  }
}

class FakeReviewer implements Reviewer {
  constructor(private seq: ReviewResult[]) {}
  async review(_input: ReviewInput): Promise<ReviewResult> {
    const next = this.seq.length > 1 ? this.seq.shift()! : this.seq[0];
    return structuredClone(next);
  }
}

const PASS_REVIEW: ReviewResult = { status: "PASS", summary: "good", findings: [], required_actions: [], rawOutput: "{}" };
const FAIL_P1: ReviewResult = {
  status: "FAIL", summary: "p1 remains",
  findings: [{ id: "SEC-001", severity: "P1", file: "src/a.ts", line: 1, problem: "auth bypass", required_fix: "enforce auth first" }],
  required_actions: ["Fix SEC-001"], rawOutput: "{}",
};

const UNAVAILABLE_REVIEW: ReviewResult = {
  status: "UNAVAILABLE", summary: "reviewer not found",
  findings: [], required_actions: ["install reviewer"], rawOutput: "{}",
};

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "orch-test-"));
  mkdirSync(join(workdir, ".ai", "orchestrator", "runs"), { recursive: true });
  FakeCodingAgent.calls = [];
});

afterEach(() => {
  try { rmSync(workdir, { recursive: true, force: true }); } catch { /* noop */ }
});

function taskFile(): string {
  const p = join(workdir, "task.md");
  writeFileSync(p, "# T\n\n## Acceptance Criteria\n- [ ] done\n");
  return p;
}

function models3(): ModelEntry[] {
  return [
    { id: "m1", provider: "opencode", model: "opencode/m1", priority: 1, enabled: true },
    { id: "m2", provider: "opencode", model: "opencode/m2", priority: 2, enabled: true },
    { id: "m3", provider: "opencode", model: "opencode/m3", priority: 3, enabled: true },
  ];
}

function certifiableState(runId: string, patch: Partial<RunStateDoc> = {}): RunStateDoc {
  const now = new Date().toISOString();
  return {
    taskId: "task", runId, state: "CERTIFY",
    attempt: 1, fixCycle: 1, reviewCycle: 1, consecutiveFailures: 0,
    reviewerStatus: "PASS", currentModel: null, sessionId: null,
    startedAt: now, updatedAt: now,
    taskFile: "", taskText: "# T\n\n## Acceptance Criteria\n- [ ] done\n",
    acceptanceCriteria: ["done"], findings: [], tests: [],
    history: [{ state: "CERTIFY", at: now, note: "test" }],
    modelsUsed: ["opencode/m1"], fallbacks: [], gitHead: null, gitBranch: null,
    openCodePid: null, finalized: false,
    ...patch,
  };
}

describe("fallback + fix loop integration (fake adapters)", () => {
  it("falls back m1(quota) -> m2(rate) -> m3(success), no manual intervention", async () => {
    const config = makeConfig();
    config.coding.models = models3();
    const router = new ModelRouter(config.coding.models, { cooldownMs: config.orchestrator.modelCooldownMs });
    const runId = "run-fallback";
    const paths = runPaths(workdir, runId);
    const script = new Map([
      ["opencode/m1", [{ ok: false, kind: "QUOTA_EXCEEDED" as const }]],
      ["opencode/m2", [{ ok: false, kind: "RATE_LIMITED" as const }]],
      ["opencode/m3", [{ ok: true }]],
    ]);
    const factory = (m: ModelEntry) => new FakeCodingAgent(script, paths.runDir) as CodingAgent;
    const reviewer = new FakeReviewer([PASS_REVIEW]);
    const outcome = await runAutonomousTask({
      taskFile: taskFile(), runId, paths, config,
      caps: { openCode: { installed: true, version: "x", supportsRun: true, supportsModelFlag: true, supportsSessionFlag: true, supportsContinueFlag: true, supportsFormatJson: true }, reviewer: { executableFound: true, executable: "fake" } },
      codingAgentFactory: factory, reviewer, router,
    });
    assert.equal(outcome.finalStatus, "CERTIFIED");
    const used = FakeCodingAgent.calls.map((c) => c.model);
    assert.deepEqual(used, ["opencode/m1", "opencode/m2", "opencode/m3"]);
    const events = await readEvents(paths);
    assert.ok(events.some((e) => e["type"] === "MODEL_FALLBACK"));
  });

  it("preserves work across model switches (filesystem authoritative)", async () => {
    const config = makeConfig();
    config.coding.models = models3();
    const router = new ModelRouter(config.coding.models, { cooldownMs: config.orchestrator.modelCooldownMs });
    const runId = "run-preserve";
    const paths = runPaths(workdir, runId);
    const script = new Map([
      ["opencode/m1", [{ ok: false, kind: "QUOTA_EXCEEDED" as const }]],
      ["opencode/m2", [{ ok: true }]],
    ]);
    // Pre-existing work marker before run
    mkdirSync(paths.runDir, { recursive: true });
    writeFileSync(join(paths.runDir, "pre-existing.txt"), "must survive");
    const factory = (m: ModelEntry) => new FakeCodingAgent(script, paths.runDir) as CodingAgent;
    await runAutonomousTask({
      taskFile: taskFile(), runId, paths, config,
      caps: { openCode: { installed: true, version: "x", supportsRun: true, supportsModelFlag: true, supportsSessionFlag: true, supportsContinueFlag: true, supportsFormatJson: true }, reviewer: { executableFound: true, executable: "fake" } },
      codingAgentFactory: factory, reviewer: new FakeReviewer([PASS_REVIEW]), router,
    });
    assert.ok(existsSync(join(paths.runDir, "pre-existing.txt")));
    assert.ok(existsSync(join(paths.runDir, "work-2.txt")));
  });

  it("review FAIL -> fix -> retest -> review PASS certifies", async () => {
    const config = makeConfig();
    config.coding.models = models3().slice(0, 1);
    const router = new ModelRouter(config.coding.models, { cooldownMs: config.orchestrator.modelCooldownMs });
    const runId = "run-fixloop";
    const paths = runPaths(workdir, runId);
    const script = new Map([["opencode/m1", [{ ok: true }]]]);
    const factory = (m: ModelEntry) => new FakeCodingAgent(script, paths.runDir) as CodingAgent;
    const outcome = await runAutonomousTask({
      taskFile: taskFile(), runId, paths, config,
      caps: { openCode: { installed: true, version: "x", supportsRun: true, supportsModelFlag: true, supportsSessionFlag: true, supportsContinueFlag: true, supportsFormatJson: true }, reviewer: { executableFound: true, executable: "fake" } },
      codingAgentFactory: factory, reviewer: new FakeReviewer([FAIL_P1, PASS_REVIEW]), router,
    });
    assert.equal(outcome.finalStatus, "CERTIFIED");
    const events = await readEvents(paths);
    const types = events.map((e) => String(e["type"]));
    assert.ok(types.includes("REVIEW_FAILED"));
    assert.ok(types.includes("CERTIFIED"));
    const st = await readState(paths);
    assert.equal(st?.fixCycle, 1);
  });

  it("P0/P1 unresolved + maxFixCycles -> BLOCKED, never fake-certified", async () => {
    const config = makeConfig();
    config.orchestrator.maxFixCycles = 1;
    config.coding.models = models3().slice(0, 1);
    const router = new ModelRouter(config.coding.models, { cooldownMs: config.orchestrator.modelCooldownMs });
    const runId = "run-blocked";
    const paths = runPaths(workdir, runId);
    const script = new Map([["opencode/m1", [{ ok: true }]]]);
    const factory = (m: ModelEntry) => new FakeCodingAgent(script, paths.runDir) as CodingAgent;
    const outcome = await runAutonomousTask({
      taskFile: taskFile(), runId, paths, config,
      caps: { openCode: { installed: true, version: "x", supportsRun: true, supportsModelFlag: true, supportsSessionFlag: true, supportsContinueFlag: true, supportsFormatJson: true }, reviewer: { executableFound: true, executable: "fake" } },
      codingAgentFactory: factory, reviewer: new FakeReviewer([FAIL_P1]), router,
    });
    assert.equal(outcome.finalStatus, "BLOCKED");
    const report = JSON.parse(readFileSync(outcome.reportPath, "utf8")) as { status: string };
    assert.notEqual(report.status, "CERTIFIED");
  });

  it("state persistence + crash recovery: resume continues safely", async () => {
    const config = makeConfig();
    config.coding.models = models3().slice(0, 1);
    const runId = "run-crash";
    const paths = runPaths(workdir, runId);
    const script = new Map([["opencode/m1", [{ ok: true }]]]);
    const factory = (m: ModelEntry) => new FakeCodingAgent(script, paths.runDir) as CodingAgent;
    const caps = { openCode: { installed: true, version: "x", supportsRun: true, supportsModelFlag: true, supportsSessionFlag: true, supportsContinueFlag: true, supportsFormatJson: true }, reviewer: { executableFound: true, executable: "fake" } } as const;
    // First full run to CERTIFIED creates persisted state
    const r1 = await runAutonomousTask({
      taskFile: taskFile(), runId, paths, config, caps: { ...caps },
      codingAgentFactory: factory, reviewer: new FakeReviewer([PASS_REVIEW]),
      router: new ModelRouter(config.coding.models, { cooldownMs: config.orchestrator.modelCooldownMs }),
    });
    assert.equal(r1.finalStatus, "CERTIFIED");
    // Simulate crash-restart: new router + same runId must detect finalized state and not repeat work
    const callsBefore = FakeCodingAgent.calls.length;
    const r2 = await runAutonomousTask({
      taskFile: taskFile(), runId, paths, config, caps: { ...caps },
      codingAgentFactory: factory, reviewer: new FakeReviewer([PASS_REVIEW]),
      router: new ModelRouter(config.coding.models, { cooldownMs: config.orchestrator.modelCooldownMs }),
    });
    assert.equal(FakeCodingAgent.calls.length, callsBefore, "no duplicate coding invocations after finalize");
    const st = await readState(paths);
    assert.equal(st?.finalized, true);
    void r2;
  });

  it("resume CERTIFY state uses persisted reviewerStatus PASS (crash before certify completes)", async () => {
    const config = makeConfig();
    config.coding.models = models3().slice(0, 1);
    const router = new ModelRouter(config.coding.models, { cooldownMs: config.orchestrator.modelCooldownMs });
    const runId = "run-resume-pass";
    const paths = runPaths(workdir, runId);
    mkdirSync(paths.runDir, { recursive: true });
    await writeState(paths, certifiableState(runId, { reviewerStatus: "PASS" }));
    const factory = (m: ModelEntry) => new FakeCodingAgent(new Map(), paths.runDir) as CodingAgent;
    const outcome = await runAutonomousTask({
      taskFile: taskFile(), runId, paths, config,
      caps: { openCode: { installed: true, version: "x", supportsRun: true, supportsModelFlag: true, supportsSessionFlag: true, supportsContinueFlag: true, supportsFormatJson: true }, reviewer: { executableFound: true, executable: "fake" } },
      codingAgentFactory: factory, reviewer: new FakeReviewer([PASS_REVIEW]), router,
    });
    assert.equal(outcome.finalStatus, "CERTIFIED");
  });

  it("resume legacy CERTIFY state (no reviewerStatus field, empty findings) still certifies", async () => {
    const config = makeConfig();
    config.coding.models = models3().slice(0, 1);
    const router = new ModelRouter(config.coding.models, { cooldownMs: config.orchestrator.modelCooldownMs });
    const runId = "run-resume-legacy";
    const paths = runPaths(workdir, runId);
    mkdirSync(paths.runDir, { recursive: true });
    const legacy = certifiableState(runId, { findings: [] });
    delete (legacy as unknown as Record<string, unknown>)["reviewerStatus"];
    await writeState(paths, legacy);
    const factory = (m: ModelEntry) => new FakeCodingAgent(new Map(), paths.runDir) as CodingAgent;
    const outcome = await runAutonomousTask({
      taskFile: taskFile(), runId, paths, config,
      caps: { openCode: { installed: true, version: "x", supportsRun: true, supportsModelFlag: true, supportsSessionFlag: true, supportsContinueFlag: true, supportsFormatJson: true }, reviewer: { executableFound: true, executable: "fake" } },
      codingAgentFactory: factory, reviewer: new FakeReviewer([PASS_REVIEW]), router,
    });
    assert.equal(outcome.finalStatus, "CERTIFIED");
  });

  it("resume CERTIFY state with persisted reviewerStatus FAIL does not certify", async () => {
    const config = makeConfig();
    config.coding.models = models3().slice(0, 1);
    const router = new ModelRouter(config.coding.models, { cooldownMs: config.orchestrator.modelCooldownMs });
    const runId = "run-resume-fail";
    const paths = runPaths(workdir, runId);
    mkdirSync(paths.runDir, { recursive: true });
    await writeState(paths, certifiableState(runId, { reviewerStatus: "FAIL" }));
    const factory = (m: ModelEntry) => new FakeCodingAgent(new Map(), paths.runDir) as CodingAgent;
    const outcome = await runAutonomousTask({
      taskFile: taskFile(), runId, paths, config,
      caps: { openCode: { installed: true, version: "x", supportsRun: true, supportsModelFlag: true, supportsSessionFlag: true, supportsContinueFlag: true, supportsFormatJson: true }, reviewer: { executableFound: true, executable: "fake" } },
      codingAgentFactory: factory, reviewer: new FakeReviewer([PASS_REVIEW]), router,
    });
    assert.equal(outcome.finalStatus, "BLOCKED");
    const st = await readState(paths);
    assert.equal(st?.state, "BLOCKED");
  });

  it("retry limits: maxModelAttempts exceeded -> BLOCKED", async () => {
    const config = makeConfig();
    config.orchestrator.maxModelAttempts = 2;
    config.coding.models = models3();
    const router = new ModelRouter(config.coding.models, { cooldownMs: 60000 });
    const runId = "run-retry";
    const paths = runPaths(workdir, runId);
    const script = new Map([
      ["opencode/m1", [{ ok: false, kind: "QUOTA_EXCEEDED" as const }]],
      ["opencode/m2", [{ ok: false, kind: "QUOTA_EXCEEDED" as const }]],
      ["opencode/m3", [{ ok: true }]],
    ]);
    const factory = (m: ModelEntry) => new FakeCodingAgent(script, paths.runDir) as CodingAgent;
    const outcome = await runAutonomousTask({
      taskFile: taskFile(), runId, paths, config,
      caps: { openCode: { installed: true, version: "x", supportsRun: true, supportsModelFlag: true, supportsSessionFlag: true, supportsContinueFlag: true, supportsFormatJson: true }, reviewer: { executableFound: true, executable: "fake" } },
      codingAgentFactory: factory, reviewer: new FakeReviewer([PASS_REVIEW]), router,
    });
    assert.equal(outcome.finalStatus, "BLOCKED");
    assert.ok(FakeCodingAgent.calls.length <= 2);
  });

  it("reviewer UNAVAILABLE -> BLOCKED immediately (no fix loop)", async () => {
    const config = makeConfig();
    config.coding.models = models3().slice(0, 1);
    const router = new ModelRouter(config.coding.models, { cooldownMs: config.orchestrator.modelCooldownMs });
    const runId = "run-unavailable";
    const paths = runPaths(workdir, runId);
    const script = new Map([["opencode/m1", [{ ok: true }]]]);
    const factory = (m: ModelEntry) => new FakeCodingAgent(script, paths.runDir) as CodingAgent;
    const outcome = await runAutonomousTask({
      taskFile: taskFile(), runId, paths, config,
      caps: { openCode: { installed: true, version: "x", supportsRun: true, supportsModelFlag: true, supportsSessionFlag: true, supportsContinueFlag: true, supportsFormatJson: true }, reviewer: { executableFound: true, executable: "fake" } },
      codingAgentFactory: factory, reviewer: new FakeReviewer([UNAVAILABLE_REVIEW]), router,
    });
    assert.equal(outcome.finalStatus, "BLOCKED");
    const events = await readEvents(paths);
    const types = events.map((e) => String(e["type"]));
    assert.ok(types.includes("REVIEW_UNAVAILABLE"));
    assert.ok(!types.includes("FIX_STARTED"), "should not attempt fix when reviewer unavailable");
  });

  it("model fallback works during fix cycle (review FAIL -> fix -> model quota -> fallback -> test -> review PASS)", async () => {
    const config = makeConfig();
    config.coding.models = models3();
    const router = new ModelRouter(config.coding.models, { cooldownMs: config.orchestrator.modelCooldownMs });
    const runId = "run-fix-fallback";
    const paths = runPaths(workdir, runId);
    // Implementation succeeds on first model
    // First review FAILs with P1
    // Fix attempt on m1 hits quota -> fallback to m2 -> fix succeeds
    // Retest passes, review PASS
    const script = new Map([
      ["opencode/m1", [{ ok: true }, { ok: false, kind: "QUOTA_EXCEEDED" as const }]], // implement OK, fix quota
      ["opencode/m2", [{ ok: true }]], // fix succeeds on fallback
    ]);
    const factory = (m: ModelEntry) => new FakeCodingAgent(script, paths.runDir) as CodingAgent;
    const outcome = await runAutonomousTask({
      taskFile: taskFile(), runId, paths, config,
      caps: { openCode: { installed: true, version: "x", supportsRun: true, supportsModelFlag: true, supportsSessionFlag: true, supportsContinueFlag: true, supportsFormatJson: true }, reviewer: { executableFound: true, executable: "fake" } },
      codingAgentFactory: factory, reviewer: new FakeReviewer([FAIL_P1, PASS_REVIEW]), router,
    });
    assert.equal(outcome.finalStatus, "CERTIFIED");
    const used = FakeCodingAgent.calls.map((c) => c.model);
    assert.deepEqual(used, ["opencode/m1", "opencode/m1", "opencode/m2"]);
    const events = await readEvents(paths);
    const types = events.map((e) => String(e["type"]));
    assert.ok(types.includes("REVIEW_FAILED"));
    assert.ok(types.includes("MODEL_QUOTA_EXCEEDED"));
    assert.ok(types.includes("MODEL_FALLBACK"));
    assert.ok(types.includes("FIX_STARTED"));
    assert.ok(types.includes("FIX_COMPLETED"));
    assert.ok(types.includes("TEST_STARTED"));
    assert.ok(types.includes("REVIEW_PASSED"));
    assert.ok(types.includes("CERTIFIED"));
  });
});
