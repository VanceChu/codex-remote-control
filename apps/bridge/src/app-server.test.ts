import { describe, expect, it } from "vitest";
import { buildAppServerCommand } from "./app-server.js";

describe("buildAppServerCommand", () => {
  it("starts Codex app-server over stdio", () => {
    expect(buildAppServerCommand()).toEqual({
      command: "codex",
      args: ["app-server", "--listen", "stdio://"]
    });
  });
});
