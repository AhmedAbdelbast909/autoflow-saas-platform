import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyFailure } from "../src/failure-classifier.js";
describe("failure classifier", () => {
    it("detects quota exceeded", () => {
        assert.equal(classifyFailure(1, "Error: quota exceeded for model").kind, "QUOTA_EXCEEDED");
    });
    it("detects insufficient credits", () => {
        assert.equal(classifyFailure(1, "insufficient credits, please top up").kind, "QUOTA_EXCEEDED");
    });
    it("detects rate limit 429", () => {
        assert.equal(classifyFailure(1, "HTTP 429 too many requests").kind, "RATE_LIMITED");
    });
    it("detects auth failure", () => {
        assert.equal(classifyFailure(1, "401 unauthorized: invalid api key").kind, "AUTH_FAILED");
    });
    it("detects provider 503", () => {
        assert.equal(classifyFailure(1, "upstream 503 Service Unavailable").kind, "PROVIDER_UNAVAILABLE");
    });
    it("detects timeout", () => {
        assert.equal(classifyFailure(1, "request timed out after 30s").kind, "TIMEOUT");
    });
    it("quota-like failures are retryable with next model", () => {
        for (const msg of ["quota exceeded", "rate limited", "timed out", "socket hang up"]) {
            const c = classifyFailure(1, msg);
            assert.equal(c.retryableWithNextModel, true, msg);
        }
    });
});
//# sourceMappingURL=failure-classifier.test.js.map