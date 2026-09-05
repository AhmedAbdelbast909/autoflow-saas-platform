import type { GateResult, QualityConfig } from "./types.js";
export interface DiscoveredCommands {
    pkgDir: string | null;
    scripts: Record<string, string>;
    hasTsc: boolean;
    hasEslint: boolean;
}
export declare function discoverRepoCommands(repoRoot: string, projectDir?: string): Promise<DiscoveredCommands>;
export declare function runQualityGates(repoRoot: string, quality: QualityConfig, timeoutPerGateMs?: number): Promise<GateResult[]>;
//# sourceMappingURL=quality.d.ts.map