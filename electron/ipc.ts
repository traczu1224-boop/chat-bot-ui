import { app, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';
import type { ConversationPayload, Settings } from './types';
import { askN8n, isValidWebhookUrl } from './n8n';
import {
  conversationExists,
  formatConversationTxt,
  readConversation,
  writeConversation
} from './storageConversations';
import {
  getLastConversationId,
  getOrCreateDeviceId,
  getSettings,
  saveSettings,
  setLastConversationId
} from './storage';

const ensureConversation = async (conversationId: string): Promise<ConversationPayload> => {
  const messages = await readConversation(conversationId);
  await writeConversation(conversationId, messages);
  return { conversationId, messages };
};

export const registerIpcHandlers = () => {
  ipcMain.handle('settings:get', () => getSettings());

  ipcMain.handle('settings:save', (_event, settings: Settings) => {
    if (settings.webhookUrl && !isValidWebhookUrl(settings.webhookUrl)) {
      throw new Error('Webhook URL musi zaczynać się od http:// lub https://');
    }
    saveSettings(settings);
  });

  ipcMain.handle('device:getOrCreate', () => getOrCreateDeviceId());

  ipcMain.handle('conversation:loadLast', async () => {
    const lastConversationId = getLastConversationId();
    if (lastConversationId && (await conversationExists(lastConversationId))) {
      const messages = await readConversation(lastConversationId);
      return { conversationId: lastConversationId, messages };
    }

    const conversationId = uuidv4();
    setLastConversationId(conversationId);
    return ensureConversation(conversationId);
  });

  ipcMain.handle('conversation:new', async () => {
    const conversationId = uuidv4();
    setLastConversationId(conversationId);
    return ensureConversation(conversationId);
  });

  ipcMain.handle('conversation:load', async (_event, conversationId: string) => {
    const messages = await readConversation(conversationId);
    return { conversationId, messages };
  });

  ipcMain.handle('conversation:save', async (_event, payload: ConversationPayload) => {
    setLastConversationId(payload.conversationId);
    await writeConversation(payload.conversationId, payload.messages);
    return { saved: true };
  });

  ipcMain.handle('conversation:exportTxt', async (_event, conversationId: string) => {
    const messages = await readConversation(conversationId);
    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath: `conversation-${conversationId}.txt`,
      filters: [{ name: 'Text', extensions: ['txt'] }]
    });

    if (canceled || !filePath) {
      return { saved: false };
    }

    const output = formatConversationTxt(conversationId, messages);
    await fs.writeFile(filePath, output, 'utf-8');
    return { saved: true };
  });

  ipcMain.handle('n8n:ask', async (_event, payload: { question: string; conversationId: string }) =>
    askN8n(payload)
  );

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (!isValidWebhookUrl(url)) {
      throw new Error('Nieprawidłowy URL.');
    }
    await shell.openExternal(url);
  });

  ipcMain.handle('client:getInfo', () => ({
    app_version: app.getVersion(),
    platform: process.platform
  }));
};
