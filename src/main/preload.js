'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('recorderAPI', {
  /**
   * Save a recording.
   * @param {ArrayBuffer} buffer
   * @param {number} durationMs
   */
  save: (buffer, durationMs) =>
    ipcRenderer.invoke('recordings:save', { buffer, durationMs }),

  list: () => ipcRenderer.invoke('recordings:list'),

  delete: (filename) => ipcRenderer.invoke('recordings:delete', filename),

  reveal: (filename) => ipcRenderer.invoke('recordings:reveal', filename),

  dir: () => ipcRenderer.invoke('recordings:dir'),

  fileUrl: (filename) => `rec://recording/${encodeURIComponent(filename)}`,
});
