# k8s prod (perigram-01 / hera): env source of truth

Прод perigram-app живёт в k3s (server perigram-01/hera `.248`, ns
`perigram`), развёрнут императивно — пайплайн в `.forgejo/workflows/`
качает только staging (poseidon, docker). Пока prod-деплой не в git,
этот файл — единственная запись желаемого env прод-деплоя.

Приложив env заново (после пересборки деплоя руками/CI):

```bash
kubectl -n perigram set env deploy/perigram-app \
  OLLAMA_BASE_URL=http://ollama-perigram.ai-worker.svc.cluster.local:11434 \
  CONFIG_BOT_CHAT_MODEL=qwen3:4b \
  CONFIG_BOT_EMBED_MODEL=bge-m3
```

Текущий полный env прод-деплоя (2026-09-25, live):

- `NUXT_MONGODB_URI` — Mongo на hera (секрет, значение в deploy-контуре)
- `BASE_URL` / `NUXT_PUBLIC_BASE_URL` — `https://perigram.sodalab.pro`
- `LIVEKIT_PUBLIC_URL` / `LIVEKIT_INTERNAL_URL` / `LIVEKIT_API_KEY` /
  `LIVEKIT_API_SECRET` — LiveKit на hera
- `OLLAMA_BASE_URL` — `http://ollama-perigram.ai-worker.svc.cluster.local:11434`
  (k8s-под ollama-perigram в ns ai-worker, inspur GPU1; раннее значение
  `http://192.168.0.251:11434` — host-сервис, параллельный путь на время
  наблюдения; история: 2026-09-22 императивный env был потерян деплоем —
  этот файл существует, чтобы это не повторилось)
- `CONFIG_BOT_CHAT_MODEL=qwen3:4b`, `CONFIG_BOT_EMBED_MODEL=bge-m3`

Проверка цепочки ConfigBot→Ollama (из пода, node fetch):

```js
fetch(process.env.OLLAMA_BASE_URL + "/api/tags").then(r => r.status) // 200
```
