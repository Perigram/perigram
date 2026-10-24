# COMPONENT: Web Search

Web search is a capability module: one neutral search over the
organization's configured public-web search provider, consumed by the
agent tool catalog's `web_search`
([agent bots](../agent-bots/README.md)). It owns no collection —
provider configuration lives in the organization's settings, mirroring
[transcription](../transcription/README.md).

## Providers

| Provider | Endpoint | Wire shape |
|---|---|---|
| `searxng` | `{baseUrl}/search?q=…&format=json` | Self-hosted SearXNG metasearch with its JSON format enabled; no key. |
| `tavily` | `{baseUrl}/search` | Tavily cloud search API; `Authorization: Bearer` with the org's key, `{ query, max_results }`. |

`provider: 'none'` (the default) disables search everywhere. Outbound
requests ride the shared proxy-aware egress seam exported by
[llm](../llm/README.md) — cloud providers work behind the deployment's
proxy env; LAN SearXNG instances stay direct (`NO_PROXY` honored).

## Configuration Resolution

Organizations declare the provider at `data.settings.webSearch`
(writable through the standard organization settings seam):
`{ provider, baseUrl?, apiKey? }` — `baseUrl` is the SearXNG instance
address (or a Tavily base override); `apiKey` is the Tavily key. Keys
stay server-side: reads report `apiKeySet`, saves keep an omitted key and
clear on empty string (the llm settings law). The environment is the
unnamed default:

| Variable | Default | Meaning |
|---|---|---|
| `WEB_SEARCH_PROVIDER` | `none` | Provider when the org sets none (`searxng`, `tavily`). |
| `WEB_SEARCH_SEARXNG_BASE_URL` | — | SearXNG instance base; required for `searxng`. |
| `WEB_SEARCH_TAVILY_BASE_URL` | `https://api.tavily.com` | Tavily base override. |
| `WEB_SEARCH_TAVILY_API_KEY` | — | Tavily key; required for `tavily`. |

A selected provider that cannot work resolves to `{ provider: 'none' }`
and every consumer treats search as unavailable: the agent tool catalog
omits `web_search` from its descriptors for such organizations (the
capability-availability law — an org without a provider offers no
search tool on any surface).

## Service Contract

- `resolveWebSearchConfig(organizationId)` → `{ provider, baseUrl?, apiKey? }`; `{ provider: 'none' }` when disabled or unusable.
- `isWebSearchAvailable(organizationId)` → boolean shorthand.
- `webSearch({ organizationId, query, maxResults })` → `{ provider, results: [{ title, url, snippet }] }` — results capped at ten, filtered to rows carrying a title or url. Throws 503 when unresolved, 502 when the endpoint is unreachable, answers non-2xx, or returns no JSON.
- `readWebSearchSettings(auth)` / `saveWebSearchSettings(auth, payload)` → the settings read/write behind `GET/PUT /api/web-search/settings` (gated by [organizations](../organizations/README.md) `readSettingsSection`/`updateSettingsSection`).
- `testWebSearch(auth)` → `{ ok, provider?, results?, reason? }` — one real search round for the models screen's connection test (`POST /api/web-search/test`).

## Related

- [Agent bots](../agent-bots/README.md) — the `web_search` tool over this seam
- [LLM](../llm/README.md) — the shared egress seam
- [Transcription](../transcription/README.md) — the capability-module provider pattern this mirrors
