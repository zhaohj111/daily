import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Search, Trash2, Edit3, X, Minus, Square, ChevronRight, Settings as SettingsIcon, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getContrastColor } from './lib/utils';
import { getInitialDiaryDate } from './lib/dateUtils';
import type { DiaryEntry, DiaryListItem, AppSettings, ThemeMode, UpdateStatus } from './types';
import DiaryEditor from './components/DiaryEditor';
import SettingsModal from './components/SettingsModal';


// ──── App 主组件 ────
export default function App() {
  const [serverPort, setServerPort] = useState(0); // 0 = 等待主进程分配端口

  // 从主进程获取动态分配的后端端口
  useEffect(() => {
    if (!window.electronAPI?.getServerPort) {
      setServerPort(3000); // 浏览器模式，端口无意义
      return;
    }
    window.electronAPI.getServerPort().then((port: number) => {
      setServerPort(port || 3000);
    });
  }, []);

  // 根据环境自动选择 API 基础路径（动态端口）
  const API_BASE = window.electronAPI
    ? `http://localhost:${serverPort || 3000}`
    : '';

  const [diaries, setDiaries] = useState<DiaryListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedDiary, setSelectedDiary] = useState<DiaryEntry | null>(null);
  const loadedIdRef = useRef<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [settings, setSettings] = useState<AppSettings>({ themeColor: '#000000', defaultFontSize: 16, fontPreset: 'system', themeMode: 'light', customFonts: [] });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // ──── 版本更新状态 ────
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateBadgeSeen, setUpdateBadgeSeen] = useState(false); // 点击查看后消失
  const [settingsScrollTo, setSettingsScrollTo] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState('');

  // 初始化主题（localStorage 优先，确保页面加载时立即应用，避免闪烁）
  useEffect(() => {
    const stored = localStorage.getItem('themeMode') as ThemeMode | null;
    if (stored === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (stored === 'light') {
      document.documentElement.classList.remove('dark');
    }
    // 如果没有存储值，跟随系统偏好
    if (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  // 等动态端口就绪后再加载数据
  useEffect(() => {
    if (!serverPort) return;
    fetchDiaries();
    fetchSettings();
  }, [serverPort]);

  const [windowState, setWindowState] = useState<'normal' | 'maximized'>('normal');

  useEffect(() => {
    if (window.electronAPI?.onWindowState) {
      const cleanup = window.electronAPI.onWindowState((state: 'normal' | 'maximized') => {
        setWindowState(state);
      });
      return cleanup;
    }
  }, []);

  // 监听主进程推送的更新状态
  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return;
    const cleanup = window.electronAPI.onUpdateStatus((data) => {
      setUpdateStatus({
        ...data,
        releaseNotes: stripHtml(data.releaseNotes),
      } as UpdateStatus);
      if (data.status === 'available') {
        setUpdateBadgeSeen(false);
      }
    });
    return cleanup;
  }, []);

  // 获取应用版本号
  useEffect(() => {
    if (!window.electronAPI?.getAppVersion) {
      setAppVersion('1.0.0');
      return;
    }
    window.electronAPI.getAppVersion().then(v => setAppVersion(v || '1.0.0'));
  }, []);

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // ──── 共享：执行版本检查（自动 + 手动共用）────
  const stripHtml = (text?: string) => text?.replace(/<[^>]+>/g, '').trim() || '';

  async function performCheck() {
    if (!window.electronAPI?.checkForUpdates) return;
    setUpdateStatus({ status: 'checking' });
    const result = await window.electronAPI.checkForUpdates();
    if (result.updateAvailable) {
      setUpdateStatus({
        status: 'available',
        version: result.version,
        releaseNotes: stripHtml(result.releaseNotes),
        releaseDate: result.releaseDate,
      });
      setUpdateBadgeSeen(false);
    } else {
      setUpdateStatus({
        status: 'not-available',
        error: result.error,
      });
    }
  }

  // 启动时自动检查更新（serverPort 就绪 + settings 已加载 + 未禁用时触发）
  const autoCheckDoneRef = useRef(false);
  useEffect(() => {
    if (!serverPort) return;                          // 等服务端就绪
    if (!settings || settings.autoUpdateDisabled === true) return;
    if (!window.electronAPI?.checkForUpdates) return;
    if (autoCheckDoneRef.current) return;
    autoCheckDoneRef.current = true;
    const timer = setTimeout(() => performCheck(), 2500);
    return () => {
      clearTimeout(timer);
      autoCheckDoneRef.current = false;  // StrictMode 重置
    };
  }, [serverPort, settings]);

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

  // 同步字体预设（自定义字体直接设置 --font-editor）
  useEffect(() => {
    const preset = settings.fontPreset || 'system';
    // 先清除所有预设字体类
    document.documentElement.className = document.documentElement.className
      .replace(/\bfont-(system|serif-cn|kaiti|heiti)\b/g, '');

    // 检查是否为自定义字体
    const customFont = (settings.customFonts || []).find(f => f.id === preset);
    if (customFont) {
      document.documentElement.style.setProperty('--font-editor', `"${customFont.family}", serif`);
    } else {
      // 使用预设 CSS 类
      document.documentElement.className += ` font-${preset}`;
      document.documentElement.style.removeProperty('--font-editor');
    }
  }, [settings.fontPreset, settings.customFonts]);

  // 同步深色主题
  useEffect(() => {
    const isDark = settings.themeMode === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('themeMode', settings.themeMode);
  }, [settings.themeMode]);

  // 同步自定义字体 — 仅对「导入字体」动态注入 @font-face（系统字体已安装，无需注入）
  useEffect(() => {
    const styleId = 'custom-fonts-style';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    const importedFonts = (settings.customFonts || []).filter(f => f.source !== 'system');
    const fontFaces = importedFonts.map(f => {
      if (!f.fileName) return '';
      const ext = f.fileName.split('.').pop()?.toLowerCase();
      const formatMap: Record<string, string> = { ttf: 'truetype', otf: 'opentype', woff2: 'woff2', woff: 'woff' };
      const format = formatMap[ext || ''] || 'truetype';
      const fontUrl = `${API_BASE}/api/fonts/files/${encodeURIComponent(f.fileName)}`;
      return `@font-face {
  font-family: "${f.family}";
  src: url("${fontUrl}") format("${format}");
  font-display: swap;
}`;
    }).filter(Boolean);

    styleEl.textContent = fontFaces.join('\n');
  }, [settings.customFonts, serverPort]);

  // 主题切换
  function toggleTheme() {
    const next: ThemeMode = settings.themeMode === 'dark' ? 'light' : 'dark';
    setSettings(prev => ({ ...prev, themeMode: next }));
    // 乐观更新服务器
    fetch(`${API_BASE}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, themeMode: next })
    }).catch(err => console.error('Failed to save theme:', err));
  }

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
        ? { id: updated.id, date: updated.date, content: updated.content.trimStart(), updatedAt: updated.updatedAt }
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
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className={cn(
          "glass-sidebar flex flex-col h-full relative overflow-hidden shrink-0 rounded-tr-3xl rounded-br-3xl",
          isSidebarOpen ? "border-r border-white/20 dark:border-white/5" : "border-none"
        )}
      >
        <div className="p-6 pb-5 border-b border-white/10 dark:border-white/5 flex items-center justify-between">
          <h1 className="text-xl tracking-[0.04em] text-text leading-none flex items-center gap-2">
            Daily
            {updateStatus?.status === 'available' && !updateBadgeSeen && (
              <button
                onClick={() => { setIsSettingsOpen(true); setUpdateBadgeSeen(true); setSettingsScrollTo('version'); }}
                className="text-[11px] font-mono px-2.5 py-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer leading-none font-medium"
                title="发现新版本，点击查看"
              >
                可更新
              </button>
            )}
            {updateStatus?.status === 'downloaded' && (
              <button
                onClick={() => { setIsSettingsOpen(true); setSettingsScrollTo('version'); }}
                className="text-[11px] font-mono px-2.5 py-1.5 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors cursor-pointer leading-none font-medium"
                title="更新已下载，点击安装"
              >
                待安装
              </button>
            )}
          </h1>
          <div className="flex gap-1.5">
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-white/40 dark:hover:bg-white/8 rounded-full transition-all duration-200 text-text-muted hover:text-text"
              title={settings.themeMode === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
            >
              {settings.themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 hover:bg-white/40 dark:hover:bg-white/8 rounded-full transition-all duration-200 text-text-muted hover:text-text"
            >
              <SettingsIcon size={18} />
            </button>
            <button
              onClick={handleCreate}
              className="p-2 bg-accent text-accent-content rounded-full hover:scale-110 transition-all duration-300 active:scale-95 shadow-md shadow-accent/15"
              title="新建日记"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" size={15} />
            <input
              type="text"
              placeholder="搜索日期或内容..."
              className="w-full pl-10 pr-4 py-2.5 glass-input rounded-2xl text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/15 transition-all duration-300 placeholder:text-text-muted/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* 侧边栏滚动区域 - no-drag */}
        <div className="flex-1 overflow-y-auto px-4 pt-1 pb-4 space-y-1.5 custom-scrollbar no-drag">
          {filteredDiaries.map((diary) => (
            <div
              key={diary.id}
              onClick={() => setSelectedId(diary.id)}
              style={{ contentVisibility: 'auto', containIntrinsicSize: '76px' } as React.CSSProperties}
              className={cn(
                "p-4 rounded-2xl cursor-pointer transition-all duration-300 flex flex-col gap-1 group relative no-drag",
                selectedId === diary.id
                  ? "bg-white/60 dark:bg-white/8 shadow-sm ring-1 ring-black/5 dark:ring-white/5 translate-x-0.5"
                  : "hover:bg-white/40 dark:hover:bg-white/5 hover:translate-x-0.5"
              )}
            >
              {selectedId === diary.id && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-accent shadow-[0_0_6px_var(--color-accent)]" />
              )}
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-text-muted uppercase tracking-[0.12em]">{diary.date}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(diary.id); }}
                  className={cn(
                    "p-1.5 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100",
                    deletingId === diary.id
                      ? "bg-danger text-white shadow-sm opacity-100"
                      : "text-text-muted hover:text-danger hover:bg-white/50 dark:hover:bg-white/8"
                  )}
                  title={deletingId === diary.id ? "再次点击确认删除" : "删除日记"}
                >
                  {deletingId === diary.id ? <X size={14} /> : <Trash2 size={14} />}
                </button>
              </div>
              <p className="text-sm font-medium line-clamp-1 text-text-secondary" style={{ fontFamily: 'var(--font-editor)' }}>
                {diary.content?.trimStart() || <span className="text-text-placeholder italic">空白日记</span>}
              </p>
            </div>
          ))}
          {filteredDiaries.length === 0 && (
            <div className="text-center py-16 text-text-muted/60 text-sm font-light tracking-wider">暂无匹配内容</div>
          )}
        </div>
      </motion.aside>

      <main className="flex-1 h-full overflow-hidden relative bg-transparent">
        <AnimatePresence mode="wait">
          {selectedDiary ? (
            <DiaryEditor
              key={selectedDiary.id}
              diary={selectedDiary}
              onUpdate={handleUpdate}
              onPreviewImage={setPreviewImage}
              downloadProgress={updateStatus?.status === 'downloading' ? updateStatus.progress : undefined}
            />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="h-full flex items-center justify-center text-text-placeholder flex-col gap-5"
            >
              <div className="p-10 bg-white/35 dark:bg-white/5 backdrop-blur-sm rounded-full ring-1 ring-black/5 dark:ring-white/5">
                <Edit3 size={52} className="opacity-15" />
              </div>
              <p className="text-sm tracking-[0.12em] font-light">选择一篇日记开始记录</p>
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
            className="fixed inset-0 z-[200] bg-[#1e1b2e]/90 backdrop-blur-2xl flex items-center justify-center p-8 cursor-zoom-out"
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
            updateStatus={updateStatus}
            appVersion={appVersion}
            onCheckUpdate={performCheck}
            onStartDownload={async () => {
              if (!window.electronAPI?.startDownload) return;
              const result = await window.electronAPI.startDownload();
              if (!result.success) {
                setUpdateStatus(prev => prev ? { ...prev, error: result.error } : { status: 'error', error: result.error });
              }
            }}
            onInstallUpdate={() => {
              window.electronAPI?.installUpdate();
            }}
            onToggleAutoUpdate={(disabled) => {
              const newSettings = { ...settings, autoUpdateDisabled: disabled };
              updateSettings(newSettings);
            }}
            scrollTo={settingsScrollTo}
            onScrolled={() => setSettingsScrollTo(null)}
          />
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="fixed bottom-6 left-6 z-50 p-3 glass-card shadow-lg rounded-full text-text-muted hover:text-accent transition-all duration-300 hover:shadow-xl hover:scale-105 md:flex hidden ring-1 ring-black/5 dark:ring-white/5"
      >
        <ChevronRight size={20} className={cn("transition-transform duration-300", isSidebarOpen && "rotate-180")} />
      </button>
    </div>
  );
}
