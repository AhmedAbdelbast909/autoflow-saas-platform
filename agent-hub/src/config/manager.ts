import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';

export interface HubConfig {
  defaultAgent?: string;
  defaultPipeline?: {
    architect: string;
    developer: string;
    reviewer: string;
  };
  keys?: {
    anthropic?: string;
    openai?: string;
    xai?: string;
    moonshot?: string;
    gemini?: string;
  };
}

const CONFIG_DIR = path.join(os.homedir(), '.agent-hub');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function loadEnvAndConfig(): HubConfig {
  // 1. Ensure all agent bin directories are in process.env.PATH
  const userHome = os.homedir();
  const essentialPaths = [
    path.join(process.env.LOCALAPPDATA || path.join(userHome, 'AppData', 'Local'), 'agy', 'bin'),
    path.join(userHome, '.grok', 'bin'),
    path.join(userHome, '.kimi-code', 'bin'),
    path.join(userHome, '.local', 'bin'),
    path.join(userHome, 'AppData', 'Roaming', 'npm')
  ];

  const currentPaths = (process.env.PATH || '').split(path.delimiter);
  for (const p of essentialPaths) {
    if (fs.existsSync(p) && !currentPaths.some((cp) => cp.toLowerCase() === p.toLowerCase())) {
      process.env.PATH = `${p}${path.delimiter}${process.env.PATH}`;
    }
  }

  // 2. Load local .env if it exists
  const localEnvPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
  }

  // 3. Load global config
  if (!fs.existsSync(CONFIG_FILE)) {
    return {
      defaultAgent: 'claude',
      defaultPipeline: {
        architect: 'agy',
        developer: 'codex',
        reviewer: 'grok'
      },
      keys: {}
    };
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as HubConfig;

    // Apply global keys to process.env if not already set
    if (parsed.keys) {
      if (parsed.keys.anthropic && !process.env.ANTHROPIC_API_KEY) {
        process.env.ANTHROPIC_API_KEY = parsed.keys.anthropic;
      }
      if (parsed.keys.openai && !process.env.OPENAI_API_KEY) {
        process.env.OPENAI_API_KEY = parsed.keys.openai;
      }
      if (parsed.keys.xai && !process.env.XAI_API_KEY) {
        process.env.XAI_API_KEY = parsed.keys.xai;
      }
      if (parsed.keys.moonshot && !process.env.MOONSHOT_API_KEY) {
        process.env.MOONSHOT_API_KEY = parsed.keys.moonshot;
      }
      if (parsed.keys.gemini && !process.env.GEMINI_API_KEY) {
        process.env.GEMINI_API_KEY = parsed.keys.gemini;
      }
    }

    return parsed;
  } catch {
    return {
      defaultAgent: 'claude',
      defaultPipeline: {
        architect: 'agy',
        developer: 'codex',
        reviewer: 'grok'
      },
      keys: {}
    };
  }
}

export function saveConfig(config: HubConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function getConfigFilePath(): string {
  return CONFIG_FILE;
}
