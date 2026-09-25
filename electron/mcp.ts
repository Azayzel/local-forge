import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServerConfig, McpServerStatus, McpTool } from "../src/types";

const CONNECT_TIMEOUT_MS = 12_000;
const LIST_TIMEOUT_MS = 12_000;
const TOOL_TIMEOUT_MS = 120_000;
const MAX_TOOL_RESULT_CHARS = 64_000;
const BLOCKED_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "transfer-encoding",
]);

type McpTransport = StdioClientTransport | StreamableHTTPClientTransport;

interface ManagedConnection {
  client: Client;
  fingerprint: string;
  transport: McpTransport;
}

export interface McpToolBinding {
  ollamaName: string;
  server: McpServerConfig;
  tool: McpTool;
}

export interface McpToolCatalog {
  bindings: McpToolBinding[];
  statuses: McpServerStatus[];
}

export interface McpToolExecutionResult {
  content: string;
  isError: boolean;
  summary: string;
}

const connections = new Map<string, ManagedConnection>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown MCP error.";
}

function validateKeyValues(
  value: unknown,
  label: string,
  keyPattern: RegExp,
): asserts value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be key/value pairs.`);
  }
  for (const [key, entry] of Object.entries(value)) {
    if (!keyPattern.test(key) || typeof entry !== "string") {
      throw new Error(`${label} contains an invalid key or value.`);
    }
    if (/\r|\n/.test(key) || /\r|\n/.test(entry)) {
      throw new Error(`${label} cannot contain line breaks.`);
    }
  }
}

function validatedHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid MCP server URL.");
  }
  if (url.username || url.password) {
    throw new Error("Put credentials in headers, not in the MCP URL.");
  }
  const isLoopback =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new Error("Remote MCP servers must use HTTPS.");
  }
  return url;
}

export function validateMcpServerConfig(
  value: unknown,
): asserts value is McpServerConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid MCP server configuration.");
  }
  const server = value as Partial<McpServerConfig>;
  if (!server.id || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(server.id)) {
    throw new Error("The MCP server id is invalid.");
  }
  if (!server.name?.trim() || server.name.trim().length > 80) {
    throw new Error("Enter an MCP server name up to 80 characters.");
  }
  if (typeof server.enabled !== "boolean") {
    throw new Error("The MCP enabled setting is invalid.");
  }
  if (server.transport !== "stdio" && server.transport !== "http") {
    throw new Error("Choose a supported MCP transport.");
  }
  if (!Array.isArray(server.args) || server.args.length > 128) {
    throw new Error("MCP arguments must be a list of at most 128 values.");
  }
  if (server.args.some((argument) => typeof argument !== "string")) {
    throw new Error("Every MCP argument must be text.");
  }
  validateKeyValues(
    server.env,
    "Environment variables",
    /^[a-zA-Z_][a-zA-Z0-9_]*$/,
  );
  validateKeyValues(
    server.headers,
    "HTTP headers",
    /^[!#$%&'*+.^_`|~0-9a-zA-Z-]+$/,
  );
  for (const header of Object.keys(server.headers)) {
    if (BLOCKED_HEADERS.has(header.toLowerCase())) {
      throw new Error(`The ${header} header is managed by the MCP transport.`);
    }
  }
  if (typeof server.command !== "string" || typeof server.cwd !== "string") {
    throw new Error("Invalid MCP process configuration.");
  }
  if (typeof server.url !== "string") {
    throw new Error("Invalid MCP URL configuration.");
  }
  if (server.transport === "stdio" && !server.command.trim()) {
    throw new Error("Enter the command that starts this MCP server.");
  }
  if (server.transport === "http") validatedHttpUrl(server.url);
}

function configFingerprint(server: McpServerConfig): string {
  return JSON.stringify({
    transport: server.transport,
    command: server.command,
    args: server.args,
    cwd: server.cwd,
    env: server.env,
    url: server.url,
    headers: server.headers,
  });
}

function createTransport(server: McpServerConfig): McpTransport {
  if (server.transport === "stdio") {
    return new StdioClientTransport({
      command: server.command.trim(),
      args: server.args,
      cwd: server.cwd.trim() || undefined,
      env: { ...getDefaultEnvironment(), ...server.env },
      stderr: "pipe",
    });
  }
  return new StreamableHTTPClientTransport(validatedHttpUrl(server.url), {
    requestInit: { headers: server.headers },
  });
}

