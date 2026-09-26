import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { describeImageWithOllama } from "./vision";

describe("describeImageWithOllama", () => {
  it("sends a prompt-building request and image to local Ollama", async () => {
    let requestBody: Record<string, unknown> = {};
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          message: {
            content: "portrait, window light, shallow depth of field",
          },
        }),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;

    try {
      await expect(
        describeImageWithOllama({
          baseUrl: `http://127.0.0.1:${address.port}`,
          model: "vision-fixture",
          imageBase64: "aW1hZ2U=",
          mode: "prompt",
        }),
      ).resolves.toEqual({
        text: "portrait, window light, shallow depth of field",
        model: "vision-fixture",
        mode: "prompt",
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }

    expect(requestBody).toMatchObject({
      model: "vision-fixture",
      stream: false,
      messages: [
        { role: "system", content: expect.stringContaining("clearly adult") },
        { role: "user", images: ["aW1hZ2U="] },
      ],
    });
  });

  it("rejects non-local runtime URLs", async () => {
    await expect(
      describeImageWithOllama({
        baseUrl: "https://example.com",
        model: "vision-fixture",
        imageBase64: "aW1hZ2U=",
        mode: "description",
      }),
    ).rejects.toThrow("only connects to runtimes on this machine");
  });

  it("rejects unexpected IPC mode values", async () => {
    await expect(
      describeImageWithOllama({
        baseUrl: "http://127.0.0.1:11434",
        model: "vision-fixture",
        imageBase64: "aW1hZ2U=",
        mode: "__proto__" as never,
      }),
    ).rejects.toThrow("Unknown image description mode");
  });
});
