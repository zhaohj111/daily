const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimize: () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  onWindowState: (callback) => {
    ipcRenderer.on('window-state', (_, state) => callback(state));
    return () => ipcRenderer.removeAllListeners('window-state');
  },
  // 服务器日志与就绪事件
  onServerLog: (callback) => {
    ipcRenderer.on('server-log', (_, msg) => callback(msg));
    return () => ipcRenderer.removeAllListeners('server-log');
  },
  onServerReady: (callback) => {
    ipcRenderer.on('server-ready', () => callback());
    return () => ipcRenderer.removeAllListeners('server-ready');
  },
  // 数据迁移 - 文件夹选择器
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  // 获取动态服务端口
  getServerPort: () => ipcRenderer.invoke('get-server-port')
});
