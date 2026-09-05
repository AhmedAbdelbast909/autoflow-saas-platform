export interface GitSnapshot {
    isRepo: boolean;
    head: string | null;
    branch: string | null;
    statusShort: string;
    diffStat: string;
    hasUnrelatedChanges?: boolean;
}
export declare function gitSnapshot(repoRoot: string): Promise<GitSnapshot>;
export declare function gitDiff(repoRoot: string, maxChars?: number): Promise<string>;
export declare function gitChangedFiles(repoRoot: string): Promise<string[]>;
export declare function assertGitSafe(args: string[]): void;
export declare function gitCommit(repoRoot: string, message: string, files: string[]): Promise<{
    code: number;
    out: string;
}>;
//# sourceMappingURL=git.d.ts.map