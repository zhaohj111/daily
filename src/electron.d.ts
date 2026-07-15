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
      // 本地字体管理
      listSystemFonts: () => Promise<{ fonts: SystemFontInfo[]; source?: string; error?: string }>;
      pickFontFile: () => Promise<FontImportResult | null>;
    };
  }
}

interface SystemFontInfo {
  name: string;
  family: string;
  fileName: string;
  path: string;
  source: 'system' | 'imported';
}

interface FontImportResult {
  name: string;
  family: string;
  fileName: string;
  dataUrl: string;
  size: number;
  error?: string;
}
