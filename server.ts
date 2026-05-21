import express from 'express';
import path from 'path';
import fs from 'fs/promises';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// 数据目录（由环境变量传入）
const DATA_BASE = process.env.DATA_PATH || path.join(process.cwd(), 'data');
const DATA_DIR = path.join(DATA_BASE, 'diaries');
const SETTINGS_FILE = path.join(DATA_BASE, 'settings.json');

// 初始化数据目录
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(SETTINGS_FILE);
  } catch {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify({
      themeColor: '#000000',
      defaultFontSize: 16
    }));
  }
}

initData().catch(err => {
  console.error('Failed to init data:', err);
  process.exit(1);
});

app.use(express.json({ limit: '50mb' }));

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

// Diary APIs
app.get('/api/diaries', async (req, res) => {
  try {
    const files = await fs.readdir(DATA_DIR);
    const diaries = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(DATA_DIR, file), 'utf-8');
        diaries.push(JSON.parse(content));
      }
    }
    diaries.sort((a, b) => b.id - a.id);
    res.json(diaries);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read diaries' });
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