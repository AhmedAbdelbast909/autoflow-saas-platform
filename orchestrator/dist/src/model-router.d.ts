import type { FailureKind, ModelEntry, ModelHealth } from "./types.js";
export interface RouterOptions {
    cooldownMs: number;
    maxAttemptsPerModel?: number;
}
export declare class ModelRouter {
    private models;
    private opts;
    private health;
    private attempts;
    constructor(models: ModelEntry[], opts: RouterOptions);
    setModels(models: ModelEntry[]): void;
    sorted(): ModelEntry[];
    isAvailable(m: ModelEntry, nowMs?: number): boolean;
    selectNext(exclude?: string[], nowMs?: number): ModelEntry | null;
    recordSuccess(model: string): void;
    recordFailure(model: string, kind: FailureKind): void;
    disableModel(model: string): void;
    enableModel(model: string): void;
    snapshot(): ModelHealth[];
    loadSnapshot(entries: ModelHealth[]): void;
    attemptsFor(model: string): number;
}
//# sourceMappingURL=model-router.d.ts.map