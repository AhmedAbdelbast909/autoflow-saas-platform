export interface PipelineOptions {
    task?: string;
    architect?: string;
    developer?: string;
    reviewer?: string;
    saveReport?: boolean;
}
export declare function runPipeline(options?: PipelineOptions): Promise<void>;
