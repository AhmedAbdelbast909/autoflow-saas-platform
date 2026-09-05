import type { RunStateDoc } from "./types.js";
export interface Paths {
    repoRoot: string;
    baseDir: string;
    runDir: string;
    stateFile: string;
    eventsFile: string;
    taskFile: string;
    planFile: string;
    reportFile: string;
    opencodeDir: string;
    reviewDir: string;
    testsDir: string;
    logDir: string;
}
export declare function runPaths(repoRoot: string, runId: string): Paths;
export declare function ensureRunDirs(p: Paths): Promise<void>;
export declare function writeState(p: Paths, state: RunStateDoc): Promise<void>;
export declare function readState(p: Paths): Promise<RunStateDoc | null>;
export declare function emitEvent(p: Paths, type: string, data?: Record<string, unknown>): Promise<void>;
export declare function readEvents(p: Paths): Promise<Array<Record<string, unknown>>>;
export declare function newRunId(prefix?: string): string;
export declare function listRunIds(repoRoot: string): string[];
//# sourceMappingURL=state-store.d.ts.map