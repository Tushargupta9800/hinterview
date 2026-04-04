declare global {
  interface Window {
    hinterviewDesktop?: {
      apiBaseUrl: string;
      platform: string;
      openExternal?: (url: string) => Promise<void>;
      transcribeAudio?: (payload: { audioBytes: Uint8Array; fileName?: string; locale?: string }) => Promise<{ text: string }>;
      onOpenSettings?: (handler: () => void) => (() => void) | void;
    };
  }
}

export {};
