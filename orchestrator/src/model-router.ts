import type { FailureKind, ModelEntry, ModelHealth, ModelHealthStatus } from "./types.js";

export interface RouterOptions {
  cooldownMs: number;
  maxAttemptsPerModel?: number;
}

export class ModelRouter {
  private health = new Map<string, ModelHealth>();
  private attempts = new Map<string, number>();
  constructor(private models: ModelEntry[], private opts: RouterOptions) {
    const now = new Date().toISOString();
    for (const m of models) {
      this.health.set(m.model, {
        model: m.model, id: m.id,
        status: m.enabled ? "AVAILABLE" : "DISABLED",
        cooldownUntil: null, lastSuccess: null, lastFailure: null,
        failureCount: 0, lastFailureKind: null,
      });
      void now;
    }
  }

  setModels(models: ModelEntry[]): void {
    this.models = models;
    for (const m of models) {
      if (!this.health.has(m.model)) {
        this.health.set(m.model, {
          model: m.model, id: m.id, status: m.enabled ? "AVAILABLE" : "DISABLED",
          cooldownUntil: null, lastSuccess: null, lastFailure: null,
          failureCount: 0, lastFailureKind: null,
        });
      } else {
        const h = this.health.get(m.model)!;
        if (!m.enabled) { h.status = "DISABLED"; }
        else if (h.status === "DISABLED") { h.status = "AVAILABLE"; h.cooldownUntil = null; }
      }
    }
  }

  sorted(): ModelEntry[] {
    return [...this.models].sort((a, b) => a.priority - b.priority);
  }

  isAvailable(m: ModelEntry, nowMs = Date.now()): boolean {
    if (!m.enabled) return false;
    const h = this.health.get(m.model);
    if (!h) return true;
    if (h.status === "DISABLED") return false;
    if (h.cooldownUntil && Date.parse(h.cooldownUntil) > nowMs) return false;
    return true;
  }

  selectNext(exclude: string[] = [], nowMs = Date.now()): ModelEntry | null {
    for (const m of this.sorted()) {
      if (exclude.includes(m.model)) continue;
      if (this.isAvailable(m, nowMs)) return m;
    }
    return null;
  }

  recordSuccess(model: string): void {
    const h = this.health.get(model);
    if (!h) return;
    h.status = "AVAILABLE";
    h.lastSuccess = new Date().toISOString();
    h.cooldownUntil = null;
    h.failureCount = 0;
    h.lastFailureKind = null;
    this.attempts.set(model, 0);
  }

  recordFailure(model: string, kind: FailureKind): void {
    const h = this.health.get(model);
    if (!h) return;
    const now = new Date().toISOString();
    h.lastFailure = now;
    h.lastFailureKind = kind;
    h.failureCount += 1;
    this.attempts.set(model, (this.attempts.get(model) ?? 0) + 1);
    const statusMap: Record<FailureKind, ModelHealthStatus> = {
      QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
      RATE_LIMITED: "RATE_LIMITED",
      AUTH_FAILED: "AUTH_FAILED",
      PROVIDER_UNAVAILABLE: "UNAVAILABLE",
      TIMEOUT: "UNAVAILABLE",
      TRANSIENT: "UNAVAILABLE",
      PERMANENT_CONFIG: "UNAVAILABLE",
      UNKNOWN: "UNAVAILABLE",
    };
    h.status = statusMap[kind];
    if (kind !== "PERMANENT_CONFIG" && kind !== "AUTH_FAILED") {
      h.cooldownUntil = new Date(Date.now() + this.opts.cooldownMs).toISOString();
      h.status = h.status === "AVAILABLE" ? "COOLDOWN" : h.status;
    }
  }

  disableModel(model: string): void {
    const h = this.health.get(model);
    if (h) { h.status = "DISABLED"; h.cooldownUntil = null; }
  }

  enableModel(model: string): void {
    const h = this.health.get(model);
    if (h) { h.status = "AVAILABLE"; h.cooldownUntil = null; h.failureCount = 0; }
  }

  snapshot(): ModelHealth[] {
    const nowMs = Date.now();
    return this.sorted().map((m) => {
      const h = this.health.get(m.model)!;
      const inCooldown = h.cooldownUntil !== null && Date.parse(h.cooldownUntil) > nowMs;
      return { ...h, status: !m.enabled ? "DISABLED" : inCooldown ? "COOLDOWN" : h.status };
    });
  }

  loadSnapshot(entries: ModelHealth[]): void {
    for (const e of entries) {
      if (this.health.has(e.model)) this.health.set(e.model, { ...e });
    }
  }

  attemptsFor(model: string): number {
    return this.attempts.get(model) ?? 0;
  }
}
