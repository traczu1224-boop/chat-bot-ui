import type { ConversationPayload, Message, Settings, SourceItem } from './types';

declare global {
  interface Window {
    api: {
      getSettings: () => Promise<Settings>;
      saveSettings: (settings: Settings) => Promise<void>;
      loadLastConversation: () => Promise<ConversationPayload>;
      newConversation: () => Promise<ConversationPayload>;
      sendMessage: (payload: { conversationId: string; content: string; tempId: string }) => Promise<{
        userMessage: Message;
        assistantMessage: Message;
      }>;
      exportConversation: (conversationId: string) => Promise<{ saved: boolean }>;
      openExternal: (url: string) => Promise<void>;
      getAppInfo: () => Promise<{ version: string; platform: string; deviceId: string }>; 
      getMockMode: () => Promise<boolean>;
    };
  }
}

export {};
