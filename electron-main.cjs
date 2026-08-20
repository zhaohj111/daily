const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { fork, spawn, execSync } = require('child_process');
const net = require('net');
const { autoUpdater } = require('electron-updater');

// ══════════════════════════════════════
//  字体渲染兼容（必须在窗口创建前设置）
//  Noto Color Emoji 是 COLRv1 彩色字体，部分 Windows GPU 驱动下
//  GPU 光栅化无法渲染 COLRv1，Chromium 会回退到系统 emoji 字体
// （Segoe UI Emoji）。禁用硬件加速、强制全软件渲染后，
// 字体（含 COLRv1）走 CPU 光栅化，正文中的 emoji 也能用 Noto 渲染。
// 日记应用界面轻量，软件渲染性能无感知影响。
// ══════════════════════════════════════
app.disableHardwareAcceleration();

let mainWindow;
let serverProcess;
let serverPort = 0;

// ══════════════════════════════════════
//  自动更新配置
// ══════════════════════════════════════
autoUpdater.autoDownload = false;         // 手动控制下载时机
autoUpdater.autoInstallOnAppQuit = true;  // 退出时自动安装
autoUpdater.forceDevUpdateConfig = true;  // 允许开发模式下检查更新

// 转发 autoUpdater 事件到渲染进程
function forwardUpdateStatus(data) {
  sendToRenderer('update-status', data);
}

