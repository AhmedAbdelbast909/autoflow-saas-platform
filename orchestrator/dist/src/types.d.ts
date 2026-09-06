export type RunState = "DISCOVER" | "PLAN" | "IMPLEMENT" | "TEST" | "REVIEW" | "FIX" | "RETEST" | "CERTIFY" | "COMMIT" | "BLOCKED" | "DONE";
export type FinalStatus = "CERTIFIED" | "BLOCKED" | "FAILED" | "CANCELLED";
export interface ModelEntry {
    id: string;
    provider: string;
    model: string;
    priority: number;
    enabled: boolean;
    maxAttempts?: number;
}
export interface LimitsConfig {
    maxModelAttempts: number;
    maxFixCycles: number;
    maxReviewCycles: number;
    maxConsecutiveFailures: number;
    modelCooldownMs: number;
    openCodeTimeoutMs: number;
    reviewerTimeoutMs: number;
}
export interface QualityGateEntry {
    name: string;
    command: string[];
    enabled: boolean;
    required: boolean;
    workdir?: string;
}
export interface QualityConfig {
    typecheck: boolean;
    lint: boolean;
    tests: boolean;
    build: boolean;
    extraGates?: QualityGateEntry[];
    projectDir?: string;
}
export interface GitConfig {
    autoCommit: boolean;
}
export interface ReviewerConfig {
    executable: string;
    args?: string[];
    model?: string;
    timeoutMs?: number;
    envPrefixAllowlist?: string[];
    failOnUnavailable?: boolean;
}
export interface OrchestratorConfig {
    orchestrator: {
        maxFixCycles: number;
        maxModelAttempts: number;
        maxReviewCycles: number;
        maxConsecutiveFailures: number;
        modelCooldownMs: number;
        openCodeTimeoutMs: number;
        reviewerTimeoutMs: number;
        autoCommit: boolean;
    };
    coding: {
        models: ModelEntry[];
    };
    review: ReviewerConfig & {
        provider: string;
        model: string;
    };
    quality: QualityConfig;
    git: GitConfig;
    certification: {
        maxP0: number;
        maxP1: number;
        maxP2?: number;
        requireTestsPass: boolean;
        requireTypecheckPass: boolean;
        requireLintPass: boolean;
        requireBuildPass: boolean;
    };
}
export type FailureKind = "QUOTA_EXCEEDED" | "RATE_LIMITED" | "AUTH_FAILED" | "PROVIDER_UNAVAILABLE" | "TIMEOUT" | "TRANSIENT" | "PERMANENT_CONFIG" | "UNKNOWN";
export interface ClassifiedFailure {
    kind: FailureKind;
    retryableWithNextModel: boolean;
    permanent: boolean;
    evidence: string;
}
export type ModelHealthStatus = "AVAILABLE" | "UNAVAILABLE" | "RATE_LIMITED" | "QUOTA_EXCEEDED" | "AUTH_FAILED" | "COOLDOWN" | "DISABLED";
export interface ModelHealth {
    model: string;
    id: string;
    status: ModelHealthStatus;
    cooldownUntil: string | null;
    lastSuccess: string | null;
    lastFailure: string | null;
    failureCount: number;
    lastFailureKind: FailureKind | null;
}
export interface CodingInput {
    taskText: string;
    acceptanceCriteria: string[];
    context: {
        runId: string;
        attempt: number;
        cycle: number;
        repoRoot: string;
        changedFilesSoFar: string[];
        previousFindings: ReviewFinding[];
        sessionId: string | null;
        extraInstructions: string;
    };
    model: ModelEntry;
}
export interface CodingResult {
    ok: boolean;
    exitCode: number | null;
    sessionId: string | null;
    outputTail: string;
    logFile: string;
    failure?: ClassifiedFailure;
    gitHeadBefore: string | null;
    gitHeadAfter: string | null;
    changedFiles: string[];
}
export interface GateResult {
    name: string;
    command: string[];
    exitCode: number | null;
    status: "PASS" | "FAIL" | "NOT_TESTED" | "SKIPPED";
    durationMs: number;
    outputTail: string;
    skippedReason?: string;
}
export interface ReviewFinding {
    id: string;
    severity: "P0" | "P1" | "P2" | "P3";
    file?: string;
    line?: number;
    problem: string;
    required_fix: string;
}
export type ReviewStatus = "PASS" | "FAIL" | "UNAVAILABLE";
export interface ReviewResult {
    status: ReviewStatus;
    summary: string;
    findings: ReviewFinding[];
    required_actions: string[];
    rawOutput: string;
}
export interface ReviewInput {
    taskText: string;
    acceptanceCriteria: string[];
    gitDiff: string;
    changedFiles: string[];
    testResults: GateResult[];
    buildResults: GateResult[];
    previousFindings: ReviewFinding[];
    implementationStatus: string;
    repoRoot: string;
}
export interface CodingAgent {
    run(input: CodingInput): Promise<CodingResult>;
}
export interface Reviewer {
    review(input: ReviewInput): Promise<ReviewResult>;
}
export interface RunStateDoc {
    taskId: string;
    runId: string;
    state: RunState;
    attempt: number;
    fixCycle: number;
    reviewCycle: number;
    consecutiveFailures: number;
    reviewerStatus: ReviewStatus | null;
    currentModel: string | null;
    sessionId: string | null;
    startedAt: string;
    updatedAt: string;
    taskFile: string;
    taskText: string;
    acceptanceCriteria: string[];
    findings: ReviewFinding[];
    tests: GateResult[];
    history: Array<{
        state: RunState;
        at: string;
        note: string;
    }>;
    modelsUsed: string[];
    fallbacks: Array<{
        from: string;
        to: string;
        reason: string;
        at: string;
    }>;
    gitHead: string | null;
    gitBranch: string | null;
    openCodePid: number | null;
    finalized: boolean;
}
export interface OrchestratorCapabilities {
    openCode: {
        installed: boolean;
        version: string | null;
        supportsRun: boolean;
        supportsModelFlag: boolean;
        supportsSessionFlag: boolean;
        supportsContinueFlag: boolean;
        supportsFormatJson: boolean;
    };
    reviewer: {
        executableFound: boolean;
        executable: string;
    };
}
//# sourceMappingURL=types.d.ts.map