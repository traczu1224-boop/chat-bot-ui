import { app, BrowserWindow, session } from 'electron';
import * as path from 'node:path';
import { registerIpcHandlers } from './ipc.js';
import { getOrCreateDeviceId } from './storage.js';
import { cleanupExpiredTrash } from './storageConversations.js';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist-electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isFile = url.startsWith('file://');
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    const isDevUrl = devUrl ? url.startsWith(devUrl) : false;
    if (!isFile && !isDevUrl) {
      event.preventDefault();
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(app.getAppPath(), 'dist/renderer/index.html'));
  }
};

app.whenReady().then(async () => {
  console.info('[main] uruchamianie aplikacji');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
    const csp = isDev
      ? [
          "default-src 'self'",
          `script-src 'self' ${devServerUrl} 'unsafe-eval' 'unsafe-inline'`,
          `style-src 'self' 'unsafe-inline' ${devServerUrl}`,
          "img-src 'self' data: blob:",
          `connect-src 'self' ${devServerUrl} ws://localhost:5173`,
          "frame-src 'none'"
        ]
      : [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "connect-src 'self'",
          "frame-src 'none'"
        ];

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp.join('; ')]
      }
    });
  });

  getOrCreateDeviceId();
  await cleanupExpiredTrash();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
