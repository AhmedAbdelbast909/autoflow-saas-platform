export interface AgentSpec {
    id: string;
    name: string;
    vendor: string;
    description: string;
    binary: string;
    versionFlag: string;
    envKeys: string[];
    color: string;
    getInteractiveArgs: (extraArgs?: string[]) => string[];
    getPrintArgs: (prompt: string, extraArgs?: string[]) => string[];
}
export declare const AGENTS: Record<string, AgentSpec>;
export declare function getAgentList(): AgentSpec[];
export declare function getAgent(id: string): AgentSpec | undefined;
export declare function resolveAgentBinary(agent: AgentSpec): string;
