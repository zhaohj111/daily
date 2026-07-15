import { useState, useEffect } from 'react';
import { Palette, Type, X, HardDrive, FolderOpen, AlertCircle, CheckCircle2, Loader2, Upload, Search, Trash2, ArrowLeft, Monitor, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import type { AppSettings, CustomFont } from '../types';

interface SettingsModalProps {
  settings: AppSettings;
  onClose: () => void;
  onSave: (s: AppSettings) => void;
}

interface SystemFontInfo {
  name: string;
  family: string;
  fileName: string;
  path: string;
  source: 'system' | 'imported';
}

export default function SettingsModal({ settings, onClose, onSave }: SettingsModalProps) {
  const [themeColor, setThemeColor] = useState(settings.themeColor);
  const [defaultFontSize, setDefaultFontSize] = useState(settings.defaultFontSize);
  const [fontPreset, setFontPreset] = useState(settings.fontPreset || 'system');
  const [customFonts, setCustomFonts] = useState<CustomFont[]>(settings.customFonts || []);

  // 数据迁移状态
  const [dataPath, setDataPath] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [migrationError, setMigrationError] = useState('');
  const [serverPort, setServerPort] = useState(0);

  // 字体导入状态
  const [isBrowsingSystem, setIsBrowsingSystem] = useState(false);
  const [systemFonts, setSystemFonts] = useState<SystemFontInfo[]>([]);
  const [fontSearch, setFontSearch] = useState('');
  const [importingFont, setImportingFont] = useState<string | null>(null);
  const [fontImportError, setFontImportError] = useState('');

  useEffect(() => {
    if (!window.electronAPI?.getServerPort) return;
    window.electronAPI.getServerPort().then(p => { if (p) setServerPort(p); });
  }, []);

  useEffect(() => {
    if (!serverPort) return;
    const API_BASE = window.electronAPI ? `http://localhost:${serverPort}` : '';
    fetch(`${API_BASE}/api/data-path`)
      .then(res => res.json())
      .then(data => setDataPath(data.dataPath))
      .catch(() => setDataPath('(无法获取)'));
  }, [serverPort]);

  const API_BASE = window.electronAPI ? `http://localhost:${serverPort || 3000}` : '';

  // 加载系统字体列表（PowerShell 获取所有已安装字体，含 .ttc 内的中文字体）
  async function loadSystemFonts() {
    if (!window.electronAPI?.listSystemFonts) {
      setFontImportError('系统字体浏览仅在桌面应用中可用');
      return;
    }
    setIsBrowsingSystem(true);
    setFontImportError('');
    const result = await window.electronAPI.listSystemFonts();
    if (result.error) {
      setFontImportError(result.error);
      setSystemFonts([]);
    } else {
      setSystemFonts(result.fonts.filter((f: SystemFontInfo) => f.name.trim()));
    }
  }

  // 添加系统字体（无需文件导入，直接引用系统已安装的字体族名）
  async function addSystemFont(font: SystemFontInfo) {
    setImportingFont(font.name);
    setFontImportError('');
    try {
      const res = await fetch(`${API_BASE}/api/fonts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: font.name, family: font.family, source: 'system' }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFontImportError(err.error || '添加失败');
        return;
      }
      const saved = await res.json();
      setCustomFonts(prev => [...prev, { id: saved.id, name: saved.name, family: saved.family, source: 'system' as const }]);
    } catch (err: any) {
      setFontImportError(err.message || '网络错误');
    } finally {
      setImportingFont(null);
    }
  }

  // 从文件选择器导入字体文件
  async function importFontFile() {
    if (!window.electronAPI?.pickFontFile) {
      setFontImportError('字体导入仅在桌面应用中可用');
      return;
    }
    setFontImportError('');
    const result = await window.electronAPI.pickFontFile();
    if (!result) return; // 用户取消
    if (result.error) {
      setFontImportError(result.error);
      return;
    }
    setImportingFont(result.name);
    try {
      const res = await fetch(`${API_BASE}/api/fonts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: result.dataUrl, name: result.name, family: result.family, source: 'imported' }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFontImportError(err.error || '保存失败');
        return;
      }
      const saved = await res.json();
      setCustomFonts(prev => [...prev, { id: saved.id, name: saved.name, family: saved.family, fileName: saved.fileName, source: 'imported' as const }]);
    } catch (err: any) {
      setFontImportError(err.message || '网络错误');
    } finally {
      setImportingFont(null);
    }
  }

  // 删除自定义字体
  async function deleteCustomFont(font: CustomFont) {
    try {
      await fetch(`${API_BASE}/api/fonts/${font.id}`, { method: 'DELETE' });
      setCustomFonts(prev => prev.filter(f => f.id !== font.id));
      // 如果当前选中的是这个字体，回退到 system
      if (fontPreset === font.id) setFontPreset('system');
    } catch (err: any) {
      setFontImportError(err.message || '删除失败');
    }
  }

  const colors = [
    '#000000', '#2563EB', '#D97706', '#059669', '#DC2626', '#7C3AED', '#DB2777'
  ];

  const fontPresets = [
    { id: 'system', name: '系统默认', desc: 'Inter / 苹方', family: 'sans-serif' },
    { id: 'serif-cn', name: '宋体', desc: 'Songti / SimSun', family: 'serif' },
    { id: 'kaiti', name: '楷体', desc: 'KaiTi / STKaiti', family: 'serif' },
    { id: 'heiti', name: '黑体', desc: 'PingFang / 微软雅黑', family: 'sans-serif' },
  ];

  // 将自定义字体合并到预设列表
  const allFontOptions = [
    ...fontPresets,
    ...customFonts.map(f => ({
      id: f.id,
      name: f.name,
      desc: f.source === 'system' ? '系统字体' : '导入字体',
      family: f.family,
      isCustom: true as const,
    })),
  ];

  const filteredSystemFonts = systemFonts.filter(f =>
    f.name.toLowerCase().includes(fontSearch.toLowerCase()) ||
    f.family.toLowerCase().includes(fontSearch.toLowerCase()) ||
    (f.fileName || '').toLowerCase().includes(fontSearch.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1e1b2e]/5 dark:bg-black/40 backdrop-blur-md p-4 no-drag"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 16 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col relative ring-1 ring-white/20 dark:ring-white/5 no-drag"
      >
        {/* 固定头部 */}
        <div className="px-8 pt-8 pb-2 shrink-0">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-medium tracking-tight">个性化设置</h2>
            <button onClick={onClose} className="p-2 hover:bg-white/40 dark:hover:bg-white/8 rounded-full transition-all duration-200 text-text-muted hover:text-text">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 可滚动内容区 */}
        <div className="px-8 pb-6 overflow-y-auto flex-1 space-y-6 scrollbar-none">
            <div>
              <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest block mb-3 flex items-center gap-2">
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
              <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest block mb-3 flex items-center gap-2">
                <Type size={12} /> 编辑字体
              </label>
              <div className="grid grid-cols-2 gap-3">
                {allFontOptions.map(fp => (
                  <button
                    key={fp.id}
                    onClick={() => setFontPreset(fp.id)}
                    className={cn(
                      "text-left p-3.5 rounded-2xl transition-all duration-200 border group relative",
                      fontPreset === fp.id
                        ? "border-accent/30 bg-accent/5 ring-1 ring-accent/10"
                        : "border-border hover:border-border hover:bg-white/40 dark:hover:bg-white/5"
                    )}
                  >
                    <div className={cn("text-sm font-medium text-text")} style={{ fontFamily: fp.family }}>{fp.name}</div>
                    <div className="text-[10px] text-text-muted mt-0.5 font-mono">{fp.desc}</div>
                    {/* 自定义字体显示删除按钮 */}
                    {customFonts.some(cf => cf.id === fp.id) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); const cf = customFonts.find(c => c.id === fp.id); if (cf) deleteCustomFont(cf); }}
                        className="absolute top-2 right-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/60 dark:hover:bg-white/10 transition-all text-text-muted hover:text-danger"
                        title="删除字体"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ──── 本地字体导入 ──── */}
            <div>
              <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest block mb-3 flex items-center gap-2">
                <Upload size={12} /> 导入本地字体
              </label>

              <div className="space-y-2.5">
                {/* 操作按钮 */}
                <div className="flex gap-2">
                  <button
                    onClick={loadSystemFonts}
                    className="flex-1 py-2.5 px-3 rounded-2xl border border-border hover:border-accent/30 hover:bg-accent/5 transition-all duration-200 flex items-center justify-center gap-1.5 text-xs font-medium text-text-secondary"
                  >
                    <Monitor size={14} />
                    浏览系统字体
                  </button>
                  <button
                    onClick={importFontFile}
                    className="flex-1 py-2.5 px-3 rounded-2xl border border-border hover:border-accent/30 hover:bg-accent/5 transition-all duration-200 flex items-center justify-center gap-1.5 text-xs font-medium text-text-secondary"
                  >
                    <FolderOpen size={14} />
                    导入字体文件
                  </button>
                </div>

                {/* 错误提示 */}
                {fontImportError && (
                  <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-2xl p-2.5 text-xs">
                    <AlertCircle size={13} />
                    <span>{fontImportError}</span>
                  </div>
                )}

                {/* 系统字体浏览器 */}
                <AnimatePresence>
                  {isBrowsingSystem && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-white/40 dark:bg-white/5 backdrop-blur-sm rounded-2xl border border-border overflow-hidden">
                        {/* 搜索栏 */}
                        <div className="p-3 border-b border-border flex items-center gap-2">
                          <button
                            onClick={() => { setIsBrowsingSystem(false); setFontSearch(''); }}
                            className="p-1 hover:bg-white/50 dark:hover:bg-white/8 rounded-lg transition-colors text-text-muted"
                          >
                            <ArrowLeft size={14} />
                          </button>
                          <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" size={11} />
                            <input
                              type="text"
                              placeholder="搜索字体..."
                              value={fontSearch}
                              onChange={e => setFontSearch(e.target.value)}
                              className="w-full pl-7 pr-3 py-1.5 text-xs bg-white/50 dark:bg-white/5 rounded-xl focus:outline-none focus:ring-1 focus:ring-accent/20"
                            />
                          </div>
                        </div>
                        {/* 字体列表 */}
                        <div className="max-h-52 overflow-y-auto custom-scrollbar p-1.5">
                          {filteredSystemFonts.length === 0 ? (
                            <div className="text-center py-6 text-text-muted/50 text-xs">
                              {systemFonts.length === 0 ? '正在获取系统字体...' : '无匹配字体'}
                            </div>
                          ) : (
                            filteredSystemFonts.map(f => (
                              <button
                                key={f.family}
                                onClick={() => addSystemFont(f)}
                                disabled={importingFont === f.name}
                                className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/60 dark:hover:bg-white/8 transition-all flex items-center justify-between group"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-medium text-text truncate" style={{ fontFamily: `"${f.family}", sans-serif` }}>
                                    {f.name}
                                  </div>
                                  <div className="text-[10px] text-text-muted font-mono truncate">{f.family}</div>
                                </div>
                                {importingFont === f.name ? (
                                  <Loader2 size={13} className="animate-spin shrink-0 text-accent ml-2" />
                                ) : (
                                  <Plus size={13} className="opacity-0 group-hover:opacity-100 shrink-0 text-accent transition-opacity ml-2" />
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 导入中提示 */}
                {importingFont && !isBrowsingSystem && (
                  <div className="flex items-center justify-center gap-2 text-xs text-text-muted py-2">
                    <Loader2 size={13} className="animate-spin" />
                    <span>正在导入 {importingFont}...</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest block mb-3 flex items-center gap-2">
                <Type size={12} /> 默认字体大小
              </label>
              <div className="flex items-center gap-6 bg-white/40 dark:bg-white/5 backdrop-blur-sm rounded-2xl p-4 ring-1 ring-black/5 dark:ring-white/5">
                <input
                  type="range" min="12" max="48"
                  value={defaultFontSize}
                  onChange={(e) => setDefaultFontSize(parseInt(e.target.value))}
                  className="flex-1 h-1 bg-surface-active rounded-lg appearance-none cursor-pointer accent-accent"
                />
                <span className="text-sm font-mono w-8">{defaultFontSize}px</span>
              </div>
            </div>

            {/* 数据管理 */}
            <div>
              <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest block mb-3 flex items-center gap-2">
                <HardDrive size={12} /> 数据管理
              </label>
              <div className="space-y-3">
                {/* 当前数据路径 */}
                <div className="bg-white/40 dark:bg-white/5 backdrop-blur-sm rounded-2xl p-4 ring-1 ring-black/5 dark:ring-white/5">
                  <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1">当前数据目录</div>
                  <div className="text-xs font-mono text-text-secondary break-all">{dataPath || '加载中...'}</div>
                </div>

                {/* 选择目标目录 */}
                <button
                  onClick={async () => {
                    if (!window.electronAPI?.selectFolder) return;
                    const folder = await window.electronAPI.selectFolder();
                    if (folder) {
                      setTargetPath(folder);
                      setMigrationStatus('idle');
                      setMigrationError('');
                    }
                  }}
                  className="w-full py-3 px-4 rounded-2xl border border-border hover:border-accent/30 hover:bg-accent/5 transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium text-text-secondary"
                >
                  <FolderOpen size={16} />
                  选择目标目录
                </button>

                {/* 目标路径 */}
                {targetPath && (
                  <div className="bg-white/40 dark:bg-white/5 backdrop-blur-sm rounded-2xl p-4 ring-1 ring-black/5 dark:ring-white/5">
                    <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1">目标目录</div>
                    <div className="text-xs font-mono text-text-secondary break-all">{targetPath}</div>
                  </div>
                )}

                {/* 迁移按钮 */}
                {targetPath && (
                  <button
                    onClick={async () => {
                      setMigrating(true);
                      setMigrationStatus('idle');
                      setMigrationError('');
                      try {
                        const API_BASE = window.electronAPI ? `http://localhost:${serverPort}` : '';
                        const res = await fetch(`${API_BASE}/api/migrate`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ targetPath })
                        });
                        const result = await res.json();
                        if (result.success) {
                          setMigrationStatus('success');
                        } else {
                          setMigrationStatus('error');
                          setMigrationError(result.error || '未知错误');
                        }
                      } catch (err: any) {
                        setMigrationStatus('error');
                        setMigrationError(err.message || '网络错误');
                      } finally {
                        setMigrating(false);
                      }
                    }}
                    disabled={migrating}
                    className={cn(
                      "w-full py-3 rounded-2xl font-medium transition-all duration-300 flex items-center justify-center gap-2 text-sm",
                      migrating
                        ? "bg-surface-active text-text-muted cursor-not-allowed"
                        : "bg-accent text-accent-content hover:opacity-90 active:scale-[0.98] shadow-md shadow-accent/15"
                    )}
                  >
                    {migrating ? (
                      <><Loader2 size={16} className="animate-spin" /> 迁移中...</>
                    ) : (
                      '迁移数据'
                    )}
                  </button>
                )}

                {/* 状态反馈 */}
                {migrationStatus === 'success' && (
                  <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-2xl p-3 text-xs">
                    <CheckCircle2 size={14} />
                    <span>迁移成功，请重启应用以使用新目录。</span>
                  </div>
                )}
                {migrationStatus === 'error' && (
                  <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-2xl p-3 text-xs">
                    <AlertCircle size={14} />
                    <span>{migrationError}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 固定底部按钮 */}
          <div className="px-8 pb-8 pt-2 shrink-0">
            <button
              onClick={() => { onSave({ themeColor, defaultFontSize, fontPreset, themeMode: settings.themeMode, customFonts }); onClose(); }}
              className="w-full py-4 bg-accent text-accent-content rounded-2xl font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-300 shadow-md shadow-accent/15"
            >
              保存并关闭
            </button>
          </div>
        </motion.div>
      </motion.div>
    );
  }
