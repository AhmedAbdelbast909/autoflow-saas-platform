#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { applyEnvOverrides, defaultConfigPath, loadConfig, validateConfig, DEFAULT_CONFIG } from "./config.js";
import { detectOpenCode, OpenCodeAdapter } from "./opencode.js";
import { ModelRouter } from "./model-router.js";
import { runAutonomousTask } from "./orchestrator.js";
import { reviewerExecutableExists, DeepSeekHarnessReviewer } from "./reviewer.js";
import { ensureRunDirs, listRunIds, newRunId, readEvents, readState, runPaths } from "./state-store.js";
import { gitSnapshot } from "./git.js";
import { renderStatus } from "./status-view.js";
const repoRoot = resolve(process.argv.includes("--repo") ? process.argv[process.argv.indexOf("--repo") + 1] : process.cwd());
function arg(name) {
    const i = process.argv.indexOf(name);
    return i !== -1 ? process.argv[i + 1] : undefined;
}
function has(name) { return process.argv.includes(name); }
function usage() {
    return `orchestrator <command> [options]

Commands:
  start --task <file> [--config <file>] [--run-id <id>]   start a new autonomous run
  status [--run-id <id>]                                   show live status of latest/active run
  resume --run-id <id>                                     resume an unfinished run
  stop --run-id <id>                                       mark a run CANCELLED (does not kill processes)
  models                                                   list configured models + health
  runs                                                     list runs
  doctor                                                   verify environment

Options:
  --repo <dir>   repository root (default: cwd)
  --config <file> orchestrator config file
  --task <file>  task markdown/json file
  --run-id <id>  run identifier
`;
}
async function getConfig(configFlag) {
    const { config, path } = await loadConfig(configFlag, repoRoot);
    return { config: applyEnvOverrides(config), path };
}
async function buildRouterAndReviewer(configPath, runIdForLogs = "doctor") {
    const { config } = await getConfig(configPath);
    const router = new ModelRouter(config.coding.models, { cooldownMs: config.orchestrator.modelCooldownMs });
    const caps = { openCode: await detectOpenCode(), reviewer: { executableFound: await reviewerExecutableExists(config.review.executable), executable: config.review.executable } };
    return { config, router, caps };
}
async function cmdDoctor(configFlag) {
    const { config, router, caps } = await buildRouterAndReviewer(configFlag);
    const errors = validateConfig(config);
    const snap = await gitSnapshot(repoRoot);
    const checks = [
        ["node", process.version],
        ["repo", repoRoot],
        ["git", snap.isRepo ? `repo (branch=${snap.branch ?? "?"}, head=${snap.head?.slice(0, 8) ?? "?"})` : "NOT a git repo — git gates/safety limited"],
        ["opencode", caps.openCode.installed ? `v${caps.openCode.version} run=${caps.openCode.supportsRun} model=${caps.openCode.supportsModelFlag} session=${caps.openCode.supportsSessionFlag} continue=${caps.openCode.supportsContinueFlag} json=${caps.openCode.supportsFormatJson}` : "NOT FOUND"],
        ["reviewer", caps.reviewer.executableFound ? `${config.review.executable} found` : `${config.review.executable} NOT FOUND — review will fail clearly until configured`],
        ["models", router.snapshot().map((m) => `${m.id}=${m.status}`).join(", ") || "(none)"],
        ["config", errors.length === 0 ? "valid" : `INVALID: ${errors.join("; ")}`],
    ];
    for (const [k, v] of checks)
        console.log(`${k.padEnd(10)} ${v}`);
    return errors.length === 0 && caps.openCode.installed ? 0 : 2;
}
async function cmdModels(configFlag) {
    const { config, router } = await buildRouterAndReviewer(configFlag);
    for (const m of router.snapshot()) {
        console.log(`${m.status.padEnd(14)} ${m.id}  ${m.model}  fails=${m.failureCount}${m.cooldownUntil ? " cooldownUntil=" + m.cooldownUntil : ""}`);
    }
    void config;
    return 0;
}
async function cmdRuns() {
    const ids = listRunIds(repoRoot);
    if (ids.length === 0) {
        console.log("(no runs)");
        return 0;
    }
    for (const id of ids) {
        const p = runPaths(repoRoot, id);
        const st = await readState(p);
        console.log(`${id}  ${st ? st.state : "(no state)"}  task=${st?.taskId ?? "?"}`);
    }
    return 0;
}
async function cmdStatus(runId) {
    const ids = listRunIds(repoRoot);
    const id = runId ?? ids[0];
    if (!id) {
        console.log("(no runs)");
        return 1;
    }
    const p = runPaths(repoRoot, id);
    const st = await readState(p);
    if (!st) {
        console.log(`no state for run ${id}`);
        return 1;
    }
    const events = await readEvents(p);
    const last = events[events.length - 1];
    const elapsed = Date.parse(st.updatedAt) - Date.parse(st.startedAt);
    const { config } = await getConfig(arg("--config"));
    const router = new ModelRouter(config.coding.models, { cooldownMs: config.orchestrator.modelCooldownMs });
    console.log(renderStatus(st, router.snapshot(), {
        taskLabel: st.taskId, elapsedMs: Number.isFinite(elapsed) ? elapsed : 0,
        testsSummary: st.tests.length > 0 ? st.tests.map((t) => `${t.name}=${t.status}`).join(" ") : "PENDING",
        reviewer: st.findings.length > 0 ? `${st.findings.length} finding(s)` : "WAITING",
        lastAction: String(last?.["type"] ?? st.state),
    }));
    return 0;
}
async function cmdStart(taskFile, configFlag, runId) {
    const absTask = resolve(repoRoot, taskFile);
    if (!existsSync(absTask)) {
        console.error(`task file not found: ${absTask}`);
        return 1;
    }
    const { config, path: cfgPath } = await getConfig(configFlag);
    const errors = validateConfig(config);
    if (errors.length > 0) {
        console.error("invalid config: " + errors.join("; "));
        return 1;
    }
    const id = runId ?? newRunId("run");
    const paths = runPaths(repoRoot, id);
    await ensureRunDirs(paths);
    const caps = { openCode: await detectOpenCode(), reviewer: { executableFound: await reviewerExecutableExists(config.review.executable), executable: config.review.executable } };
    if (!caps.openCode.installed) {
        console.error("opencode executable not found on PATH");
        return 1;
    }
    console.log(`config: ${cfgPath ?? "(defaults)"}  run: ${id}`);
    const router = new ModelRouter(config.coding.models, { cooldownMs: config.orchestrator.modelCooldownMs });
    const codingAgentFactory = (model) => new OpenCodeAdapter({ timeoutMs: config.orchestrator.openCodeTimeoutMs, logDir: paths.opencodeDir, repoRoot, caps: caps.openCode });
    const reviewer = new DeepSeekHarnessReviewer({
        executable: config.review.executable, args: config.review.args ?? ["review", "--format", "json"],
        model: config.review.model, timeoutMs: config.review.timeoutMs ?? config.orchestrator.reviewerTimeoutMs,
        reviewDir: paths.reviewDir, runId: id,
    });
    const outcome = await runAutonomousTask({ taskFile: absTask, runId: id, paths, config, caps, codingAgentFactory, reviewer, router });
    console.log(`final: ${outcome.finalStatus}  report: ${outcome.reportPath}`);
    try {
        const report = await readFile(outcome.reportPath, "utf8");
        console.log(report.slice(0, 4000));
    }
    catch { /* noop */ }
    return outcome.finalStatus === "CERTIFIED" ? 0 : 3;
}
async function cmdResume(runId, configFlag) {
    const paths = runPaths(repoRoot, runId);
    const st = await readState(paths);
    if (!st) {
        console.error(`no state for run ${runId}`);
        return 1;
    }
    if (st.finalized) {
        console.log(`run ${runId} already finalized (${st.state})`);
        return 0;
    }
    return cmdStart(st.taskFile, configFlag, runId);
}
async function cmdStop(runId) {
    const paths = runPaths(repoRoot, runId);
    const st = await readState(paths);
    if (!st) {
        console.error(`no state for run ${runId}`);
        return 1;
    }
    st.history.push({ state: st.state, at: new Date().toISOString(), note: "CANCELLED by user" });
    const { appendFile } = await import("node:fs/promises");
    await appendFile(paths.eventsFile, JSON.stringify({ type: "CANCELLED", timestamp: new Date().toISOString() }) + "\n", "utf8").catch(() => undefined);
    const report = { status: "CANCELLED", taskId: st.taskId, runId, blockers: ["cancelled by user"] };
    await writeFile(paths.reportFile, JSON.stringify(report, null, 2), "utf8");
    console.log(`run ${runId} marked CANCELLED`);
    return 0;
}
async function ensureDefaultConfig() {
    const p = defaultConfigPath(repoRoot);
    if (!existsSync(p)) {
        await mkdir(join(repoRoot, ".ai", "orchestrator", "config"), { recursive: true });
        await writeFile(p, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
        console.log(`wrote default config: ${p}`);
    }
}
async function main() {
    const cmd = process.argv[2];
    if (!cmd || has("--help") || has("-h")) {
        console.log(usage());
        return 0;
    }
    if (cmd === "init") {
        await ensureDefaultConfig();
        return 0;
    }
    if (cmd === "doctor")
        return cmdDoctor(arg("--config"));
    if (cmd === "models")
        return cmdModels(arg("--config"));
    if (cmd === "runs")
        return cmdRuns();
    if (cmd === "status")
        return cmdStatus(arg("--run-id"));
    if (cmd === "stop") {
        const id = arg("--run-id") ?? arg("--id");
        if (!id) {
            console.error("stop requires --run-id");
            return 1;
        }
        return cmdStop(id);
    }
    if (cmd === "resume") {
        const id = arg("--run-id") ?? arg("--id");
        if (!id) {
            console.error("resume requires --run-id");
            return 1;
        }
        return cmdResume(id, arg("--config"));
    }
    if (cmd === "start") {
        const task = arg("--task");
        if (!task) {
            console.error("start requires --task <file>");
            return 1;
        }
        return cmdStart(task, arg("--config"), arg("--run-id"));
    }
    console.error(`unknown command: ${cmd}\n` + usage());
    return 1;
}
main().then((c) => process.exit(c), (e) => { console.error(String(e?.stack ?? e)); process.exit(1); });
//# sourceMappingURL=cli.js.map