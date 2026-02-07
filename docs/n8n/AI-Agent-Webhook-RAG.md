# AI Agent Webhook RAG (n8n + Qdrant + Ollama)

Poniżej masz instrukcję krok po kroku dla amatorów. Po jej wykonaniu aplikacja Chat Bot UI będzie rozmawiać z agentem AI przez webhook n8n, a odpowiedzi będą oparte o lokalny RAG w Qdrant.

## 1) Docker Compose – ustaw ENV w n8n

W sekcji `environment` serwisu `n8n` dopisz (lub zaktualizuj) te dwie zmienne:

```yaml
services:
  n8n:
    environment:
      - CHATBOT_UI_TOKEN=twoj-sekretny-token # opcjonalnie
      - REQUIRE_AUTH=false                   # domyślnie false
```

**Co to oznacza?**
- `CHATBOT_UI_TOKEN` – jeśli ustawisz, możesz w UI wpisać token i wtedy n8n będzie go weryfikować.
- `REQUIRE_AUTH=true` – w trybie produkcyjnym *wymusza* token. Bez poprawnego tokena dostaniesz 401.

> Po zmianie pliku `docker-compose.yml` zrób restart kontenerów: `docker compose up -d`.

## 2) Import workflow do n8n

1. Wejdź do n8n w przeglądarce: `http://localhost:5678/`.
2. Kliknij **Workflows** → **Import from File**.
3. Wybierz plik `docs/n8n/AI-Agent-Webhook-RAG.json` z tego repo.
4. Zapisz workflow i włącz go (toggle **Active**).

Workflow nazywa się **AI Agent Webhook RAG** i ma webhook **POST** pod ścieżką `/agent`.

## 3) (Opcjonalnie) Sprawdź połączenia do usług

Workflow komunikuje się po nazwach usług z docker-compose:
- Ollama: `http://ollama:11434`
- Qdrant: `http://qdrant:6333`

Jeśli masz inne nazwy lub porty, zmień je w node'ach workflow:
- **Ollama Embeddings**
- **Qdrant Search**
- **Ollama Generate**

## 4) Skonfiguruj Chat Bot UI

1. Uruchom aplikację.
2. Wejdź w **Ustawienia**.
3. W polu **Webhook URL** wpisz:
   ```
   http://localhost:5678/webhook/agent
   ```
4. Jeśli masz ustawiony `CHATBOT_UI_TOKEN`, wpisz go w polu **API Token**.
5. Zapisz ustawienia.

## 5) Co wysyła i co odbiera webhook

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

## 6) Jak przetestować (checklista)

1. **Uruchom kontenery**: `docker compose up -d`.
2. **Wejdź do n8n**: `http://localhost:5678/`.
3. **Upewnij się, że workflow jest aktywny**.
4. **Wyślij testowe zapytanie** z terminala:
   ```bash
   curl -X POST http://localhost:5678/webhook/agent \
     -H 'Content-Type: application/json' \
     -d '{"message":"Jak hotel powinien reagować na reklamację hałasu?"}'
   ```
   - Jeśli masz token, dodaj nagłówek:
     ```bash
     -H 'Authorization: Bearer TWOJ_TOKEN'
     ```
5. **Sprawdź odpowiedź** – powinna zawierać `answer` i tablicę `sources`.
6. **Otwórz Chat Bot UI**, wpisz webhook URL i wyślij wiadomość.
7. **Sprawdź w UI sekcję „Źródła”** pod odpowiedzią.

Gotowe! Jeśli widzisz odpowiedź i źródła, integracja działa end-to-end.
