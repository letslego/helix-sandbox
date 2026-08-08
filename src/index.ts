import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
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
  exec(command: string): { stdout: string; stderr: string; exitCode: number };
  glob?(pattern: string): string[];
  grep?(pattern: string, path?: string): Array<{ path: string; line: number; text: string }>;
  bash?(command: string): { stdout: string; stderr: string; exitCode: number };
}


export function defineSandbox(config: SandboxConfig = {}): SandboxConfig {
  return {
    backend: config.backend ?? "local",
    root: config.root,
    allowNetwork: config.allowNetwork ?? false,
    bootstrap: config.bootstrap ?? [],
    workspaceSeed: config.workspaceSeed ?? "agent/sandbox/workspace",
  };
}

export interface SandboxSession extends SandboxHandle {
  id: string;
  backend: string;
  glob(pattern: string): string[];
  grep(pattern: string, path?: string): Array<{ path: string; line: number; text: string }>;
  bash(command: string): { stdout: string; stderr: string; exitCode: number };
}

/**
 * Isolated per-agent compute. Tools and the model never see host credentials;
 * they only touch files/commands inside the sandbox root.
 */
export function createSandbox(
  agentRoot: string,
  config: SandboxConfig,
  sessionId = "default",
): SandboxSession {
  const root = resolve(
    agentRoot,
    config.root ?? join(".helix", "sandbox", sessionId),
  );
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, "workspace"), { recursive: true });

  seedWorkspace(agentRoot, root, config);

  for (const item of config.bootstrap ?? []) {
    const target = safeJoin(root, item);
    mkdirSync(dirname(target), { recursive: true });
    if (!existsSync(target)) writeFileSync(target, "");
  }

  if (config.backend === "none") {
    return disabledSandbox(root);
  }

  const handle: SandboxSession = {
    id: sessionId,
    backend: config.backend ?? "local",
    root,
    readFile(path: string) {
      return readFileSync(safeJoin(root, path), "utf8");
    },
    writeFile(path: string, contents: string) {
      const full = safeJoin(root, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, contents);
    },
    list(path = ".") {
      const full = safeJoin(root, path);
      if (!existsSync(full)) return [];
      return walk(full, root);
    },
    glob(pattern: string) {
      const files = walk(root, root);
      const rx = globToRegExp(pattern);
      return files.filter((f) => rx.test(f));
    },
    grep(pattern: string, path = ".") {
      const rx = new RegExp(pattern, "i");
      const hits: Array<{ path: string; line: number; text: string }> = [];
      for (const file of handle.list(path)) {
        const full = safeJoin(root, file);
        if (!statSync(full).isFile()) continue;
        const lines = readFileSync(full, "utf8").split(/\r?\n/);
        lines.forEach((text, idx) => {
          if (rx.test(text)) hits.push({ path: file, line: idx + 1, text });
        });
      }
      return hits.slice(0, 100);
    },
    exec(command: string) {
      return handle.bash(command);
    },
    bash(command: string) {
      if (/[;&|`$<>]/.test(command) || command.includes("\n")) {
        return {
          stdout: "",
          stderr: "Command rejected by sandbox policy",
          exitCode: 126,
        };
      }
      const parts = command.trim().split(/\s+/);
      const bin = parts[0];
      const args = parts.slice(1);
      const allowed = new Set([
        "ls",
        "pwd",
        "cat",
        "echo",
        "head",
        "tail",
        "wc",
        "node",
        "npm",
        "python3",
      ]);
      if (!allowed.has(bin)) {
        return {
          stdout: "",
          stderr: `Binary not allowlisted in sandbox: ${bin}`,
          exitCode: 126,
        };
      }
      try {
        const stdout = execFileSync(bin, args, {
          cwd: root,
          encoding: "utf8",
          timeout: 10_000,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            PATH: process.env.PATH,
            HOME: root,
            HELIX_SANDBOX: "1",
          },
        });
        return { stdout, stderr: "", exitCode: 0 };
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; status?: number };
        return {
          stdout: e.stdout ?? "",
          stderr: e.stderr ?? (err instanceof Error ? err.message : String(err)),
          exitCode: e.status ?? 1,
        };
      }
    },
  };

  return handle;
}

function seedWorkspace(agentRoot: string, sandboxRoot: string, config: SandboxConfig) {
  const seedRel = config.workspaceSeed ?? "agent/sandbox/workspace";
  const seed = resolve(agentRoot, seedRel);
  if (!existsSync(seed)) return;
  for (const file of walk(seed, seed)) {
    const src = join(seed, file);
    if (!statSync(src).isFile()) continue;
    const dest = safeJoin(sandboxRoot, join("workspace", file));
    mkdirSync(dirname(dest), { recursive: true });
    if (!existsSync(dest)) writeFileSync(dest, readFileSync(src));
  }
}

function disabledSandbox(root: string): SandboxSession {
  const reject = () => {
    throw new Error("Sandbox disabled");
  };
  return {
    id: "disabled",
    backend: "none",
    root,
    readFile: reject,
    writeFile: reject,
    list: () => [],
    glob: () => [],
    grep: () => [],
    exec: () => ({ stdout: "", stderr: "Sandbox disabled", exitCode: 1 }),
    bash: () => ({ stdout: "", stderr: "Sandbox disabled", exitCode: 1 }),
  };
}

function safeJoin(root: string, path: string): string {
  const full = resolve(root, path);
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error(`Sandbox path escapes root: ${path}`);
  }
  return full;
}

function walk(dir: string, root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(root, full);
    out.push(rel);
    if (statSync(full).isDirectory()) out.push(...walk(full, root));
  }
  return out;
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLE::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLE::/g, ".*");
  return new RegExp(`^${escaped}$`);
}
