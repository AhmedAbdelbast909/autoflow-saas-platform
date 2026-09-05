import type { CodingAgent, CodingInput, CodingResult, OrchestratorCapabilities } from "./types.js";
export declare function detectOpenCode(): Promise<OrchestratorCapabilities["openCode"]>;
export interface OpenCodeAdapterOptions {
    timeoutMs: number;
    logDir: string;
    repoRoot: string;
    caps: OrchestratorCapabilities["openCode"];
}
export declare class OpenCodeAdapter implements CodingAgent {
    private opts;
    constructor(opts: OpenCodeAdapterOptions);
    run(input: CodingInput): Promise<CodingResult>;
    private spawnOpencode;
}
export declare function buildPrompt(input: CodingInput): string;
//# sourceMappingURL=opencode.d.ts.map