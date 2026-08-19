import { useEffect, useRef } from 'react';
import { Picker as EmojiMartPickerElement } from 'emoji-mart';
// 本地打包的表情数据：@emoji-mart/data 的中文 native 数据 + emoji-datasource-google
// 的 62x62 雪碧图坐标（由 scripts/gen-emoji-data.cjs 生成），完全离线
import data from '../assets/emojidata/emoji-data.json';
import zh from '../assets/emojidata/zh.json';

interface EmojiMartPickerProps {
  theme: 'light' | 'dark';
  /** 应用强调色的 "r, g, b" 三元组（注入 --rgb-accent） */
  accentRgb: string;
  onEmojiSelect: (native: string) => void;
}

/**
 * emoji-mart 的 React 包装组件。
 * emoji-mart v5 是自定义元素（<em-emoji-picker>，内部 Shadow DOM），
 * 官方 @emoji-mart/react 包装层 peer 依赖仅到 React 18，
 * 这里按同样机制自行封装（new Picker + update() 同步），兼容 React 19。
 */
export default function EmojiMartPicker({ theme, accentRgb, onEmojiSelect }: EmojiMartPickerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<EmojiMartPickerElement | null>(null);
  const onSelectRef = useRef(onEmojiSelect);
  useEffect(() => { onSelectRef.current = onEmojiSelect; });

  // 创建自定义元素并挂载到容器（StrictMode 双调用安全：cleanup 时移除）
  useEffect(() => {
    if (!hostRef.current) return;
    const el = new EmojiMartPickerElement({
      data,
      i18n: zh,
      locale: 'zh',
      theme,
      // 用本地 Noto 官方雪碧图（PNG 图片）渲染表情 —— 与字体/GPU 光栅化无关，
      // 任何环境下都显示 Google/Noto 风格，100% 可靠且离线可用
      set: 'google',
      getSpritesheetURL: () => './spritesheets/google64.png',
      icons: 'auto',            // 分类图标跟随浅色/深色主题，使用内嵌 SVG，离线可用
      navPosition: 'top',       // 上侧分类导航：点击跳转到对应分类区域
      previewPosition: 'none',  // 不显示底部 emoji 详情预览
      skinTonePosition: 'search', // 预览移除后，肤色选择按钮放到搜索栏右侧
      // 根元素宽度 = perLine×emojiButtonSize + 12px padding + 16px scrollbar。
      // 9×36 + 12 + 16 = 352px，恰好撑满弹层容器，消除右侧白边。
      perLine: 9,
      emojiButtonSize: 36,
      onEmojiSelect: (e: { native?: string }) => onSelectRef.current(e?.native || ''),
      ref: hostRef,
    });
    const hostEl = el as unknown as HTMLElement;
    hostEl.style.width = '100%';  // 撑满弹层容器（覆盖 :host 的 min-content）

    // emoji-mart 内部样式把 font-family 写死为 -apple-system 栈（不含 Noto），
    // 直接向 Shadow DOM 注入覆盖样式，让面板内表情用 Noto Color Emoji 渲染。
    // 注意内部有 `:host, #root, input, button { font-family: var(--font-family) }`，
    // 因此需同时覆盖 #root 与 button 等元素。
    const styleEl = document.createElement('style');
    styleEl.textContent =
      ':host, #root, input, button {' +
      ' font-family: "Noto Color Emoji", "Segoe UI Emoji", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif !important;' +
      '}';
    // 同样覆盖 :host 上定义的 --font-family 变量（inline 优先级最高）
    hostEl.style.setProperty('--font-family', '"Noto Color Emoji", "Inter", system-ui, sans-serif');
    const shadowRoot = (el as unknown as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;
    shadowRoot.appendChild(styleEl);

    // ─── 顶部分类点击跳转 ───
    // emoji-mart 原生导航本身就带跳转，这里再在 ShadowRoot 上挂一个捕获期监听兜底，
    // 保证点击 #nav 按钮后 .scroll 一定滚到对应分类区域。
    // 监听挂在 ShadowRoot 上（随元素创建即存在、不随重渲染重建），
    // 事件发生时再实时查询 #nav / .scroll，因此无需轮询等待渲染。
    // nav 按钮顺序 = [常用, people, nature, ..., flags]，与 .scroll 内的
    // .category 一一对应，按位置定位即可（不依赖 data-id 匹配）。
    const categoryNavListener = (event: Event) => {
      const target = event.target as Element | null;
      const button = target?.closest?.('button');
      if (!(button instanceof HTMLButtonElement)) return;

      const nav = shadowRoot.querySelector<HTMLElement>('#nav');
      if (!nav || !nav.contains(button)) return;

      const scroll = shadowRoot.querySelector<HTMLElement>('.scroll');
      if (!scroll) return;

      const buttons = Array.from(nav.querySelectorAll('button'));
      const index = buttons.indexOf(button);
      if (index < 0) return;

      // 第一个按钮是「常用」，直接回到顶部
      if (index === 0) {
        scroll.scrollTop = 0;
        return;
      }

      // 其余按钮与 .scroll 中的 .category 同序对应
      const categoryEl = scroll.querySelectorAll<HTMLElement>('.category')[index];
      if (!categoryEl || categoryEl.getClientRects().length === 0) return;

      const scrollRect = scroll.getBoundingClientRect();
      const categoryRect = categoryEl.getBoundingClientRect();
      scroll.scrollTop = Math.max(0, scroll.scrollTop + categoryRect.top - scrollRect.top);
    };
    shadowRoot.addEventListener('click', categoryNavListener, true);

    instanceRef.current = el;
    return () => {
      shadowRoot.removeEventListener('click', categoryNavListener, true);
      (instanceRef.current as unknown as HTMLElement | null)?.remove();
      instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 主题切换时同步（data/i18n 等静态属性无需重复同步）
  useEffect(() => {
    instanceRef.current?.update({ theme });
  }, [theme]);

  // 强调色 → CSS 变量（穿透 Shadow DOM）
  useEffect(() => {
    hostRef.current?.style.setProperty('--rgb-accent', accentRgb);
  }, [accentRgb]);

  return <div ref={hostRef} className="emoji-mart-host" />;
}
