import type { ModelHealth } from "./types.js";
import type { RunStateDoc } from "./types.js";
export declare function renderStatus(state: RunStateDoc, health: ModelHealth[], extra: {
    taskLabel: string;
    elapsedMs: number;
    testsSummary: string;
    reviewer: string;
    lastAction: string;
}): string;
//# sourceMappingURL=status-view.d.ts.map