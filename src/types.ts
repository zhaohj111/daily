export interface Tag {
  label: string;
  value: string;
  isRemovable: boolean;
}

export interface AppSettings {
  themeColor: string;
  defaultFontSize: number;
}

export interface DiaryEntry {
  id: number;
  content: string;
  date: string; // YYYY/MM/DD
  tags: Tag[];
  images: string[]; // Base64
  fontSize: number;
  updatedAt: number;
}
