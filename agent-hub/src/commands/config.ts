import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import boxen from 'boxen';
import { getAgentList } from '../agents/registry.js';
import { loadEnvAndConfig, saveConfig, getConfigFilePath } from '../config/manager.js';

export async function runConfigWizard(): Promise<void> {
  const current = loadEnvAndConfig();
  const agents = getAgentList();
  const agentChoices = agents.map((a) => ({
    name: `${a.name} (${a.vendor})`,
    value: a.id
  }));

  console.log(
    boxen(
      `${chalk.bold.hex('#8B5CF6')('⚙️ Agent Hub Configuration Wizard ⚙️')}\n` +
      `${chalk.gray('Configure default agents, pipeline stages, and global API keys')}\n` +
      `${chalk.gray('File: ' + getConfigFilePath())}`,
      {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderColor: '#8B5CF6',
        borderStyle: 'round'
      }
    )
  );

  const action = await select({
    message: 'What would you like to configure?',
    choices: [
      { name: '1. Set Default Preferred Agent', value: 'defaultAgent' },
      { name: '2. Set Default Pipeline Agents (Architect, Developer, Reviewer)', value: 'pipeline' },
      { name: '3. Configure API Keys / Environment Secrets', value: 'keys' },
      { name: '4. View Current Configuration', value: 'view' }
    ]
  });

  if (action === 'defaultAgent') {
    const selected = await select({
      message: 'Choose your default AI coding agent:',
      choices: agentChoices,
      default: current.defaultAgent || 'claude'
    });
    current.defaultAgent = selected;
    saveConfig(current);
    console.log(chalk.green(`\n✔ Default agent set to: ${chalk.bold(selected)}\n`));
  } else if (action === 'pipeline') {
    const architect = await select({
      message: 'Default Stage 1 (Architect / Planning):',
      choices: agentChoices,
      default: current.defaultPipeline?.architect || 'agy'
    });
    const developer = await select({
      message: 'Default Stage 2 (Implementer / Coding):',
      choices: agentChoices,
      default: current.defaultPipeline?.developer || 'codex'
    });
    const reviewer = await select({
      message: 'Default Stage 3 (Reviewer / QA):',
      choices: agentChoices,
      default: current.defaultPipeline?.reviewer || 'grok'
    });

    current.defaultPipeline = { architect, developer, reviewer };
    saveConfig(current);
    console.log(chalk.green('\n✔ Default pipeline updated successfully!\n'));
  } else if (action === 'keys') {
    if (!current.keys) current.keys = {};

    const anthropicKey = await input({
      message: 'ANTHROPIC_API_KEY (Leave blank to keep current):',
      default: current.keys.anthropic ? '******' : ''
    });
    if (anthropicKey && anthropicKey !== '******') current.keys.anthropic = anthropicKey;

    const openaiKey = await input({
      message: 'OPENAI_API_KEY (Leave blank to keep current):',
      default: current.keys.openai ? '******' : ''
    });
    if (openaiKey && openaiKey !== '******') current.keys.openai = openaiKey;

    const xaiKey = await input({
      message: 'XAI_API_KEY (Leave blank to keep current):',
      default: current.keys.xai ? '******' : ''
    });
    if (xaiKey && xaiKey !== '******') current.keys.xai = xaiKey;

    const moonshotKey = await input({
      message: 'MOONSHOT_API_KEY (Leave blank to keep current):',
      default: current.keys.moonshot ? '******' : ''
    });
    if (moonshotKey && moonshotKey !== '******') current.keys.moonshot = moonshotKey;

    const geminiKey = await input({
      message: 'GEMINI_API_KEY (Leave blank to keep current):',
      default: current.keys.gemini ? '******' : ''
    });
    if (geminiKey && geminiKey !== '******') current.keys.gemini = geminiKey;

    saveConfig(current);
    console.log(chalk.green('\n✔ API keys successfully stored in ' + getConfigFilePath() + '\n'));
  } else if (action === 'view') {
    console.log('\n' + chalk.bold('Current Hub Configuration:'));
    console.log(JSON.stringify(current, null, 2) + '\n');
  }
}
