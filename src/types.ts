export interface Tag {
  label: string;
  value: string;
  isRemovable: boolean;
}

export type ThemeMode = 'light' | 'dark';

export interface CustomFont {
  id: string;              // 唯一标识
  name: string;            // 显示名称（如 "微软雅黑"）
  family: string;          // CSS font-family 名称
  fileName?: string;       // 导入字体才有文件名（存储在 data/fonts/ 下）
  source: 'system' | 'imported';  // system=系统已安装（无需@font-face），imported=从文件导入
}

export interface AppSettings {
  themeColor: string;
  defaultFontSize: number;
  fontPreset: string;
  themeMode: ThemeMode;
  customFonts: CustomFont[];
}

export interface Comment {
  id: number;
  content: string;
  createdAt: number;
}

export interface DiaryEntry {
  id: number;
  content: string;
  date: string; // YYYY/MM/DD
  tags: Tag[];
  images: string[]; // Base64
  comments?: Comment[];
  fontSize: number;
  updatedAt: number;
}

// 侧边栏列表使用的轻量条目，不包含图片等大字段。
export interface DiaryListItem {
  id: number;
  date: string;
  content: string;
  updatedAt: number;
}
