const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_TITLE = 'Пепельный Легион: Душа Павшего';
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 450,
    useContentSize: true,
    center: true,
    show: false,
    title: APP_TITLE,
    backgroundColor: '#050409',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-changed', false);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Keep the game a sealed desktop app: no in-app navigation or pop-ups.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  setupCapture(mainWindow);
}

/** Небольшой QA-режим: LEGION_CAPTURE=/path/out.png npm start */
function setupCapture(win) {
  const target = process.env.LEGION_CAPTURE;
  if (!target) return;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[console:${level}] ${message} (${sourceId}:${line})`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[render-process-gone]', details);
  });
  win.webContents.once('did-finish-load', async () => {
    try {
      await wait(Number(process.env.LEGION_CAPTURE_DELAY || 1600));
      const script = process.env.LEGION_CAPTURE_SCRIPT;
      if (script) {
        const value = await win.webContents.executeJavaScript(script, true);
        if (value !== undefined) console.log('[script]', value);
        await wait(Number(process.env.LEGION_CAPTURE_AFTER || 700));
      }
      const image = await win.webContents.capturePage();
      fs.writeFileSync(target, image.toPNG());
      console.log(`[capture] ${target}`);
    } catch (error) {
      console.error('[capture] failed', error);
    } finally {
      app.quit();
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    app.setName(APP_TITLE);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

ipcMain.handle('window:is-fullscreen', () => Boolean(mainWindow?.isFullScreen()));
ipcMain.handle('window:toggle-fullscreen', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});
ipcMain.handle('window:set-fullscreen', (_event, value) => {
  if (!mainWindow) return false;
  mainWindow.setFullScreen(Boolean(value));
  return Boolean(value);
});
ipcMain.handle('app:quit', () => {
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
