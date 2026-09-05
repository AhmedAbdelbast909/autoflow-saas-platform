import { type ChildProcess } from "node:child_process";
/**
 * Windows-safe process execution.
 * npm-shimmed CLIs (opencode, npm, tsc via .cmd) cannot be spawned with
 * shell:false on Windows. With shell:true Node concatenates args without
 * escaping, so we quote every argument ourselves (file included).
 */
export declare function quoteArg(arg: string): string;
export interface RunOpts {
    cwd?: string;
    timeout?: number;
    maxBuffer?: number;
}
export declare function execFileSafe(file: string, args: string[], opts?: RunOpts): Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
    error: Error | null;
}>;
export declare function spawnSafe(file: string, args: string[], opts: {
    cwd?: string;
    timeout?: number;
}): ChildProcess;
//# sourceMappingURL=proc.d.ts.map