import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redactSecrets } from "../src/secrets.js";
import { assertGitSafe } from "../src/git.js";

describe("secret redaction", () => {
  it("redacts api key patterns", () => {
    const out = redactSecrets("key=sk-abcdefghijklmnop123456 rest");
    assert.ok(!out.includes("sk-abcdef"), out);
    assert.ok(out.includes("[REDACTED]"));
  });
  it("redacts KEY= assignments", () => {
    const out = redactSecrets("DEEPSEEK_API_KEY=supersecretvalue123");
    assert.ok(!out.includes("supersecretvalue123"), out);
  });
  it("redacts private keys", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nABCDEF\n-----END PRIVATE KEY-----";
    assert.ok(redactSecrets(pem).includes("[REDACTED]"));
  });
});

describe("git safety", () => {
  it("refuses reset --hard", () => {
    assert.throws(() => assertGitSafe(["reset", "--hard", "HEAD"]));
  });
  it("refuses force push", () => {
    assert.throws(() => assertGitSafe(["push", "--force"]));
  });
  it("refuses clean -fd", () => {
    assert.throws(() => assertGitSafe(["clean", "-fd"]));
  });
  it("allows safe commit", () => {
    assert.doesNotThrow(() => assertGitSafe(["commit", "-m", "x"]));
  });
  it("allows status", () => {
    assert.doesNotThrow(() => assertGitSafe(["status", "--short"]));
  });
});
