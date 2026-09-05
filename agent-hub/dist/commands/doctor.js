import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import { execa } from 'execa';
import { getAgentList } from '../agents/registry.js';
import { loadEnvAndConfig } from '../config/manager.js';
export async function runDoctor() {
    loadEnvAndConfig();
    console.log(boxen(`${chalk.bold.hex('#38BDF8')('⚡ Agent Hub Diagnostics & Health Doctor ⚡')}\n` +
        `${chalk.gray('Inspecting all 6 installed AI coding agents, binaries, and keys')}`, {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderColor: '#38BDF8',
        borderStyle: 'round'
    }));
    const agents = getAgentList();
    const results = [];
    for (const agent of agents) {
        const spinner = ora(`Checking ${chalk.bold(agent.name)} (${agent.binary})...`).start();
        let installed = false;
        let version = 'Not detected';
        let binPath = 'N/A';
        try {
            // 1. Check path
            const whereRes = await execa('where', [agent.binary], { shell: true });
            const paths = whereRes.stdout.trim().split('\r\n').filter(Boolean);
            binPath = paths[0] || 'Found in PATH';
            installed = true;
            // 2. Check version
            try {
                const verRes = await execa(agent.binary, [agent.versionFlag], {
                    shell: true,
                    timeout: 5000
                });
                const lines = verRes.stdout.trim().split('\n').filter(Boolean);
                version = lines[lines.length - 1] || 'Available';
            }
            catch {
                version = 'Ready (binary active)';
            }
            spinner.succeed(`${chalk.bold(agent.name)}: ${chalk.green('Ready')}`);
        }
        catch {
            spinner.fail(`${chalk.bold(agent.name)}: ${chalk.red('Binary not found in PATH')}`);
        }
        // 3. Check keys
        const foundKeys = agent.envKeys.filter((k) => !!process.env[k]);
        let keysStatus = chalk.yellow('⚠️ No env key set (uses CLI login/config)');
        if (foundKeys.length > 0) {
            const masked = foundKeys.map((k) => {
                const val = process.env[k] || '';
                const preview = val.length > 8 ? `${val.slice(0, 4)}...${val.slice(-4)}` : 'SET';
                return `${k}=${preview}`;
            });
            keysStatus = chalk.green(`🔑 ${masked.join(', ')}`);
        }
        results.push({
            name: agent.name,
            installed,
            version,
            path: binPath,
            keysStatus
        });
    }
    console.log('\n' + chalk.bold.underline('System Agent Status Summary:') + '\n');
    for (const r of results) {
        const statusIcon = r.installed ? chalk.green('✔ ACTIVE') : chalk.red('✖ MISSING');
        console.log(`${chalk.bold(r.name.padEnd(20))} [${statusIcon}]  ` +
            `Version: ${chalk.cyan(r.version.padEnd(24))}  ` +
            `Path: ${chalk.gray(r.path)}`);
        console.log(`   ${r.keysStatus}\n`);
    }
    const allGood = results.every((r) => r.installed);
    if (allGood) {
        console.log(boxen(chalk.green.bold('🎉 All 6 AI Coding CLIs are ready and operational!'), {
            padding: 1,
            borderColor: 'green',
            borderStyle: 'single'
        }));
    }
    else {
        console.log(boxen(chalk.yellow.bold('⚠️ Some agents were not detected. Run their installers to restore them.'), {
            padding: 1,
            borderColor: 'yellow',
            borderStyle: 'single'
        }));
    }
}
