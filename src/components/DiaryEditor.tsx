import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit3, Trash2, X, Type, Image as ImageIcon, MessageSquare, Send } from 'lucide-react';
import { motion } from 'motion/react';
import type { DiaryEntry, Tag, Comment } from '../types';

// ──── DiaryEditor 组件 Props ────
interface DiaryEditorProps {
  diary: DiaryEntry;
  onUpdate: (d: DiaryEntry) => void | Promise<void>;
  onPreviewImage: (url: string) => void;
  key?: number;
}

export default function DiaryEditor({ diary, onUpdate, onPreviewImage }: DiaryEditorProps) {
  const [content, setContent] = useState(diary.content);
  const [fontSize, setFontSize] = useState(diary.fontSize || 16);
  const [tags, setTags] = useState<Tag[]>(diary.tags);
  const [images, setImages] = useState<string[]>(diary.images);
  const [comments, setComments] = useState<Comment[]>(diary.comments || []);
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentContent, setEditCommentContent] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCursor = useRef<number | null>(null);

  useEffect(() => {
    setContent(diary.content);
    setFontSize(diary.fontSize || 16);
    setTags(diary.tags);
    setImages(diary.images);
    setComments(diary.comments || []);
    setNewComment('');
    setEditingCommentId(null);
  }, [diary.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const hasChanged =
        content !== diary.content ||
        fontSize !== diary.fontSize ||
        JSON.stringify(tags) !== JSON.stringify(diary.tags) ||
        JSON.stringify(images) !== JSON.stringify(diary.images) ||
        JSON.stringify(comments) !== JSON.stringify(diary.comments || []);

      if (hasChanged) {
        onUpdate({ ...diary, content, fontSize, tags, images, comments, updatedAt: Date.now() });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [content, fontSize, tags, images, comments]);

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
    const files = Array.from<File>(e.dataTransfer.files ?? []);
    if (files.length > 0) addImageFiles(files);
  };

  // 空格键处理：默认全角空格，仅英文单词间为半角
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== ' ') return;
    const pos = e.currentTarget.selectionStart;
    const before = pos > 0 ? content[pos - 1] : '';
    // 仅当前一个字符是英文字母时，保持半角空格（英文单词间）
    if (!/^[a-zA-Z]$/.test(before)) {
      e.preventDefault();
      const newVal = content.slice(0, pos) + '　' + content.slice(pos);
      pendingCursor.current = pos + 1;
      setContent(newVal);
    }
  };

  // 恢复全角空格插入后的光标位置
  useEffect(() => {
    if (pendingCursor.current !== null && textareaRef.current) {
      textareaRef.current.selectionStart = textareaRef.current.selectionEnd = pendingCursor.current;
      pendingCursor.current = null;
    }
  }, [content]);

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

  // ──── 评论操作 ────
  const addComment = () => {
    if (!newComment.trim()) return;
    const comment: Comment = {
      id: Date.now(),
      content: newComment.trim(),
      createdAt: Date.now()
    };
    setComments(prev => [...prev, comment]);
    setNewComment('');
  };

  const deleteComment = (id: number) => {
    setComments(prev => prev.filter(c => c.id !== id));
  };

  const startEditComment = (id: number, content: string) => {
    setEditingCommentId(id);
    setEditCommentContent(content);
  };

  const saveEditComment = (id: number) => {
    if (!editCommentContent.trim()) return;
    setComments(prev => prev.map(c =>
      c.id === id ? { ...c, content: editCommentContent.trim() } : c
    ));
    setEditingCommentId(null);
    setEditCommentContent('');
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditCommentContent('');
  };

  // 评论编辑失焦时自动保存（空内容则取消）
  const handleCommentBlur = (id: number) => {
    if (editCommentContent.trim()) {
      saveEditComment(id);
    } else {
      cancelEditComment();
    }
  };

  const handleCommentKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addComment();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="h-full flex flex-col p-8 md:p-12 lg:p-20 max-w-5xl mx-auto"
    >
      <div className="flex flex-wrap items-center gap-3 mb-14">
        {tags.map((tag, idx) => (
          <div
            key={idx}
            className="flex items-center glass-card px-3.5 py-2 rounded-xl group transition-all duration-300 focus-within:ring-2 focus-within:ring-accent/15 focus-within:shadow-sm"
          >
            <span className="text-sm font-mono text-text-muted uppercase tracking-[0.1em] mr-2 leading-none">{tag.label}</span>
            <input
              type="text"
              value={tag.value}
              onChange={(e) => updateTagValue(idx, e.target.value)}
              style={{ fontFamily: 'var(--font-editor)' } as React.CSSProperties}
              className="text-sm bg-transparent focus:outline-none w-28 min-w-min text-text-secondary py-0 leading-none align-middle"
              placeholder="..."
            />
            {tag.isRemovable && (
              <button
                onClick={() => setTags(tags.filter((_, i) => i !== idx))}
                className="ml-2 opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-all duration-200"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
        {isAddingTag ? (
          <div className="flex items-center glass-card border-accent/25 rounded-xl px-3 py-2 shadow-sm ring-2 ring-accent/8">
            <input
              autoFocus
              type="text"
              placeholder="标签名"
              className="text-sm font-mono outline-none w-20 bg-transparent py-0 leading-none"
              value={newTagLabel}
              onChange={(e) => setNewTagLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
              onBlur={addCustomTag}
            />
          </div>
        ) : (
          <button
            onClick={() => setIsAddingTag(true)}
            className="p-2 text-text-placeholder hover:text-accent border border-dashed border-border rounded-xl transition-all duration-300 hover:bg-white/40 dark:hover:bg-white/5 hover:border-accent/20"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      <div className="mb-10 pl-5 flex items-end justify-between" style={{ borderLeft: '4px solid var(--color-accent)' } as React.CSSProperties}>
        <div>
          <h2 className="text-3xl font-serif italic font-light text-text-secondary">{diary.date} 快照</h2>
          <p className="text-[10px] font-mono text-text-placeholder/70 uppercase tracking-[0.2em] mt-2 ml-0.5">Edited {new Date(diary.updatedAt).toLocaleTimeString()}</p>
        </div>

        <div className="group/toolbar flex items-center gap-2.5 p-2 rounded-2xl transition-all duration-300 hover:bg-white/25 dark:hover:bg-white/5 hover:ring-1 hover:ring-black/5 dark:hover:ring-white/5">
          <Type size={14} className="text-text-muted/50 ml-1 transition-colors duration-300 group-hover/toolbar:text-text-muted" />
          <input
            type="range" min="12" max="48"
            value={fontSize}
            onChange={(e) => setFontSize(parseInt(e.target.value))}
            className="w-24 h-1 bg-surface-active rounded-lg appearance-none cursor-pointer accent-accent"
          />
          <span className="text-[10px] font-mono text-text-muted/50 w-4 transition-all duration-300 group-hover/toolbar:text-text-muted">{fontSize}</span>
        </div>
      </div>

      {/* 编辑器滚动区域 - no-drag */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-0.5 no-drag">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleEditorKeyDown}
          placeholder="开始您的记录..."
          style={{ fontSize: `${fontSize}px`, fontFamily: 'var(--font-editor)' }}
          className="w-full h-auto min-h-[400px] bg-transparent resize-none focus:outline-none leading-relaxed text-text placeholder:text-text-placeholder/30 transition-all font-light"
        />

        {/* ──── 评论区域 ──── */}
        <div className="mt-10 border-t border-border-subtle pt-8 no-drag">
          <label className="text-sm font-mono text-text-muted uppercase tracking-[0.1em] leading-none mb-4 flex items-center gap-1.5">
            <MessageSquare size={14} className="shrink-0" /> 评论 ({comments.length})
          </label>

          {/* 已有评论列表 */}
          {comments.length > 0 && (
            <div className="space-y-2.5 mb-5">
              {comments.map(c => (
                <div key={c.id} className="bg-white/40 dark:bg-white/5 backdrop-blur-sm rounded-2xl p-3 border border-black/5 dark:border-white/5 group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-text-muted/60">
                      {new Date(c.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEditComment(c.id, c.content)}
                        className="p-1 hover:bg-white/60 dark:hover:bg-white/10 rounded-lg transition-colors text-text-muted hover:text-text"
                        title="编辑"
                      >
                        <Edit3 size={11} />
                      </button>
                      <button
                        onClick={() => deleteComment(c.id)}
                        className="p-1 hover:bg-white/60 dark:hover:bg-white/10 rounded-lg transition-colors text-text-muted hover:text-danger"
                        title="删除"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                  {editingCommentId === c.id ? (
                      <input
                        value={editCommentContent}
                        onChange={e => setEditCommentContent(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') cancelEditComment(); }}
                        onBlur={() => handleCommentBlur(c.id)}
                        className="w-full text-sm bg-transparent border border-border-light dark:border-white/5 rounded-lg px-2.5 py-1 focus:outline-none focus:border-accent/20 transition-colors text-text-secondary"
                        style={{ fontFamily: 'var(--font-editor)' } as React.CSSProperties}
                        autoFocus
                      />
                  ) : (
                    <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap break-words" style={{ fontFamily: 'var(--font-editor)' }}>{c.content}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 新增评论输入 */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={handleCommentKeyDown}
              placeholder="添加评论..."
              style={{ fontFamily: 'var(--font-editor)' } as React.CSSProperties}
              className="flex-1 text-sm bg-white/40 dark:bg-white/5 backdrop-blur-sm rounded-2xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-accent/20 ring-1 ring-black/5 dark:ring-white/5 transition-all placeholder:text-text-placeholder/50"
            />
            <button
              onClick={addComment}
              disabled={!newComment.trim()}
              className="px-4 py-2.5 bg-accent text-accent-content rounded-2xl text-sm font-mono font-medium hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
            >
              <Send size={14} /> 发送
            </button>
          </div>
        </div>

        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="mt-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 no-drag"
        >
          {images.map((img, idx) => (
            <motion.div
              layout
              key={idx}
              className="relative aspect-square group rounded-3xl overflow-hidden shadow-sm ring-1 ring-black/5 cursor-zoom-in no-drag hover:shadow-lg hover:-translate-y-0.5 transition-all duration-400"
              onClick={() => onPreviewImage(img)}
            >
              <img src={img} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <button
                onClick={(e) => { e.stopPropagation(); setImages(images.filter((_, i) => i !== idx)); }}
                className="absolute top-3 right-3 p-2.5 bg-black/40 text-white rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-black/60 hover:scale-110"
                title="删除图片"
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
          <label className="aspect-square border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center text-text-placeholder hover:text-accent hover:border-accent/20 hover:bg-white/30 dark:hover:bg-white/5 cursor-pointer transition-all duration-300 group">
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            <ImageIcon size={36} className="mb-3 group-hover:scale-110 transition-transform duration-300 opacity-25 group-hover:opacity-45" />
            <span className="text-[10px] font-mono tracking-widest uppercase opacity-30 group-hover:opacity-60 transition-opacity">Upload Image</span>
          </label>
        </div>
      </div>

      <div className="mt-10 pt-8 border-t border-border-subtle flex justify-between items-center text-[10px] font-mono text-text-placeholder/60 uppercase tracking-widest">
        <span>Daily / {diary.id}</span>
        <span>{content.length} words</span>
      </div>
    </motion.div>
  );
}
