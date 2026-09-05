import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadPrompt } from "./prompts.js";
import { ModelRouter } from "./model-router.js";
import { isQuotaLike } from "./failure-classifier.js";
import { gitChangedFiles, gitCommit, gitDiff, gitSnapshot } from "./git.js";
import { runQualityGates } from "./quality.js";
import { emitEvent, ensureRunDirs, readState, writeState, type Paths } from "./state-store.js";
import { redactSecrets } from "./secrets.js";
import type {
  CodingAgent, CodingResult, FinalStatus, GateResult, ModelEntry,
  OrchestratorConfig, OrchestratorCapabilities, Reviewer, ReviewFinding, RunStateDoc,
} from "./types.js";

export interface RunOptions {
  taskFile: string;
  runId: string;
  paths: Paths;
  config: OrchestratorConfig;
  caps: OrchestratorCapabilities;
  codingAgentFactory: (model: ModelEntry) => CodingAgent;
  reviewer: Reviewer;
  router: ModelRouter;
}

export interface RunOutcome {
  finalStatus: FinalStatus;
  reportPath: string;
  runId: string;
}

function parseTaskFile(text: string, taskFile: string): { taskText: string; acceptance: string[]; taskId: string } {
  const taskId = taskFile.replace(/\\/g, "/").split("/").pop()?.replace(/\.(md|txt|json)$/i, "") ?? "task";
  if (taskFile.endsWith(".json")) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      const taskText = String(obj["task"] ?? obj["description"] ?? text);
      const acceptance = Array.isArray(obj["acceptanceCriteria"]) ? (obj["acceptanceCriteria"] as unknown[]).map(String) : [];
      return { taskText, acceptance, taskId: String(obj["taskId"] ?? taskId) };
    } catch { /* fall through to raw */ }
  }
  const acceptance: string[] = [];
  const lines = text.split("\n");
  let inAccept = false;
  for (const l of lines) {
    if (/acceptance criteria/i.test(l)) { inAccept = true; continue; }
    if (inAccept && /^\s*#{1,3}\s/.test(l)) break;
    if (inAccept) {
      const m = l.match(/^\s*(?:[-*]|\d+\.)\s+(.+)/);
      if (m) acceptance.push(m[1].trim());
    }
  }
  return { taskText: text.slice(0, 20000), acceptance, taskId };
}

function transition(state: RunStateDoc, next: RunStateDoc["state"], note: string): void {
  state.state = next;
  state.history.push({ state: next, at: new Date().toISOString(), note });
}

export function certificationDecision(
  config: OrchestratorConfig,
  findings: ReviewFinding[],
  gates: GateResult[],
  reviewerStatus: "PASS" | "FAIL" | null,
): { certifiable: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const p0 = findings.filter((f) => f.severity === "P0").length;
  const p1 = findings.filter((f) => f.severity === "P1").length;
  if (p0 > config.certification.maxP0) blockers.push(`P0 findings: ${p0} > allowed ${config.certification.maxP0}`);
  if (p1 > config.certification.maxP1) blockers.push(`P1 findings: ${p1} > allowed ${config.certification.maxP1}`);
  if (reviewerStatus !== "PASS") blockers.push(`reviewer status is ${reviewerStatus ?? "unknown"} (requires PASS)`);
  const gateByName = new Map(gates.map((g) => [g.name, g]));
  const req = (name: string, flag: boolean) => {
    if (!flag) return;
    const g = gateByName.get(name);
    if (!g || g.status === "SKIPPED") blockers.push(`${name} gate did not run (SKIPPED) — cannot certify`);
    else if (g.status === "NOT_TESTED") blockers.push(`${name} gate NOT_TESTED — cannot certify`);
    else if (g.status !== "PASS") blockers.push(`${name} gate status ${g.status} — cannot certify`);
  };
  req("typecheck", config.certification.requireTypecheckPass);
  req("lint", config.certification.requireLintPass);
  req("tests", config.certification.requireTestsPass);
  req("build", config.certification.requireBuildPass);
  return { certifiable: blockers.length === 0, blockers };
}

