export {};

declare global {
  interface DesktopBridge {
    platform: string;
    versions: {
      electron: string;
      chrome: string;
      node: string;
    };
    isFullscreen: () => Promise<boolean>;
    toggleFullscreen: () => Promise<boolean>;
    setFullscreen: (value: boolean) => Promise<boolean>;
    quit: () => Promise<void>;
    onFullscreenChange: (callback: (value: boolean) => void) => () => void;
  }

  interface Window {
    desktop?: DesktopBridge;
  }
}
