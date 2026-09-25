import { describe, expect, it } from "vitest";
import { mapWorkspaceMcpSecrets } from "./workspace-secrets";

describe("workspace MCP secret mapping", () => {
  it("transforms only environment and header values without mutating input", () => {
    const workspace = {
      settings: {
        ollamaUrl: "http://127.0.0.1:11434",
        mcpServers: [
          {
            id: "server",
            command: "npx",
            env: { API_TOKEN: "secret" },
            headers: { Authorization: "Bearer token" },
          },
        ],
      },
    };

    const mapped = mapWorkspaceMcpSecrets(
      workspace,
      (value) => `protected:${value}`,
    ) as typeof workspace;

    expect(mapped.settings.mcpServers[0]).toMatchObject({
      command: "npx",
      env: { API_TOKEN: "protected:secret" },
      headers: { Authorization: "protected:Bearer token" },
    });
    expect(workspace.settings.mcpServers[0].env.API_TOKEN).toBe("secret");
  });
});
