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

export type SendQuestionPayload = {
  question: string;
  conversationId: string;
};

export type AskResult = {
  answer?: string;
  sources?: SourceItem[];
  error?: string | null;
};

export type ClientInfo = {
  app_version: string;
  platform: NodeJS.Platform;
};
