export interface BroadcastOptions {
    agents?: string;
    timeout?: string;
}
export declare function runBroadcast(promptArg?: string, options?: BroadcastOptions): Promise<void>;
