import { randomUUID } from "node:crypto";
import type {
  ChatRequest,
  ChatStreamEvent,
  McpToolCallRequest,
} from "../src/types";
import { callMcpTool, listEnabledMcpTools, type McpToolBinding } from "./mcp";

const MAX_TOOL_ROUNDS = 8;

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface OllamaConversationMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

interface ChatRunnerOptions {
  request: ChatRequest;
  messages: OllamaConversationMessage[];
  signal: AbortSignal;
  emit: (event: ChatStreamEvent) => void;
  approve: (call: McpToolCallRequest) => Promise<boolean>;
}

interface RoundResult {
  content: string;
  toolCalls: OllamaToolCall[];
  totalDurationMs: number;
  promptTokens: number;
  outputTokens: number;
  evalDurationNs: number;
}

function runtimeEndpoint(baseUrl: string): string {
  const url = new URL(baseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (url.protocol !== "http:" || !localHosts.has(url.hostname)) {
    throw new Error("Local Forge only connects to runtimes on this machine.");
  }
  url.pathname = "/api/chat";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function readJsonLines(
  response: Response,
  onValue: (value: Record<string, unknown>) => void,
): Promise<void> {
  if (!response.body) throw new Error("Runtime returned an empty response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onValue(JSON.parse(line) as Record<string, unknown>);
    }
    if (done) break;
  }
  if (buffer.trim()) onValue(JSON.parse(buffer) as Record<string, unknown>);
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      throw new Error("The model returned invalid JSON tool arguments.");
    }
  }
  return {};
}

function parseToolCalls(value: unknown): OllamaToolCall[] {
  if (!Array.isArray(value)) return [];
  const calls: OllamaToolCall[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const fn = (entry as { function?: unknown }).function;
    if (!fn || typeof fn !== "object") continue;
    const name = (fn as { name?: unknown }).name;
    if (typeof name !== "string" || !name) continue;
    calls.push({
      function: {
        name,
        arguments: parseArguments((fn as { arguments?: unknown }).arguments),
      },
    });
  }
  return calls;
}

function toolDefinitions(bindings: McpToolBinding[]) {
  return bindings.map((binding) => ({
    type: "function",
    function: {
      name: binding.ollamaName,
      description:
        binding.tool.description ||
        `${binding.tool.name} from ${binding.server.name}`,
      parameters: binding.tool.inputSchema,
    },
  }));
}

