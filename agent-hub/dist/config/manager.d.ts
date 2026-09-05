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
export declare function loadEnvAndConfig(): HubConfig;
export declare function saveConfig(config: HubConfig): void;
export declare function getConfigFilePath(): string;
