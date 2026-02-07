import ElectronStore = require('electron-store');
import { v4 as uuidv4 } from 'uuid';
import type { Settings } from './types';

export type ConversationMeta = {
  id: string;
  title: string;
  updatedAt: string;
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
  const next = uuidv4();
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
