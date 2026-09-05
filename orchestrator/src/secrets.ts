const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9-_]{8,}/g,
  /sk-ant-[A-Za-z0-9-_]{8,}/g,
  /xox[bpas]-[A-Za-z0-9-]{8,}/g,
  /ghp_[A-Za-z0-9]{8,}/g,
  /github_pat_[A-Za-z0-9_]{8,}/g,
  /AIza[A-Za-z0-9-_]{8,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];

const ENV_SECRET_KEYS = [
  "API_KEY",
  "SECRET",
  "TOKEN",
  "PASSWORD",
  "PRIVATE_KEY",
  "SUPABASE",
  "OPENAI",
  "ANTHROPIC",
  "DEEPSEEK",
  "OPENCODE",
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, "[REDACTED]");
  }
  for (const key of ENV_SECRET_KEYS) {
    const re = new RegExp(`(${key}[A-Za-z0-9_]*\\s*[:=]\\s*)([^\\s"'\\]]{6,})`, "gi");
    out = out.replace(re, "$1[REDACTED]");
  }
  return out;
}

export function redactEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    const upper = k.toUpperCase();
    const sensitive = ENV_SECRET_KEYS.some((s) => upper.includes(s));
    out[k] = sensitive ? "[REDACTED]" : String(v ?? "");
  }
  return out;
}

export function sanitizeArgsForLog(args: string[]): string[] {
  return args.map((a) => {
    if (a.length > 24 && /^(sk-|sk-ant-|ghp_|github_pat_|xox|AIza)/.test(a)) return "[REDACTED]";
    return redactSecrets(a);
  });
}
