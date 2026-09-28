import { shell, type WebContents } from "electron";

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function openExternalLink(value: string): void {
  const url = parseUrl(value);
  if (!url || url.protocol !== "https:" || url.username || url.password) return;
  void shell.openExternal(url.toString()).catch((error) => {
    console.warn("Could not open external link:", error);
  });
}

export function registerExternalNavigation(
  webContents: WebContents,
  developmentUrl?: string,
): void {
  const developmentOrigin = developmentUrl
    ? parseUrl(developmentUrl)?.origin
    : undefined;

  webContents.setWindowOpenHandler(({ url }) => {
    openExternalLink(url);
    return { action: "deny" };
  });
  webContents.on("will-navigate", (event, url) => {
    if (developmentOrigin && parseUrl(url)?.origin === developmentOrigin) return;
    event.preventDefault();
    openExternalLink(url);
  });
}
