# Company Assistant

Desktopowa aplikacja Company Assistant (Electron + TypeScript + React + Vite).

## Konfiguracja webhooka i tokenu

1. Otwórz **Ustawienia** w aplikacji.
2. Wpisz **Webhook URL** (musi zaczynać się od `http://` lub `https://`). Dla n8n używaj `http://127.0.0.1:5678/webhook/agent` (nie `/webhook-test/agent`).
3. (Opcjonalnie) Wpisz **API Token** – jeśli pole jest puste, nagłówek `Authorization` nie będzie wysyłany.
4. (Opcjonalnie) Uzupełnij **Nazwa użytkownika**.
5. (Opcjonalnie) Ustaw `N8N_WEBHOOK_TIMEOUT_MS` (np. `90000`) – kontroluje timeout klienta webhooka.
6. Zapisz ustawienia – zostaną trwale zapisane lokalnie.

> ⚠️ Token API jest przechowywany lokalnie w `electron-store`. Rozważ użycie mechanizmu systemowego (np. keychain) w środowiskach produkcyjnych.

## Webhook test vs production

- **Test URL (tylko w trybie Execute workflow w edytorze n8n):**
  `http://127.0.0.1:5678/webhook-test/agent`
- **Production URL (działa tylko, gdy workflow jest ACTIVE):**
  `http://127.0.0.1:5678/webhook/agent`

Jeśli widzisz w UI komunikat o braku połączenia, upewnij się, że workflow jest **aktywowany** w n8n i korzystasz z **produkcyjnego** URL. Produkcyjny webhook nie zadziała, gdy workflow jest wyłączony.

## Timeout klienta

Wykonanie workflow może trwać ~40s. Upewnij się, że klient ma timeout ustawiony na **co najmniej 60–90s**, aby uniknąć błędów połączenia.

## IF outputs w n8n (ważne)

W node'ach typu **IF**: `output[0] = TRUE`, `output[1] = FALSE`. To łatwo pomylić przy łączeniu ścieżek.

## Przykładowe testy (PowerShell)

1. Zapis request JSON bez BOM:
   ```powershell
   [System.IO.File]::WriteAllText("request.json", '{"message":"Jak hotel powinien reagować na reklamację hałasu?"}', (New-Object System.Text.UTF8Encoding($false)))
   ```
2. Wyślij request z tokenem:
   ```powershell
   curl.exe -X POST http://127.0.0.1:5678/webhook/agent `
     -H "Content-Type: application/json" `
     -H "Authorization: Bearer 1234" `
     --data-binary "@request.json"
   ```

> W trybie produkcyjnym `/webhook/agent` działa tylko, gdy workflow jest **ACTIVE**.

## Tryb developerski (Vite + Electron)

```bash
npm install
npm run dev
```

### Tryb mock (bez n8n)

```bash
USE_MOCK=true npm run dev
```

W trybie mock aplikacja zwraca przykładową odpowiedź i źródła, bez wykonywania zapytań HTTP.

## Build (renderer + main/preload)

```bash
npm run build
```

## Instalator (Windows / macOS / Linux)

```bash
npm run dist
```

Wynikowe artefakty znajdziesz w katalogu `release/`.

## Dane aplikacji

Konwersacje są zapisywane w katalogu:

- `userData/conversations` (np. `~/Library/Application Support/Company Assistant/conversations` na macOS).

Usuwanie rozmowy przenosi jej plik do `userData/conversations/.trash` i przez 10 sekund pozwala cofnąć operację. Po tym czasie dane są trwale kasowane.

## Zmienne środowiskowe

- `USE_MOCK=true` – uruchamia tryb mock bez wywołań HTTP.
- `COMPANY_ASSISTANT_WEBHOOK_URL` – wymusza webhook URL (UI jest tylko do odczytu).
- `SETTINGS_LOCKED=true` – blokuje edycję ustawień w aplikacji.
- `N8N_WEBHOOK_TIMEOUT_MS=90000` – kontroluje timeout klienta webhooka.

## USE_MOCK=true (bez n8n)

```bash
USE_MOCK=true npm run dev
```

W trybie mock aplikacja zwraca przykładową odpowiedź i źródła, bez wykonywania zapytań HTTP.
