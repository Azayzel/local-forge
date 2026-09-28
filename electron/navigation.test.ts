import { EventEmitter } from "node:events";
import { shell, type WebContents } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerExternalNavigation } from "./navigation";

vi.mock("electron", () => ({
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
}));

function setup(developmentUrl?: string) {
  const contents = Object.assign(new EventEmitter(), {
    setWindowOpenHandler: vi.fn(),
  });
  registerExternalNavigation(contents as unknown as WebContents, developmentUrl);
  return {
    navigate(url: string) {
      const event = { preventDefault: vi.fn() };
      contents.emit("will-navigate", event, url);
      return event.preventDefault;
    },
    openWindow(url: string) {
      return contents.setWindowOpenHandler.mock.calls[0][0]({ url });
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("external navigation", () => {
  it.each([undefined, "http://localhost:5173/"])(
    "opens Hugging Face links externally with development URL %s",
    (developmentUrl) => {
      const url = "https://huggingface.co/organization/model";
      expect(setup(developmentUrl).navigate(url)).toHaveBeenCalledOnce();
      expect(shell.openExternal).toHaveBeenCalledExactlyOnceWith(url);
    },
  );

  it("opens HTTPS popup links in the browser, not an Electron window", () => {
    const url = "https://huggingface.co/organization/model";
    expect(setup().openWindow(url)).toEqual({ action: "deny" });
    expect(shell.openExternal).toHaveBeenCalledExactlyOnceWith(url);
  });

  it.each([
    "http://huggingface.co/organization/model",
    "file:///tmp/model.html",
    "javascript:alert(1)",
    "data:text/html,model",
    "hf://organization/model",
    "not a URL",
  ])("blocks unsafe or unsupported links: %s", (url) => {
    for (const developmentUrl of [undefined, "http://localhost:5173/"]) {
      const navigation = setup(developmentUrl);
      expect(navigation.navigate(url)).toHaveBeenCalledOnce();
      expect(navigation.openWindow(url)).toEqual({ action: "deny" });
    }
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it.each(["username", "password"] as const)(
    "rejects links with an embedded %s",
    (field) => {
      const url = new URL("https://huggingface.co/organization/model");
      url[field] = "fixture";
      const navigation = setup();
      expect(navigation.navigate(url.toString())).toHaveBeenCalledOnce();
      expect(navigation.openWindow(url.toString())).toEqual({ action: "deny" });
      expect(shell.openExternal).not.toHaveBeenCalled();
    },
  );

  it("allows navigation within the development server origin", () => {
    const navigation = setup("http://localhost:5173/");
    expect(
      navigation.navigate("http://localhost:5173/models"),
    ).not.toHaveBeenCalled();
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it("does not trust URLs that merely start with the development URL", () => {
    const navigation = setup("http://localhost:5173");
    expect(navigation.navigate("http://localhost:51730/")).toHaveBeenCalledOnce();
    const spoofedUrl = new URL("http://other.test/");
    spoofedUrl.username = "localhost";
    spoofedUrl.password = "5173";
    expect(navigation.navigate(spoofedUrl.toString())).toHaveBeenCalledOnce();
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it("handles browser-launch failures without an unhandled rejection", async () => {
    const error = new Error("No default browser");
    vi.mocked(shell.openExternal).mockRejectedValueOnce(error);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      setup().navigate("https://huggingface.co/organization/model"),
    ).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith("Could not open external link:", error),
    );
  });
});
