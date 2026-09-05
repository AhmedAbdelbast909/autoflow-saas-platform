import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { execa } from 'execa';
import { getAgent, getAgentList } from '../agents/registry.js';
import { loadEnvAndConfig } from '../config/manager.js';

export async function runSwitcher(targetAgent?: string, extraArgs: string[] = []): Promise<void> {
  loadEnvAndConfig();

  let selectedId = targetAgent?.toLowerCase();

  if (!selectedId) {
    const agents = getAgentList();
    const choices = agents.map((a) => ({
      name: `${chalk.bold.hex(a.color)(a.name.padEnd(20))} - ${chalk.gray(a.description)}`,
      value: a.id,
      description: `Vendor: ${a.vendor} | Command: ${a.binary}`
    }));

    selectedId = await select({
      message: 'Select an AI coding agent to launch:',
      choices
    });
  }

  const agent = getAgent(selectedId);
  if (!agent) {
    console.error(chalk.red(`\nUnknown agent: "${selectedId}". Available agents: claude, codex, grok, agy, opencode, kimi`));
    process.exit(1);
  }

  console.log(chalk.cyan(`\n🚀 Launching ${chalk.bold.hex(agent.color)(agent.name)} in ${chalk.bold(process.cwd())}...\n`));

  const launchArgs = agent.getInteractiveArgs(extraArgs);

  try {
    const proc = execa(agent.binary, launchArgs, {
      stdio: 'inherit',
      shell: true,
      env: process.env
    });

    await proc;
  } catch (err: any) {
    if (err.exitCode !== 0 && !err.isCanceled) {
      console.log(chalk.gray(`\nSession finished (${agent.name}).`));
    }
  }
}
