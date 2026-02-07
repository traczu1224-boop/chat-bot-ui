const DEFAULT_WEBHOOK_TIMEOUT_MS = 90000;

const envWebhookTimeout = Number.parseInt(process.env.N8N_WEBHOOK_TIMEOUT_MS ?? '', 10);

export const WEBHOOK_TIMEOUT_MS = Number.isFinite(envWebhookTimeout)
  ? envWebhookTimeout
  : DEFAULT_WEBHOOK_TIMEOUT_MS;
