import type { VisionDescribeMode, VisionDescribeResult } from "../src/types";

interface VisionRequest {
  baseUrl: string;
  model: string;
  imageBase64: string;
  mode: VisionDescribeMode;
}

const SYSTEM_PROMPTS: Record<VisionDescribeMode, string> = {
  description:
    "Describe the attached image precisely in two to four sentences. Cover visible subjects, pose or action, clothing, setting, composition, lighting, color, and visual style. If it contains clearly adult nudity or explicit adult sexual content, describe it accurately with neutral anatomical language without moralizing. Do not identify real people or infer protected traits. If any subject may be under 18, omit sexual detail. Return only the description.",
  prompt:
    "Create one detailed image-generation prompt from the attached image. Preserve the visible subject, pose or action, clothing or nudity for clearly adult subjects, setting, composition, camera perspective, lighting, color, medium, and style. Describe explicit adult details factually when present, but never sexualize a subject who may be under 18. Do not identify real people or invent unsupported details. Return only the prompt as concise comma-separated natural language with no heading or quotation marks.",
};

function visionEndpoint(baseUrl: string): string {
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

export async function describeImageWithOllama(
  request: VisionRequest,
  fetchRuntime: typeof fetch = fetch,
): Promise<VisionDescribeResult> {
  if (!request.model.trim()) throw new Error("Select a vision model first.");
  if (!request.imageBase64) throw new Error("Select an image first.");
  if (request.mode !== "description" && request.mode !== "prompt") {
    throw new Error("Unknown image description mode.");
  }

  const response = await fetchRuntime(visionEndpoint(request.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: request.model,
      stream: false,
      messages: [
        { role: "system", content: SYSTEM_PROMPTS[request.mode] },
        {
          role: "user",
          content:
            request.mode === "prompt"
              ? "Build an image-generation prompt from this image."
              : "Describe this image.",
          images: [request.imageBase64],
        },
      ],
      options: {
        temperature: request.mode === "prompt" ? 0.4 : 0.2,
      },
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).trim().slice(0, 500);
    throw new Error(
      `Vision model request failed with HTTP ${response.status}${
        detail ? `: ${detail}` : "."
      }`,
    );
  }

  const payload = (await response.json()) as {
    error?: unknown;
    message?: { content?: unknown };
  };
  if (typeof payload.error === "string" && payload.error) {
    throw new Error(payload.error);
  }
  const text =
    typeof payload.message?.content === "string"
      ? payload.message.content.trim()
      : "";
  if (!text) throw new Error("The vision model returned an empty response.");

  return { text, model: request.model, mode: request.mode };
}
