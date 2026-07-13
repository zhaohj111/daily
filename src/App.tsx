import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Search, Trash2, Edit3, Image as ImageIcon, Type, Minus, Square, X, ChevronRight, Settings as SettingsIcon, Palette } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getInitialDiaryDate } from './lib/dateUtils';
import type { DiaryEntry, DiaryListItem, Tag, AppSettings } from './types';


function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.5 ? '#000000' : '#ffffff';
}

// ──── DiaryEditor 组件 Props ────
interface DiaryEditorProps {
  diary: DiaryEntry;
  onUpdate: (d: DiaryEntry) => void | Promise<void>;
  onPreviewImage: (url: string) => void;
  key?: number;
}

// ──── App 主组件 ────
export default function App() {
  // 根据环境自动选择 API 基础路径
  const API_BASE = window.electronAPI ? 'http://localhost:3000' : '';

  const [diaries, setDiaries] = useState<DiaryListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedDiary, setSelectedDiary] = useState<DiaryEntry | null>(null);
  const loadedIdRef = useRef<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [settings, setSettings] = useState<AppSettings>({ themeColor: '#000000', defaultFontSize: 16 });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    fetchDiaries();
    fetchSettings();
  }, []);

  const [windowState, setWindowState] = useState<'normal' | 'maximized'>('normal');

  useEffect(() => {
    if (window.electronAPI?.onWindowState) {
      const cleanup = window.electronAPI.onWindowState((state: 'normal' | 'maximized') => {
        setWindowState(state);
      });
      return cleanup;
    }
  }, []);

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  async function fetchDiaries() {
    try {
      const res = await fetch(`${API_BASE}/api/diaries`);
      const data = await res.json();
      setDiaries(data);
    } catch (err) {
      console.error('Failed to fetch diaries:', err);
    }
  }

  useEffect(() => {
    if (diaries.length > 0 && selectedId === null) {
      setSelectedId(diaries[0].id);
    }
  }, [diaries]);

  async function fetchSettings() {
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  }

  // 同步主题色到 CSS 自定义属性
  useEffect(() => {
    document.documentElement.style.setProperty('--color-accent', settings.themeColor);
    document.documentElement.style.setProperty('--color-accent-content', getContrastColor(settings.themeColor));
  }, [settings.themeColor]);

  const filteredDiaries = useMemo(() => {
    return diaries.filter(d =>
      d.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.date.includes(searchQuery)
    );
  }, [diaries, searchQuery]);

  // 按需加载选中日记的完整内容（含 Base64 图片），
  // 避免初次打开就把所有日记的图片全部拉取下来造成卡顿。
  useEffect(() => {
    if (selectedId === null) {
      setSelectedDiary(null);
      loadedIdRef.current = null;
      return;
    }
    if (loadedIdRef.current === selectedId) return;
    loadedIdRef.current = selectedId;
    let cancelled = false;
    fetch(`${API_BASE}/api/diaries/${selectedId}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelled && data) setSelectedDiary(data);
      })
      .catch(err => console.error('Failed to fetch diary:', err));
    return () => { cancelled = true; };
  }, [selectedId]);

  async function handleCreate() {
    const newId = Date.now();
    const newDiary: DiaryEntry = {
      id: newId,
      content: '',
      date: getInitialDiaryDate(),
      tags: [
        { label: '日期', value: getInitialDiaryDate(), isRemovable: false },
        { label: '天气', value: '晴', isRemovable: true }
      ],
      images: [],
      fontSize: settings.defaultFontSize,
      updatedAt: newId
    };

    setDiaries(prev => [{
      id: newDiary.id,
      date: newDiary.date,
      content: newDiary.content,
      updatedAt: newDiary.updatedAt
    }, ...prev]);
    setSelectedId(newId);
    setSelectedDiary(newDiary);
    loadedIdRef.current = newId;

    try {
      await fetch(`${API_BASE}/api/diaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDiary)
      });
    } catch (err) {
      console.error('Failed to create:', err);
      fetchDiaries();
    }
  }

  async function handleUpdate(updated: DiaryEntry) {
    const prev = diaries.find(d => d.id === updated.id);
    if (!prev) return;

    setDiaries(prevDiaries => prevDiaries.map(d =>
      d.id === updated.id
        ? { id: updated.id, date: updated.date, content: updated.content, updatedAt: updated.updatedAt }
        : d
    ));
    setSelectedDiary(updated);

    try {
      const res = await fetch(`${API_BASE}/api/diaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (!res.ok) throw new Error('Save failed');
    } catch (err) {
      console.error('Failed to update server:', err);
    }
  }

  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function handleDelete(id: number) {
    if (deletingId !== id) {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 2000);
      return;
    }

    setDeletingId(null);

    const originalDiaries = [...diaries];
    const originalSelectedId = selectedId;

    setDiaries(prev => prev.filter(d => d.id !== id));
    if (selectedId === id) setSelectedId(null);

    try {
      const res = await fetch(`${API_BASE}/api/diaries/${id}`, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' }
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Delete failed');
    } catch (err) {
      console.error('Failed to delete diary:', err);
      alert('无法删除该日记，服务器可能在忙。');
      setDiaries(originalDiaries);
      setSelectedId(originalSelectedId);
    }
  }

  async function updateSettings(newSettings: AppSettings) {
    setSettings(newSettings);
    try {
      await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }

  return (
    <div className="flex h-screen bg-surface text-text font-sans selection:bg-accent selection:text-accent-content">
      {/* 自定义标题栏（可拖拽区域） */}
      <div className="fixed top-0 left-0 right-0 h-10 z-[300] flex items-center justify-end px-4"
           style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => window.electronAPI?.minimize()}
            className="p-1.5 hover:bg-surface-active rounded transition-colors"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => window.electronAPI?.toggleMaximize()}
            className="p-1.5 hover:bg-surface-active rounded transition-colors"
          >
            {windowState === 'maximized' ? <Square size={12} /> : <Square size={14} />}
          </button>
          <button
            onClick={() => window.electronAPI?.close()}
            className="p-1.5 hover:bg-danger hover:text-accent-content rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <motion.aside
        initial={false}
        animate={{ width: isSidebarOpen ? 320 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        className={cn(
          "border-r border-border-light flex flex-col h-full bg-surface-elevated relative overflow-hidden shrink-0",
          !isSidebarOpen && "border-none"
        )}
      >
        <div className="p-6 border-b border-border-subtle flex items-center justify-between">
          <h1 className="text-xl font-medium tracking-tight">Daily</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 hover:bg-surface-hover rounded-full transition-colors text-text-muted"
            >
              <SettingsIcon size={18} />
            </button>
            <button
              onClick={handleCreate}
              className="p-2 bg-accent text-accent-content rounded-full hover:scale-110 transition-transform active:scale-95"
              title="新建日记"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        <div className="px-6 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              type="text"
              placeholder="搜索日期或内容..."
              className="w-full pl-10 pr-4 py-2 bg-surface-hover rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-accent transition-all font-sans"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* 侧边栏滚动区域 - no-drag */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 custom-scrollbar no-drag">
          {filteredDiaries.map((diary) => (
            <div
              key={diary.id}
              onClick={() => setSelectedId(diary.id)}
              style={{ contentVisibility: 'auto', containIntrinsicSize: '76px' } as React.CSSProperties}
              className={cn(
                "p-4 rounded-2xl cursor-pointer transition-all flex flex-col gap-1 group relative no-drag",
                selectedId === diary.id ? "bg-surface-hover shadow-sm" : "hover:bg-surface-hover/50"
              )}
            >
              {selectedId === diary.id && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-accent" />
              )}
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-text-muted uppercase tracking-widest">{diary.date}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(diary.id); }}
                  className={cn(
                    "p-1.5 rounded transition-all",
                    deletingId === diary.id ? "bg-danger text-accent-content" : "text-text-muted hover:text-danger hover:bg-surface-hover"
                  )}
                  title={deletingId === diary.id ? "再次点击确认删除" : "删除日记"}
                >
                  {deletingId === diary.id ? <X size={14} /> : <Trash2 size={14} />}
                </button>
              </div>
              <p className="text-sm font-medium line-clamp-1 text-text-secondary">
                {diary.content || <span className="text-text-placeholder italic">空白日记</span>}
              </p>
            </div>
          ))}
          {filteredDiaries.length === 0 && (
            <div className="text-center py-10 text-text-muted text-sm">暂无匹配内容</div>
          )}
        </div>
      </motion.aside>

      <main className="flex-1 h-full overflow-hidden relative bg-surface-elevated">
        <AnimatePresence mode="wait">
          {selectedDiary ? (
            <DiaryEditor
              key={selectedDiary.id}
              diary={selectedDiary}
              onUpdate={handleUpdate}
              onPreviewImage={setPreviewImage}
            />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex items-center justify-center text-text-placeholder flex-col gap-4"
            >
              <div className="p-8 bg-surface-hover rounded-full">
                <Edit3 size={48} className="opacity-20" />
              </div>
              <p className="text-sm tracking-wide">选择一篇日记开始记录</p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* 图片预览覆盖层 */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewImage(null)}
            className="fixed inset-0 z-[200] bg-text/90 backdrop-blur-xl flex items-center justify-center p-8 cursor-zoom-out"
          >
            <motion.img
              initial={{ scale: 0.9, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              src={previewImage}
              alt=""
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg no-drag"
            />
            <button className="absolute top-10 right-10 text-text-placeholder/50 hover:text-accent-content transition-colors">
              <X size={32} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 设置模态框 */}
      <AnimatePresence>
        {isSettingsOpen && (
          <SettingsModal
            settings={settings}
            onClose={() => setIsSettingsOpen(false)}
            onSave={updateSettings}
          />
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="fixed bottom-6 left-6 z-50 p-3 bg-surface-elevated shadow-lg border border-border-light rounded-full text-text-secondary hover:text-accent transition-colors md:flex hidden"
      >
        <ChevronRight size={20} className={cn("transition-transform duration-300", isSidebarOpen && "rotate-180")} />
      </button>
    </div>
  );
}

// ──── DiaryEditor 组件 ────
function DiaryEditor({ diary, onUpdate, onPreviewImage }: DiaryEditorProps) {
  const [content, setContent] = useState(diary.content);
  const [fontSize, setFontSize] = useState(diary.fontSize || 16);
  const [tags, setTags] = useState<Tag[]>(diary.tags);
  const [images, setImages] = useState<string[]>(diary.images);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');

  useEffect(() => {
    setContent(diary.content);
    setFontSize(diary.fontSize || 16);
    setTags(diary.tags);
    setImages(diary.images);
  }, [diary.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const hasChanged =
        content !== diary.content ||
        fontSize !== diary.fontSize ||
        JSON.stringify(tags) !== JSON.stringify(diary.tags) ||
        JSON.stringify(images) !== JSON.stringify(diary.images);

      if (hasChanged) {
        onUpdate({ ...diary, content, fontSize, tags, images, updatedAt: Date.now() });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [content, fontSize, tags, images]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    addImageFiles(Array.from(files));
    // 允许再次选择同一文件
    e.target.value = '';
  };

  // 读取图片文件并追加到 images（点击上传与拖放共用）
  const addImageFiles = (files: File[]) => {
    files
      .filter(f => f.type.startsWith('image/'))
      .forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImages(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) addImageFiles(files);
  };

  const addCustomTag = () => {
    if (!newTagLabel.trim()) {
      setIsAddingTag(false);
      return;
    }
    setTags([...tags, { label: newTagLabel.trim(), value: '', isRemovable: true }]);
    setNewTagLabel('');
    setIsAddingTag(false);
  };

  const updateTagValue = (index: number, value: string) => {
    const newTags = [...tags];
    newTags[index].value = value;
    if (newTags[index].label === '日期') {
      onUpdate({ ...diary, date: value, tags: newTags });
    }
    setTags(newTags);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="h-full flex flex-col p-8 md:p-12 lg:p-20 max-w-5xl mx-auto"
    >
      <div className="flex flex-wrap items-center gap-3 mb-12">
        {tags.map((tag, idx) => (
          <div
            key={idx}
            className="flex items-center bg-surface-hover px-3 py-1.5 rounded-lg border border-border-light group transition-all focus-within:ring-1 focus-within:ring-accent"
          >
            <span className="text-[10px] font-mono text-text-muted uppercase tracking-widest mr-2">{tag.label}</span>
            <input
              type="text"
              value={tag.value}
              onChange={(e) => updateTagValue(idx, e.target.value)}
              className="text-xs bg-transparent focus:outline-none w-20 min-w-min"
              placeholder="..."
            />
            {tag.isRemovable && (
              <button
                onClick={() => setTags(tags.filter((_, i) => i !== idx))}
                className="ml-2 opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-opacity"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
        {isAddingTag ? (
          <div className="flex items-center bg-surface-elevated border border-accent rounded-lg px-2 py-1 shadow-sm">
            <input
              autoFocus
              type="text"
              placeholder="标签名"
              className="text-xs outline-none w-16"
              value={newTagLabel}
              onChange={(e) => setNewTagLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
              onBlur={addCustomTag}
            />
          </div>
        ) : (
          <button
            onClick={() => setIsAddingTag(true)}
            className="p-1.5 text-text-placeholder hover:text-accent border border-dashed border-border rounded-lg transition-all"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      <div className="mb-8 pl-4 border-l-4 border-l-accent flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-serif italic text-text-muted">{diary.date} 快照</h2>
          <p className="text-[10px] font-mono text-text-placeholder uppercase tracking-[0.2em] mt-1">Edited {new Date(diary.updatedAt).toLocaleTimeString()}</p>
        </div>

        <div className="flex items-center gap-2 bg-surface-hover p-1.5 rounded-xl border border-border-light">
          <Type size={14} className="text-text-muted ml-1" />
          <input
            type="range" min="12" max="48"
            value={fontSize}
            onChange={(e) => setFontSize(parseInt(e.target.value))}
            className="w-24 h-1 bg-surface-active rounded-lg appearance-none cursor-pointer accent-accent"
          />
          <span className="text-[10px] font-mono text-text-muted w-4">{fontSize}</span>
        </div>
      </div>

      {/* 编辑器滚动区域 - no-drag */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 no-drag">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="开始您的记录..."
          style={{ fontSize: `${fontSize}px` }}
          className="w-full h-auto min-h-[400px] bg-transparent resize-none focus:outline-none leading-relaxed text-text placeholder:text-text-placeholder transition-all font-sans"
        />

        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="mt-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 no-drag"
        >
          {images.map((img, idx) => (
            <motion.div
              layout
              key={idx}
              className="relative aspect-square group rounded-3xl overflow-hidden shadow-sm border border-border-light cursor-zoom-in no-drag"
              onClick={() => onPreviewImage(img)}
            >
              <img src={img} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
              <button
                onClick={(e) => { e.stopPropagation(); setImages(images.filter((_, i) => i !== idx)); }}
                className="absolute top-3 right-3 p-2 bg-text/50 text-accent-content rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all hover:bg-text"
                title="删除图片"
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
          <label className="aspect-square border-2 border-dashed border-border-light rounded-3xl flex flex-col items-center justify-center text-text-placeholder hover:text-accent hover:border-border cursor-pointer transition-all group">
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            <ImageIcon size={32} className="mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-mono tracking-widest uppercase">Upload Image</span>
          </label>
        </div>
      </div>

      <div className="mt-8 pt-8 border-t border-border-subtle flex justify-between items-center text-[10px] font-mono text-text-placeholder uppercase tracking-widest">
        <span>Daily / {diary.id}</span>
        <span>{content.length} words</span>
      </div>
    </motion.div>
  );
}

// ──── SettingsModal 组件 ────
function SettingsModal({ settings, onClose, onSave }: { settings: AppSettings, onClose: () => void, onSave: (s: AppSettings) => void }) {
  const [themeColor, setThemeColor] = useState(settings.themeColor);
  const [defaultFontSize, setDefaultFontSize] = useState(settings.defaultFontSize);

  const colors = [
    '#000000', '#2563EB', '#D97706', '#059669', '#DC2626', '#7C3AED', '#DB2777'
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-text/10 backdrop-blur-sm p-4 no-drag"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-elevated rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative border border-border-light no-drag"
      >
        <div className="p-8">
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-xl font-medium tracking-tight">个性化设置</h2>
            <button onClick={onClose} className="p-2 hover:bg-surface-hover rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-10">
            <div>
              <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest block mb-4 flex items-center gap-2">
                <Palette size={12} /> 主题色
              </label>
              <div className="flex flex-wrap gap-4">
                {colors.map(c => (
                  <button
                    key={c}
                    onClick={() => setThemeColor(c)}
                    style={{ backgroundColor: c }}
                    className={cn(
                      "w-10 h-10 rounded-2xl shadow-sm transition-all transform hover:scale-110",
                      themeColor === c ? "ring-2 ring-offset-4 ring-accent" : "opacity-80 hover:opacity-100"
                    )}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest block mb-4 flex items-center gap-2">
                <Type size={12} /> 默认字体大小
              </label>
              <div className="flex items-center gap-6 bg-surface-hover p-4 rounded-2xl">
                <input
                  type="range" min="12" max="48"
                  value={defaultFontSize}
                  onChange={(e) => setDefaultFontSize(parseInt(e.target.value))}
                  className="flex-1 h-1 bg-surface-active rounded-lg appearance-none cursor-pointer accent-accent"
                />
                <span className="text-sm font-mono w-8">{defaultFontSize}px</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => { onSave({ themeColor, defaultFontSize }); onClose(); }}
            className="w-full mt-12 py-4 bg-accent text-accent-content rounded-2xl font-medium hover:opacity-90 active:scale-[0.98] transition-all"
          >
            保存并关闭
          </button>
        </div>
      </motion.div>
    </div>
  );
}