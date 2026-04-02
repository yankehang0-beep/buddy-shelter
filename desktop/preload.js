'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddyBridge', {
  onBuddyData:    (cb) => ipcRenderer.on('buddy-data',    (_e, payload) => cb(payload)),
  onSetMode:      (cb) => ipcRenderer.on('set-mode',      (_e, mode)    => cb(mode)),
  onIdleMessage:  (cb) => ipcRenderer.on('idle-message',  (_e, text)    => cb(text)),
  sendChat:       (msg) => ipcRenderer.invoke('chat-send', msg),
  getMirrorPort:  ()    => ipcRenderer.invoke('get-mirror-port'),
});
