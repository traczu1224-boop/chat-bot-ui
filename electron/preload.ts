import { contextBridge, ipcRenderer } from 'electron';
import type { ConversationMeta, ConversationPayload, Settings, SettingsState } from './types.js';

contextBridge.exposeInMainWorld('companyAssistant', {
  settings: {
    get: (): Promise<SettingsState> => ipcRenderer.invoke('settings:get'),
    save: (settings: Settings): Promise<Settings> => ipcRenderer.invoke('settings:save', settings)
  },
  device: {
    getOrCreate: (): Promise<string> => ipcRenderer.invoke('device:getOrCreate')
  },
  conversation: {
    loadLast: (): Promise<ConversationPayload> => ipcRenderer.invoke('conversation:loadLast'),
    load: (conversationId: string): Promise<ConversationPayload> =>
      ipcRenderer.invoke('conversation:load', conversationId),
    new: (): Promise<ConversationPayload> => ipcRenderer.invoke('conversation:new'),
    save: (payload: ConversationPayload): Promise<{ saved: boolean }> =>
      ipcRenderer.invoke('conversation:save', payload),
    exportTxt: (conversationId: string): Promise<{ saved: boolean }> =>
      ipcRenderer.invoke('conversation:exportTxt', conversationId),
    list: (): Promise<ConversationMeta[]> => ipcRenderer.invoke('conversation:list')
  },
  n8n: {
    ask: (payload: { question: string; conversationId: string; requestId: string }) =>
      ipcRenderer.invoke('n8n:ask', payload),
    cancel: (requestId: string) => ipcRenderer.invoke('n8n:cancel', requestId)
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
  },
  client: {
    getInfo: () => ipcRenderer.invoke('client:getInfo')
  },
  diagnostics: {
    export: () => ipcRenderer.invoke('diagnostics:export')
  }
});
