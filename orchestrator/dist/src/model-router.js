export class ModelRouter {
    models;
    opts;
    health = new Map();
    attempts = new Map();
    constructor(models, opts) {
        this.models = models;
        this.opts = opts;
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
    setModels(models) {
        this.models = models;
        for (const m of models) {
            if (!this.health.has(m.model)) {
                this.health.set(m.model, {
                    model: m.model, id: m.id, status: m.enabled ? "AVAILABLE" : "DISABLED",
                    cooldownUntil: null, lastSuccess: null, lastFailure: null,
                    failureCount: 0, lastFailureKind: null,
                });
            }
            else {
                const h = this.health.get(m.model);
                if (!m.enabled) {
                    h.status = "DISABLED";
                }
                else if (h.status === "DISABLED") {
                    h.status = "AVAILABLE";
                    h.cooldownUntil = null;
                }
            }
        }
    }
    sorted() {
        return [...this.models].sort((a, b) => a.priority - b.priority);
    }
    isAvailable(m, nowMs = Date.now()) {
        if (!m.enabled)
            return false;
        const h = this.health.get(m.model);
        if (!h)
            return true;
        if (h.status === "DISABLED")
            return false;
        if (h.cooldownUntil && Date.parse(h.cooldownUntil) > nowMs)
            return false;
        return true;
    }
    selectNext(exclude = [], nowMs = Date.now()) {
        for (const m of this.sorted()) {
            if (exclude.includes(m.model))
                continue;
            if (this.isAvailable(m, nowMs))
                return m;
        }
        return null;
    }
    recordSuccess(model) {
        const h = this.health.get(model);
        if (!h)
            return;
        h.status = "AVAILABLE";
        h.lastSuccess = new Date().toISOString();
        h.cooldownUntil = null;
        h.failureCount = 0;
        h.lastFailureKind = null;
        this.attempts.set(model, 0);
    }
    recordFailure(model, kind) {
        const h = this.health.get(model);
        if (!h)
            return;
        const now = new Date().toISOString();
        h.lastFailure = now;
        h.lastFailureKind = kind;
        h.failureCount += 1;
        this.attempts.set(model, (this.attempts.get(model) ?? 0) + 1);
        const statusMap = {
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
    disableModel(model) {
        const h = this.health.get(model);
        if (h) {
            h.status = "DISABLED";
            h.cooldownUntil = null;
        }
    }
    enableModel(model) {
        const h = this.health.get(model);
        if (h) {
            h.status = "AVAILABLE";
            h.cooldownUntil = null;
            h.failureCount = 0;
        }
    }
    snapshot() {
        const nowMs = Date.now();
        return this.sorted().map((m) => {
            const h = this.health.get(m.model);
            const inCooldown = h.cooldownUntil !== null && Date.parse(h.cooldownUntil) > nowMs;
            return { ...h, status: !m.enabled ? "DISABLED" : inCooldown ? "COOLDOWN" : h.status };
        });
    }
    loadSnapshot(entries) {
        for (const e of entries) {
            if (this.health.has(e.model))
                this.health.set(e.model, { ...e });
        }
    }
    attemptsFor(model) {
        return this.attempts.get(model) ?? 0;
    }
}
//# sourceMappingURL=model-router.js.map