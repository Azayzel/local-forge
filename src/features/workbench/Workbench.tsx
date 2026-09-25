import {
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  ImagePlus,
  LoaderCircle,
  Paperclip,
  Plug,
  ShieldCheck,
  Sparkles,
  Square,
  Wrench,
  X,
} from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { forgeApi } from "../../lib/forge-api";
import { imageBase64, imageDataUrl } from "../../lib/images";
import {
  titleFromPrompt,
  type ForgeSettings,
  type Thread,
} from "../../state/workspace";
import type {
  ChatMessage,
  ChatStreamEvent,
  ImageAttachment,
  McpServerStatus,
  McpToolCallRequest,
  OllamaModel,
} from "../../types";

interface ToolActivity {
  callId: string;
  serverName: string;
  toolName: string;
  status: "running" | "completed" | "denied" | "error";
  summary?: string;
}

interface WorkbenchProps {
  thread: Thread;
  settings: ForgeSettings;
  models: OllamaModel[];
  runtimeOnline: boolean;
  onUpdateThread: (
    threadId: string,
    update: (thread: Thread) => Thread,
  ) => void;
  onModelChange: (model: string) => void;
  onOpenModels: () => void;
}

const promptIdeas = [
  "Review an architecture decision",
  "Turn rough notes into a plan",
  "Debug a failing test with me",
  "Compare two implementation approaches",
];

