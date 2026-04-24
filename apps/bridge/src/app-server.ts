import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { JsonRpcPeer, type JsonlTransport } from "@crc/codex-client";

export interface AppServerCommand {
  command: string;
  args: string[];
}

export function buildAppServerCommand(): AppServerCommand {
  return {
    command: "codex",
    args: ["app-server", "--listen", "stdio://"]
  };
}

export function spawnCodexAppServer(): {
  process: ChildProcessWithoutNullStreams;
  peer: JsonRpcPeer;
} {
  const { command, args } = buildAppServerCommand();
  const child = spawn(command, args, { stdio: "pipe" });
  const transport = new StdioJsonlTransport(child);
  return { process: child, peer: new JsonRpcPeer(transport) };
}

class StdioJsonlTransport implements JsonlTransport {
  private lineHandler?: (line: string) => void;
  private pending = "";

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      this.pending += chunk;
      let newline = this.pending.indexOf("\n");
      while (newline >= 0) {
        const line = this.pending.slice(0, newline).trim();
        this.pending = this.pending.slice(newline + 1);
        if (line) {
          this.lineHandler?.(line);
        }
        newline = this.pending.indexOf("\n");
      }
    });
  }

  send(line: string): void {
    this.child.stdin.write(`${line}\n`);
  }

  onLine(handler: (line: string) => void): void {
    this.lineHandler = handler;
  }
}
