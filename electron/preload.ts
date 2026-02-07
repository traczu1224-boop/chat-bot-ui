import { contextBridge, ipcRenderer } from 'electron';
import type { ConversationPayload, Settings } from './types';

contextBridge.exposeInMainWorld('companyAssistant', {
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    save: (settings: Settings): Promise<void> => ipcRenderer.invoke('settings:save', settings)
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
      ipcRenderer.invoke('conversation:exportTxt', conversationId)
  },
  n8n: {
    ask: (payload: { question: string; conversationId: string }) =>
      ipcRenderer.invoke('n8n:ask', payload)
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
  },
  client: {
    getInfo: () => ipcRenderer.invoke('client:getInfo')
  }
});
