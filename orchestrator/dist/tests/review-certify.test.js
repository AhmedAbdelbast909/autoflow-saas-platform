import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseReviewJson } from "../src/reviewer.js";
import { certificationDecision } from "../src/orchestrator.js";
import { DEFAULT_CONFIG } from "../src/config.js";
const passGates = ["typecheck", "lint", "tests", "build"].map((n) => ({
    name: n, command: [n], exitCode: 0, status: "PASS", durationMs: 5, outputTail: "",
}));
describe("reviewer PASS/FAIL/UNAVAILABLE parsing", () => {
    it("parses PASS json", () => {
        const r = parseReviewJson(JSON.stringify({ status: "PASS", summary: "ok", findings: [], required_actions: [] }));
        assert.equal(r.status, "PASS");
        assert.deepEqual(r.findings, []);
    });
    it("parses FAIL with findings", () => {
        const r = parseReviewJson(JSON.stringify({
            status: "FAIL", summary: "bad",
            findings: [{ id: "SEC-001", severity: "P1", file: "a.ts", line: 1, problem: "x", required_fix: "y" }],
            required_actions: ["fix it"],
        }));
        assert.equal(r.status, "FAIL");
        assert.equal(r.findings[0].severity, "P1");
    });
    it("parses UNAVAILABLE status", () => {
        const r = parseReviewJson(JSON.stringify({
            status: "UNAVAILABLE", summary: "reviewer not found",
            findings: [], required_actions: ["install reviewer"],
        }));
        assert.equal(r.status, "UNAVAILABLE");
    });
    it("rejects non-json", () => {
        assert.throws(() => parseReviewJson("looks fine, ship it"));
    });
    it("rejects invalid status", () => {
        assert.throws(() => parseReviewJson(JSON.stringify({ status: "INVALID", summary: "x", findings: [], required_actions: [] })));
    });
    it("strips code fences", () => {
        const r = parseReviewJson("```json\n" + JSON.stringify({ status: "PASS", summary: "s", findings: [], required_actions: [] }) + "\n```");
        assert.equal(r.status, "PASS");
    });
});
describe("certification policy", () => {
    it("certifies when gates pass and reviewer passes", () => {
        const d = certificationDecision(DEFAULT_CONFIG, [], passGates, "PASS");
        assert.equal(d.certifiable, true);
    });
    it("blocks on UNAVAILABLE reviewer", () => {
        const d = certificationDecision(DEFAULT_CONFIG, [], passGates, "UNAVAILABLE");
        assert.equal(d.certifiable, false);
        assert.ok(d.blockers.some((b) => b.includes("reviewer status is UNAVAILABLE")));
    });
    it("blocks on P0", () => {
        const d = certificationDecision(DEFAULT_CONFIG, [{ id: "X", severity: "P0", problem: "p", required_fix: "f" }], passGates, "FAIL");
        assert.equal(d.certifiable, false);
    });
    it("blocks on P1", () => {
        const d = certificationDecision(DEFAULT_CONFIG, [{ id: "X", severity: "P1", problem: "p", required_fix: "f" }], passGates, "FAIL");
        assert.equal(d.certifiable, false);
    });
    it("blocks on test failure", () => {
        const gates = passGates.map((g) => g.name === "tests" ? { ...g, status: "FAIL", exitCode: 1 } : g);
        const d = certificationDecision(DEFAULT_CONFIG, [], gates, "PASS");
        assert.equal(d.certifiable, false);
    });
    it("blocks on typecheck/lint/build failure", () => {
        for (const name of ["typecheck", "lint", "build"]) {
            const gates = passGates.map((g) => g.name === name ? { ...g, status: "FAIL", exitCode: 1 } : g);
            const d = certificationDecision(DEFAULT_CONFIG, [], gates, "PASS");
            assert.equal(d.certifiable, false, name);
        }
    });
    it("SKIPPED required gate blocks certification", () => {
        const gates = passGates.map((g) => g.name === "tests" ? { ...g, status: "SKIPPED", exitCode: null } : g);
        const d = certificationDecision(DEFAULT_CONFIG, [], gates, "PASS");
        assert.equal(d.certifiable, false);
    });
});
//# sourceMappingURL=review-certify.test.js.map