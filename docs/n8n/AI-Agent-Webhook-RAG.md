# AI Agent Webhook RAG (n8n + Qdrant + Ollama)

Poniżej masz instrukcję krok po kroku dla amatorów. Po jej wykonaniu aplikacja Chat Bot UI będzie rozmawiać z agentem AI przez webhook n8n, a odpowiedzi będą oparte o lokalny RAG w Qdrant.

## 1) Docker Compose – ustaw ENV w n8n (CORS)

W sekcji `environment` serwisu `n8n` dopisz (lub zaktualizuj) poniższe zmienne, aby UI mogło robić `fetch` bez błędów CORS:

```yaml
services:
  n8n:
    environment:
      - N8N_CORS_ENABLED=true
      - N8N_CORS_ALLOW_ORIGIN=*
      - N8N_CORS_ALLOW_METHODS=GET,POST,OPTIONS
      - N8N_CORS_ALLOW_HEADERS=Content-Type,Authorization
```

> Po zmianie pliku `docker-compose.yml` zrób restart kontenerów: `docker compose up -d`.

## 2) Ustaw token w workflow (Community без Variables)

W Community Edition nie ma panelu **Variables**, więc token i flagę auth ustawiasz **bezpośrednio w IF node**:

1. Otwórz node **Authorized?**.
2. W polu z wyrażeniem ustaw:
   - `const requireAuth = true;`
   - `const token = '1234';`
3. Jeśli chcesz wyłączyć auth, ustaw `requireAuth = false`.

## 3) Import workflow do n8n

1. Wejdź do n8n w przeglądarce: `http://localhost:5678/`.
2. Kliknij **Workflows** → **Import from File**.
3. Wybierz plik `docs/n8n/AI-Agent-Webhook-RAG.json` z tego repo.
4. Zapisz workflow i włącz go (toggle **Active**).

Workflow nazywa się **AI Agent Webhook RAG** i ma webhook **POST** pod ścieżką `/agent`.

## 4) (Opcjonalnie) Sprawdź połączenia do usług

Workflow komunikuje się po nazwach usług z docker-compose:
- Ollama: `http://ollama:11434`
- Qdrant: `http://qdrant:6333`

Jeśli masz inne nazwy lub porty, zmień je w node'ach workflow:
- **Ollama Embeddings**
- **Qdrant Search**
- **Ollama Generate**

## 5) Skonfiguruj Chat Bot UI

1. Uruchom aplikację.
2. Wejdź w **Ustawienia**.
3. W polu **Webhook URL** wpisz:
   ```
   http://127.0.0.1:5678/webhook/agent
   ```
4. Jeśli auth jest włączony, wpisz token `1234` w polu **API Token**.
5. Zapisz ustawienia.

## 6) Co wysyła i co odbiera webhook

**Request (do n8n):**
```json
{
  "message": "Jak hotel powinien reagować na reklamację hałasu?"
}
```

**Response (z n8n):**
```json
{
  "answer": "...",
  "sources": [
    {
      "source": "procedury_hotelowe.pdf",
      "chunk": 3,
      "score": 0.8123,
      "text": "Fragment tekstu z dokumentu..."
    }
  ],
  "meta": {
    "topScore": 0.8123,
    "hits": 4
  }
}
```

## 7) Jak przetestować (checklista)

1. **Uruchom kontenery**: `docker compose up -d`.
2. **Wejdź do n8n**: `http://localhost:5678/`.
3. **Upewnij się, że workflow jest aktywny** (toggle **Active**).
4. **Upewnij się, że URL w UI to produkcyjny endpoint**: `http://127.0.0.1:5678/webhook/agent` (a nie `/webhook-test/agent`).
5. **Jeśli auth włączony**, ustaw w UI token `1234`.
6. **Wyślij testowe zapytanie** z terminala:
   ```bash
   curl -X POST http://127.0.0.1:5678/webhook/agent \
     -H 'Content-Type: application/json' \
     -d '{"message":"Jak hotel powinien reagować na reklamację hałasu?"}'
   ```
   - Jeśli masz token, dodaj nagłówek:
     ```bash
     -H 'Authorization: Bearer 1234'
     ```
7. **Sprawdź odpowiedź** – powinna zawierać `answer` i tablicę `sources`.
8. **Otwórz Chat Bot UI**, wpisz webhook URL i wyślij wiadomość.
9. **Sprawdź w UI sekcję „Źródła”** pod odpowiedzią.

## 8) Testy w Windows PowerShell (bez BOM + token)

1. **Zapisz JSON bez BOM (UTF-8 bez BOM)**:
   ```powershell
   $payload = '{\"message\":\"Jak hotel powinien reagować na reklamację hałasu?\"}'
   $path = \"$env:TEMP\\rag-request.json\"
   [System.IO.File]::WriteAllText($path, $payload, New-Object System.Text.UTF8Encoding($false))
   ```
2. **Wyślij request bez BOM**:
   ```powershell
   curl.exe -X POST http://127.0.0.1:5678/webhook/agent `
     -H \"Content-Type: application/json\" `
     --data-binary \"@$path\"
   ```
3. **Test z tokenem (REQUIRE_AUTH=true)**:
   ```powershell
   curl.exe -X POST http://127.0.0.1:5678/webhook/agent `
     -H \"Content-Type: application/json\" `
     -H \"Authorization: Bearer 1234\" `
     --data-binary \"@$path\"
   ```
4. **Test bez tokena (REQUIRE_AUTH=true)** – powinno zwrócić 401:
   ```powershell
   curl.exe -X POST http://127.0.0.1:5678/webhook/agent `
     -H \"Content-Type: application/json\" `
     --data-binary \"@$path\"
   ```

## 8) Testy w Windows PowerShell (bez BOM + token)

1. **Zapisz JSON bez BOM (UTF-8 bez BOM)**:
   ```powershell
   $payload = '{\"message\":\"Jak hotel powinien reagować na reklamację hałasu?\"}'
   $path = \"$env:TEMP\\rag-request.json\"
   [System.IO.File]::WriteAllText($path, $payload, New-Object System.Text.UTF8Encoding($false))
   ```
2. **Wyślij request bez BOM**:
   ```powershell
   curl.exe -X POST http://127.0.0.1:5678/webhook/agent `
     -H \"Content-Type: application/json\" `
     --data-binary \"@$path\"
   ```
3. **Test z tokenem (REQUIRE_AUTH=true)**:
   ```powershell
   curl.exe -X POST http://127.0.0.1:5678/webhook/agent `
     -H \"Content-Type: application/json\" `
     -H \"Authorization: Bearer TWOJ_TOKEN\" `
     --data-binary \"@$path\"
   ```
4. **Test bez tokena (REQUIRE_AUTH=true)** – powinno zwrócić 401:
   ```powershell
   curl.exe -X POST http://127.0.0.1:5678/webhook/agent `
     -H \"Content-Type: application/json\" `
     --data-binary \"@$path\"
   ```

Gotowe! Jeśli widzisz odpowiedź i źródła, integracja działa end-to-end.

## Dlaczego nie używać `process.env` + różnica `/webhook` vs `/webhook-test`

- **`process.env` nie działa w Code node** na n8n 2.6.3 Community, bo Code node działa w sandboxie bez dostępu do `process`. Dlatego auth jest realizowany bez `process.env`.  
- **`/webhook-test/agent`** działa tylko w trybie testowym edytora (gdy klikasz „Execute Workflow”), a **`/webhook/agent`** działa tylko gdy workflow jest **Active**. Chat Bot UI musi używać produkcyjnego `/webhook/agent`.
