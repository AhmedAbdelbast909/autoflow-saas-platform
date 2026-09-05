import type { Reviewer, ReviewInput, ReviewResult } from "./types.js";
export declare function reviewerPrompt(input: ReviewInput): string;
export declare function parseReviewJson(raw: string): ReviewResult;
export interface DeepSeekHarnessOptions {
    executable: string;
    args: string[];
    model?: string;
    timeoutMs: number;
    reviewDir: string;
    runId: string;
}
export declare class DeepSeekHarnessReviewer implements Reviewer {
    private opts;
    constructor(opts: DeepSeekHarnessOptions);
    review(input: ReviewInput): Promise<ReviewResult>;
    private spawnReviewer;
}
export declare function reviewerExecutableExists(executable: string): Promise<boolean>;
//# sourceMappingURL=reviewer.d.ts.map