async function connectMcpServer(
  server: McpServerConfig,
): Promise<ManagedConnection> {
  validateMcpServerConfig(server);
  const fingerprint = configFingerprint(server);
  const current = connections.get(server.id);
  if (current?.fingerprint === fingerprint) return current;
  if (current) await disconnectMcpServer(server.id);

  const client = new Client(
    { name: "local-forge", version: "0.1.0" },
    { capabilities: {} },
  );
  const transport = createTransport(server);
  try {
    await client.connect(transport, { timeout: CONNECT_TIMEOUT_MS });
  } catch (error) {
    await transport.close().catch(() => undefined);
    throw error;
  }

  const connection = { client, fingerprint, transport };
  connections.set(server.id, connection);
  return connection;
}

function toMcpTool(tool: {
  name: string;
  description?: string;
  inputSchema: { [key: string]: unknown };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}): McpTool {
  return {
    name: tool.name,
    description: tool.description ?? "",
    inputSchema: tool.inputSchema,
    annotations: tool.annotations
      ? {
          readOnlyHint: tool.annotations.readOnlyHint,
          destructiveHint: tool.annotations.destructiveHint,
          idempotentHint: tool.annotations.idempotentHint,
          openWorldHint: tool.annotations.openWorldHint,
        }
      : undefined,
  };
}

async function listServerTools(server: McpServerConfig): Promise<{
  connection: ManagedConnection;
  tools: McpTool[];
}> {
  const connection = await connectMcpServer(server);
  try {
    const result = await connection.client.listTools(undefined, {
      timeout: LIST_TIMEOUT_MS,
    });
    return { connection, tools: result.tools.map(toMcpTool) };
  } catch (error) {
    await disconnectMcpServer(server.id);
    throw error;
  }
}

function safeToolName(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "tool";
}

function allocateToolName(
  server: McpServerConfig,
  tool: McpTool,
  usedNames: Set<string>,
): string {
  const base =
    `mcp_${safeToolName(server.name)}_${safeToolName(tool.name)}`.slice(0, 58);
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base.slice(0, 55)}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

export async function testMcpServer(
  server: McpServerConfig,
): Promise<McpServerStatus> {
  try {
    const { connection, tools } = await listServerTools(server);
    const implementation = connection.client.getServerVersion();
    return {
      serverId: server.id,
      state: "connected",
      serverName: implementation?.name,
      serverVersion: implementation?.version,
      tools,
    };
  } catch (error) {
    return {
      serverId: server.id,
      state: "error",
      tools: [],
      error: errorMessage(error),
    };
  }
}

export async function listEnabledMcpTools(
  servers: McpServerConfig[],
): Promise<McpToolCatalog> {
  const bindings: McpToolBinding[] = [];
  const statuses: McpServerStatus[] = [];
  const usedNames = new Set<string>();

  for (const server of servers.filter((entry) => entry.enabled)) {
    const status = await testMcpServer(server);
    statuses.push(status);
    if (status.state !== "connected") continue;
    for (const tool of status.tools) {
      bindings.push({
        ollamaName: allocateToolName(server, tool, usedNames),
        server,
        tool,
      });
    }
  }
  return { bindings, statuses };
}

function toolResultContent(result: unknown): string {
  if (!result || typeof result !== "object") return JSON.stringify(result);
  const record = result as Record<string, unknown>;
  const parts: string[] = [];
  if (Array.isArray(record.content)) {
    for (const item of record.content) {
      if (!item || typeof item !== "object") continue;
      const content = item as Record<string, unknown>;
      if (content.type === "text" && typeof content.text === "string") {
        parts.push(content.text);
      } else if (content.type === "resource" && content.resource) {
        parts.push(JSON.stringify(content.resource));
      } else if (content.type === "resource_link") {
        parts.push(JSON.stringify(content));
      } else if (content.type === "image" || content.type === "audio") {
        parts.push(
          `[${content.type} result${typeof content.mimeType === "string" ? `: ${content.mimeType}` : ""}]`,
        );
      }
    }
  }
  if (record.structuredContent) {
    parts.push(JSON.stringify(record.structuredContent));
  }
  const text = parts.length > 0 ? parts.join("\n") : JSON.stringify(result);
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n[Tool result truncated]`;
}

export async function callMcpTool(
  binding: McpToolBinding,
  argumentsValue: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<McpToolExecutionResult> {
  const connection = await connectMcpServer(binding.server);
  const result = await connection.client.callTool(
    { name: binding.tool.name, arguments: argumentsValue },
    undefined,
    { signal, timeout: TOOL_TIMEOUT_MS },
  );
  const content = toolResultContent(result);
  const isError = "isError" in result && result.isError === true;
  const summary = content.replace(/\s+/g, " ").trim().slice(0, 160);
  return { content, isError, summary };
}

export async function disconnectMcpServer(serverId: string): Promise<void> {
  const connection = connections.get(serverId);
  if (!connection) return;
  connections.delete(serverId);
  await connection.client.close().catch(() => undefined);
}

export async function closeMcpConnections(): Promise<void> {
  await Promise.all([...connections.keys()].map(disconnectMcpServer));
}
