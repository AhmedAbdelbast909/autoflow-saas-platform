import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { redactSecrets } from "./secrets.js";
export function runPaths(repoRoot, runId) {
    const baseDir = join(repoRoot, ".ai", "orchestrator");
    const runDir = join(baseDir, "runs", runId);
    return {
        repoRoot, baseDir, runDir,
        stateFile: join(runDir, "state.json"),
        eventsFile: join(runDir, "events.jsonl"),
        taskFile: join(runDir, "task.json"),
        planFile: join(runDir, "plan.md"),
        reportFile: join(runDir, "final-report.json"),
        opencodeDir: join(runDir, "opencode"),
        reviewDir: join(runDir, "review"),
        testsDir: join(runDir, "tests"),
        logDir: join(baseDir, "logs"),
    };
}
export async function ensureRunDirs(p) {
    for (const d of [p.baseDir, p.runDir, p.opencodeDir, p.reviewDir, p.testsDir, p.logDir]) {
        await mkdir(d, { recursive: true });
    }
}
export async function writeState(p, state) {
    state.updatedAt = new Date().toISOString();
    await mkdir(dirname(p.stateFile), { recursive: true });
    const tmp = p.stateFile + ".tmp";
    await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
    const { rename } = await import("node:fs/promises");
    await rename(tmp, p.stateFile);
}
export async function readState(p) {
    if (!existsSync(p.stateFile))
        return null;
    try {
        return JSON.parse(await readFile(p.stateFile, "utf8"));
    }
    catch {
        return null;
    }
}
export async function emitEvent(p, type, data = {}) {
    const evt = { type, timestamp: new Date().toISOString(), ...data };
    await mkdir(dirname(p.eventsFile), { recursive: true });
    await appendFile(p.eventsFile, redactSecrets(JSON.stringify(evt)) + "\n", "utf8");
}
export async function readEvents(p) {
    if (!existsSync(p.eventsFile))
        return [];
    const text = await readFile(p.eventsFile, "utf8");
    return text.split("\n").filter(Boolean).map((l) => { try {
        return JSON.parse(l);
    }
    catch {
        return { raw: l };
    } });
}
export function newRunId(prefix = "run") {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${stamp}-${rand}`;
}
export function listRunIds(repoRoot) {
    try {
        return readdirSync(join(repoRoot, ".ai", "orchestrator", "runs"), { withFileTypes: true })
            .filter((d) => d.isDirectory()).map((d) => d.name).sort().reverse();
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=state-store.js.map