async function runRound(
  options: ChatRunnerOptions,
  messages: OllamaConversationMessage[],
  bindings: McpToolBinding[],
): Promise<RoundResult> {
  const response = await fetch(runtimeEndpoint(options.request.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: options.request.model,
      messages,
      options: options.request.options,
      think: false,
      tools: bindings.length > 0 ? toolDefinitions(bindings) : undefined,
      stream: true,
    }),
    signal: options.signal,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Runtime returned ${response.status}.`);
  }

  let content = "";
  let totalDurationMs = 0;
  let promptTokens = 0;
  let outputTokens = 0;
  let evalDurationNs = 0;
  const toolCalls: OllamaToolCall[] = [];
  const seenCalls = new Set<string>();

  await readJsonLines(response, (chunk) => {
    const message = chunk.message as
      | { content?: unknown; tool_calls?: unknown }
      | undefined;
    if (typeof message?.content === "string" && message.content) {
      content += message.content;
      options.emit({
        requestId: options.request.requestId,
        type: "content",
        content: message.content,
      });
    }
    for (const call of parseToolCalls(message?.tool_calls)) {
      const key = JSON.stringify(call);
      if (!seenCalls.has(key)) {
        seenCalls.add(key);
        toolCalls.push(call);
      }
    }
    if (chunk.done) {
      totalDurationMs = Number(chunk.total_duration ?? 0) / 1_000_000;
      promptTokens = Number(chunk.prompt_eval_count ?? 0);
      outputTokens = Number(chunk.eval_count ?? 0);
      evalDurationNs = Number(chunk.eval_duration ?? 0);
    }
  });

  return {
    content,
    toolCalls,
    totalDurationMs,
    promptTokens,
    outputTokens,
    evalDurationNs,
  };
}

function toolCallRequest(
  requestId: string,
  binding: McpToolBinding,
  argumentsValue: Record<string, unknown>,
): McpToolCallRequest {
  const annotations = binding.tool.annotations;
  return {
    requestId,
    callId: randomUUID(),
    serverId: binding.server.id,
    serverName: binding.server.name,
    toolName: binding.tool.name,
    arguments: argumentsValue,
    destructive:
      annotations?.destructiveHint !== false &&
      annotations?.readOnlyHint !== true,
    openWorld: annotations?.openWorldHint !== false,
  };
}

export async function runMcpChat(options: ChatRunnerOptions): Promise<void> {
  const catalog = await listEnabledMcpTools(options.request.mcpServers ?? []);
  for (const serverStatus of catalog.statuses) {
    options.emit({
      requestId: options.request.requestId,
      type: "mcp-status",
      serverStatus,
    });
  }

  const bindingsByName = new Map(
    catalog.bindings.map((binding) => [binding.ollamaName, binding]),
  );
  const conversation = [...options.messages];
  let totalDurationMs = 0;
  let promptTokens = 0;
  let outputTokens = 0;
  let evalDurationNs = 0;

  for (let roundIndex = 0; roundIndex < MAX_TOOL_ROUNDS; roundIndex += 1) {
    options.signal.throwIfAborted();
    const round = await runRound(options, conversation, catalog.bindings);
    totalDurationMs += round.totalDurationMs;
    promptTokens += round.promptTokens;
    outputTokens += round.outputTokens;
    evalDurationNs += round.evalDurationNs;

    if (round.toolCalls.length === 0) {
      options.emit({
        requestId: options.request.requestId,
        type: "done",
        stats: {
          totalDurationMs,
          promptTokens,
          outputTokens,
          tokensPerSecond:
            evalDurationNs > 0
              ? outputTokens / (evalDurationNs / 1_000_000_000)
              : 0,
        },
      });
      return;
    }

    conversation.push({
      role: "assistant",
      content: round.content,
      tool_calls: round.toolCalls,
    });

    for (const call of round.toolCalls) {
      const binding = bindingsByName.get(call.function.name);
      if (!binding) {
        conversation.push({
          role: "tool",
          tool_name: call.function.name,
          content: "Tool unavailable: Local Forge did not advertise this tool.",
        });
        continue;
      }

      const approval = toolCallRequest(
        options.request.requestId,
        binding,
        call.function.arguments,
      );
      options.emit({
        requestId: options.request.requestId,
        type: "tool-approval",
        toolCall: approval,
      });
      const approved = await options.approve(approval);
      options.signal.throwIfAborted();

      if (!approved) {
        options.emit({
          requestId: options.request.requestId,
          type: "tool-result",
          toolResult: {
            callId: approval.callId,
            serverName: approval.serverName,
            toolName: approval.toolName,
            status: "denied",
          },
        });
        conversation.push({
          role: "tool",
          tool_name: call.function.name,
          content: "The user denied this tool call.",
        });
        continue;
      }

      options.emit({
        requestId: options.request.requestId,
        type: "tool-start",
        toolCall: approval,
      });
      try {
        const result = await callMcpTool(
          binding,
          call.function.arguments,
          options.signal,
        );
        options.emit({
          requestId: options.request.requestId,
          type: "tool-result",
          toolResult: {
            callId: approval.callId,
            serverName: approval.serverName,
            toolName: approval.toolName,
            status: result.isError ? "error" : "completed",
            summary: result.summary,
          },
        });
        conversation.push({
          role: "tool",
          tool_name: call.function.name,
          content: result.content,
        });
      } catch (error) {
        if (options.signal.aborted) throw error;
        const message =
          error instanceof Error ? error.message : "MCP tool call failed.";
        options.emit({
          requestId: options.request.requestId,
          type: "tool-result",
          toolResult: {
            callId: approval.callId,
            serverName: approval.serverName,
            toolName: approval.toolName,
            status: "error",
            summary: message,
          },
        });
        conversation.push({
          role: "tool",
          tool_name: call.function.name,
          content: `Tool error: ${message}`,
        });
      }
    }
  }

  throw new Error(`Stopped after ${MAX_TOOL_ROUNDS} MCP tool rounds.`);
}
