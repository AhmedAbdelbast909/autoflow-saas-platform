import { execFileSafe } from "./proc.js";

function runGit(repoRoot: string, args: string[], timeoutMs = 15000): Promise<{ code: number; out: string }> {
  return (async () => {
    const r = await execFileSafe("git", args, { cwd: repoRoot, timeout: timeoutMs });
    return { code: r.code ?? 1, out: r.stdout + r.stderr };
  })();
}

export interface GitSnapshot {
  isRepo: boolean;
  head: string | null;
  branch: string | null;
  statusShort: string;
  diffStat: string;
  hasUnrelatedChanges?: boolean;
}

export async function gitSnapshot(repoRoot: string): Promise<GitSnapshot> {
  const rev = await runGit(repoRoot, ["rev-parse", "--is-inside-work-tree"]);
  if (rev.code !== 0 || !rev.out.includes("true")) {
    return { isRepo: false, head: null, branch: null, statusShort: "", diffStat: "" };
  }
  const head = await runGit(repoRoot, ["rev-parse", "HEAD"]);
  const branch = await runGit(repoRoot, ["branch", "--show-current"]);
  const status = await runGit(repoRoot, ["status", "--short", "--branch"]);
  const diff = await runGit(repoRoot, ["diff", "--stat"]);
  return {
    isRepo: true,
    head: head.code === 0 ? head.out.trim().split("\n")[0] : null,
    branch: branch.code === 0 && branch.out.trim() ? branch.out.trim().split("\n")[0] : null,
    statusShort: status.out.trim().slice(0, 8000),
    diffStat: diff.out.trim().slice(0, 8000),
  };
}

export async function gitDiff(repoRoot: string, maxChars = 60000): Promise<string> {
  const snap = await gitSnapshot(repoRoot);
  if (!snap.isRepo) return "";
  const diff = await runGit(repoRoot, ["diff", "--no-color", "--unified=3"], 30000);
  const staged = await runGit(repoRoot, ["diff", "--cached", "--no-color", "--unified=3"], 30000);
  const combined = `--- unstaged ---\n${diff.out}\n--- staged ---\n${staged.out}`;
  return combined.slice(0, maxChars);
}

export async function gitChangedFiles(repoRoot: string): Promise<string[]> {
  const r = await runGit(repoRoot, ["status", "--porcelain"]);
  if (r.code !== 0) return [];
  return r.out.split("\n").map((l) => l.trim()).filter(Boolean)
    .map((l) => l.slice(2).trim().split(" -> ").pop() as string)
    .filter(Boolean).slice(0, 500);
}

const FORBIDDEN = ["reset --hard", "push --force", "push -f", "rebase", "filter-branch", "clean -fd", "checkout ."];

export function assertGitSafe(args: string[]): void {
  const joined = args.join(" ");
  for (const f of FORBIDDEN) {
    if (joined.includes(f)) throw new Error(`Refused destructive git command: git ${joined}`);
  }
}

export async function gitCommit(repoRoot: string, message: string, files: string[]): Promise<{ code: number; out: string }> {
  if (files.length > 0) {
    assertGitSafe(["add", ...files]);
    const add = await runGit(repoRoot, ["add", "--", ...files]);
    if (add.code !== 0) return add;
  }
  assertGitSafe(["commit", message]);
  return runGit(repoRoot, ["commit", "-m", message]);
}
