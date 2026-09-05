import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { quoteArg, execFileSafe } from "../src/proc.js";
describe("proc helper", () => {
    it("quotes args with spaces", () => {
        assert.equal(quoteArg("a b"), '"a b"');
        assert.equal(quoteArg("plain"), "plain");
    });
    it("escapes embedded quotes", () => {
        assert.equal(quoteArg('say "hi"'), '"say \\"hi\\""');
    });
    it("executes a real command and captures output", async () => {
        const r = await execFileSafe("node", ["--version"], { timeout: 15000 });
        assert.equal(r.code, 0);
        assert.match(r.stdout, /v\d+\./);
    });
});
//# sourceMappingURL=proc.test.js.map