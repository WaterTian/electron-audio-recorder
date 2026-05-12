'use strict';

const { app, BrowserWindow, ipcMain, protocol, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { pathToFileURL } = require('url');

const RECORDINGS_DIR = path.join(app.getPath('userData'), 'recordings');
const INDEX_PATH = path.join(RECORDINGS_DIR, 'recordings.json');

function ensureDir() {
  if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  }
}

async function readIndex() {
  ensureDir();
  try {
    const raw = await fsp.readFile(INDEX_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    console.error('readIndex error:', err);
    return [];
  }
}

async function writeIndex(entries) {
  ensureDir();
  const tmp = INDEX_PATH + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(entries, null, 2), 'utf8');
  await fsp.rename(tmp, INDEX_PATH);
}

function timestampFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const Y = date.getFullYear();
  const M = pad(date.getMonth() + 1);
  const D = pad(date.getDate());
  const h = pad(date.getHours());
  const m = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `recording-${Y}-${M}-${D}T${h}-${m}-${s}.webm`;
}

function safeFilenameValidator(name) {
  return /^recording-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d+)?\.webm$/.test(name);
}

function uniqueFilename(base) {
  let candidate = base;
  let i = 1;
  while (fs.existsSync(path.join(RECORDINGS_DIR, candidate))) {
    candidate = base.replace(/\.webm$/, `-${i}.webm`);
    i += 1;
  }
  return candidate;
}

// ---------- IPC handlers ----------

ipcMain.handle('recordings:save', async (_evt, { buffer, durationMs }) => {
  ensureDir();
  if (!buffer || !(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer))) {
    throw new Error('Invalid buffer');
  }
  const data = Buffer.from(buffer);
  const createdAt = new Date();
  const baseName = timestampFilename(createdAt);
  const filename = uniqueFilename(baseName);
  const fullPath = path.join(RECORDINGS_DIR, filename);
  await fsp.writeFile(fullPath, data);
  const stat = await fsp.stat(fullPath);

  const entry = {
    filename,
    durationMs: Number(durationMs) || 0,
    sizeBytes: stat.size,
    createdAt: createdAt.toISOString(),
  };

  const index = await readIndex();
  index.push(entry);
  await writeIndex(index);
  return entry;
});

ipcMain.handle('recordings:list', async () => {
  const index = await readIndex();
  const valid = [];
  let dirty = false;
  for (const e of index) {
    if (fs.existsSync(path.join(RECORDINGS_DIR, e.filename))) {
      valid.push(e);
    } else {
      dirty = true;
    }
  }
  if (dirty) await writeIndex(valid);
  return valid.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
});

ipcMain.handle('recordings:delete', async (_evt, filename) => {
  if (typeof filename !== 'string' || !safeFilenameValidator(filename)) {
    throw new Error('Invalid filename');
  }
  const fullPath = path.join(RECORDINGS_DIR, filename);
  if (fs.existsSync(fullPath)) await fsp.unlink(fullPath);
  const index = await readIndex();
  const next = index.filter((e) => e.filename !== filename);
  await writeIndex(next);
  return true;
});

ipcMain.handle('recordings:reveal', async (_evt, filename) => {
  if (typeof filename !== 'string' || !safeFilenameValidator(filename)) {
    throw new Error('Invalid filename');
  }
  const fullPath = path.join(RECORDINGS_DIR, filename);
  if (fs.existsSync(fullPath)) {
    shell.showItemInFolder(fullPath);
    return true;
  }
  return false;
});

ipcMain.handle('recordings:dir', async () => RECORDINGS_DIR);

// ---------- custom protocol ----------

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'rec',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
    },
  },
]);

function registerRecProtocol() {
  protocol.handle('rec', (request) => {
    try {
      const url = new URL(request.url);
      const filename = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      if (!safeFilenameValidator(filename)) {
        return new Response('Forbidden', { status: 403 });
      }
      const fullPath = path.join(RECORDINGS_DIR, filename);
      if (!fs.existsSync(fullPath)) {
        return new Response('Not found', { status: 404 });
      }
      return net.fetch(pathToFileURL(fullPath).toString());
    } catch (err) {
      console.error('protocol handle error:', err);
      return new Response('Internal error', { status: 500 });
    }
  });
}

// ---------- window ----------

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 720,
    minHeight: 480,
    title: 'Electron Audio Recorder',
    backgroundColor: '#1c1c1e',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  ensureDir();
  registerRecProtocol();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
