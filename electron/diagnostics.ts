import { app } from 'electron';
import { buildInfo } from './buildInfo.js';
import type { DiagnosticsInfo } from './types.js';
import { getEffectiveSettings } from './storage.js';
import { getConversationsStats, getStorageInfo } from './storageConversations.js';

const sensitiveQueryKeys = ['token', 'api_key', 'apikey', 'key', 'secret', 'password', 'auth', 'signature'];

const isSensitiveKey = (key: string) => sensitiveQueryKeys.some((entry) => key.toLowerCase().includes(entry));

const sanitizeWebhookUrl = (webhookUrl?: string) => {
  if (!webhookUrl) {
    return null;
  }

  try {
    const url = new URL(webhookUrl);
    if (url.username) {
      url.username = '****';
    }
    if (url.password) {
      url.password = '****';
    }
    url.searchParams.forEach((_value, key) => {
      if (isSensitiveKey(key)) {
        url.searchParams.set(key, '****');
      }
    });
    return url.toString();
  } catch {
    return webhookUrl
      .replace(/(Bearer\s+)[^\s]+/gi, '$1****')
      .replace(/([?&](?:token|api[_-]?key|key|secret|signature|auth|password)=)[^&]+/gi, '$1****');
  }
};

export const getDiagnosticsInfo = async (): Promise<DiagnosticsInfo> => {
  const settings = getEffectiveSettings();
  const [storageInfo, conversationStats] = await Promise.all([getStorageInfo(), getConversationsStats()]);

  return {
    appName: app.getName(),
    appVersion: app.getVersion(),
    build: buildInfo.commitSha || 'unknown',
    author: 'Michał Tracz',
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    storage: storageInfo,
    conversationsCount: conversationStats.files,
    conversationsSizeBytes: conversationStats.totalSize,
    webhookUrl: sanitizeWebhookUrl(settings.webhookUrl)
  };
};
