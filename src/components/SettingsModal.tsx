import { useState, useEffect } from 'react';
import { Palette, Type, X, HardDrive, FolderOpen, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import type { AppSettings } from '../types';

interface SettingsModalProps {
  settings: AppSettings;
  onClose: () => void;
  onSave: (s: AppSettings) => void;
}

export default function SettingsModal({ settings, onClose, onSave }: SettingsModalProps) {
  const [themeColor, setThemeColor] = useState(settings.themeColor);
  const [defaultFontSize, setDefaultFontSize] = useState(settings.defaultFontSize);
  const [fontPreset, setFontPreset] = useState(settings.fontPreset || 'system');

  // 数据迁移状态
  const [dataPath, setDataPath] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [migrationError, setMigrationError] = useState('');

  useEffect(() => {
    const API_BASE = window.electronAPI ? 'http://localhost:3000' : '';
    fetch(`${API_BASE}/api/data-path`)
      .then(res => res.json())
      .then(data => setDataPath(data.dataPath))
      .catch(() => setDataPath('(无法获取)'));
  }, []);

  const colors = [
    '#000000', '#2563EB', '#D97706', '#059669', '#DC2626', '#7C3AED', '#DB2777'
  ];

  const fontPresets = [
    { id: 'system', name: '系统默认', desc: 'Inter / 苹方', family: 'sans-serif' },
    { id: 'serif-cn', name: '宋体', desc: 'Songti / SimSun', family: 'serif' },
    { id: 'kaiti', name: '楷体', desc: 'KaiTi / STKaiti', family: 'serif' },
    { id: 'heiti', name: '黑体', desc: 'PingFang / 微软雅黑', family: 'sans-serif' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1e1b2e]/5 backdrop-blur-md p-4 no-drag"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 16 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col relative ring-1 ring-white/20 no-drag"
      >
        {/* 固定头部 */}
        <div className="px-8 pt-8 pb-2 shrink-0">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-medium tracking-tight">个性化设置</h2>
            <button onClick={onClose} className="p-2 hover:bg-white/40 rounded-full transition-all duration-200 text-text-muted hover:text-text">
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
                {fontPresets.map(fp => (
                  <button
                    key={fp.id}
                    onClick={() => setFontPreset(fp.id)}
                    className={cn(
                      "text-left p-3.5 rounded-2xl transition-all duration-200 border",
                      fontPreset === fp.id
                        ? "border-accent/30 bg-accent/5 ring-1 ring-accent/10"
                        : "border-border hover:border-border hover:bg-white/40"
                    )}
                  >
                    <div className={cn("text-sm font-medium text-text", fp.family)}>{fp.name}</div>
                    <div className="text-[10px] text-text-muted mt-0.5 font-mono">{fp.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest block mb-3 flex items-center gap-2">
                <Type size={12} /> 默认字体大小
              </label>
              <div className="flex items-center gap-6 bg-white/40 backdrop-blur-sm rounded-2xl p-4 ring-1 ring-black/5">
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
                <div className="bg-white/40 backdrop-blur-sm rounded-2xl p-4 ring-1 ring-black/5">
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
                  <div className="bg-white/40 backdrop-blur-sm rounded-2xl p-4 ring-1 ring-black/5">
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
                        const API_BASE = window.electronAPI ? 'http://localhost:3000' : '';
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
                  <div className="flex items-center gap-2 bg-green-50 text-green-700 rounded-2xl p-3 text-xs">
                    <CheckCircle2 size={14} />
                    <span>迁移成功，请重启应用以使用新目录。</span>
                  </div>
                )}
                {migrationStatus === 'error' && (
                  <div className="flex items-center gap-2 bg-red-50 text-red-700 rounded-2xl p-3 text-xs">
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
              onClick={() => { onSave({ themeColor, defaultFontSize, fontPreset }); onClose(); }}
              className="w-full py-4 bg-accent text-accent-content rounded-2xl font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-300 shadow-md shadow-accent/15"
            >
              保存并关闭
            </button>
          </div>
        </motion.div>
      </motion.div>
    );
  }
