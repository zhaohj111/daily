export {};

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void;
      toggleMaximize: () => void;
      close: () => void;
      onWindowState: (callback: (state: 'normal' | 'maximized') => void) => () => void;
    };
  }
}