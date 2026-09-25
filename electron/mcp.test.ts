import type { Server as HttpServer } from "node:http";
import path from "node:path";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod/v4";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { McpServerConfig } from "../src/types";
import {
  callMcpTool,
  closeMcpConnections,
  listEnabledMcpTools,
  testMcpServer,
} from "./mcp";

const fixture: McpServerConfig = {
  id: "echo-fixture",
  name: "Echo fixture",
  enabled: true,
  transport: "stdio",
  command: process.execPath,
  args: [path.resolve("tests/fixtures/mcp-echo-server.mjs")],
  cwd: "",
  env: {},
  url: "",
  headers: {},
};

let httpFixture: McpServerConfig;
let httpServer: HttpServer | undefined;

beforeAll(async () => {
  const app = createMcpExpressApp();
  app.post("/mcp", async (request, response) => {
    const server = new McpServer({
      name: "local-forge-http-fixture",
      version: "1.0.0",
    });
    server.registerTool(
      "echo-http",
      {
        description: "Echo text over Streamable HTTP.",
        inputSchema: { message: z.string() },
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async ({ message }) => ({
        content: [{ type: "text", text: `http-fixture:${message}` }],
      }),
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    response.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  });

  httpServer = await new Promise<HttpServer>((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("HTTP MCP fixture did not bind to a TCP port.");
  }
  httpFixture = {
    id: "http-echo-fixture",
    name: "HTTP echo fixture",
    enabled: true,
    transport: "http",
    command: "",
    args: [],
    cwd: "",
    env: {},
    url: `http://127.0.0.1:${address.port}/mcp`,
    headers: {},
  };
});

afterAll(async () => {
  await closeMcpConnections();
  await new Promise<void>((resolve, reject) => {
    if (!httpServer) {
      resolve();
      return;
    }
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("MCP manager", () => {
  it("connects to a stdio server and discovers its tools", async () => {
    const status = await testMcpServer(fixture);

    expect(status).toMatchObject({
      state: "connected",
      serverName: "local-forge-fixture",
      serverVersion: "1.0.0",
    });
    expect(status.tools.map((tool) => tool.name)).toContain("echo");
  });

  it("calls a discovered tool through the production manager", async () => {
    const catalog = await listEnabledMcpTools([fixture]);
    const binding = catalog.bindings.find(
      (entry) => entry.tool.name === "echo",
    );

    expect(binding).toBeDefined();
    const result = await callMcpTool(binding!, { message: "hello" });

    expect(result.isError).toBe(false);
    expect(result.content).toBe("fixture:hello");
  });

  it("discovers and calls a tool over Streamable HTTP", async () => {
    const catalog = await listEnabledMcpTools([httpFixture]);
    const binding = catalog.bindings.find(
      (entry) => entry.tool.name === "echo-http",
    );

    expect(catalog.statuses[0]).toMatchObject({
      state: "connected",
      serverName: "local-forge-http-fixture",
    });
    expect(binding).toBeDefined();
    const result = await callMcpTool(binding!, { message: "hello" });

    expect(result.isError).toBe(false);
    expect(result.content).toBe("http-fixture:hello");
  });
});
