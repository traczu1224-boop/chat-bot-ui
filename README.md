# Company Assistant

Desktopowa aplikacja Company Assistant (Electron + TypeScript + React + Vite).

## Konfiguracja webhooka i tokenu

1. Otwórz **Ustawienia** w aplikacji.
2. Wpisz **Webhook URL** (musi zaczynać się od `http://` lub `https://`).
3. (Opcjonalnie) Wpisz **API Token** – jeśli pole jest puste, nagłówek `Authorization` nie będzie wysyłany.
4. (Opcjonalnie) Uzupełnij **Nazwa użytkownika**.
5. Zapisz ustawienia – zostaną trwale zapisane lokalnie.

## Tryb developerski (Vite + Electron)

```bash
npm install
npm run dev
```

## Build (renderer + main/preload)

```bash
npm run build
```

## Instalator (Windows / macOS / Linux)

```bash
npm run dist
```

Wynikowe artefakty znajdziesz w katalogu `release/`.

## USE_MOCK=true (bez n8n)

```bash
USE_MOCK=true npm run dev
```

W trybie mock aplikacja zwraca przykładową odpowiedź i źródła, bez wykonywania zapytań HTTP.