export function Workbench({
  thread,
  settings,
  models,
  runtimeOnline,
  onUpdateThread,
  onModelChange,
  onOpenModels,
}: WorkbenchProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [lastStats, setLastStats] = useState<ChatStreamEvent["stats"]>();
  const [pendingToolCall, setPendingToolCall] =
    useState<McpToolCallRequest | null>(null);
  const [toolActivity, setToolActivity] = useState<ToolActivity[]>([]);
  const [mcpStatuses, setMcpStatuses] = useState<
    Record<string, McpServerStatus>
  >({});
  const activeRequest = useRef<{
    requestId: string;
    threadId: string;
    assistantId: string;
  } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedModel =
    thread.model || settings.selectedModel || models[0]?.name || "";
  const enabledMcpServers = settings.mcpServers.filter(
    (server) => server.enabled,
  );

  const handleStreamEvent = useEffectEvent((event: ChatStreamEvent) => {
    const active = activeRequest.current;
    if (!active || event.requestId !== active.requestId) return;

    if (event.type === "content" && event.content) {
      onUpdateThread(active.threadId, (current) => ({
        ...current,
        messages: current.messages.map((message) =>
          message.id === active.assistantId
            ? { ...message, content: message.content + event.content }
            : message,
        ),
      }));
    }

    if (event.type === "mcp-status" && event.serverStatus) {
      setMcpStatuses((current) => ({
        ...current,
        [event.serverStatus!.serverId]: event.serverStatus!,
      }));
    }

    if (event.type === "tool-approval" && event.toolCall) {
      setPendingToolCall(event.toolCall);
    }

    if (event.type === "tool-start" && event.toolCall) {
      setPendingToolCall(null);
      setToolActivity((current) => [
        ...current.filter((item) => item.callId !== event.toolCall!.callId),
        {
          callId: event.toolCall.callId,
          serverName: event.toolCall.serverName,
          toolName: event.toolCall.toolName,
          status: "running",
        },
      ]);
    }

    if (event.type === "tool-result" && event.toolResult) {
      setPendingToolCall((current) =>
        current?.callId === event.toolResult!.callId ? null : current,
      );
      setToolActivity((current) => [
        ...current.filter((item) => item.callId !== event.toolResult!.callId),
        event.toolResult!,
      ]);
    }

    if (event.type === "done" || event.type === "error") {
      setIsGenerating(false);
      setLastStats(event.stats);
      setPendingToolCall(null);
      activeRequest.current = null;
      if (event.error) setError(event.error);
    }
  });

  useEffect(() => forgeApi.ollama.onChatEvent(handleStreamEvent), []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [thread.messages]);

  async function chooseImages() {
    try {
      const selected = await forgeApi.dialog.chooseImages();
      setAttachments((current) => [...current, ...selected].slice(0, 4));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not attach image.",
      );
    }
  }

  function sendMessage() {
    const prompt = input.trim();
    if (!prompt || isGenerating) return;
    if (!runtimeOnline) {
      setError("Start Ollama, then reconnect from Models or Settings.");
      return;
    }
    if (!selectedModel) {
      setError("Install or select a model before sending a message.");
      return;
    }

    const requestId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const images = attachments.map((attachment) => attachment.url);
    const userMessage: ChatMessage = {
      id: userId,
      role: "user",
      content: prompt,
      createdAt,
      images: images.length > 0 ? images : undefined,
    };
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt,
    };

    onUpdateThread(thread.id, (current) => ({
      ...current,
      title:
        current.messages.length === 0 ? titleFromPrompt(prompt) : current.title,
      model: selectedModel,
      messages: [...current.messages, userMessage, assistantMessage],
    }));
    activeRequest.current = { requestId, threadId: thread.id, assistantId };
    setInput("");
    setAttachments([]);
    setError("");
    setLastStats(undefined);
    setPendingToolCall(null);
    setToolActivity([]);
    setMcpStatuses({});
    setIsGenerating(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    void forgeApi.ollama
      .chat({
        requestId,
        baseUrl: settings.ollamaUrl,
        model: selectedModel,
        messages: [
          ...thread.messages.filter((message) => message.content),
          userMessage,
        ].map(({ role, content, images: messageImages }) => ({
          role,
          content,
          images: messageImages?.map(imageBase64),
        })),
        options: {
          temperature: settings.temperature,
          numCtx: settings.contextLength,
        },
        mcpServers: enabledMcpServers,
      })
      .catch((reason: unknown) => {
        setIsGenerating(false);
        setError(
          reason instanceof Error ? reason.message : "Chat request failed.",
        );
      });
  }

  function stopGeneration() {
    const request = activeRequest.current;
    if (request) void forgeApi.ollama.cancelChat(request.requestId);
  }

  async function decideToolCall(approved: boolean) {
    const call = pendingToolCall;
    if (!call) return;
    setPendingToolCall(null);
    try {
      await forgeApi.mcp.respondToToolCall({
        requestId: call.requestId,
        callId: call.callId,
        approved,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not respond to the tool request.",
      );
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      sendMessage();
    }
  }

  function resizeComposer(target: HTMLTextAreaElement) {
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 180)}px`;
  }

  async function copyMessage(message: ChatMessage) {
    await navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    window.setTimeout(() => setCopiedId(""), 1200);
  }

  return (
    <main className="workbench-main">
      <header className="workbench-header">
        <div>
          <span className="eyebrow">Conversation</span>
          <h1>{thread.title}</h1>
        </div>
        <div className="workbench-actions">
          <label className="model-select">
            <span className="sr-only">Active model</span>
            <select
              value={selectedModel}
              onChange={(event) => onModelChange(event.target.value)}
              disabled={models.length === 0}
            >
              {models.length === 0 && (
                <option value="">No models installed</option>
              )}
              {models.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
          <span className="privacy-label">
            {enabledMcpServers.length > 0 ? (
              <>
                <Plug size={14} /> {enabledMcpServers.length} MCP active
              </>
            ) : (
              <>
                <ShieldCheck size={14} /> On device
              </>
            )}
          </span>
        </div>
      </header>

      <section
        className={`messages ${thread.messages.length === 0 ? "empty" : ""}`}
        aria-live="polite"
      >
        {thread.messages.length === 0 ? (
          <div className="empty-workbench">
            <span className="empty-forge-mark">
              <Sparkles size={25} />
            </span>
            <h2>What are we building?</h2>
            <p>Start with a question, a file, or a half-formed idea.</p>
            <div className="prompt-ideas">
              {promptIdeas.map((idea) => (
                <button
                  type="button"
                  key={idea}
                  onClick={() => {
                    setInput(idea);
                    textareaRef.current?.focus();
                  }}
                >
                  <span>{idea}</span>
                  <ArrowUp size={14} />
                </button>
              ))}
            </div>
            {!runtimeOnline && (
              <button
                className="text-button"
                type="button"
                onClick={onOpenModels}
              >
                Connect a local runtime
              </button>
            )}
          </div>
        ) : (
          <div className="message-stream">
            {thread.messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <div className="message-avatar" aria-hidden="true">
                  {message.role === "assistant" ? <Sparkles size={15} /> : "Y"}
                </div>
                <div className="message-body">
                  <div className="message-author">
                    <strong>
                      {message.role === "assistant" ? selectedModel : "You"}
                    </strong>
                    <span>
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {message.images && message.images.length > 0 && (
                    <div className="message-image-row">
                      {message.images.map((image, index) => (
                        <img
                          key={`${message.id}-${index}`}
                          src={imageDataUrl(image)}
                          alt={`Attachment ${index + 1}`}
                        />
                      ))}
                    </div>
                  )}
                  {message.role === "assistant" ? (
                    message.content ? (
                      <div className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <span className="thinking-line">
                        <i />
                        <i />
                        <i />
                        <span className="sr-only">Generating response</span>
                      </span>
                    )
                  ) : (
                    <p>{message.content}</p>
                  )}
                  {message.role === "assistant" && message.content && (
                    <div className="message-tools">
                      <button
                        type="button"
                        title="Copy response"
                        aria-label="Copy response"
                        onClick={() => void copyMessage(message)}
                      >
                        {copiedId === message.id ? (
                          <Check size={14} />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                      {message.id === thread.messages.at(-1)?.id &&
                        lastStats && (
                          <span>
                            {lastStats.tokensPerSecond.toFixed(1)} tok/s /{" "}
                            {lastStats.outputTokens} tokens
                          </span>
                        )}
                    </div>
                  )}
                </div>
              </article>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </section>

      <div className="composer-zone">
        {error && (
          <div className="inline-error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {Object.values(mcpStatuses)
          .filter((status) => status.state === "error")
          .map((status) => (
            <div
              className="mcp-chat-warning"
              role="alert"
              key={status.serverId}
            >
              <Plug size={14} />
              <span>{status.error ?? "An MCP server could not connect."}</span>
            </div>
          ))}
        {pendingToolCall && (
          <section
            className="tool-approval"
            aria-labelledby={`tool-approval-${pendingToolCall.callId}`}
          >
            <div className="tool-approval-heading">
              <span aria-hidden="true">
                <Wrench size={16} />
              </span>
              <div>
                <strong id={`tool-approval-${pendingToolCall.callId}`}>
                  Allow {pendingToolCall.toolName}?
                </strong>
                <small>{pendingToolCall.serverName}</small>
              </div>
              <div className="tool-risk-labels">
                {pendingToolCall.destructive && <span>May change data</span>}
                {pendingToolCall.openWorld && <span>External access</span>}
              </div>
            </div>
            <pre>{JSON.stringify(pendingToolCall.arguments, null, 2)}</pre>
            <div className="tool-approval-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => void decideToolCall(false)}
              >
                Deny
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => void decideToolCall(true)}
              >
                Allow once
              </button>
            </div>
          </section>
        )}
        {toolActivity.length > 0 && (
          <div className="tool-activity" aria-live="polite">
            {toolActivity.map((activity) => (
              <div key={activity.callId}>
                <Wrench size={13} />
                <span>
                  <strong>{activity.toolName}</strong>
                  <small>{activity.serverName}</small>
                </span>
                <b className={activity.status}>
                  {activity.status === "running" ? "Running" : activity.status}
                </b>
              </div>
            ))}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="attachment-tray">
            {attachments.map((attachment, index) => (
              <div
                className="attachment-chip"
                key={`${attachment.path}-${index}`}
              >
                <img src={attachment.url} alt="" />
                <span>{attachment.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="composer">
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            aria-label="Message"
            placeholder={
              runtimeOnline
                ? `Message ${selectedModel || "your local model"}`
                : "Local runtime is offline"
            }
            onChange={(event) => {
              setInput(event.target.value);
              resizeComposer(event.target);
            }}
            onKeyDown={handleKeyDown}
          />
          <div className="composer-toolbar">
            <div>
              <button
                className="icon-button"
                type="button"
                title="Attach images"
                aria-label="Attach images"
                onClick={() => void chooseImages()}
              >
                <Paperclip size={17} />
              </button>
              <button
                className="composer-tool"
                type="button"
                onClick={() => void chooseImages()}
              >
                <ImagePlus size={15} /> Vision
              </button>
              <span className="composer-setting">
                Temp {settings.temperature.toFixed(1)}
              </span>
              {enabledMcpServers.length > 0 && (
                <span className="composer-setting">
                  MCP {enabledMcpServers.length}
                </span>
              )}
            </div>
            {isGenerating ? (
              <button
                className="send-button stop"
                type="button"
                title="Stop generation"
                aria-label="Stop generation"
                onClick={stopGeneration}
              >
                <Square size={15} fill="currentColor" />
              </button>
            ) : (
              <button
                className="send-button"
                type="button"
                title="Send message"
                aria-label="Send message"
                disabled={!input.trim() || !runtimeOnline || !selectedModel}
                onClick={sendMessage}
              >
                {runtimeOnline ? (
                  <ArrowUp size={17} />
                ) : (
                  <LoaderCircle size={17} />
                )}
              </button>
            )}
          </div>
        </div>
        <p className="composer-note">
          Local models can make mistakes. Verify important output.
        </p>
      </div>
    </main>
  );
}
