import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync, } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
export function defineSandbox(config = {}) {
    return {
        backend: config.backend ?? "local",
        root: config.root,
        allowNetwork: config.allowNetwork ?? false,
        bootstrap: config.bootstrap ?? [],
        workspaceSeed: config.workspaceSeed ?? "agent/sandbox/workspace",
    };
}
/**
 * Isolated per-agent compute. Tools and the model never see host credentials;
 * they only touch files/commands inside the sandbox root.
 */
export function createSandbox(agentRoot, config, sessionId = "default") {
    const root = resolve(agentRoot, config.root ?? join(".helix", "sandbox", sessionId));
    mkdirSync(root, { recursive: true });
    mkdirSync(join(root, "workspace"), { recursive: true });
    seedWorkspace(agentRoot, root, config);
    for (const item of config.bootstrap ?? []) {
        const target = safeJoin(root, item);
        mkdirSync(dirname(target), { recursive: true });
        if (!existsSync(target))
            writeFileSync(target, "");
    }
    if (config.backend === "none") {
        return disabledSandbox(root);
    }
    const handle = {
        id: sessionId,
        backend: config.backend ?? "local",
        root,
        readFile(path) {
            return readFileSync(safeJoin(root, path), "utf8");
        },
        writeFile(path, contents) {
            const full = safeJoin(root, path);
            mkdirSync(dirname(full), { recursive: true });
            writeFileSync(full, contents);
        },
        list(path = ".") {
            const full = safeJoin(root, path);
            if (!existsSync(full))
                return [];
            return walk(full, root);
        },
        glob(pattern) {
            const files = walk(root, root);
            const rx = globToRegExp(pattern);
            return files.filter((f) => rx.test(f));
        },
        grep(pattern, path = ".") {
            const rx = new RegExp(pattern, "i");
            const hits = [];
            for (const file of handle.list(path)) {
                const full = safeJoin(root, file);
                if (!statSync(full).isFile())
                    continue;
                const lines = readFileSync(full, "utf8").split(/\r?\n/);
                lines.forEach((text, idx) => {
                    if (rx.test(text))
                        hits.push({ path: file, line: idx + 1, text });
                });
            }
            return hits.slice(0, 100);
        },
        exec(command) {
            return handle.bash(command);
        },
        bash(command) {
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
            }
            catch (err) {
                const e = err;
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
function seedWorkspace(agentRoot, sandboxRoot, config) {
    const seedRel = config.workspaceSeed ?? "agent/sandbox/workspace";
    const seed = resolve(agentRoot, seedRel);
    if (!existsSync(seed))
        return;
    for (const file of walk(seed, seed)) {
        const src = join(seed, file);
        if (!statSync(src).isFile())
            continue;
        const dest = safeJoin(sandboxRoot, join("workspace", file));
        mkdirSync(dirname(dest), { recursive: true });
        if (!existsSync(dest))
            writeFileSync(dest, readFileSync(src));
    }
}
function disabledSandbox(root) {
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
function safeJoin(root, path) {
    const full = resolve(root, path);
    if (full !== root && !full.startsWith(root + sep)) {
        throw new Error(`Sandbox path escapes root: ${path}`);
    }
    return full;
}
function walk(dir, root) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const rel = relative(root, full);
        out.push(rel);
        if (statSync(full).isDirectory())
            out.push(...walk(full, root));
    }
    return out;
}
function globToRegExp(pattern) {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "::DOUBLE::")
        .replace(/\*/g, "[^/]*")
        .replace(/::DOUBLE::/g, ".*");
    return new RegExp(`^${escaped}$`);
}
//# sourceMappingURL=index.js.map