async function writeFinalReport(paths: Paths, state: RunStateDoc, status: FinalStatus, blockers: string[], extra: Record<string, unknown> = {}): Promise<string> {
  const report = {
    status,
    taskId: state.taskId,
    runId: state.runId,
    cycles: state.fixCycle,
    modelsUsed: state.modelsUsed,
    fallbacks: state.fallbacks,
    tests: state.tests,
    reviewFindings: state.findings,
    changedFiles: await gitChangedFiles(paths.repoRoot),
    commit: state.gitHead,
    blockers,
    startedAt: state.startedAt,
    finishedAt: new Date().toISOString(),
    ...extra,
  };
  await writeFile(paths.reportFile, JSON.stringify(report, null, 2), "utf8");
  return paths.reportFile;
}

function fixerInstructions(findings: ReviewFinding[], requiredActions: string[]): string {
  return `Fix the following reviewer findings. Keep changes minimal.\n${findings.map((f) => `- [${f.severity}] ${f.id} ${f.file ?? ""}${f.line ? ":" + f.line : ""}: ${f.problem} (REQUIRED FIX: ${f.required_fix})`).join("\n")}\nRequired actions:\n${requiredActions.map((a) => `- ${a}`).join("\n")}`;
}

export async function runAutonomousTask(opts: RunOptions): Promise<RunOutcome> {
  const { paths, config } = opts;
  await ensureRunDirs(paths);
  const taskText0 = await readFile(opts.taskFile, "utf8");
  const parsed = parseTaskFile(taskText0, opts.taskFile);
  void redactSecrets;

  let state = await readState(paths);
  if (!state) {
    const snap = await gitSnapshot(paths.repoRoot);
    state = {
      taskId: parsed.taskId, runId: opts.runId, state: "DISCOVER",
      attempt: 0, fixCycle: 0, reviewCycle: 0, consecutiveFailures: 0,
      currentModel: null, sessionId: null,
      startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      taskFile: opts.taskFile, taskText: parsed.taskText,
      acceptanceCriteria: parsed.acceptance, findings: [], tests: [],
      history: [{ state: "DISCOVER", at: new Date().toISOString(), note: "run created" }],
      modelsUsed: [], fallbacks: [], gitHead: snap.head, gitBranch: snap.branch,
      openCodePid: null, finalized: false,
    };
    await writeFile(paths.taskFile, JSON.stringify({ taskId: parsed.taskId, taskFile: opts.taskFile, acceptanceCriteria: parsed.acceptance }, null, 2), "utf8");
    await emitEvent(paths, "RUN_STARTED", { runId: opts.runId, taskId: parsed.taskId });
    await writeState(paths, state);
  } else {
    await emitEvent(paths, "RUN_RESUMED", { runId: opts.runId, state: state.state });
  }

  const dead: string[] = [];
  let reviewerStatus: "PASS" | "FAIL" | null = null;

  const planIfNeeded = async () => {
    if (state!.fixCycle > 0 || state!.attempt > 0) return;
    transition(state!, "PLAN", "planning");
    await writeState(paths, state!);
    const planner = await loadPrompt(paths.repoRoot, "planner");
    const plan = `# Plan for ${state!.taskId}\n\nTask file: ${state!.taskFile}\n\n## Steps\n1. Discover repo layout and relevant files\n2. Implement minimal changes for acceptance criteria\n3. Run quality gates (typecheck/lint/tests/build where present)\n4. Submit for review; fix P0/P1 findings\n\n## Planner guidance\n${planner}\n`;
    await writeFile(paths.planFile, plan, "utf8");
    await emitEvent(paths, "PLAN_CREATED", {});
  };

  await planIfNeeded();
  if (state.state === "DISCOVER" || state.state === "PLAN") {
    transition(state, "IMPLEMENT", "plan complete");
    await writeState(paths, state);
  }

  // Crash-recovery guard: never repeat a commit; if finalized, just report.
  if (state.finalized) {
    const reportPath = paths.reportFile;
    return { finalStatus: "BLOCKED", reportPath, runId: opts.runId };
  }

  while (true) {
    // Retry-limit guard
    if (state.fixCycle > config.orchestrator.maxFixCycles) {
      transition(state, "BLOCKED", `maxFixCycles exceeded (${config.orchestrator.maxFixCycles})`);
      await writeState(paths, state);
      await emitEvent(paths, "BLOCKED", { reason: "maxFixCycles" });
      const rp = await writeFinalReport(paths, state, "BLOCKED", [`maxFixCycles (${config.orchestrator.maxFixCycles}) exceeded`]);
      return { finalStatus: "BLOCKED", reportPath: rp, runId: opts.runId };
    }
    if (state.reviewCycle > config.orchestrator.maxReviewCycles) {
      transition(state, "BLOCKED", "maxReviewCycles exceeded");
      await writeState(paths, state);
      await emitEvent(paths, "BLOCKED", { reason: "maxReviewCycles" });
      const rp = await writeFinalReport(paths, state, "BLOCKED", [`maxReviewCycles (${config.orchestrator.maxReviewCycles}) exceeded`]);
      return { finalStatus: "BLOCKED", reportPath: rp, runId: opts.runId };
    }
    if (state.consecutiveFailures >= config.orchestrator.maxConsecutiveFailures) {
      transition(state, "BLOCKED", "maxConsecutiveFailures exceeded");
      await writeState(paths, state);
      await emitEvent(paths, "BLOCKED", { reason: "maxConsecutiveFailures" });
      const rp = await writeFinalReport(paths, state, "BLOCKED", [`maxConsecutiveFailures (${config.orchestrator.maxConsecutiveFailures}) exceeded`]);
      return { finalStatus: "BLOCKED", reportPath: rp, runId: opts.runId };
    }

    // ---- IMPLEMENT / FIX with model fallback ----
    if (state.state === "IMPLEMENT" || state.state === "FIX") {
      const isFix = state.state === "FIX";
      const extra = isFix ? fixerInstructions(state.findings, []) : await loadPrompt(paths.repoRoot, "implementer").catch(() => "");
      let codingResult: CodingResult | null = null;
      let attempts = 0;
      const triedThisCycle: string[] = [];
      while (attempts < config.orchestrator.maxModelAttempts) {
        const model = opts.router.selectNext([...dead, ...triedThisCycle]);
        if (!model) {
          transition(state, "BLOCKED", "all models unavailable");
          await writeState(paths, state);
          await emitEvent(paths, "BLOCKED", { reason: "all-models-unavailable" });
          const rp = await writeFinalReport(paths, state, "BLOCKED", ["All configured coding models unavailable (cooldown/disabled)."]);
          return { finalStatus: "BLOCKED", reportPath: rp, runId: opts.runId };
        }
        const prevModel = state.currentModel;
        state.currentModel = model.model;
        if (!state.modelsUsed.includes(model.model)) state.modelsUsed.push(model.model);
        await emitEvent(paths, "MODEL_SELECTED", { model: model.model, id: model.id });
        if (prevModel && prevModel !== model.model) {
          state.fallbacks.push({ from: prevModel, to: model.model, reason: "model-switch", at: new Date().toISOString() });
          await emitEvent(paths, "MODEL_FALLBACK", { from: prevModel, to: model.model });
        }
        await writeState(paths, state);

        const snapBefore = await gitSnapshot(paths.repoRoot);
        await emitEvent(paths, isFix ? "FIX_STARTED" : "OPENCODE_STARTED", { model: model.model, attempt: state.attempt + 1 });
        const agent = opts.codingAgentFactory(model);
        const changedSoFar = await gitChangedFiles(paths.repoRoot);
        codingResult = await agent.run({
          taskText: state.taskText,
          acceptanceCriteria: state.acceptanceCriteria,
          context: {
            runId: state.runId, attempt: state.attempt + 1, cycle: state.fixCycle,
            repoRoot: paths.repoRoot, changedFilesSoFar: changedSoFar,
            previousFindings: state.findings, sessionId: state.sessionId,
            extraInstructions: extra,
          },
          model,
        });
        state.attempt += 1;
        if (codingResult.sessionId) state.sessionId = codingResult.sessionId;
        const snapAfter = await gitSnapshot(paths.repoRoot);
        state.gitHead = snapAfter.head;
        await writeState(paths, state);

        if (codingResult.ok) {
          opts.router.recordSuccess(model.model);
          await emitEvent(paths, isFix ? "FIX_COMPLETED" : "OPENCODE_COMPLETED", { model: model.model, headBefore: snapBefore.head, headAfter: snapAfter.head });
          state.consecutiveFailures = 0;
          await writeState(paths, state);
          break;
        }
        const kind = codingResult.failure?.kind ?? "UNKNOWN";
        await emitEvent(paths, kind === "QUOTA_EXCEEDED" ? "MODEL_QUOTA_EXCEEDED" : "MODEL_FAILED", { model: model.model, kind });
        opts.router.recordFailure(model.model, kind);
        triedThisCycle.push(model.model);
        state.consecutiveFailures += 1;
        await writeState(paths, state);
        attempts += 1;
        codingResult = null;

        if (!isQuotaLike(kind) && kind === "PERMANENT_CONFIG") {
          dead.push(model.model);
        }
        if (attempts >= config.orchestrator.maxModelAttempts) {
          transition(state, "BLOCKED", `maxModelAttempts (${config.orchestrator.maxModelAttempts}) exceeded this cycle`);
          await writeState(paths, state);
          const rp = await writeFinalReport(paths, state, "BLOCKED", [`Coding failed on all attempted models (last kind: ${kind}).`]);
          return { finalStatus: "BLOCKED", reportPath: rp, runId: opts.runId };
        }
      }
      transition(state, isFix ? "RETEST" : "TEST", "implementation done");
      await writeState(paths, state);
      continue;
    }

    // ---- TEST / RETEST ----
    if (state.state === "TEST" || state.state === "RETEST") {
      await emitEvent(paths, "TEST_STARTED", {});
      const gates = await runQualityGates(paths.repoRoot, config.quality);
      state.tests = gates;
      const allPass = gates.every((g) => g.status === "PASS" || g.status === "SKIPPED");
      await emitEvent(paths, "TEST_COMPLETED", { status: allPass ? "PASS" : "FAIL", gates: gates.map((g) => ({ name: g.name, status: g.status })) });
      await writeFile(join(paths.testsDir, `gates-cycle${state.fixCycle}.json`), JSON.stringify(gates, null, 2), "utf8");
      transition(state, "REVIEW", "tests complete");
      await writeState(paths, state);
      continue;
    }

    // ---- REVIEW ----
    if (state.state === "REVIEW") {
      state.reviewCycle += 1;
      await emitEvent(paths, "REVIEW_STARTED", { cycle: state.reviewCycle });
      await writeState(paths, state);
      const diff = await gitDiff(paths.repoRoot);
      const changed = await gitChangedFiles(paths.repoRoot);
      let review;
      try {
        review = await opts.reviewer.review({
          taskText: state.taskText,
          acceptanceCriteria: state.acceptanceCriteria,
          gitDiff: diff,
          changedFiles: changed,
          testResults: state.tests,
          buildResults: [],
          previousFindings: state.findings,
          implementationStatus: `fixCycle=${state.fixCycle} attempt=${state.attempt} model=${state.currentModel}`,
          repoRoot: paths.repoRoot,
        });
      } catch (err) {
        await emitEvent(paths, "REVIEW_ERROR", { error: redactSecrets(String((err as Error).message)).slice(0, 2000) });
        state.consecutiveFailures += 1;
        await writeState(paths, state);
        if (state.consecutiveFailures >= config.orchestrator.maxConsecutiveFailures) {
          transition(state, "BLOCKED", "reviewer repeatedly unavailable");
          await writeState(paths, state);
          const rp = await writeFinalReport(paths, state, "BLOCKED", [`Reviewer unavailable: ${String((err as Error).message).slice(0, 500)}`]);
          return { finalStatus: "BLOCKED", reportPath: rp, runId: opts.runId };
        }
        transition(state, "RETEST", "reviewer error; re-verify gates");
        await writeState(paths, state);
        continue;
      }
      state.findings = review.findings;
      reviewerStatus = review.status;
      await writeFile(join(paths.reviewDir, `review-cycle${state.reviewCycle}.json`), JSON.stringify(review, null, 2), "utf8");
      if (review.status === "FAIL") {
        await emitEvent(paths, "REVIEW_FAILED", { findingCount: review.findings.length });
      } else {
        await emitEvent(paths, "REVIEW_PASSED", {});
      }

      const { certifiable, blockers } = certificationDecision(config, state.findings, state.tests, reviewerStatus);
      if (certifiable) {
        transition(state, "CERTIFY", "gates + review pass");
        await writeState(paths, state);
        continue;
      }
      // Not certifiable: if reviewer FAIL with P0/P1 -> fix loop; if gates fail -> fix loop too (up to limits)
      const hasBlockerFindings = state.findings.some((f) => f.severity === "P0" || f.severity === "P1");
      if (review.status === "FAIL" || hasBlockerFindings || blockers.length > 0) {
        if (state.fixCycle >= config.orchestrator.maxFixCycles) {
          transition(state, "BLOCKED", "maxFixCycles reached with unresolved findings");
          await writeState(paths, state);
          const rp = await writeFinalReport(paths, state, "BLOCKED", [...blockers, `Unresolved findings: ${state.findings.length}`]);
          return { finalStatus: "BLOCKED", reportPath: rp, runId: opts.runId };
        }
        state.fixCycle += 1;
        transition(state, "FIX", `fix cycle ${state.fixCycle}: ${review.summary.slice(0, 200)}`);
        await writeState(paths, state);
        continue;
      }
      transition(state, "FIX", "review requires changes");
      state.fixCycle += 1;
      await writeState(paths, state);
      continue;
    }

    // ---- CERTIFY / COMMIT ----
    if (state.state === "CERTIFY" || state.state === "COMMIT") {
      const { certifiable, blockers } = certificationDecision(config, state.findings, state.tests, reviewerStatus ?? (state.findings.length === 0 ? "PASS" : null));
      if (!certifiable) {
        transition(state, "BLOCKED", "certification gates not satisfied");
        await writeState(paths, state);
        const rp = await writeFinalReport(paths, state, "BLOCKED", blockers);
        return { finalStatus: "BLOCKED", reportPath: rp, runId: opts.runId };
      }
      await emitEvent(paths, "CERTIFIED", {});
      let commit: string | null = state.gitHead;
      if (config.git.autoCommit || config.orchestrator.autoCommit) {
        const snap = await gitSnapshot(paths.repoRoot);
        if (snap.isRepo) {
          const changed = await gitChangedFiles(paths.repoRoot);
          if (changed.length > 0) {
            const res = await gitCommit(paths.repoRoot, `orchestrator: ${state.taskId} certified (${state.runId})`, changed);
            if (res.code === 0) {
              const after = await gitSnapshot(paths.repoRoot);
              commit = after.head;
              state.gitHead = commit;
            }
          }
        }
      }
      state.finalized = true;
      transition(state, "DONE", "certified");
      await writeState(paths, state);
      const rp = await writeFinalReport(paths, state, "CERTIFIED", [], { commit });
      return { finalStatus: "CERTIFIED", reportPath: rp, runId: opts.runId };
    }

    if (state.state === "BLOCKED" || state.state === "DONE") {
      const rp = await writeFinalReport(paths, state, state.state === "DONE" ? "CERTIFIED" : "BLOCKED", ["run ended in state " + state.state]);
      return { finalStatus: state.state === "DONE" ? "CERTIFIED" : "BLOCKED", reportPath: rp, runId: opts.runId };
    }

    throw new Error(`Unknown state: ${state.state}`);
  }
}
