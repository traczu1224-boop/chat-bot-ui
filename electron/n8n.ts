import { app } from 'electron';
import * as os from 'node:os';
import type { AskResult, SendQuestionPayload } from './types.js';
import { WEBHOOK_TIMEOUT_MS } from './config.js';
import { getEffectiveSettings, getOrCreateDeviceId } from './storage.js';

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

type AskOptions = {
  signal?: AbortSignal;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const timeoutErrorMessage = 'Przekroczono czas oczekiwania na odpowiedź (timeout). Spróbuj ponownie lub zwiększ limit.';
const networkErrorMessage = 'Brak połączenia z siecią lub nie można połączyć z webhookiem.';

const getErrorCode = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const maybeError = error as { code?: unknown; cause?: unknown };
  if (typeof maybeError.code === 'string') {
    return maybeError.code;
  }
  if (maybeError.cause && typeof maybeError.cause === 'object') {
    const maybeCause = maybeError.cause as { code?: unknown };
    if (typeof maybeCause.code === 'string') {
      return maybeCause.code;
    }
  }
  return undefined;
};

const isTimeoutError = (error: unknown, reason: unknown) => {
  if (error instanceof Error && error.name === 'AbortError' && reason === 'timeout') {
    return true;
  }
  const code = getErrorCode(error);
  return code === 'ETIMEDOUT' || code === 'ECONNABORTED';
};

const isNetworkError = (error: unknown) => {
  const code = getErrorCode(error);
  return (
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH'
  );
};

export const askN8n = async (payload: SendQuestionPayload, options: AskOptions = {}): Promise<AskResult> => {
  const settings = getEffectiveSettings();
  const webhookUrl = settings.webhookUrl;

  if (!isValidWebhookUrl(webhookUrl)) {
    return {
      error: 'Nieprawidłowy URL webhooka. Ustaw poprawny adres w ustawieniach.'
    };
  }

  if (process.env.USE_MOCK === 'true') {
    console.info('[n8n] tryb mock aktywny');
    return {
      answer: 'To jest przykładowa odpowiedź z trybu mock. Możesz przetestować UI bez n8n.',
      sources: [
        {
          source: 'Dokumentacja firmowa',
          chunk: 1,
          score: 0.92,
          text: 'Przykładowy fragment źródła do podglądu w UI.'
        },
        {
          source: 'FAQ IT',
          chunk: 2,
          score: 0.87,
          text: 'Krótki opis źródła, które można otworzyć w przeglądarce.'
        }
      ]
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), WEBHOOK_TIMEOUT_MS);
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort('user'), { once: true });
  }
  let startedAt = Date.now();

  try {
    const token = settings.apiToken;
    const username = settings.username || os.userInfo().username;
    const deviceId = getOrCreateDeviceId();
    const retryDelays = [500, 1500];

    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      console.info('[n8n] wysyłanie zapytania', {
        attempt: attempt + 1,
        conversationId: payload.conversationId,
        hasToken: Boolean(token)
      });

      try {
        startedAt = Date.now();
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            message: payload.question,
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
          if (response.status === 401) {
            return {
              error: 'Błędny token API. Sprawdź wartość w ustawieniach aplikacji.'
            };
          }
          if (response.status >= 500 && attempt < retryDelays.length) {
            await sleep(retryDelays[attempt]);
            continue;
          }
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
          throw error;
        }
        if (attempt < retryDelays.length) {
          await sleep(retryDelays[attempt]);
          continue;
        }
        throw error;
      }
    }
    return {
      error: 'Nie udało się uzyskać odpowiedzi z webhooka. Spróbuj ponownie.'
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (controller.signal.reason === 'user') {
        return { error: 'Anulowano wysyłkę na żądanie użytkownika.' };
      }
      if (isTimeoutError(error, controller.signal.reason)) {
        return { error: timeoutErrorMessage };
      }
    }

    if (isTimeoutError(error, controller.signal.reason)) {
      return { error: timeoutErrorMessage };
    }

    if (isNetworkError(error)) {
      return { error: networkErrorMessage };
    }

    return {
      error: networkErrorMessage
    };
  } finally {
    clearTimeout(timeout);
    const durationMs = Date.now() - startedAt;
    const timedOut = controller.signal.aborted && controller.signal.reason === 'timeout';
    console.info('[n8n] zakończono zapytanie', { durationMs, timedOut });
  }
};
