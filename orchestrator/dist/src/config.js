import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
export const DEFAULT_CONFIG = {
    orchestrator: {
        maxFixCycles: 5,
        maxModelAttempts: 3,
        maxReviewCycles: 5,
        maxConsecutiveFailures: 5,
        modelCooldownMs: 15 * 60 * 1000,
        openCodeTimeoutMs: 30 * 60 * 1000,
        reviewerTimeoutMs: 10 * 60 * 1000,
        autoCommit: false,
    },
    coding: {
        models: [
            { id: "coding-primary", provider: "opencode", model: "opencode/nemotron-3-ultra-free", priority: 1, enabled: true },
            { id: "coding-secondary", provider: "opencode", model: "opencode/glm-5.3-flash", priority: 2, enabled: true },
            { id: "coding-tertiary", provider: "opencode", model: "opencode/deepseek-v4-flash", priority: 3, enabled: true },
        ],
    },
    review: {
        provider: "opencode",
        model: "opencode/nemotron-3-ultra-free",
        executable: "opencode",
        args: ["run", "--model", "opencode/nemotron-3-ultra-free"],
        timeoutMs: 10 * 60 * 1000,
    },
    quality: { typecheck: true, lint: true, tests: true, build: true },
    git: { autoCommit: false },
    certification: {
        maxP0: 0,
        maxP1: 0,
        requireTestsPass: true,
        requireTypecheckPass: true,
        requireLintPass: true,
        requireBuildPass: true,
    },
};
export function repoRootDefault() {
    return process.cwd();
}
export function defaultConfigPath(repoRoot) {
    return join(repoRoot, ".ai", "orchestrator", "config", "orchestrator.config.json");
}
function stripJsonComments(text) {
    let out = "";
    let inStr = false;
    let strCh = "";
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1] ?? "";
        if (inStr) {
            out += c;
            if (c === "\\") {
                out += next;
                i++;
            }
            else if (c === strCh)
                inStr = false;
            continue;
        }
        if (c === '"' || c === "'") {
            inStr = true;
            strCh = c;
            out += c;
            continue;
        }
        if (c === "/" && next === "/") {
            while (i < text.length && text[i] !== "\n")
                i++;
            out += "\n";
            continue;
        }
        out += c;
    }
    return out;
}
function parseSimpleYaml(text) {
    const lines = text.split(/\r?\n/);
    const root = {};
    const stack = [{ indent: -1, obj: root }];
    const parseScalar = (v) => {
        const t = v.trim();
        if (t === "true")
            return true;
        if (t === "false")
            return false;
        if (t === "null" || t === "~")
            return null;
        if (/^-?\d+$/.test(t))
            return Number(t);
        if (/^-?\d+\.\d+$/.test(t))
            return Number(t);
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
            return t.slice(1, -1);
        return t;
    };
    for (const rawLine of lines) {
        const line = rawLine.replace(/#.*$/, "").replace(/\s+$/, "");
        if (!line.trim())
            continue;
        const indent = line.match(/^\s*/)?.[0].length ?? 0;
        const trimmed = line.trim();
        while (stack.length > 1 && indent <= stack[stack.length - 1].indent)
            stack.pop();
        const parent = stack[stack.length - 1].obj;
        if (trimmed.startsWith("- ")) {
            const val = trimmed.slice(2).trim();
            if (!Array.isArray(parent))
                continue;
            if (val.includes(":")) {
                const obj = {};
                const idx = val.indexOf(":");
                const k = val.slice(0, idx).trim();
                const rest = val.slice(idx + 1).trim();
                obj[k] = rest ? parseScalar(rest) : null;
                parent.push(obj);
                stack.push({ indent, obj, key: k });
            }
            else {
                parent.push(parseScalar(val));
            }
            continue;
        }
        const idx = trimmed.indexOf(":");
        if (idx === -1)
            continue;
        const key = trimmed.slice(0, idx).trim();
        const rest = trimmed.slice(idx + 1).trim();
        if (Array.isArray(parent))
            continue;
        if (rest === "") {
            const lookahead = lines.slice(lines.indexOf(rawLine) + 1).find((l) => l.trim());
            if (lookahead && lookahead.trim().startsWith("- ")) {
                const arr = [];
                parent[key] = arr;
                stack.push({ indent, obj: arr });
            }
            else {
                const obj = {};
                parent[key] = obj;
                stack.push({ indent, obj });
            }
        }
        else {
            parent[key] = parseScalar(rest);
        }
    }
    return root;
}
function normalizeConfig(raw) {
    const cfg = structuredClone(DEFAULT_CONFIG);
    if (!raw || typeof raw !== "object")
        return cfg;
    const r = raw;
    const pick = (o, path) => {
        let cur = o;
        for (const p of path) {
            if (!cur || typeof cur !== "object")
                return undefined;
            cur = cur[p];
        }
        return cur;
    };
    const asNum = (v, fb) => (typeof v === "number" && Number.isFinite(v) ? v : fb);
    const asBool = (v, fb) => (typeof v === "boolean" ? v : fb);
    const orch = (r["orchestrator"] ?? {});
    cfg.orchestrator.maxFixCycles = asNum(orch["maxFixCycles"], cfg.orchestrator.maxFixCycles);
    cfg.orchestrator.maxModelAttempts = asNum(orch["maxModelAttempts"], cfg.orchestrator.maxModelAttempts);
    cfg.orchestrator.maxReviewCycles = asNum(orch["maxReviewCycles"], cfg.orchestrator.maxReviewCycles);
    cfg.orchestrator.maxConsecutiveFailures = asNum(orch["maxConsecutiveFailures"], cfg.orchestrator.maxConsecutiveFailures);
    cfg.orchestrator.modelCooldownMs = asNum(orch["modelCooldownMs"] ?? pick(r, ["limits", "modelCooldownMs"]), cfg.orchestrator.modelCooldownMs);
    cfg.orchestrator.openCodeTimeoutMs = asNum(orch["openCodeTimeoutMs"], cfg.orchestrator.openCodeTimeoutMs);
    cfg.orchestrator.reviewerTimeoutMs = asNum(orch["reviewerTimeoutMs"], cfg.orchestrator.reviewerTimeoutMs);
    cfg.orchestrator.autoCommit = asBool(orch["autoCommit"], cfg.orchestrator.autoCommit);
    const coding = (r["coding"] ?? {});
    const modelsRaw = (coding["models"] ?? r["models"]?.["coding"] ?? []);
    if (Array.isArray(modelsRaw) && modelsRaw.length > 0) {
        const mapped = modelsRaw.map((m, i) => {
            if (typeof m === "string") {
                const [provider] = m.split("/");
                return { id: `coding-${i + 1}`, provider: provider ?? "opencode", model: m, priority: i + 1, enabled: true };
            }
            const mm = m;
            const model = String(mm["model"] ?? "");
            const provider = String(mm["provider"] ?? model.split("/")[0] ?? "opencode");
            return {
                id: String(mm["id"] ?? `coding-${i + 1}`),
                provider,
                model,
                priority: asNum(mm["priority"], i + 1),
                enabled: asBool(mm["enabled"], true),
            };
        }).filter((m) => m.model);
        if (mapped.length > 0)
            cfg.coding.models = mapped;
    }
    const review = (r["review"] ?? {});
    if (typeof review["provider"] === "string")
        cfg.review.provider = review["provider"];
    if (typeof review["model"] === "string")
        cfg.review.model = review["model"];
    if (typeof review["executable"] === "string")
        cfg.review.executable = review["executable"];
    if (Array.isArray(review["args"]))
        cfg.review.args = review["args"].map(String);
    if (typeof review["timeoutMs"] === "number")
        cfg.review.timeoutMs = review["timeoutMs"];
    if (typeof review["failOnUnavailable"] === "boolean")
        cfg.review.failOnUnavailable = review["failOnUnavailable"];
    const quality = (r["quality"] ?? {});
    cfg.quality.typecheck = asBool(quality["typecheck"], cfg.quality.typecheck);
    cfg.quality.lint = asBool(quality["lint"], cfg.quality.lint);
    cfg.quality.tests = asBool(quality["tests"], cfg.quality.tests);
    cfg.quality.build = asBool(quality["build"], cfg.quality.build);
    if (typeof quality["projectDir"] === "string")
        cfg.quality.projectDir = quality["projectDir"];
    if (Array.isArray(quality["extraGates"]))
        cfg.quality.extraGates = quality["extraGates"];
    const git = (r["git"] ?? {});
    cfg.git.autoCommit = asBool(git["autoCommit"], cfg.orchestrator.autoCommit);
    const cert = (r["certification"] ?? {});
    if (typeof cert["maxP0"] === "number")
        cfg.certification.maxP0 = cert["maxP0"];
    if (typeof cert["maxP1"] === "number")
        cfg.certification.maxP1 = cert["maxP1"];
    return cfg;
}
export function validateConfig(cfg) {
    const errors = [];
    if (cfg.coding.models.length === 0)
        errors.push("coding.models must contain at least one model");
    const ids = new Set();
    for (const m of cfg.coding.models) {
        if (!m.model.includes("/"))
            errors.push(`model "${m.id}" must be in provider/model format, got "${m.model}"`);
        if (ids.has(m.id))
            errors.push(`duplicate model id "${m.id}"`);
        ids.add(m.id);
    }
    if (cfg.orchestrator.maxFixCycles < 0 || cfg.orchestrator.maxFixCycles > 50)
        errors.push("orchestrator.maxFixCycles out of range 0..50");
    if (cfg.orchestrator.maxModelAttempts < 1)
        errors.push("orchestrator.maxModelAttempts must be >= 1");
    if (!cfg.review.executable)
        errors.push("review.executable must not be empty");
    return errors;
}
export async function loadConfig(configPath, repoRoot) {
    const root = repoRoot ?? repoRootDefault();
    const candidates = configPath
        ? [configPath]
        : [
            defaultConfigPath(root),
            join(root, ".ai", "orchestrator", "config", "orchestrator.config.yaml"),
            join(root, ".ai", "orchestrator", "config", "orchestrator.config.yml"),
            join(root, "orchestrator", "orchestrator.config.json"),
        ];
    for (const p of candidates) {
        if (!existsSync(p))
            continue;
        const text = await readFile(p, "utf8");
        try {
            const raw = p.endsWith(".yaml") || p.endsWith(".yml") ? parseSimpleYaml(text) : JSON.parse(stripJsonComments(text));
            return { config: normalizeConfig(raw), path: p };
        }
        catch (err) {
            throw new Error(`Failed to parse config at ${p}: ${err.message}`);
        }
    }
    return { config: structuredClone(DEFAULT_CONFIG), path: null };
}
export function applyEnvOverrides(cfg) {
    const out = structuredClone(cfg);
    const num = (k) => {
        const v = process.env[k];
        if (!v)
            return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    };
    const n1 = num("ORCH_MAX_FIX_CYCLES");
    if (n1 !== undefined)
        out.orchestrator.maxFixCycles = n1;
    const n2 = num("ORCH_MAX_MODEL_ATTEMPTS");
    if (n2 !== undefined)
        out.orchestrator.maxModelAttempts = n2;
    const n3 = num("ORCH_MODEL_COOLDOWN_MS");
    if (n3 !== undefined)
        out.orchestrator.modelCooldownMs = n3;
    if (process.env["ORCH_REVIEW_EXEC"])
        out.review.executable = process.env["ORCH_REVIEW_EXEC"];
    if (process.env["ORCH_REVIEW_MODEL"])
        out.review.model = process.env["ORCH_REVIEW_MODEL"];
    if (process.env["ORCH_REVIEW_ARGS"]) {
        const rawArgs = process.env["ORCH_REVIEW_ARGS"];
        try {
            const parsed = JSON.parse(rawArgs);
            if (Array.isArray(parsed))
                out.review.args = parsed.map(String);
            else
                out.review.args = rawArgs.split(/\s+/).filter(Boolean);
        }
        catch {
            out.review.args = rawArgs.split(/\s+/).filter(Boolean);
        }
    }
    const reviewTimeout = num("ORCH_REVIEW_TIMEOUT_MS");
    if (reviewTimeout !== undefined)
        out.review.timeoutMs = reviewTimeout;
    if (process.env["ORCH_REVIEW_FAIL_ON_UNAVAILABLE"] === "1" || process.env["ORCH_REVIEW_FAIL_ON_UNAVAILABLE"] === "true") {
        out.review.failOnUnavailable = true;
    }
    if (process.env["ORCH_AUTO_COMMIT"] === "1" || process.env["ORCH_AUTO_COMMIT"] === "true") {
        out.orchestrator.autoCommit = true;
        out.git.autoCommit = true;
    }
    return out;
}
//# sourceMappingURL=config.js.map