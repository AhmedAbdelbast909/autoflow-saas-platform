import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ModelRouter } from "../src/model-router.js";
const models = [
    { id: "coding-primary", provider: "opencode", model: "opencode/a", priority: 1, enabled: true },
    { id: "coding-secondary", provider: "opencode", model: "opencode/b", priority: 2, enabled: true },
    { id: "coding-tertiary", provider: "opencode", model: "opencode/c", priority: 3, enabled: true },
];
describe("model selection + priority", () => {
    it("selects lowest priority number first", () => {
        const r = new ModelRouter(models, { cooldownMs: 60000 });
        assert.equal(r.selectNext()?.model, "opencode/a");
    });
    it("skips disabled models", () => {
        const r = new ModelRouter(models.map((m) => m.id === "coding-primary" ? { ...m, enabled: false } : m), { cooldownMs: 60000 });
        assert.equal(r.selectNext()?.model, "opencode/b");
    });
    it("quota fallback moves to next model", () => {
        const r = new ModelRouter(models, { cooldownMs: 600000 });
        assert.equal(r.selectNext()?.model, "opencode/a");
        r.recordFailure("opencode/a", "QUOTA_EXCEEDED");
        assert.equal(r.selectNext()?.model, "opencode/b");
        r.recordFailure("opencode/b", "RATE_LIMITED");
        assert.equal(r.selectNext()?.model, "opencode/c");
    });
    it("rate-limit and timeout mark cooldown", () => {
        const r = new ModelRouter(models, { cooldownMs: 600000 });
        r.recordFailure("opencode/a", "RATE_LIMITED");
        r.recordFailure("opencode/a", "TIMEOUT");
        const snap = r.snapshot().find((s) => s.model === "opencode/a");
        assert.ok(snap.cooldownUntil !== null);
        assert.equal(r.selectNext()?.model, "opencode/b");
    });
    it("auth failure is recorded and skippable", () => {
        const r = new ModelRouter(models, { cooldownMs: 60000 });
        r.recordFailure("opencode/a", "AUTH_FAILED");
        const snap = r.snapshot().find((s) => s.model === "opencode/a");
        assert.equal(snap.status, "AUTH_FAILED");
    });
    it("all models unavailable returns null", () => {
        const r = new ModelRouter(models, { cooldownMs: 600000 });
        r.recordFailure("opencode/a", "QUOTA_EXCEEDED");
        r.recordFailure("opencode/b", "QUOTA_EXCEEDED");
        r.recordFailure("opencode/c", "QUOTA_EXCEEDED");
        assert.equal(r.selectNext(), null);
    });
    it("cooldown expiry makes model available again", () => {
        const r = new ModelRouter(models, { cooldownMs: 1 });
        r.recordFailure("opencode/a", "QUOTA_EXCEEDED");
        assert.equal(r.selectNext()?.model, "opencode/b");
        const future = Date.now() + 60000;
        assert.equal(r.selectNext([], future)?.model, "opencode/a");
    });
    it("manual disable/enable works", () => {
        const r = new ModelRouter(models, { cooldownMs: 60000 });
        r.disableModel("opencode/a");
        assert.equal(r.selectNext()?.model, "opencode/b");
        r.enableModel("opencode/a");
        assert.equal(r.selectNext()?.model, "opencode/a");
    });
    it("success clears failure count", () => {
        const r = new ModelRouter(models, { cooldownMs: 600000 });
        r.recordFailure("opencode/a", "TRANSIENT");
        r.recordSuccess("opencode/a");
        const snap = r.snapshot().find((s) => s.model === "opencode/a");
        assert.equal(snap.failureCount, 0);
        assert.equal(snap.status, "AVAILABLE");
    });
});
//# sourceMappingURL=model-router.test.js.map