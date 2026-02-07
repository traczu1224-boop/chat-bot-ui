import { app, dialog, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import type { ConversationPayload, Settings } from './types.js';
import { askN8n, isValidWebhookUrl } from './n8n.js';
import {
  conversationExists,
  formatConversationTxt,
  readConversation,
  writeConversation
} from './storageConversations.js';
import {
  areSettingsLocked,
  getConversationIndex,
  getEffectiveSettings,
  getLastConversationId,
  getOrCreateDeviceId,
  getSettings,
  isWebhookLocked,
  saveSettings,
  setLastConversationId,
  upsertConversationIndex
} from './storage.js';
import { getConversationsDir, getConversationsStats } from './storageConversations.js';

const ensureConversation = async (conversationId: string): Promise<ConversationPayload> => {
  const messages = await readConversation(conversationId);
  await writeConversation(conversationId, messages);
  return { conversationId, messages };
};

const pendingRequests = new Map<string, AbortController>();

const deriveConversationTitle = (messages: ConversationPayload['messages']) => {
  const firstUser = messages.find((message) => message.role === 'user');
  if (!firstUser) {
    return 'Nowa rozmowa';
  }
  const words = firstUser.content.trim().split(/\s+/).slice(0, 8).join(' ');
  return words || 'Nowa rozmowa';
};

export const registerIpcHandlers = () => {
  ipcMain.handle('settings:get', () => ({
    settings: getEffectiveSettings(),
    locked: areSettingsLocked(),
    webhookLocked: isWebhookLocked()
  }));

  ipcMain.handle('settings:save', (_event, settings: Settings) => {
    if (areSettingsLocked()) {
      throw new Error('Ustawienia są zablokowane przez administratora.');
    }
    const webhookUrl = isWebhookLocked() ? getEffectiveSettings().webhookUrl : settings.webhookUrl;
    const nextSettings = isWebhookLocked() ? { ...settings, webhookUrl: getSettings().webhookUrl } : settings;
    if (webhookUrl && !isValidWebhookUrl(webhookUrl)) {
      throw new Error('Webhook URL musi zaczynać się od http:// lub https://');
    }
    saveSettings(nextSettings);
    return nextSettings;
  });

  ipcMain.handle('device:getOrCreate', () => getOrCreateDeviceId());

  ipcMain.handle('conversation:loadLast', async () => {
    const lastConversationId = getLastConversationId();
    if (lastConversationId && (await conversationExists(lastConversationId))) {
      const messages = await readConversation(lastConversationId);
      upsertConversationIndex({
        id: lastConversationId,
        title: deriveConversationTitle(messages),
        updatedAt: new Date().toISOString()
      });
      return { conversationId: lastConversationId, messages };
    }

    const conversationId = randomUUID();
    setLastConversationId(conversationId);
    const payload = await ensureConversation(conversationId);
    upsertConversationIndex({
      id: conversationId,
      title: deriveConversationTitle(payload.messages),
      updatedAt: new Date().toISOString()
    });
    return payload;
  });

  ipcMain.handle('conversation:new', async () => {
    const conversationId = randomUUID();
    setLastConversationId(conversationId);
    const payload = await ensureConversation(conversationId);
    upsertConversationIndex({
      id: conversationId,
      title: deriveConversationTitle(payload.messages),
      updatedAt: new Date().toISOString()
    });
    return payload;
  });

  ipcMain.handle('conversation:load', async (_event, conversationId: string) => {
    const messages = await readConversation(conversationId);
    setLastConversationId(conversationId);
    upsertConversationIndex({
      id: conversationId,
      title: deriveConversationTitle(messages),
      updatedAt: new Date().toISOString()
    });
    return { conversationId, messages };
  });

  ipcMain.handle('conversation:save', async (_event, payload: ConversationPayload) => {
    setLastConversationId(payload.conversationId);
    await writeConversation(payload.conversationId, payload.messages);
    upsertConversationIndex({
      id: payload.conversationId,
      title: deriveConversationTitle(payload.messages),
      updatedAt: new Date().toISOString()
    });
    return { saved: true };
  });

  ipcMain.handle('conversation:list', () => getConversationIndex());

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

  ipcMain.handle(
    'n8n:ask',
    async (_event, payload: { question: string; conversationId: string; requestId: string }) => {
      const controller = new AbortController();
      pendingRequests.set(payload.requestId, controller);
      try {
        return await askN8n(
          { question: payload.question, conversationId: payload.conversationId },
          { signal: controller.signal }
        );
      } finally {
        pendingRequests.delete(payload.requestId);
      }
    }
  );

  ipcMain.handle('n8n:cancel', (_event, requestId: string) => {
    const controller = pendingRequests.get(requestId);
    if (controller) {
      controller.abort('user');
      pendingRequests.delete(requestId);
    }
    return { canceled: Boolean(controller) };
  });

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (!isValidWebhookUrl(url)) {
      throw new Error('Nieprawidłowy URL.');
    }
    await shell.openExternal(url);
  });

  ipcMain.handle('client:getInfo', () => ({
    app_version: app.getVersion(),
    platform: process.platform,
    userDataPath: app.getPath('userData')
  }));

  ipcMain.handle('diagnostics:export', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath: `diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) {
      return { saved: false };
    }
    const conversationStats = await getConversationsStats();
    const payload = {
      app_version: app.getVersion(),
      platform: process.platform,
      userDataPath: app.getPath('userData'),
      conversationsDir: getConversationsDir(),
      conversationFiles: conversationStats.files,
      conversationsSizeBytes: conversationStats.totalSize
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { saved: true };
  });
};
