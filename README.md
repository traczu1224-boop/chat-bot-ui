# Company Assistant

Desktopowa aplikacja Company Assistant (Electron + TypeScript + React + Vite).

## Uruchomienie krok po kroku (dla początkujących)

Poniższa instrukcja prowadzi od zera do działającej aplikacji. Zakładam, że nie masz doświadczenia z Node/Electron.

### 1) Zainstaluj Node.js (jednorazowo)

1. Wejdź na stronę: https://nodejs.org
2. Pobierz wersję **LTS** i zainstaluj.
3. Po instalacji uruchom terminal i sprawdź:

```bash
node -v
npm -v
```

Jeśli widzisz numery wersji, instalacja jest OK.

### 2) Pobierz projekt i wejdź do folderu

Jeśli projekt masz już lokalnie, przejdź do jego katalogu. W naszym przypadku:

```bash
cd /workspace/chat-bot-ui
```

### 3) Zainstaluj zależności (pierwszy raz)

```bash
npm install
```

To może potrwać chwilę. Zainstaluje wszystkie biblioteki potrzebne do uruchomienia aplikacji.

### 4) Uruchom aplikację w trybie deweloperskim

```bash
npm run dev
```

Po chwili powinno pojawić się okno aplikacji.

### 5) Ustaw webhook w aplikacji

1. Kliknij **Ustawienia**.
2. Wpisz **Webhook URL** (musi zaczynać się od `http://` lub `https://`).
3. (Opcjonalnie) Uzupełnij **Token** i **Nazwa użytkownika**.
4. Kliknij **Zapisz**.

### 6) Tryb mock (jeśli nie masz n8n)

Jeśli chcesz przetestować aplikację bez prawdziwego webhooka:

```bash
USE_MOCK=true npm run dev
```

W trybie mock aplikacja zwraca przykładową odpowiedź i źródła, bez wykonywania zapytań HTTP.

## Build (renderer + main/preload)

```bash
npm run build
```

## Instalator (Windows NSIS / macOS / Linux)

```bash
npm run dist
```

Wynikowe artefakty znajdziesz w katalogu `release/`.
