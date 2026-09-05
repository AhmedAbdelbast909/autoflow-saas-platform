import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, validateConfig, DEFAULT_CONFIG } from "../src/config.js";
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
