import { checkbox, input } from '@inquirer/prompts';
import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import { execa } from 'execa';
import { getAgent, getAgentList, resolveAgentBinary } from '../agents/registry.js';
import { loadEnvAndConfig } from '../config/manager.js';

export interface BroadcastOptions {
  agents?: string;
  timeout?: string;
}

export async function runBroadcast(promptArg?: string, options: BroadcastOptions = {}): Promise<void> {
  loadEnvAndConfig();

  let prompt = promptArg;
  if (!prompt) {
    prompt = await input({
      message: 'Enter prompt/task to broadcast across agents:',
      validate: (v) => (v.trim().length > 0 ? true : 'Prompt cannot be empty')
    });
  }

  let selectedAgentIds: string[] = [];
  if (options.agents) {
    selectedAgentIds = options.agents.split(',').map((s) => s.trim().toLowerCase());
  } else {
    const allAgents = getAgentList();
    selectedAgentIds = await checkbox({
      message: 'Select agents to broadcast this task to:',
      choices: allAgents.map((a) => ({
        name: `${chalk.bold.hex(a.color)(a.name)} (${a.vendor})`,
        value: a.id,
        checked: ['agy', 'codex'].includes(a.id)
      }))
    });
  }

  if (selectedAgentIds.length === 0) {
    console.log(chalk.yellow('No agents selected. Aborting.'));
    return;
  }

  console.log(
    boxen(
      `${chalk.bold.hex('#F59E0B')('📡 Agent Hub Broadcast & Consensus 📡')}\n` +
      `${chalk.white.bold('Prompt:')} ${chalk.gray(prompt)}\n` +
      `${chalk.white.bold('Target Agents:')} ${selectedAgentIds.map((id) => chalk.cyan(id)).join(', ')}`,
      {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderColor: '#F59E0B',
        borderStyle: 'round'
      }
    )
  );

  const mainSpinner = ora(`Broadcasting to ${selectedAgentIds.length} agents in parallel...`).start();

  const startTime = Date.now();
  const tasks = selectedAgentIds.map(async (id) => {
    const agent = getAgent(id);
    if (!agent) {
      return { id, name: id, success: false, output: `Agent "${id}" not found.`, duration: '0.0' };
    }

    const t0 = Date.now();
    try {
      const binaryPath = resolveAgentBinary(agent);
      const args = agent.getPrintArgs(prompt!);
      const res = await execa(binaryPath, args, {
        shell: false,
        input: '',
        timeout: options.timeout ? parseInt(options.timeout, 10) * 1000 : 120000,
        env: process.env
      });
      const duration = ((Date.now() - t0) / 1000).toFixed(1);
      return {
        id,
        name: agent.name,
        color: agent.color,
        success: true,
        output: res.stdout || res.stderr || '(No output returned)',
        duration
      };
    } catch (err: any) {
      const duration = ((Date.now() - t0) / 1000).toFixed(1);
      return {
        id,
        name: agent.name,
        color: agent.color,
        success: false,
        output: err.stdout || err.stderr || err.message,
        duration
      };
    }
  });

  const results = await Promise.all(tasks);
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  mainSpinner.succeed(`Broadcast complete in ${chalk.bold(totalDuration + 's')}!`);

  for (const r of results) {
    const statusHeader = r.success
      ? chalk.green.bold(`✔ ${r.name} (${r.duration}s)`)
      : chalk.red.bold(`✖ ${r.name} Notice (${r.duration}s)`);

    console.log(
      boxen(
        `${statusHeader}\n\n${r.output.trim()}`,
        {
          padding: 1,
          margin: { top: 1, bottom: 1 },
          borderColor: r.success ? (r.color as any) || 'cyan' : 'yellow',
          borderStyle: 'single'
        }
      )
    );
  }
}
