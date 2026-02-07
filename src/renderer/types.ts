export type SourceItem = {
  title: string;
  url?: string;
  snippet?: string;
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
};

export type ConversationPayload = {
  conversationId: string;
  messages: Message[];
};

export type AskResult = {
  answer?: string;
  sources?: SourceItem[];
  error?: string | null;
};

export type ClientInfo = {
  app_version: string;
  platform: string;
  userDataPath: string;
};
