import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("hinterviewDesktop", {
  apiBaseUrl: process.env.SERVER_URL ?? "http://localhost:8787",
  platform: process.platform,
  transcribeAudio: (payload: { audioBytes: Uint8Array; fileName?: string; locale?: string }) =>
    ipcRenderer.invoke("audio:transcribe", payload) as Promise<{ text: string }>,
  onOpenSettings: (handler: () => void) => {
    const wrappedHandler = () => handler();
    ipcRenderer.on("app:open-settings", wrappedHandler);

    return () => {
      ipcRenderer.removeListener("app:open-settings", wrappedHandler);
    };
  }
});