// 整理更新说明：去掉 HTML 标签，并移除 GitHub 自动生成说明（generate_release_notes）
// 时无条件追加的 "**Full Changelog**: https://github.com/.../compare/v1.0.1...v1.1.0"
// 脚注，弹窗里只显示真正的内容。（仅作为兜底路径使用，见 prepareUpdateNotes）
function cleanReleaseNotes(notes) {
  return notes
    .replace(/<[^>]+>/g, '')
    .replace(/^[ \t]*\**Full Changelog\**[ \t]*[:：].*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 整理 Markdown 更新说明：只移除 Full Changelog 脚注并折叠多余空行，
// 保留 Markdown 语法（# 标题 / - 列表 / **加粗** 等），交给渲染进程的
// ReactMarkdown 排版。
function cleanMarkdownNotes(notes) {
  return notes
    .replace(/^[ \t]*\**Full Changelog\**[ \t]*[:：].*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 从 app-update.yml / dev-app-update.yml 读取 GitHub 仓库（与自动更新配置一致）
function getUpdateFeedRepo() {
  for (const f of ['app-update.yml', 'dev-app-update.yml']) {
    try {
      const raw = fs.readFileSync(path.join(__dirname, f), 'utf-8');
      const owner = /^owner\s*:\s*([^\s#]+)/m.exec(raw)?.[1];
      const repo = /^repo\s*:\s*([^\s#]+)/m.exec(raw)?.[1];
      if (owner && repo) return { owner, repo };
    } catch {}
  }
  return null;
}

// 从 GitHub API 拉取指定版本的原始 Markdown 更新说明（release.body）。
// electron-updater 的 GitHub provider 返回的是 Atom feed 里渲染好的 HTML，
// 剥掉标签后只剩纯文本，Markdown 结构全丢；这里直接取 body（原始 Markdown），
// 设置面板里的 ReactMarkdown 才能正常排版。失败时返回 null，由调用方兜底。
function fetchGitHubReleaseBody(version) {
  const repo = getUpdateFeedRepo();
  if (!repo || !version) return Promise.resolve(null);
  const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases`;
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Daily-Updater', Accept: 'application/vnd.github+json' },
      timeout: 8000,
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let raw = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > 5 * 1024 * 1024) req.destroy(); // 防异常超大响应
      });
      res.on('end', () => {
        try {
          const releases = JSON.parse(raw);
          const hit = releases.find(r =>
            !r.draft && !r.prerelease && (r.tag_name === `v${version}` || r.tag_name === version)
          );
          resolve(hit && typeof hit.body === 'string' && hit.body.trim() ? hit.body : null);
        } catch {
          resolve(null);
        }
      });
      res.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// 准备更新说明：优先取 GitHub 原始 Markdown；拿不到时退回 HTML 剥标签。
async function prepareUpdateNotes(info) {
  const notes = typeof info.releaseNotes === 'string'
    ? info.releaseNotes
    : (Array.isArray(info.releaseNotes)
      ? info.releaseNotes.map(n => (typeof n === 'string' ? n : n.note || n.label || '')).filter(Boolean).join('\n')
      : '');
  const md = await fetchGitHubReleaseBody(info.version);
  if (md) return cleanMarkdownNotes(md);
  return cleanReleaseNotes(notes);
}

autoUpdater.on('checking-for-update', () => {
  forwardUpdateStatus({ status: 'checking' });
});

autoUpdater.on('update-available', async (info) => {
  forwardUpdateStatus({
    status: 'available',
    version: info.version,
    releaseNotes: await prepareUpdateNotes(info),
    releaseDate: info.releaseDate,
  });
});

autoUpdater.on('update-not-available', (info) => {
  forwardUpdateStatus({ status: 'not-available', version: info.version });
});

autoUpdater.on('download-progress', (progress) => {
  forwardUpdateStatus({
    status: 'downloading',
    progress: Math.floor(progress.percent),
  });
});

autoUpdater.on('update-downloaded', (info) => {
  forwardUpdateStatus({
    status: 'downloaded',
    version: info.version,
    downloadedFile: info.downloadedFile,
  });
});

autoUpdater.on('error', (err) => {
  forwardUpdateStatus({ status: 'error', error: err.message || String(err) });
});

// ──── 查找空闲端口 ────
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

// ──── 强制清理后端进程（包括整个进程树）────
function cleanupServer() {
  if (!serverProcess) return;
  const pid = serverProcess.pid;
  if (!pid) return;

  try {
    if (process.platform === 'win32') {
      // /F 强制终止  /T 终止整个进程树（包括 tsx/node 子进程）
      execSync(`taskkill /PID ${pid} /F /T 2>nul`, { stdio: 'ignore' });
    } else {
      serverProcess.kill('SIGTERM');
      // 2 秒后如果还活着，强制 SIGKILL
      setTimeout(() => {
        try { process.kill(pid, 'SIGKILL'); } catch {}
      }, 2000);
    }
  } catch {
    // 进程可能已经退出
  }
}

function getLogPath() {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'server_debug.log');
  }
  return path.join(__dirname, 'server_debug.log');
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Daily - 私人日记",
    frame: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      webSecurity:false,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.on('maximize', () => mainWindow.webContents.send('window-state', 'maximized'));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-state', 'normal'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function setupIPC() {
  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window-close', () => mainWindow?.close());

  // 数据迁移 —— 打开文件夹选择对话框
  ipcMain.handle('select-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择数据存储目录',
      properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // 动态端口 —— 渲染进程通过 invoke 获取
  ipcMain.handle('get-server-port', () => serverPort);

  // ══════════════════════════════════════
  //  本地字体管理
  // ══════════════════════════════════════

  // 获取系统字体目录（跨平台回退方案）
  function getSystemFontsDir() {
    if (process.platform === 'win32') return 'C:\\Windows\\Fonts';
    if (process.platform === 'darwin') return '/System/Library/Fonts';
    return '/usr/share/fonts';
  }

  // 从文件名提取可读名称（回退方案）
  function fontNameFromFile(fileName) {
    const base = path.basename(fileName, path.extname(fileName));
    return base
      .replace(/[-_](Regular|Bold|Italic|BoldItalic|Light|Medium|Thin|Heavy|Black|Semibold|Normal|Oblique)$/i, '')
      .replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // 列出系统已安装字体
  ipcMain.handle('list-system-fonts', async () => {
    try {
      if (process.platform === 'win32') {
        // 先尝试 PowerShell（获取所有已安装字体真实名称，含 .ttc）
        try {
          // 将脚本写入临时文件，避免命令行转义问题
          const tmpFile = path.join(app.getPath('temp'), 'daily_list_fonts.ps1');
          // PowerShell 脚本：获取系统字体列表，每行一个字体名
          const psScript = [
            '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
            'Add-Type -AssemblyName System.Drawing',
            '$families = [System.Drawing.Text.InstalledFontCollection]::new().Families',
            'foreach ($f in $families) { Write-Output $f.Name }',
          ].join('\n');
          await fs.promises.writeFile(tmpFile, psScript, 'utf-8');

          const result = execSync(
            `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`,
            { encoding: 'utf-8', timeout: 20000, windowsHide: true }
          );

          // 清理临时文件
          try { await fs.promises.unlink(tmpFile); } catch {}

          const trimmed = result.trim();
          if (!trimmed) throw new Error('PowerShell returned empty output');

          // 每行一个字体名，过滤空行
          const nameList = trimmed.split(/[\r\n]+/).filter(Boolean);

          const fonts = [];
          for (var k = 0; k < nameList.length; k++) {
            var rawName = String(nameList[k]).trim();
            if (rawName) {
              fonts.push({ name: rawName, family: rawName, fileName: '', path: '', source: 'system' });
            }
          }
          fonts.sort(function(a, b) { return a.name.localeCompare(b.name, 'zh-Hans-CN', { sensitivity: 'base' }); });
          return { fonts, source: 'powershell' };
        } catch (psErr) {
          // PowerShell 失败 → 回退到目录扫描
          console.log('PowerShell font listing failed, falling back to directory scan:', psErr.message);
        }
      }

      // 非 Windows：回退到目录扫描
      const fontsDir = getSystemFontsDir();
      if (!fs.existsSync(fontsDir)) {
        return { fonts: [], error: `目录不存在: ${fontsDir}` };
      }
      const entries = await fs.promises.readdir(fontsDir, { withFileTypes: true });
      const fonts = [];
      for (const entry of entries) {
        if (entry.isDirectory()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (ext !== '.ttf' && ext !== '.otf') continue;
        const name = fontNameFromFile(entry.name);
        fonts.push({ name, family: name, fileName: entry.name, path: path.join(fontsDir, entry.name), source: 'system' });
      }
      fonts.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { sensitivity: 'base' }));
      return { fonts, source: 'directory' };
    } catch (err) {
      return { fonts: [], error: err.message || String(err) };
    }
  });

  // 打开文件选择器导入字体文件（返回 base64 data URL）
  ipcMain.handle('pick-font-file', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择字体文件',
      filters: [{ name: '字体文件', extensions: ['ttf', 'otf', 'woff2', 'woff'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);
    try {
      const buf = await fs.promises.readFile(filePath);
      const base64 = buf.toString('base64');
      const ext = path.extname(fileName).toLowerCase();
      const mimeMap = { '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.woff': 'font/woff' };
      return {
        name: fontNameFromFile(fileName),
        family: fontNameFromFile(fileName),
        fileName,
        dataUrl: `data:${mimeMap[ext] || 'font/ttf'};base64,${base64}`,
        size: buf.length,
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ══════════════════════════════════════
  //  版本更新 IPC
  // ══════════════════════════════════════

  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('check-for-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      const info = result?.updateInfo;
      return {
        updateAvailable: true,
        version: info.version,
        releaseNotes: await prepareUpdateNotes(info),
        releaseDate: info.releaseDate,
      };
    } catch (err) {
      // checkForUpdates throws when no update is available
      return { updateAvailable: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('start-download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall();
  });
}

async function startBackend() {
  const serverPath = path.join(__dirname, 'dist', 'server.cjs')
  const logPath = getLogPath();
  const isPackaged = app.isPackaged;

  // 查找空闲端口
  try {
    serverPort = await findFreePort();
  } catch (e) {
    serverPort = 3000; // 回退到默认端口
  }

  // 默认数据目录的父级（指针文件 datapath.json 存放于此）
  const defaultParent = app.isPackaged ? app.getPath('userData') : __dirname;
  const defaultDataPath = path.join(defaultParent, 'data');

  // 检查指针文件，支持迁移到自定义路径
  let dataPath = defaultDataPath;
  try {
    const pointerFile = path.join(defaultParent, 'datapath.json');
    if (fs.existsSync(pointerFile)) {
      const raw = fs.readFileSync(pointerFile, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.dataPath && typeof parsed.dataPath === 'string' && fs.existsSync(parsed.dataPath)) {
        dataPath = parsed.dataPath;
      }
    }
  } catch (e) {
    // 静默回退到默认路径
  }

  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    sendToRenderer('server-log', msg);
    try { fs.appendFileSync(logPath, line + '\n'); } catch (e) {}
  };

  const env = {
    ...process.env,
    PORT: String(serverPort),
    DATA_PATH: dataPath,
    DEFAULT_DATA_PARENT: defaultParent,
    NODE_ENV: isPackaged ? 'production' : 'development'
  };

  log(`Starting backend on port ${serverPort}...`);
  log(`Server file: ${serverPath} (exists: ${fs.existsSync(serverPath)})`);
  log(`Data path: ${dataPath}`);

  if (app.isPackaged) {
    // 生产环境：fork 打包后的 server.cjs
    if (!fs.existsSync(serverPath)) {
      log(`FATAL: server.cjs not found`);
      return;
    }
    serverProcess = fork(serverPath, [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });
  } else {
    // 开发环境：优先用 fork + 预编译的 server.cjs，更稳定
    // 若 dist/server.cjs 不存在，回退到 tsx 直接运行 TypeScript 源码
    if (fs.existsSync(serverPath)) {
      log(`Dev mode: using compiled server.cjs`);
      serverProcess = fork(serverPath, [], {
        env,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
      });
    } else {
      // 回退：直接用 node 调用 tsx CLI（避免依赖 npx PATH）
      const tsxCliPath = path.join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
      const tsxServerPath = path.join(__dirname, 'server.ts');
      log(`Dev mode: using tsx to run ${tsxServerPath}`);
      try {
        serverProcess = spawn(process.execPath, [tsxCliPath, tsxServerPath], {
          env,
          cwd: __dirname,
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } catch (e) {
        log(`FATAL: failed to start server: ${e.message}`);
        return;
      }
    }
  }

  serverProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    log(`[server] ${msg}`);
    // 检测服务器就绪标志
    if (msg.includes('Server is listening')) {
      sendToRenderer('server-ready');
    }
  });

  serverProcess.stderr.on('data', (data) => {
    log(`[server error] ${data.toString().trim()}`);
  });

  serverProcess.on('error', (err) => {
    log(`Server process error: ${err.message}`);
  });

  serverProcess.on('exit', (code, signal) => {
    log(`Server exited with code ${code} signal ${signal}`);
    serverProcess = null;
  });
}

// ──── 应用生命周期 ────
app.whenReady().then(async () => {
  setupIPC();
  await startBackend();
  setTimeout(createWindow, 1000);
});

// 窗口关闭时先清理后端进程
app.on('window-all-closed', () => {
  cleanupServer();
  if (process.platform !== 'darwin') app.quit();
});

// before-quit：确保在退出前清理
app.on('before-quit', () => {
  cleanupServer();
});

// quit：最后一道防线
app.on('quit', () => {
  cleanupServer();
});
