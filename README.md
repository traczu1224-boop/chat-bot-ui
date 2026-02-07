# Company Assistant

Desktopowa aplikacja Company Assistant (Electron + TypeScript + React + Vite).

## Konfiguracja webhooka i tokenu

1. Uruchom aplikację.
2. Kliknij **Ustawienia**.
3. Wprowadź **Webhook URL** (musi zaczynać się od `http://` lub `https://`).
4. (Opcjonalnie) Ustaw **Token** oraz **Nazwa użytkownika**.
5. Zapisz ustawienia.

## Tryb mock bez n8n

Aby uruchomić aplikację bez n8n:

```bash
USE_MOCK=true npm run dev
```

Tryb mock zwróci przykładową odpowiedź i źródła bez wykonywania HTTP.

## Uruchomienie w trybie deweloperskim

```bash
npm install
npm run dev
```

## Build (renderer + main/preload)

```bash
npm run build
```

## Instalator (Windows NSIS / macOS / Linux)

```bash
npm run dist
```

Wynikowe artefakty znajdziesz w katalogu `release/`.
