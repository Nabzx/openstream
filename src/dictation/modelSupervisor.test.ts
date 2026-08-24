import { describe, expect, it } from "vitest";
import { ModelSupervisor, materializeArgs } from "./modelSupervisor";
import type { ModelServerConfig, ServerProcess } from "./modelSupervisor";

class FakeProcess implements ServerProcess {
  exitListener: ((code: number | null, signal: string | null) => void) | undefined;
  killed = false;

  on(_event: "exit", listener: (code: number | null, signal: string | null) => void): void {
    this.exitListener = listener;
  }

  kill(): void {
    this.killed = true;
  }

  exit(code: number | null = 1, signal: string | null = null): void {
    this.exitListener?.(code, signal);
  }
}

const configs: ModelServerConfig[] = [
  { role: "transcription", command: "whisper-server", args: ["--model", "base.en.bin"], host: "127.0.0.1", port: 8178 },
  { role: "rewrite", command: "llama-server", args: ["--model", "smol.gguf"], host: "127.0.0.1", port: 8179 },
];

describe("ModelSupervisor", () => {
  it("starts both resident model roles on localhost and caps rewrite context at 2048 tokens", () => {
    const spawned: Array<{ command: string; args: string[]; process: FakeProcess }> = [];
    const supervisor = new ModelSupervisor(configs, (command, args) => {
      const process = new FakeProcess();
      spawned.push({ command, args, process });
      return process;
    });

    supervisor.start();

    expect(spawned.map((entry) => entry.command)).toEqual(["whisper-server", "llama-server"]);
    expect(spawned[0].args).toContain("127.0.0.1");
    expect(spawned[1].args).toEqual([
      "--model",
      "smol.gguf",
      "--host",
      "127.0.0.1",
      "--port",
      "8179",
      "--ctx-size",
      "2048",
    ]);
  });

  it("restarts an unexpectedly exited model server", () => {
    const spawned: FakeProcess[] = [];
    const supervisor = new ModelSupervisor([configs[0]], () => {
      const process = new FakeProcess();
      spawned.push(process);
      return process;
    });

    supervisor.start();
    spawned[0].exit(1);

    expect(spawned).toHaveLength(2);
  });

  it("does not restart during an intentional stop", () => {
    const spawned: FakeProcess[] = [];
    const supervisor = new ModelSupervisor([configs[0]], () => {
      const process = new FakeProcess();
      spawned.push(process);
      return process;
    });

    supervisor.start();
    supervisor.stop();
    spawned[0].exit(0);

    expect(spawned).toHaveLength(1);
    expect(spawned[0].killed).toBe(true);
  });

  it("rejects non-loopback model server bindings", () => {
    expect(
      () =>
        new ModelSupervisor(
          [{ ...configs[0], host: "0.0.0.0" as "127.0.0.1" }],
          () => new FakeProcess(),
        ),
    ).toThrow("must bind to localhost");
  });
});

describe("materializeArgs", () => {
  it("keeps explicit rewrite context caps", () => {
    expect(materializeArgs({ ...configs[1], contextTokens: 1024 })).toContain("1024");
  });
});
