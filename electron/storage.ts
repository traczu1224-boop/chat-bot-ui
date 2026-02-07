import { randomUUID } from 'node:crypto';
import ElectronStore from 'electron-store';
import type { Settings } from './types.js';

export type ConversationMeta = {
  id: string;
  title: string;
  updatedAt: string;
  preview?: string | null;
};

type StoreSchema = {
  settings: Settings;
  deviceId: string;
  lastConversationId: string;
  conversationsIndex: ConversationMeta[];
};

const store = new ElectronStore<StoreSchema>({
  defaults: {
    settings: {
      webhookUrl: '',
      apiToken: '',
      username: '',
      theme: 'dark'
    },
    deviceId: '',
    lastConversationId: '',
    conversationsIndex: []
  }
});

const getWebhookOverride = () => process.env.COMPANY_ASSISTANT_WEBHOOK_URL;

export const getSettings = (): Settings => store.get('settings');

export const getEffectiveSettings = (): Settings => {
  const stored = store.get('settings');
  const webhookOverride = getWebhookOverride();
  if (webhookOverride) {
    return { ...stored, webhookUrl: webhookOverride };
  }
  return stored;
};

export const areSettingsLocked = () => process.env.SETTINGS_LOCKED === 'true';

export const isWebhookLocked = () => Boolean(getWebhookOverride());

export const saveSettings = (settings: Settings) => {
  store.set('settings', settings);
};

export const getOrCreateDeviceId = () => {
  const existing = store.get('deviceId');
  if (existing) {
    return existing;
  }
  const next = randomUUID();
  store.set('deviceId', next);
  return next;
};

export const getLastConversationId = () => store.get('lastConversationId');

export const setLastConversationId = (conversationId: string) => {
  store.set('lastConversationId', conversationId);
};

export const getConversationIndex = (): ConversationMeta[] => store.get('conversationsIndex');

export const setConversationIndex = (items: ConversationMeta[]) => {
  store.set('conversationsIndex', items);
};

export const upsertConversationIndex = (meta: ConversationMeta, limit = 10) => {
  const existing = getConversationIndex().filter((item) => item.id !== meta.id);
  const next = [meta, ...existing].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  store.set('conversationsIndex', next.slice(0, limit));
};

export const removeConversationIndex = (conversationId: string) => {
  const next = getConversationIndex().filter((item) => item.id !== conversationId);
  store.set('conversationsIndex', next);
};
