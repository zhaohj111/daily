// 生成 emoji-mart 可用的雪碧图数据：
// 在 @emoji-mart/data（含中文 native 字符/名称）基础上，注入 emoji-datasource-google
// 的 62x62 网格 sheet 坐标（x/y），供 emoji-mart 用本地 Noto 雪碧图渲染。
// 输出: src/assets/emojidata/emoji-data.json（构建时打包进应用，离线可用）
const fs = require('fs');
const path = require('path');

const martData = require('../node_modules/@emoji-mart/data/sets/15/native.json');
const dsData = require('../node_modules/emoji-datasource-google/emoji.json');

// unified 大写 -> 条目
const dsMap = new Map();
for (const item of dsData) {
  dsMap.set(item.unified.toUpperCase(), item);
}

const SHEET_COLS = 62;
const SHEET_ROWS = 62;

const out = {
  sheet: { cols: SHEET_COLS, rows: SHEET_ROWS },
  emojis: {},
  aliases: martData.aliases,
  categories: martData.categories,
};

let matched = 0;
let missing = [];

for (const [id, emoji] of Object.entries(martData.emojis)) {
  const skins = emoji.skins.map((skin, idx) => {
    const unified = skin.unified.toUpperCase();
    let x = 0;
    let y = 0;
    let found = false;
    if (idx === 0) {
      const item = dsMap.get(unified);
      if (item) {
        x = item.sheet_x;
        y = item.sheet_y;
        found = true;
      }
    } else {
      // 肤色变体：先在 base 条目的 skin_variations 中查找（键为肤色码，如 1F3FB），
      // 再尝试 emoji-datasource 的独立条目（ZWJ 组合序列的肤色变体）
      const base = dsMap.get(emoji.skins[0].unified.toUpperCase());
      const toneKey = unified.split('-')[1];
      const direct = dsMap.get(unified);
      if (base && toneKey && base.skin_variations && base.skin_variations[toneKey]) {
        const v = base.skin_variations[toneKey];
        x = v.sheet_x;
        y = v.sheet_y;
        found = true;
      } else if (direct) {
        x = direct.sheet_x;
        y = direct.sheet_y;
        found = true;
      } else if (base) {
        // 兜底：emoji-datasource 15 未收录的较新 ZWJ 肤色组合，回退到 base 坐标
        x = base.sheet_x;
        y = base.sheet_y;
        found = true;
      }
    }
    if (found) matched++;
    else missing.push(unified);
    return { unified: skin.unified, native: skin.native, x, y };
  });

  out.emojis[id] = {
    id: emoji.id,
    name: emoji.name,
    keywords: emoji.keywords,
    skins,
    version: emoji.version,
  };
}

const target = path.join(__dirname, '../src/assets/emojidata/emoji-data.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(out));

// 顺便拷贝中文 i18n 文案，运行时不再依赖 @emoji-mart/data
const i18nSrc = path.join(__dirname, '../node_modules/@emoji-mart/data/i18n/zh.json');
const i18nTarget = path.join(__dirname, '../src/assets/emojidata/zh.json');
fs.copyFileSync(i18nSrc, i18nTarget);

console.log(`generated ${target}`);
console.log(`copied i18n -> ${i18nTarget}`);
console.log(`emojis: ${Object.keys(out.emojis).length}, skins matched: ${matched}, missing: ${missing.length}`);
if (missing.length) console.log('missing sample:', missing.slice(0, 10).join(', '));
