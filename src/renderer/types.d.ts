import type {
  AskResult,
  ClientInfo,
  ConversationMeta,
  ConversationPayload,
  DiagnosticsInfo,
  Settings,
  SettingsState
} from './types';

declare global {
  interface Window {
    companyAssistant: {
      settings: {
        get: () => Promise<SettingsState>;
        save: (settings: Settings) => Promise<Settings>;
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
        list: () => Promise<ConversationMeta[]>;
        softDelete: (conversationId: string) => Promise<{ deleted: boolean }>;
        restore: (conversationId: string) => Promise<{ restored: boolean }>;
        delete: (conversationId: string) => Promise<{ deleted: boolean }>;
      };
      n8n: {
        ask: (payload: { question: string; conversationId: string; requestId: string }) => Promise<AskResult>;
        cancel: (requestId: string) => Promise<{ canceled: boolean }>;
      };
      shell: {
        openExternal: (url: string) => Promise<void>;
      };
      client: {
        getInfo: () => Promise<ClientInfo>;
      };
      diagnostics: {
        export: () => Promise<{ saved: boolean }>;
        getInfo: () => Promise<DiagnosticsInfo>;
      };
    };
  }
}

export {};
