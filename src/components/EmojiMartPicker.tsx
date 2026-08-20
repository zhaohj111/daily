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
      // 整个 picker（含阴影 DOM 内全部元素）明确排除出窗口拖拽区域。
      // 应用把 html/body/#root 设为 -webkit-app-region: drag（整窗可拖动），
      // 只有 light DOM 的 button/.no-drag 等被排除。阴影 DOM 内的元素计算值
      // 为 none，既非 drag 也非 no-drag，不会被排除出拖拽区域——真实鼠标按下
      // 会被当成窗口拖拽吞掉（点击表情/分类全部无效），这里必须显式 no-drag。
      ':host, :host * {' +
      ' -webkit-app-region: no-drag;' +
      '}' +
      ':host, #root, input, button {' +
      ' font-family: "Noto Color Emoji", "Segoe UI Emoji", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif !important;' +
      '}';
    // 同样覆盖 :host 上定义的 --font-family 变量（inline 优先级最高）
    hostEl.style.setProperty('--font-family', '"Noto Color Emoji", "Inter", system-ui, sans-serif');
    const shadowRoot = (el as unknown as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;
    shadowRoot.appendChild(styleEl);

    // ─── 顶部分类点击跳转 ───
    // emoji-mart 原生导航自带跳转，但有两个不可靠点：
    //  1. 搜索状态下点分类：搜索结果的 .category（无 data-id）会插到列表首位，
    //     原生按 categoryId 定位的目标分类此刻 display:none，滚动位置计算失真，
    //     表现为“点了分类没反应 / 跳到错误位置”；
    //  2. 内部依赖 grid/refs 状态，picker 被 update()/reset() 重建期间可能失效。
    // 因此在 ShadowRoot 捕获阶段接管 #nav 按钮的点击：stopImmediatePropagation
    // 屏蔽原生 onClick，自己按顺序把按钮映射到 .scroll 中「非搜索结果」的
    // .category（跳过无 data-id 的搜索结果分类），行为完全确定；
    // 若处于搜索中，先清空搜索框恢复完整分类列表，再执行跳转。
    // 监听挂在 ShadowRoot 上（随元素创建即存在、不随重渲染重建），
    // 事件发生时再实时查询 #nav / .scroll，因此无需轮询等待渲染。
    // 激活指示器（.bar / aria-selected）由下面的 pickerComponent() 直接驱动：
    // emoji-mart 内部靠 IntersectionObserver 依据累计的 intersectionRatio
    // 取「首个非零」分类，滚动定位后回调滞后且常取到陈旧比值，导致激活标签
    // 错乱（实测点击后普遍滞后一个分类），因此禁用它并自行同步。
    type NavStateLike = { setState(s: { categoryId: string }): void; state?: { categoryId?: string } };
    type PickerComponentLike = {
      observers?: IntersectionObserver[];
      refs?: { navigation?: { current?: NavStateLike } };
    };
    const pickerComponent = () => (el as unknown as { component?: PickerComponentLike }).component;
    const setActiveCategory = (categoryId: string) => {
      disableStaleCategoryObserver(); // 兜底：确保陈旧 observer 不会异步覆盖
      const nav = pickerComponent()?.refs?.navigation?.current;
      if (!nav) return;
      if (nav.state?.categoryId !== categoryId) nav.setState({ categoryId });
    };

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

      // 接管本次点击，避免原生 onClick 的滚动逻辑与这里冲突（尤其搜索态）
      event.preventDefault();
      event.stopImmediatePropagation();

      const doScroll = () => {
        // 第一个按钮「常用」→ 直接回到顶部
        if (index === 0) {
          scroll.scrollTop = 0;
          setActiveCategory('frequent');
          return;
        }
        // 其余按钮与 .scroll 中第 index 个「非搜索结果」分类同序对应：
        // 搜索时列表首位会多出 .category#search（无 data-id），必须跳过。
        let categoryEl: HTMLElement | null = null;
        let j = 0;
        for (const c of scroll.querySelectorAll<HTMLElement>('.category')) {
          if (!c.dataset.id) continue; // 搜索结果分类，跳过
          if (j === index) { categoryEl = c; break; }
          j++;
        }
        if (!categoryEl || categoryEl.getClientRects().length === 0) return;

        const scrollRect = scroll.getBoundingClientRect();
        const categoryRect = categoryEl.getBoundingClientRect();
        scroll.scrollTop = Math.max(0, scroll.scrollTop + categoryRect.top - scrollRect.top);
        setActiveCategory(categoryEl.dataset.id || 'frequent');
      };

      // 搜索中点击分类：先清空搜索框（触发 emoji-mart 恢复完整分类列表），再跳转
      const searchInput = shadowRoot.querySelector<HTMLInputElement>('input[type="search"]');
      if (searchInput && searchInput.value.trim()) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        // handleSearchInput 是异步的（await search('')），等其重渲染后再滚动
        setTimeout(doScroll, 60);
      } else {
        doScroll();
      }
    };
    shadowRoot.addEventListener('click', categoryNavListener, true);

    // ─── 激活指示器接管 ───
    // 禁用 emoji-mart 的分类 IntersectionObserver（root=滚动区、rootMargin 为
    // 默认值 "0px 0px 0px 0px" 的那个；行渲染观察器带宽边距，必须保留），
    // 避免其用陈旧比值异步覆盖我们刚设置的激活状态。
    // 注意：自定义元素的 component 与阴影树内容都是异步渲染的，挂载当下
    // 拿不到 observer/.scroll，因此统一用 setupWhenReady 轮询，点击时兜底。
    let observerDisabled = false;
    let scrollListenerAttached = false;
    const disableStaleCategoryObserver = () => {
      if (observerDisabled) return true;
      const comp = pickerComponent();
      if (!comp?.observers) return false;
      const scrollEl = shadowRoot.querySelector<HTMLElement>('.scroll'); // 实时查询
      if (!scrollEl) return false;
      for (const obs of comp.observers) {
        if (obs instanceof IntersectionObserver && obs.root === scrollEl && obs.rootMargin === '0px 0px 0px 0px') {
          obs.disconnect();
          observerDisabled = true;
        }
      }
      return observerDisabled;
    };

    // 手动滚动列表时同步激活指示器（替代被禁用的 observer）：
    // 取「顶部边缘所在」的分类——最后一个 top 已越过视口顶部的 .category。
    let scrollTick = 0;
    const updateActiveCategoryByScroll = () => {
      const scrollEl = shadowRoot.querySelector<HTMLElement>('.scroll');
      if (!scrollEl) return;
      const nav = pickerComponent()?.refs?.navigation?.current;
      if (!nav) return;
      const scrollRect = scrollEl.getBoundingClientRect();
      const top = scrollRect.top + 2; // 视口顶部（+2 容忍 sticky 头的 1px 偏移）
      let current = 'frequent';
      for (const c of scrollEl.querySelectorAll<HTMLElement>('.category')) {
        if (!c.dataset.id) continue; // 搜索结果分类，跳过
        if (c.getBoundingClientRect().top <= top) current = c.dataset.id;
        else break;
      }
      if (nav.state?.categoryId !== current) nav.setState({ categoryId: current });
    };
    const onScroll = () => {
      cancelAnimationFrame(scrollTick);
      scrollTick = requestAnimationFrame(updateActiveCategoryByScroll);
    };
    const attachScrollListener = () => {
      if (scrollListenerAttached) return true;
      const scrollEl = shadowRoot.querySelector<HTMLElement>('.scroll');
      if (!scrollEl) return false;
      scrollEl.addEventListener('scroll', onScroll);
      scrollListenerAttached = true;
      return true;
    };

    let setupTries = 0;
    const setupWhenReady = () => {
      if (disableStaleCategoryObserver() && attachScrollListener()) return;
      if (++setupTries < 40) setTimeout(setupWhenReady, 100);
    };
    setupWhenReady();

    instanceRef.current = el;
    return () => {
      shadowRoot.removeEventListener('click', categoryNavListener, true);
      if (scrollListenerAttached) {
        const scrollEl = shadowRoot.querySelector<HTMLElement>('.scroll');
        scrollEl?.removeEventListener('scroll', onScroll);
      }
      cancelAnimationFrame(scrollTick);
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
