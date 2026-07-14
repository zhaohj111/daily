export {};

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void;
      toggleMaximize: () => void;
      close: () => void;
      onWindowState: (callback: (state: 'normal' | 'maximized') => void) => () => void;
      // 服务器日志与就绪事件
      onServerLog: (callback: (msg: string) => void) => () => void;
      onServerReady: (callback: () => void) => () => void;
      // 数据迁移
      selectFolder: () => Promise<string | null>;
      // 动态后端端口
      getServerPort: () => Promise<number>;
    };
  }
}
