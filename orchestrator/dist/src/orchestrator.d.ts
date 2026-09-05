import { ModelRouter } from "./model-router.js";
import { type Paths } from "./state-store.js";
import type { CodingAgent, FinalStatus, GateResult, ModelEntry, OrchestratorConfig, OrchestratorCapabilities, Reviewer, ReviewFinding } from "./types.js";
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
export declare function certificationDecision(config: OrchestratorConfig, findings: ReviewFinding[], gates: GateResult[], reviewerStatus: "PASS" | "FAIL" | null): {
    certifiable: boolean;
    blockers: string[];
};
export declare function runAutonomousTask(opts: RunOptions): Promise<RunOutcome>;
//# sourceMappingURL=orchestrator.d.ts.map