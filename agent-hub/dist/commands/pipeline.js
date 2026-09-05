import fs from 'node:fs';
import path from 'node:path';
import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import { execa } from 'execa';
import { getAgent, getAgentList, resolveAgentBinary } from '../agents/registry.js';
import { loadEnvAndConfig } from '../config/manager.js';
async function executeAgentPrompt(agent, prompt, timeoutMs = 180000) {
    const binaryPath = resolveAgentBinary(agent);
    const args = agent.getPrintArgs(prompt);
    try {
        const res = await execa(binaryPath, args, {
            shell: false,
            input: '',
            env: process.env,
            timeout: timeoutMs
        });
        return res.stdout || res.stderr || '(No output returned)';
    }
    catch (err) {
        return err.stdout || err.stderr || err.message || 'Execution notice';
    }
}
export async function runPipeline(options = {}) {
    const config = loadEnvAndConfig();
    let task = options.task;
    if (!task) {
        task = await input({
            message: 'Describe the feature or problem for the Multi-Agent Pipeline:',
            validate: (v) => (v.trim().length > 0 ? true : 'Task description cannot be empty')
        });
    }
    const agents = getAgentList();
    const agentChoices = agents.map((a) => ({
        name: `${a.name} (${a.vendor})`,
        value: a.id
    }));
    const architectId = options.architect ||
        config.defaultPipeline?.architect ||
        (await select({
            message: 'Select Stage 1 Agent (Architect / Planning):',
            choices: agentChoices,
            default: 'agy'
        }));
    const developerId = options.developer ||
        config.defaultPipeline?.developer ||
        (await select({
            message: 'Select Stage 2 Agent (Implementer / Coding):',
            choices: agentChoices,
            default: 'codex'
        }));
    const reviewerId = options.reviewer ||
        config.defaultPipeline?.reviewer ||
        (await select({
            message: 'Select Stage 3 Agent (Reviewer / QA):',
            choices: agentChoices,
            default: 'agy'
        }));
    const architect = getAgent(architectId);
    const developer = getAgent(developerId);
    const reviewer = getAgent(reviewerId);
    console.log(boxen(`${chalk.bold.hex('#10B981')('🚀 Multi-Agent Workflow Pipeline 🚀')}\n\n` +
        `${chalk.bold('Task:')} ${task}\n\n` +
        `  ${chalk.bold('1. Architect:')} ${chalk.hex(architect.color)(architect.name)}\n` +
        `  ${chalk.bold('2. Implementer:')} ${chalk.hex(developer.color)(developer.name)}\n` +
        `  ${chalk.bold('3. Reviewer:')} ${chalk.hex(reviewer.color)(reviewer.name)}`, {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderColor: '#10B981',
        borderStyle: 'round'
    }));
    // Stage 1: Architect
    const spinner1 = ora(`Stage 1: [${architect.name}] Analyzing task and designing architecture...`).start();
    const architectPrompt = `You are the Lead Software Architect. Provide an architectural plan and database schema for this task: "${task}". Outline the Supabase schema, table policies (RLS), and React architecture.`;
    const architectOutput = await executeAgentPrompt(architect, architectPrompt);
    spinner1.succeed(`Stage 1: [${architect.name}] Architectural Plan Generated!`);
    // Stage 2: Developer
    const spinner2 = ora(`Stage 2: [${developer.name}] Generating implementation and code structure...`).start();
    const developerPrompt = `You are the Fullstack Developer. Based on the task "${task}" and Architect Plan:\n${architectOutput.slice(0, 3000)}\n\nProvide the core TypeScript interfaces, Supabase client initialization, and React state management code.`;
    const developerOutput = await executeAgentPrompt(developer, developerPrompt);
    spinner2.succeed(`Stage 2: [${developer.name}] Implementation Completed!`);
    // Stage 3: Reviewer
    const spinner3 = ora(`Stage 3: [${reviewer.name}] Performing security and code quality review...`).start();
    const reviewerPrompt = `You are the Senior Code & Security Reviewer. Review the implementation against the task "${task}":\n${developerOutput.slice(0, 3000)}\n\nProvide a concise review summary covering Security, Scalability, and Edge Cases.`;
    const reviewerOutput = await executeAgentPrompt(reviewer, reviewerPrompt);
    spinner3.succeed(`Stage 3: [${reviewer.name}] Review & Verification Complete!`);
    // Display outputs
    console.log(boxen(`${chalk.bold.hex(architect.color)(`Stage 1: ${architect.name} (Architect)`)}\n\n${architectOutput.trim()}`, { padding: 1, margin: { top: 1, bottom: 0 }, borderColor: architect.color, borderStyle: 'single' }));
    console.log(boxen(`${chalk.bold.hex(developer.color)(`Stage 2: ${developer.name} (Implementer)`)}\n\n${developerOutput.trim()}`, { padding: 1, margin: { top: 1, bottom: 0 }, borderColor: developer.color, borderStyle: 'single' }));
    console.log(boxen(`${chalk.bold.hex(reviewer.color)(`Stage 3: ${reviewer.name} (Reviewer)`)}\n\n${reviewerOutput.trim()}`, { padding: 1, margin: { top: 1, bottom: 1 }, borderColor: reviewer.color, borderStyle: 'single' }));
    // Save report
    const reportPath = path.join(process.cwd(), 'agent-pipeline-report.md');
    const reportContent = `# Multi-Agent Pipeline Report
**Task:** ${task}  
**Date:** ${new Date().toISOString()}  
**Architect:** ${architect.name}  
**Developer:** ${developer.name}  
**Reviewer:** ${reviewer.name}  

---

## 🏗️ Stage 1: Architecture Plan (${architect.name})
${architectOutput}

---

## 💻 Stage 2: Implementation (${developer.name})
${developerOutput}

---

## 🛡️ Stage 3: Security & Code Review (${reviewer.name})
${reviewerOutput}
`;
    fs.writeFileSync(reportPath, reportContent, 'utf-8');
    console.log(chalk.green.bold(`\n📄 Pipeline report saved to: ${chalk.underline(reportPath)}\n`));
}
