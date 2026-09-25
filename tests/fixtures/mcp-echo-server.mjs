import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

const server = new McpServer({ name: "local-forge-fixture", version: "1.0.0" });

server.registerTool(
  "echo",
  {
    description: "Echo text through the Local Forge MCP fixture.",
    inputSchema: { message: z.string() },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ message }) => ({
    content: [{ type: "text", text: `fixture:${message}` }],
  }),
);

await server.connect(new StdioServerTransport());
