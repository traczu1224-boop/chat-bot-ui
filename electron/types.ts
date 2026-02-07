export type SourceItem = {
  source: string;
  chunk?: number | string | null;
  score?: number | null;
  text?: string | null;
};

export type MessageRole = 'user' | 'assistant';

export type Message = {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  sources?: SourceItem[];
  isError?: boolean;
  retryPayload?: {
    question: string;
    conversationId: string;
  };
};

export type ConversationPayload = {
  conversationId: string;
  messages: Message[];
};

export type Settings = {
  webhookUrl: string;
  apiToken: string;
  username: string;
  theme: 'dark' | 'light' | 'system';
};

export type SettingsState = {
  settings: Settings;
  locked: boolean;
  webhookLocked: boolean;
};

export type ConversationMeta = {
  id: string;
  title: string;
  updatedAt: string;
  preview?: string | null;
};

export type SendQuestionPayload = {
  question: string;
  conversationId: string;
};

export type AskResult = {
  answer?: string;
  sources?: SourceItem[];
  error?: string | null;
  errorType?: 'timeout' | 'network' | 'http' | 'canceled' | 'unknown';
  status?: number;
};

export type ClientInfo = {
  app_version: string;
  platform: NodeJS.Platform;
};

export type StorageInfo = {
  type: 'files' | 'sqlite' | 'unknown';
  path: string;
  exists: boolean;
  format?: string;
  exampleFiles?: string[];
};

export type DiagnosticsInfo = {
  appName: string;
  appVersion: string;
  build: string;
  author: string;
  platform: NodeJS.Platform;
  arch: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  storage: StorageInfo;
  conversationsCount?: number;
  conversationsSizeBytes?: number;
  webhookUrl?: string | null;
};
