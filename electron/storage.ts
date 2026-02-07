import Store from 'electron-store';
import { v4 as uuidv4 } from 'uuid';
import type { Settings } from './types';

type StoreSchema = {
  settings: Settings;
  deviceId: string;
  lastConversationId: string;
};

const store = new Store<StoreSchema>({
  defaults: {
    settings: {
      webhookUrl: '',
      apiToken: '',
      username: '',
      theme: 'dark'
    },
    deviceId: '',
    lastConversationId: ''
  }
});

export const getSettings = (): Settings => store.get('settings');

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
