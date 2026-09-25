import type { ForgeApi } from "./types";

declare global {
  interface Window {
    forge: ForgeApi;
  }
}

export {};
