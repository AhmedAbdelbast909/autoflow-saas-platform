import { execFile, spawn } from "node:child_process";
/**
 * Windows-safe process execution.
 * npm-shimmed CLIs (opencode, npm, tsc via .cmd) cannot be spawned with
 * shell:false on Windows. With shell:true Node concatenates args without
 * escaping, so we quote every argument ourselves (file included).
 */
export function quoteArg(arg) {
    if (arg === "")
        return '""';
    if (!/[\s"`$&|<>^!*?()[\]{};#'~]/.test(arg))
        return arg;
    return '"' + arg.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\*)$/, "$1$1") + '"';
}
const NEEDS_SHELL = process.platform === "win32";
export function execFileSafe(file, args, opts = {}) {
    return new Promise((resolve) => {
        try {
            const cb = (error, stdout, stderr) => {
                const code = error
                    ? (typeof error.code === "number"
                        ? (error.code)
                        : 1)
                    : 0;
                resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), error });
            };
            if (NEEDS_SHELL) {
                const cmd = [file, ...args].map(quoteArg).join(" ");
                execFile(cmd, { ...opts, shell: true, windowsHide: true }, cb);
            }
            else {
                execFile(file, args, { ...opts, windowsHide: true }, cb);
            }
        }
        catch (err) {
            resolve({ code: 1, stdout: "", stderr: "", error: err });
        }
    });
}
export function spawnSafe(file, args, opts) {
    if (NEEDS_SHELL) {
        const cmd = [file, ...args].map(quoteArg).join(" ");
        return spawn(cmd, { cwd: opts.cwd, windowsHide: true, shell: true });
    }
    return spawn(file, args, { cwd: opts.cwd, windowsHide: true });
}
//# sourceMappingURL=proc.js.map