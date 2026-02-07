import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: { webhookUrl: string; token: string; username: string }) =>
    ipcRenderer.invoke('settings:set', settings),
  loadLastConversation: () => ipcRenderer.invoke('conversation:loadLast'),
  newConversation: () => ipcRenderer.invoke('conversation:new'),
  sendMessage: (payload: { conversationId: string; content: string; tempId: string }) =>
    ipcRenderer.invoke('message:send', payload),
  exportConversation: (conversationId: string) =>
    ipcRenderer.invoke('conversation:export', conversationId),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getMockMode: () => ipcRenderer.invoke('app:mock')
});
