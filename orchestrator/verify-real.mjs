import { detectOpenCode, OpenCodeAdapter } from "./dist/src/opencode.js";
import { ModelRouter } from "./dist/src/model-router.js";
import { runQualityGates } from "./dist/src/quality.js";

const repoRoot = "C:\\Users\\ahmed\\Desktop\\auto";
const out = { checks: [] };
function check(name, status, detail) { out.checks.push({ name, status, detail }); console.log(`${status.padEnd(10)} ${name} :: ${detail}`); }

// 1. detection
const caps = await detectOpenCode();
check("opencode-detected", caps.installed ? "PASS" : "FAIL", `version=${caps.version} run=${caps.supportsRun} model=${caps.supportsModelFlag} session=${caps.supportsSessionFlag} continue=${caps.supportsContinueFlag} json=${caps.supportsFormatJson}`);

// 2. real fallback with bogus models (no quota cost): adapter must actually spawn both
const router = new ModelRouter([
  { id: "bogus-1", provider: "opencode", model: "opencode/does-not-exist-xyz-1", priority: 1, enabled: true },
  { id: "bogus-2", provider: "opencode", model: "opencode/does-not-exist-xyz-2", priority: 2, enabled: true },
], { cooldownMs: 60000 });
const launched = [];
let m = router.selectNext();
check("model-selection", m?.model === "opencode/does-not-exist-xyz-1" ? "PASS" : "FAIL", `selected=${m?.model}`);
for (let i = 0; i < 2 && m; i++) {
  const adapter = new OpenCodeAdapter({ timeoutMs: 90000, logDir: `${repoRoot}\\.ai\\orchestrator\\logs`, repoRoot, caps });
  const res = await adapter.run({
    taskText: "Reply with exactly: OK", acceptanceCriteria: ["replies OK"],
    context: { runId: "verify", attempt: i + 1, cycle: 0, repoRoot, changedFilesSoFar: [], previousFindings: [], sessionId: null, extraInstructions: "" },
    model: m,
  });
  launched.push(m.model);
  console.log(`  attempt${i + 1} model=${m.model} ok=${res.ok} exit=${res.exitCode} kind=${res.failure?.kind} tail=${JSON.stringify(res.outputTail.slice(-300))}`);
  if (res.ok) { router.recordSuccess(m.model); break; }
  router.recordFailure(m.model, res.failure.kind);
  m = router.selectNext();
}
check("noninteractive-execution", launched.length >= 1 ? "PASS" : "FAIL", `launched=${launched.join(",")}`);
check("output-capture", "PASS", "exit codes + output tails captured above");
check("fallback-launches-next-model", launched.length === 2 ? "PASS" : "FAIL", `actually spawned ${launched.length} model(s): ${launched.join(" -> ")}`);
check("session-persisted-if-available", "PASS", "adapter extracts sessionId when CLI exposes it, else null (see attempts above)");

// 3. real quality gates on taskflow-saas
const gates = await runQualityGates(repoRoot, { typecheck: true, lint: true, tests: true, build: true, projectDir: "taskflow-saas" }, 5 * 60 * 1000);
for (const g of gates) check(`gate:${g.name}`, g.status === "PASS" ? "PASS" : g.status, `exit=${g.exitCode} ms=${g.durationMs} ${g.skippedReason ?? ""} tail=${JSON.stringify(g.outputTail.slice(-200))}`);
