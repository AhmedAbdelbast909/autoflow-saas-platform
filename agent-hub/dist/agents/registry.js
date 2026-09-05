import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
export const AGENTS = {
    claude: {
        id: 'claude',
        name: 'Claude Code',
        vendor: 'Anthropic',
        description: 'Autonomous coding agent powered by Claude 3.7 Sonnet',
        binary: 'claude',
        versionFlag: '--version',
        envKeys: ['ANTHROPIC_API_KEY'],
        color: '#D97706',
        getInteractiveArgs: (extra = []) => [...extra],
        getPrintArgs: (prompt, extra = []) => ['-p', prompt, ...extra]
    },
    codex: {
        id: 'codex',
        name: 'OpenAI Codex',
        vendor: 'OpenAI',
        description: 'Terminal coding agent powered by OpenAI o-series / GPT models',
        binary: 'codex',
        versionFlag: '--version',
        envKeys: ['OPENAI_API_KEY'],
        color: '#10B981',
        getInteractiveArgs: (extra = []) => [...extra],
        getPrintArgs: (prompt, extra = []) => ['exec', '--skip-git-repo-check', prompt, ...extra]
    },
    grok: {
        id: 'grok',
        name: 'Grok Build',
        vendor: 'xAI',
        description: 'High-speed terminal TUI coding agent powered by Grok',
        binary: 'grok',
        versionFlag: '--version',
        envKeys: ['XAI_API_KEY', 'GROK_API_KEY'],
        color: '#8B5CF6',
        getInteractiveArgs: (extra = []) => [...extra],
        getPrintArgs: (prompt, extra = []) => ['-p', prompt, ...extra]
    },
    agy: {
        id: 'agy',
        name: 'Google Antigravity',
        vendor: 'Google',
        description: 'Autonomous agent CLI with native Google ecosystem & tools',
        binary: 'agy',
        versionFlag: '--version',
        envKeys: ['GEMINI_API_KEY'],
        color: '#3B82F6',
        getInteractiveArgs: (extra = []) => [...extra],
        getPrintArgs: (prompt, extra = []) => ['--print', prompt, ...extra]
    },
    opencode: {
        id: 'opencode',
        name: 'OpenCode',
        vendor: 'Anomaly',
        description: 'Multi-provider open-source terminal coding harness (ACP/MCP)',
        binary: 'opencode',
        versionFlag: '--version',
        envKeys: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
        color: '#EC4899',
        getInteractiveArgs: (extra = []) => [...extra],
        getPrintArgs: (prompt, extra = []) => ['run', prompt, ...extra]
    },
    kimi: {
        id: 'kimi',
        name: 'Kimi Code',
        vendor: 'Moonshot AI',
        description: 'Long-context terminal coding agent powered by Moonshot Kimi',
        binary: 'kimi',
        versionFlag: '--version',
        envKeys: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'],
        color: '#06B6D4',
        getInteractiveArgs: (extra = []) => [...extra],
        getPrintArgs: (prompt, extra = []) => [prompt, ...extra]
    }
};
export function getAgentList() {
    return Object.values(AGENTS);
}
export function getAgent(id) {
    return AGENTS[id.toLowerCase()];
}
export function resolveAgentBinary(agent) {
    const isWindows = process.platform === 'win32';
    const home = os.homedir();
    const candidatePaths = [];
    if (isWindows) {
        if (agent.id === 'agy') {
            candidatePaths.push(path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'agy', 'bin', 'agy.exe'));
        }
        else if (agent.id === 'grok') {
            candidatePaths.push(path.join(home, '.grok', 'bin', 'grok.exe'));
        }
        else if (agent.id === 'kimi') {
            candidatePaths.push(path.join(home, '.kimi-code', 'bin', 'kimi.exe'));
        }
        else if (agent.id === 'claude') {
            candidatePaths.push(path.join(home, '.local', 'bin', 'claude.exe'));
            candidatePaths.push(path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'));
        }
        else if (agent.id === 'codex') {
            candidatePaths.push(path.join(home, 'AppData', 'Roaming', 'npm', 'codex.cmd'));
        }
        else if (agent.id === 'opencode') {
            candidatePaths.push(path.join(home, 'AppData', 'Roaming', 'npm', 'opencode.cmd'));
        }
    }
    for (const candidate of candidatePaths) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return agent.binary;
}
