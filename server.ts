import express from 'express';
import path from 'path';
import fs from 'fs/promises';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// 数据目录（由环境变量传入）
const DATA_BASE = process.env.DATA_PATH || path.join(process.cwd(), 'data');
const DATA_DIR = path.join(DATA_BASE, 'diaries');
const FONTS_DIR = path.join(DATA_BASE, 'fonts');
const SETTINGS_FILE = path.join(DATA_BASE, 'settings.json');
const DEFAULT_DATA_PARENT = process.env.DEFAULT_DATA_PARENT || DATA_BASE;

// 初始化数据目录
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(FONTS_DIR, { recursive: true });
  try {
    await fs.access(SETTINGS_FILE);
  } catch {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify({
      themeColor: '#000000',
      defaultFontSize: 16,
      fontPreset: 'system',
      themeMode: 'light',
      customFonts: []
    }));
  }
}

initData().catch(err => {
  console.error('Failed to init data:', err);
  process.exit(1);
});

app.use(express.json({ limit: '50mb' }));

// 限制并发数的 map，避免一次性读取大量（含 Base64 图片的）日记文件撑爆内存/IO。
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const ret: R[] = new Array(items.length);
  let idx = 0;
  const worker = async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      ret[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return ret;
}

// ══════════════════════════════════════
//  Font APIs — 静态文件服务 + 管理端点
// ══════════════════════════════════════

// 静态提供字体文件（用于 CSS @font-face 加载）
app.use('/api/fonts/files', (req, res, next) => {
  // 安全：只允许 .ttf / .otf / .woff2 / .woff 扩展名
  const ext = path.extname(req.path).toLowerCase();
  if (!['.ttf', '.otf', '.woff2', '.woff'].includes(ext)) {
    res.status(403).json({ error: '不允许的文件类型' });
    return;
  }
  next();
}, express.static(FONTS_DIR));

// 添加字体（系统字体仅存储元数据，导入字体存储文件 + 元数据）
app.post('/api/fonts', async (req, res) => {
  const { dataUrl, name, family, source } = req.body;
  if (!name || !family) {
    res.status(400).json({ error: '缺少必要参数: name, family' });
    return;
  }
  try {
    let fileName: string | undefined;

    if (source === 'system') {
      // 系统字体：不需要文件，直接引用系统已安装的字体族名
      fileName = undefined;
    } else {
      // 导入字体：解析 base64 → 写入文件
      if (!dataUrl) {
        res.status(400).json({ error: '导入字体需要 dataUrl' });
        return;
      }
      const match = dataUrl.match(/^data:font\/(\w+);base64,(.+)$/);
      if (!match) {
        res.status(400).json({ error: '无效的字体 data URL' });
        return;
      }
      const [, ext, base64] = match;
      const buf = Buffer.from(base64, 'base64');
      const safeFamily = family.replace(/[^a-zA-Z0-9一-鿿_-]/g, '_').slice(0, 40);
      fileName = `${safeFamily}_${Date.now()}.${ext === 'ttf' ? 'ttf' : ext === 'otf' ? 'otf' : 'woff2'}`;
      await fs.writeFile(path.join(FONTS_DIR, fileName), buf);
    }

    // 更新 settings
    const raw = await fs.readFile(SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(raw);
    const customFonts = settings.customFonts || [];
    const id = `cf_${Date.now()}`;
    customFonts.push({ id, name, family, fileName, source: source || 'imported' });
    settings.customFonts = customFonts;
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));

    res.json({ id, name, family, fileName, source: source || 'imported' });
  } catch (err) {
    res.status(500).json({ error: `字体保存失败: ${(err as Error).message}` });
  }
});

// 删除导入的字体
app.delete('/api/fonts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(raw);
    const customFonts = settings.customFonts || [];
    const idx = customFonts.findIndex((f: any) => f.id === id);
    if (idx === -1) {
      res.status(404).json({ error: '字体未找到' });
      return;
    }
    const font = customFonts[idx];
    // 删除字体文件
    try { await fs.unlink(path.join(FONTS_DIR, font.fileName)); } catch { /* 文件不存在时忽略 */ }
    customFonts.splice(idx, 1);
    settings.customFonts = customFonts;
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: `字体删除失败: ${(err as Error).message}` });
  }
});

// Settings APIs
app.get('/api/settings', async (req, res) => {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    res.json(JSON.parse(data));
  } catch (e) {
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(req.body));
    res.json(req.body);
  } catch (e) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// 返回当前数据目录路径（设置页展示用）
app.get('/api/data-path', (_req, res) => {
  res.json({ dataPath: DATA_BASE });
});

// 数据迁移：复制所有数据到新目录，并在默认位置写入指针文件
app.post('/api/migrate', async (req, res) => {
  const { targetPath } = req.body;
  if (!targetPath || typeof targetPath !== 'string') {
    res.status(400).json({ success: false, error: '请选择有效的目标目录' });
    return;
  }
  const normalized = path.resolve(targetPath);
  if (normalized === path.resolve(DATA_BASE)) {
    res.status(400).json({ success: false, error: '目标目录与当前目录相同' });
    return;
  }
  try {
    await fs.mkdir(normalized, { recursive: true });
    await fs.cp(DATA_BASE, normalized, { recursive: true });
    const pointerFile = path.join(DEFAULT_DATA_PARENT, 'datapath.json');
    await fs.writeFile(pointerFile, JSON.stringify({ dataPath: normalized }, null, 2));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: `迁移失败: ${e.message || e}` });
  }
});

// Diary APIs
// 列表接口：并行读取，且只返回轻量字段（剥离 Base64 图片与 tags），
// 避免一次性把所有图片塞进响应导致卡顿。
app.get('/api/diaries', async (req, res) => {
  try {
    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    const results = await mapLimit(jsonFiles, 16, async (file) => {
      try {
        const raw = await fs.readFile(path.join(DATA_DIR, file), 'utf-8');
        const d = JSON.parse(raw);
        return {
          id: d.id,
          date: d.date,
          content: typeof d.content === 'string' ? d.content : '',
          updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : d.id
        };
      } catch {
        return null;
      }
    });
    const diaries = results.filter(Boolean) as Array<{ id: number; date: string; content: string; updatedAt: number }>;
    diaries.sort((a, b) => b.id - a.id);
    res.json(diaries);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read diaries' });
  }
});

// 单篇日记完整内容（含图片、tags 等），按需加载。
app.get('/api/diaries/:id', async (req, res) => {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, `${req.params.id}.json`), 'utf-8');
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(404).json({ error: 'Diary not found' });
  }
});

app.post('/api/diaries', async (req, res) => {
  try {
    const diary = req.body;
    if (!diary.id) diary.id = Date.now();
    await fs.writeFile(
      path.join(DATA_DIR, `${diary.id}.json`),
      JSON.stringify(diary, null, 2)
    );
    res.json(diary);
  } catch (e) {
    res.status(500).json({ error: 'Failed to save diary' });
  }
});

app.delete('/api/diaries/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const filePath = path.join(DATA_DIR, `${id}.json`);
    await fs.access(filePath);
    await fs.unlink(filePath);
    res.json({ success: true });
  } catch (e) {
    res.status(404).json({ error: 'Diary not found' });
  }
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is listening on http://localhost:${PORT}`);
});