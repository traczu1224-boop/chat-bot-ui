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

export type Settings = {
  webhookUrl: string;
  token: string;
  username: string;
};

export type ConversationPayload = {
  conversationId: string;
  messages: Message[];
};
