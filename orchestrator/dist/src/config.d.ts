import type { OrchestratorConfig } from "./types.js";
export declare const DEFAULT_CONFIG: OrchestratorConfig;
export declare function repoRootDefault(): string;
export declare function defaultConfigPath(repoRoot: string): string;
export declare function validateConfig(cfg: OrchestratorConfig): string[];
export declare function loadConfig(configPath?: string, repoRoot?: string): Promise<{
    config: OrchestratorConfig;
    path: string | null;
}>;
export declare function applyEnvOverrides(cfg: OrchestratorConfig): OrchestratorConfig;
//# sourceMappingURL=config.d.ts.map