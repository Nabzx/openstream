export type ModelServerRole = "transcription" | "rewrite";

export type ModelServerConfig = {
  role: ModelServerRole;
  command: string;
  args: string[];
  host: "127.0.0.1" | "localhost";
  port: number;
  contextTokens?: number;
};

export type ServerProcess = {
  on(event: "exit", listener: (code: number | null, signal: string | null) => void): void;
  kill(): void;
};

export type SpawnServer = (command: string, args: string[]) => ServerProcess;

export class ModelSupervisor {
  private processes = new Map<ModelServerRole, ServerProcess>();
  private stopping = false;

  constructor(
    private readonly configs: ModelServerConfig[],
    private readonly spawnServer: SpawnServer,
    private readonly log: (message: string) => void = () => undefined,
  ) {
    for (const config of configs) {
      if (config.host !== "127.0.0.1" && config.host !== "localhost") {
        throw new Error(`${config.role} model server must bind to localhost`);
      }
    }
  }

  start(): void {
    this.stopping = false;
    for (const config of this.configs) {
      if (!this.processes.has(config.role)) this.startOne(config);
    }
  }

  stop(): void {
    this.stopping = true;
    for (const process of this.processes.values()) process.kill();
    this.processes.clear();
  }

  private startOne(config: ModelServerConfig): void {
    const process = this.spawnServer(config.command, materializeArgs(config));
    this.processes.set(config.role, process);
    process.on("exit", (code, signal) => {
      this.processes.delete(config.role);
      if (this.stopping) return;
      this.log(`${config.role} model server exited (${signal ?? code ?? "unknown"}); restarting`);
      this.startOne(config);
    });
  }
}

export function materializeArgs(config: ModelServerConfig): string[] {
  const args = [...config.args, "--host", config.host, "--port", String(config.port)];
  if (config.role === "rewrite") args.push("--ctx-size", String(config.contextTokens ?? 2048));
  return args;
}
