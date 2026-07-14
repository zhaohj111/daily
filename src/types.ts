export interface Tag {
  label: string;
  value: string;
  isRemovable: boolean;
}

export interface AppSettings {
  themeColor: string;
  defaultFontSize: number;
  fontPreset: string;
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
