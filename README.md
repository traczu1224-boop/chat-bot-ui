# Company Assistant

Desktopowa aplikacja Company Assistant (Electron + TypeScript + React + Vite).

## Konfiguracja webhooka i tokenu

1. Otwórz **Ustawienia** w aplikacji.
2. Wpisz **Webhook URL** (musi zaczynać się od `http://` lub `https://`).
3. (Opcjonalnie) Wpisz **API Token** – jeśli pole jest puste, nagłówek `Authorization` nie będzie wysyłany.
4. (Opcjonalnie) Uzupełnij **Nazwa użytkownika**.
5. Zapisz ustawienia – zostaną trwale zapisane lokalnie.

> ⚠️ Token API jest przechowywany lokalnie w `electron-store`. Rozważ użycie mechanizmu systemowego (np. keychain) w środowiskach produkcyjnych.

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

## Zmienne środowiskowe

- `USE_MOCK=true` – uruchamia tryb mock bez wywołań HTTP.
- `COMPANY_ASSISTANT_WEBHOOK_URL` – wymusza webhook URL (UI jest tylko do odczytu).
- `SETTINGS_LOCKED=true` – blokuje edycję ustawień w aplikacji.

## USE_MOCK=true (bez n8n)

```bash
USE_MOCK=true npm run dev
```

W trybie mock aplikacja zwraca przykładową odpowiedź i źródła, bez wykonywania zapytań HTTP.
