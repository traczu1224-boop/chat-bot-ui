# AI Agent Webhook RAG (n8n + Qdrant + Ollama)

Poniżej masz instrukcję krok po kroku. Po jej wykonaniu aplikacja Chat Bot UI będzie rozmawiać z agentem AI przez webhook n8n, a odpowiedzi będą oparte o lokalny RAG w Qdrant.

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

## 2) Prosta autoryzacja po nagłówku Authorization (opcjonalna)

Workflow ma wbudowaną, prostą kontrolę dostępu:

- Jeśli **nie wyślesz** nagłówka `Authorization` → workflow przepuszcza zapytanie.
- Jeśli **wyślesz** nagłówek, to **musi** być dokładnie `Authorization: Bearer 1234` (po `trim()`), w innym wypadku dostaniesz `401 Unauthorized`.

Dzięki temu działa to również w n8n Community bez Variables/Environments.

## 3) Import workflow do n8n

1. Wejdź do n8n w przeglądarce: `http://localhost:5678/`.
2. Kliknij **Workflows** → **Import from File**.
3. Wybierz plik `docs/n8n/AI-Agent-Webhook-RAG.json` z tego repo.
4. Zapisz workflow i **opublikuj/aktywuj** go (zgodnie z Twoim UI).

Workflow nazywa się **AI Agent Webhook RAG** i ma webhook **POST** pod ścieżką `/agent`.

> **Uwaga:** Aplikacja **musi** używać `http://127.0.0.1:5678/webhook/agent`, a **nie** `/webhook-test/agent`. `webhook-test` działa wyłącznie w trybie „Execute workflow”.

## 4) (Opcjonalnie) Sprawdź połączenia do usług w Dockerze

Workflow komunikuje się po nazwach usług z docker-compose:
- Ollama: `http://ollama:11434`
- Qdrant: `http://qdrant:6333`

Jeśli masz inne nazwy lub porty, zmień je w node'ach workflow:
- **Ollama Embeddings**
- **Qdrant Search**
- **Ollama Generate**

Szybki test sieci z kontenera n8n:
```bash
docker exec -it n8n sh -lc "wget -qO- http://ollama:11434/api/tags"
docker exec -it n8n sh -lc "wget -qO- http://qdrant:6333/collections"
```

## 5) Skonfiguruj Chat Bot UI

1. Uruchom aplikację.
2. Wejdź w **Ustawienia**.
3. W polu **Webhook URL** wpisz:
   ```
   http://127.0.0.1:5678/webhook/agent
   ```
4. Jeśli masz ustawiony `CHATBOT_UI_TOKEN`, wpisz go w polu **API Token**.
5. Zapisz ustawienia.

> UI czasem wysyła `message`, a czasem `question`/`input`. Workflow obsługuje oba formaty.

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
3. **Upewnij się, że workflow jest opublikowany/aktywny**.
4. **Wyślij testowe zapytanie** z terminala:
   ```bash
   curl -X POST http://127.0.0.1:5678/webhook/agent \
     -H 'Content-Type: application/json' \
     -d '{"message":"Jak hotel powinien reagować na reklamację hałasu?"}'
   ```
   - Jeśli używasz tokena:
     ```bash
     -H 'Authorization: Bearer 1234'
     ```
5. **Sprawdź odpowiedź** – powinna zawierać `answer` i tablicę `sources`.
6. **Otwórz Chat Bot UI**, wpisz webhook URL i wyślij wiadomość.
7. **Sprawdź w UI sekcję „Źródła”** pod odpowiedzią.

## 8) Testy w Windows PowerShell (bez BOM + token)

1. **Zapisz JSON bez BOM (UTF-8 bez BOM)**:
   ```powershell
   [System.IO.File]::WriteAllText("request.json", '{"message":"Jak hotel powinien reagować na reklamację hałasu?"}', (New-Object System.Text.UTF8Encoding($false)))
   ```
2. **Wyślij request bez BOM**:
   ```powershell
   curl.exe -X POST http://127.0.0.1:5678/webhook/agent `
     -H "Content-Type: application/json" `
     --data-binary "@request.json"
   ```
3. **Test z tokenem**:
   ```powershell
   curl.exe -X POST http://127.0.0.1:5678/webhook/agent `
     -H "Content-Type: application/json" `
     -H "Authorization: Bearer 1234" `
     --data-binary "@request.json"
   ```
4. **Test z błędnym tokenem – powinno zwrócić 401**:
   ```powershell
   curl.exe -X POST http://127.0.0.1:5678/webhook/agent `
     -H "Content-Type: application/json" `
     -H "Authorization: Bearer WRONG" `
     --data-binary "@request.json"
   ```

## 9) Szybki test PowerShell z request.json

```powershell
curl.exe -i -X POST "http://127.0.0.1:5678/webhook/agent" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer 1234" `
  --data-binary "@request.json"
```

**Oczekiwane:** brak `Unauthorized`, workflow idzie do embeddings/qdrant/generate i zwraca `{answer,...}`.

## 10) Troubleshooting (najczęstsze problemy)

- **CORS / „Brak połączenia” w UI** → upewnij się, że masz ENV:
  `N8N_CORS_ENABLED=true`, `N8N_CORS_ALLOW_ORIGIN=*`, `N8N_CORS_ALLOW_METHODS=GET,POST,OPTIONS`, `N8N_CORS_ALLOW_HEADERS=Content-Type,Authorization`.
- **Używasz `/webhook-test`** → to działa tylko w trybie „Execute workflow”. Produkcyjny URL to **`/webhook/agent`**.
- **BOM w JSON (Windows)** → użyj zapisu bez BOM i `--data-binary` (sekcja 8).
- **Brak wyników z Qdrant** → przy `score_threshold=0.6` krótkie pytania typu „e/halo” mogą dać 0 hitów.
- **Kolekcja Qdrant nie istnieje lub jest pusta**:
  ```bash
  curl http://127.0.0.1:6333/collections
  curl http://127.0.0.1:6333/collections/hotel_rag
  ```
  Upewnij się, że `hotel_rag` zawiera punkty.
- **Niezgodny wymiar embeddingów** → kolekcja musi być tworzona pod wymiar modelu `nomic-embed-text`.
- **Brak połączenia z usługami w Dockerze** → sprawdź z kontenera n8n:
  ```bash
  docker exec -it n8n sh -lc "wget -qO- http://ollama:11434/api/tags"
  docker exec -it n8n sh -lc "wget -qO- http://qdrant:6333/collections"
  ```
- **Workflow nie odpowiada** → upewnij się, że jest **opublikowany/aktywny** i wywołujesz `/webhook/agent`.

Gotowe! Jeśli widzisz odpowiedź i źródła, integracja działa end-to-end.
