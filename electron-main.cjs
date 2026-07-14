const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork, spawn, execSync } = require('child_process');
const net = require('net');

let mainWindow;
let serverProcess;
let serverPort = 0;

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
