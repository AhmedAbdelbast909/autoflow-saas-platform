import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, validateConfig, applyEnvOverrides, DEFAULT_CONFIG } from "../src/config.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

describe("config system", () => {
  it("defaults load when no file present", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cfg-"));
    const { config, path } = await loadConfig(undefined, dir);
    assert.equal(path, null);
    assert.ok(config.coding.models.length >= 3);
  });
  it("validates provider/model format", () => {
    const c = structuredClone(DEFAULT_CONFIG);
    c.coding.models = [{ id: "x", provider: "p", model: "no-slash", priority: 1, enabled: true }];
    assert.ok(validateConfig(c).length > 0);
  });
  it("applies ORCH_REVIEW_EXEC/ARGS/TIMEOUT_MS overrides", () => {
    const prevExec = process.env["ORCH_REVIEW_EXEC"];
    const prevArgs = process.env["ORCH_REVIEW_ARGS"];
    const prevTimeout = process.env["ORCH_REVIEW_TIMEOUT_MS"];
    try {
      process.env["ORCH_REVIEW_EXEC"] = "my-harness";
      process.env["ORCH_REVIEW_ARGS"] = '["review", "--format", "json"]';
      process.env["ORCH_REVIEW_TIMEOUT_MS"] = "12345";
      const out = applyEnvOverrides(structuredClone(DEFAULT_CONFIG));
      assert.equal(out.review.executable, "my-harness");
      assert.deepEqual(out.review.args, ["review", "--format", "json"]);
      assert.equal(out.review.timeoutMs, 12345);
      process.env["ORCH_REVIEW_ARGS"] = "review --format json";
      const out2 = applyEnvOverrides(structuredClone(DEFAULT_CONFIG));
      assert.deepEqual(out2.review.args, ["review", "--format", "json"]);
    } finally {
      if (prevExec === undefined) delete process.env["ORCH_REVIEW_EXEC"];
      else process.env["ORCH_REVIEW_EXEC"] = prevExec;
      if (prevArgs === undefined) delete process.env["ORCH_REVIEW_ARGS"];
      else process.env["ORCH_REVIEW_ARGS"] = prevArgs;
      if (prevTimeout === undefined) delete process.env["ORCH_REVIEW_TIMEOUT_MS"];
      else process.env["ORCH_REVIEW_TIMEOUT_MS"] = prevTimeout;
    }
  });
  it("loads JSON config with string model list", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cfg-"));
    mkdirSync(join(dir, ".ai", "orchestrator", "config"), { recursive: true });
    writeFileSync(join(dir, ".ai", "orchestrator", "config", "orchestrator.config.json"),
      JSON.stringify({ coding: { models: ["opencode/a", "opencode/b"] } }));
    const { config } = await loadConfig(undefined, dir);
    assert.equal(config.coding.models.length, 2);
    assert.equal(config.coding.models[0].model, "opencode/a");
  });
});
