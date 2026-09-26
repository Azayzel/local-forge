import { createServer } from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import type {
  ChatRequest,
  ChatStreamEvent,
  McpServerConfig,
} from "../src/types";
import { runMcpChat, warmChatModel } from "./chat";
import { closeMcpConnections } from "./mcp";

const fixture: McpServerConfig = {
  id: "chat-echo-fixture",
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

afterAll(() => closeMcpConnections());

describe("MCP chat orchestration", () => {
  it("preloads the selected model with the chat keep-alive", async () => {
    let requestPath = "";
    let requestBody: Record<string, unknown> = {};
    const server = createServer(async (incoming, response) => {
      requestPath = incoming.url ?? "";
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      requestBody = JSON.parse(
        Buffer.concat(chunks).toString("utf8"),
      ) as Record<string, unknown>;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ done: true }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;

    try {
      await warmChatModel(`http://127.0.0.1:${address.port}`, "fixture-model");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }

    expect(requestPath).toBe("/api/generate");
    expect(requestBody).toMatchObject({
      model: "fixture-model",
      prompt: "",
      stream: false,
      keep_alive: "30m",
    });
  });

  it("approves and executes a tool before continuing the Ollama chat", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const server = createServer(async (incoming, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
        string,
        unknown
      >;
      requests.push(body);
      response.writeHead(200, { "content-type": "application/x-ndjson" });

      if (requests.length === 1) {
        const tools = body.tools as Array<{
          function: { name: string };
        }>;
        response.end(
          `${JSON.stringify({
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  function: {
                    name: tools[0].function.name,
                    arguments: { message: "through-chat" },
                  },
                },
              ],
            },
            done: true,
            total_duration: 10_000_000,
            prompt_eval_count: 10,
            eval_count: 2,
            eval_duration: 5_000_000,
          })}\n`,
        );
        return;
      }

      response.end(
        `${JSON.stringify({
          message: { role: "assistant", content: "Tool round complete." },
          done: true,
          total_duration: 8_000_000,
          prompt_eval_count: 14,
          eval_count: 4,
          eval_duration: 4_000_000,
        })}\n`,
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;
    const request: ChatRequest = {
      requestId: "chat-with-mcp",
      baseUrl: `http://127.0.0.1:${address.port}`,
      model: "fixture-model",
      messages: [{ role: "user", content: "Use the echo tool." }],
      mcpServers: [fixture],
    };
    const events: ChatStreamEvent[] = [];

    try {
      await runMcpChat({
        request,
        messages: request.messages,
        signal: new AbortController().signal,
        emit: (event) => events.push(event),
        approve: async () => true,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }

    expect(requests).toHaveLength(2);
    expect(requests[0].think).toBe(false);
    expect(requests[0].keep_alive).toBe("30m");
    expect(requests[0].tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function: expect.objectContaining({
            name: expect.stringMatching(/^mcp_/),
          }),
        }),
      ]),
    );
    expect(requests[1].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "tool",
          content: "fixture:through-chat",
        }),
      ]),
    );
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "mcp-status",
        "tool-approval",
        "tool-start",
        "tool-result",
        "content",
        "done",
      ]),
    );
    expect(events.find((event) => event.type === "content")?.content).toBe(
      "Tool round complete.",
    );
  });
});
