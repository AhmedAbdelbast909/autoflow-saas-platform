import type { ClassifiedFailure, FailureKind } from "./types.js";
export declare function classifyFailure(exitCode: number | null, output: string): ClassifiedFailure;
export declare function isQuotaLike(kind: FailureKind): boolean;
//# sourceMappingURL=failure-classifier.d.ts.map