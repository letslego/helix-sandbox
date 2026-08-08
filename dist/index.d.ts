export interface SandboxConfig {
    backend?: "local" | "none";
    root?: string;
    allowNetwork?: boolean;
    bootstrap?: string[];
    workspaceSeed?: string;
}
export interface SandboxHandle {
    root: string;
    readFile(path: string): string;
    writeFile(path: string, contents: string): void;
    list(path?: string): string[];
    exec(command: string): {
        stdout: string;
        stderr: string;
        exitCode: number;
    };
    glob?(pattern: string): string[];
    grep?(pattern: string, path?: string): Array<{
        path: string;
        line: number;
        text: string;
    }>;
    bash?(command: string): {
        stdout: string;
        stderr: string;
        exitCode: number;
    };
}
export declare function defineSandbox(config?: SandboxConfig): SandboxConfig;
export interface SandboxSession extends SandboxHandle {
    id: string;
    backend: string;
    glob(pattern: string): string[];
    grep(pattern: string, path?: string): Array<{
        path: string;
        line: number;
        text: string;
    }>;
    bash(command: string): {
        stdout: string;
        stderr: string;
        exitCode: number;
    };
}
/**
 * Isolated per-agent compute. Tools and the model never see host credentials;
 * they only touch files/commands inside the sandbox root.
 */
export declare function createSandbox(agentRoot: string, config: SandboxConfig, sessionId?: string): SandboxSession;
//# sourceMappingURL=index.d.ts.map