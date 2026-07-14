const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');

let mainWindow;
let serverProcess;

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
}

function startBackend() {
  const serverPath = path.join(__dirname, 'dist', 'server.cjs')
  const logPath = getLogPath();
  const isPackaged = app.isPackaged;

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

  log(`Starting backend...`);
  log(`Server file: ${serverPath} (exists: ${fs.existsSync(serverPath)})`);
  log(`Data path: ${dataPath}`);

  if (!fs.existsSync(serverPath)) {
    log(`FATAL: server.cjs not found`);
    return;
  }

  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      PORT: '3000',
      DATA_PATH: dataPath,
      DEFAULT_DATA_PARENT: defaultParent,
      NODE_ENV: isPackaged ? 'production' : 'development'
    },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  });

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
  });
}

app.whenReady().then(() => {
  setupIPC();
  startBackend();
  setTimeout(createWindow, 1000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  if (serverProcess) serverProcess.kill();
});