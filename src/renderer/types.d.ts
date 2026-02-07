import type { AskResult, ClientInfo, ConversationPayload, Settings } from './types';

declare global {
  interface Window {
    companyAssistant: {
      settings: {
        get: () => Promise<Settings>;
        save: (settings: Settings) => Promise<void>;
      };
      device: {
        getOrCreate: () => Promise<string>;
      };
      conversation: {
        loadLast: () => Promise<ConversationPayload>;
        load: (conversationId: string) => Promise<ConversationPayload>;
        new: () => Promise<ConversationPayload>;
        save: (payload: ConversationPayload) => Promise<{ saved: boolean }>;
        exportTxt: (conversationId: string) => Promise<{ saved: boolean }>;
      };
      n8n: {
        ask: (payload: { question: string; conversationId: string }) => Promise<AskResult>;
      };
      shell: {
        openExternal: (url: string) => Promise<void>;
      };
      client: {
        getInfo: () => Promise<ClientInfo>;
      };
    };
  }
}

export {};
