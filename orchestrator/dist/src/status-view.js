export function renderStatus(state, health, extra) {
    const line = "─".repeat(44);
    const fmtElapsed = (ms) => {
        const s = Math.floor(ms / 1000);
        const hh = String(Math.floor(s / 3600)).padStart(2, "0");
        const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
        const ss = String(s % 60).padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
    };
    const healthLines = health.map((h) => `  ${h.id} (${h.model})\n    ${h.status}${h.cooldownUntil ? " until " + h.cooldownUntil : ""}  fail=${h.failureCount}`).join("\n") || "  (no models)";
    return [
        "AUTONOMOUS CODING RUN",
        line,
        "",
        `Task: ${extra.taskLabel}`,
        `State: ${state.state}`,
        `Cycle: ${state.fixCycle} (attempt ${state.attempt})`,
        "",
        "Current model:",
        `  ${state.currentModel ?? "(none selected)"}`,
        "",
        "Model health:",
        healthLines,
        "",
        "Last action:",
        `  ${extra.lastAction}`,
        "",
        "Tests:",
        `  ${extra.testsSummary}`,
        "",
        "Reviewer:",
        `  ${extra.reviewer}`,
        "",
        "Elapsed:",
        `  ${fmtElapsed(extra.elapsedMs)}`,
        "",
    ].join("\n");
}
//# sourceMappingURL=status-view.js.map