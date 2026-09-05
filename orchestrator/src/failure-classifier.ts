import type { ClassifiedFailure, FailureKind } from "./types.js";

const RULES: Array<{ kind: FailureKind; re: RegExp }> = [
  { kind: "QUOTA_EXCEEDED", re: /(quota|usage limit|usage_limit|credit|credits|insufficient|billing|plan limit|free limit|allowance|exhausted)/i },
  { kind: "RATE_LIMITED", re: /(rate.?limit|429|too many requests|throttl|retry after|rate exceeded)/i },
  { kind: "AUTH_FAILED", re: /(unauthorized|401\b|403\b|forbidden|invalid api key|invalid_api_key|api key|authenticat|permission denied|access denied|sign[- ]?in required)/i },
  { kind: "PROVIDER_UNAVAILABLE", re: /(5\d\d\b|bad gateway|service unavailable|server error|internal error|overloaded|provider|upstream|econnreset|econnrefused|enotfound|socket hang up|fetch failed|network)/i },
  { kind: "TIMEOUT", re: /(timed? ?out|etimeout|deadline exceeded|timout)/i },
];

const PERMANENT_RE = /(invalid model|model not found|unknown provider|unsupported provider|no such provider|bad request.*model|config.*invalid|executable not found|enoent|not recognized as)/i;

export function classifyFailure(exitCode: number | null, output: string): ClassifiedFailure {
  const evidence = output.slice(-2000);
  if (PERMANENT_RE.test(output) && !/rate|quota|credit|429|5\d\d|timeout|network/i.test(output)) {
    const authLike = RULES.find((r) => r.kind === "AUTH_FAILED")!;
    if (authLike.re.test(output)) {
      return { kind: "AUTH_FAILED", retryableWithNextModel: true, permanent: false, evidence };
    }
    return { kind: "PERMANENT_CONFIG", retryableWithNextModel: false, permanent: true, evidence };
  }
  for (const rule of RULES) {
    if (rule.re.test(output)) {
      const permanent = rule.kind === "AUTH_FAILED" ? false : false;
      return {
        kind: rule.kind,
        retryableWithNextModel: true,
        permanent,
        evidence,
      };
    }
  }
  if (exitCode !== 0 && exitCode !== null) {
    return { kind: "TRANSIENT", retryableWithNextModel: true, permanent: false, evidence };
  }
  return { kind: "UNKNOWN", retryableWithNextModel: false, permanent: false, evidence };
}

export function isQuotaLike(kind: FailureKind): boolean {
  return kind === "QUOTA_EXCEEDED" || kind === "RATE_LIMITED" || kind === "TIMEOUT" || kind === "TRANSIENT" || kind === "PROVIDER_UNAVAILABLE";
}
