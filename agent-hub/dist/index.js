import { Command } from 'commander';
import { runSwitcher } from './commands/switcher.js';
import { runBroadcast } from './commands/broadcast.js';
import { runPipeline } from './commands/pipeline.js';
import { runDoctor } from './commands/doctor.js';
import { runConfigWizard } from './commands/config.js';
const program = new Command();
program
    .name('hub')
    .description('⚡ Unified Multi-Agent Orchestrator CLI for Claude, Codex, Grok, AGY, OpenCode, and Kimi')
    .version('1.0.0');
// hub switch / s
program
    .command('switch [agent]', { isDefault: false })
    .alias('s')
    .alias('launch')
    .description('Interactive agent picker or quick-switch to an agent (claude, codex, grok, agy, opencode, kimi)')
    .allowUnknownOption()
    .action(async (agent, _options, command) => {
    const extraArgs = command ? command.args.slice(1) : [];
    await runSwitcher(agent, extraArgs);
});
// hub broadcast / b
program
    .command('broadcast [prompt]')
    .alias('b')
    .alias('consensus')
    .description('Broadcast a prompt across multiple agents simultaneously and compare responses')
    .option('-a, --agents <list>', 'Comma-separated list of agent IDs (e.g. claude,codex,agy)')
    .option('-t, --timeout <seconds>', 'Timeout per agent in seconds', '90')
    .action(async (prompt, options) => {
    await runBroadcast(prompt, options);
});
// hub pipeline / p
program
    .command('pipeline')
    .alias('p')
    .alias('flow')
    .description('Run a 3-stage Multi-Agent Workflow (Architect -> Implementer -> Reviewer)')
    .option('-t, --task <description>', 'Task description')
    .option('--architect <agent>', 'Stage 1 Architect agent ID')
    .option('--developer <agent>', 'Stage 2 Implementer agent ID')
    .option('--reviewer <agent>', 'Stage 3 Reviewer agent ID')
    .action(async (options) => {
    await runPipeline(options);
});
// hub doctor / d
program
    .command('doctor')
    .alias('d')
    .alias('check')
    .description('Perform diagnostics on installed CLIs, binary paths, versions, and API keys')
    .action(async () => {
    await runDoctor();
});
// hub config / c
program
    .command('config')
    .alias('c')
    .alias('keys')
    .description('Configure default agents, pipeline stages, and global API keys')
    .action(async () => {
    await runConfigWizard();
});
// Default action when running just `hub`
program.action(async () => {
    await runSwitcher();
});
export async function main() {
    await program.parseAsync(process.argv);
}
