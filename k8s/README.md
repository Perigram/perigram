# COMPONENT: Production Cluster (k8s)

Cluster state for the hera production environment. `deploy/` owns
deployables (the staging pipeline and its images); this file owns the
prod cluster's desired state.

Parent: [root README](../README.md).

## Layout

The production `perigram-app` runs in k3s (server `perigram-01`/hera
`192.168.0.248`, namespace `perigram`), deployed imperatively. The
Forgejo pipeline deploys staging only (poseidon, docker), so this file
is the single record of the prod deploy's desired env.

## Environment

Re-apply the env after rebuilding the deploy by hand or CI:

```bash
kubectl -n perigram set env deploy/perigram-app \
  OLLAMA_BASE_URL=http://ollama-perigram.ai-worker.svc.cluster.local:11434 \
  CONFIG_BOT_CHAT_MODEL=qwen3:4b \
  CONFIG_BOT_EMBED_MODEL=bge-m3
```

Full env of the prod deploy:

- `NUXT_MONGODB_URI` — Mongo on hera (secret; value lives in the deploy
  context)
- `BASE_URL` / `NUXT_PUBLIC_BASE_URL` — `https://perigram.sodalab.pro`
- `LIVEKIT_PUBLIC_URL` / `LIVEKIT_INTERNAL_URL` / `LIVEKIT_API_KEY` /
  `LIVEKIT_API_SECRET` — LiveKit on hera
- `OLLAMA_BASE_URL` —
  `http://ollama-perigram.ai-worker.svc.cluster.local:11434`
  (k8s pod `ollama-perigram` in ns `ai-worker`, inspur GPU1)
- `CONFIG_BOT_CHAT_MODEL=qwen3:4b`, `CONFIG_BOT_EMBED_MODEL=bge-m3`

An imperative redeploy can drop the applied env; re-apply from this
list before handing traffic back.

## ConfigBot → Ollama health check

From a pod (node fetch):

```js
fetch(process.env.OLLAMA_BASE_URL + "/api/tags").then(r => r.status) // 200
```
