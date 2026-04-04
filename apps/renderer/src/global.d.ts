declare global {
  interface Window {
    hinterviewDesktop?: {
      apiBaseUrl: string;
      platform: string;
      transcribeAudio?: (payload: { audioBytes: Uint8Array; fileName?: string; locale?: string }) => Promise<{ text: string }>;
      onOpenSettings?: (handler: () => void) => (() => void) | void;
    };
  }
}

export {};
