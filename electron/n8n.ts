import { app } from 'electron';
import os from 'node:os';
import type { AskResult, SendQuestionPayload } from './types';
import { getOrCreateDeviceId, getSettings } from './storage';

export const isValidWebhookUrl = (value: string) => {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const askN8n = async (payload: SendQuestionPayload): Promise<AskResult> => {
  const settings = getSettings();
  const webhookUrl = settings.webhookUrl;

  if (!isValidWebhookUrl(webhookUrl)) {
    return {
      error: 'Nieprawidłowy URL webhooka. Ustaw poprawny adres w ustawieniach.'
    };
  }

  if (process.env.USE_MOCK === 'true') {
    return {
      answer: 'To jest przykładowa odpowiedź z trybu mock. Możesz przetestować UI bez n8n.',
      sources: [
        {
          title: 'Dokumentacja firmowa',
          url: 'https://example.com/docs',
          snippet: 'Przykładowy fragment źródła do podglądu w UI.'
        },
        {
          title: 'FAQ IT',
          url: 'https://example.com/faq',
          snippet: 'Krótki opis źródła, które można otworzyć w przeglądarce.'
        }
      ]
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const token = settings.apiToken;
    const username = settings.username || os.userInfo().username;
    const deviceId = getOrCreateDeviceId();

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        question: payload.question,
        conversation_id: payload.conversationId,
        user: {
          username,
          device_id: deviceId
        },
        client: {
          app_version: app.getVersion(),
          platform: process.platform
        }
      }),
      signal: controller.signal
    });

    const data = (await response.json()) as {
      answer?: string;
      sources?: AskResult['sources'];
      error?: string | null;
    };

    if (!response.ok) {
      return {
        error: 'Serwer zwrócił błąd. Spróbuj ponownie później.'
      };
    }

    if (!data.answer || data.error) {
      return {
        error: data.error || 'Brak odpowiedzi z webhooka. Sprawdź konfigurację.',
        sources: data.sources ?? []
      };
    }

    return {
      answer: data.answer,
      sources: data.sources ?? []
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        error: 'Przekroczono limit czasu (30s). Spróbuj ponownie.'
      };
    }

    return {
      error: 'Brak połączenia z siecią lub nie można połączyć z webhookiem.'
    };
  } finally {
    clearTimeout(timeout);
  }
};
