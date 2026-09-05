import { execFile, spawn, type ChildProcess } from "node:child_process";

/**
 * Windows-safe process execution.
 * npm-shimmed CLIs (opencode, npm, tsc via .cmd) cannot be spawned with
 * shell:false on Windows. With shell:true Node concatenates args without
 * escaping, so we quote every argument ourselves (file included).
 */
export function quoteArg(arg: string): string {
  if (arg === "") return '""';
  if (!/[\s"`$&|<>^!*?()[\]{};#'~]/.test(arg)) return arg;
  return '"' + arg.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\*)$/, "$1$1") + '"';
}

const NEEDS_SHELL = process.platform === "win32";

export interface RunOpts {
  cwd?: string;
  timeout?: number;
  maxBuffer?: number;
}

export function execFileSafe(
  file: string,
  args: string[],
  opts: RunOpts = {},
): Promise<{ code: number | null; stdout: string; stderr: string; error: Error | null }> {
  return new Promise((resolve) => {
    try {
      const cb = (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => {
        const code = error
          ? (typeof (error as unknown as { code?: unknown }).code === "number"
              ? ((error as unknown as { code: number }).code)
              : 1)
          : 0;
        resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), error });
      };
      if (NEEDS_SHELL) {
        const cmd = [file, ...args].map(quoteArg).join(" ");
        execFile(cmd, { ...opts, shell: true, windowsHide: true } as never, cb as never);
      } else {
        execFile(file, args, { ...opts, windowsHide: true }, cb as never);
      }
    } catch (err) {
      resolve({ code: 1, stdout: "", stderr: "", error: err as Error });
    }
  });
}

export function spawnSafe(file: string, args: string[], opts: { cwd?: string; timeout?: number }): ChildProcess {
  if (NEEDS_SHELL) {
    const cmd = [file, ...args].map(quoteArg).join(" ");
    return spawn(cmd, { cwd: opts.cwd, windowsHide: true, shell: true });
  }
  return spawn(file, args, { cwd: opts.cwd, windowsHide: true });
}
