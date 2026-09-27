# perigram — операционный журнал

Индекс записей. Формат записей соответствует `/home/cutkit/agent-orchestrator/docs/session-closure-protocol.md`
(знание → договорённость → действие → наблюдаемый результат → осмысление).
Закрытие каждой нетривиальной сессии дублируется строкой в
`/home/cutkit/Documents/cutkit-cortex/9_meta/session-close-log.md`.

---

## 2026-09-27 — OPS-SINK-001: заведён операционный журнал территории

**Знание:**
- Аудит соответствия 16 проектов каталога протоколу AOR-CLOSURE-PROTOCOL v2.1.0 (сессия Штаба 2026-09-27): perigram — 16 упоминаний в session-close-log (все из чужих/штабных записей и org-migration), локального feedback-sink не было.

**Договорённость:**
- Владелец утвердил план «Полный: A + B + C» (2026-09-27): завести недостающий feedback-sink. Scope — создание `docs/ops/daily-log.md` и первая запись; код, фронтенд и бэкенд не затрагиваются.

**Действие:**
- Создан этот файл (первая запись); docs-коммит в `staging` (прецедент docs-коммитов напрямую — cb654549; worktree-протокол AGENTS.md ссылается на упразднённую ветку `local` и направлен на кодовые сессии — отклонение раскрыто в записи закрытия).

**Наблюдаемый результат:**
- Файл существует и закоммичен; `node scripts/check-docs.js` — пройден; рабочее дерево чисто. Операционный статус: `repo_changed`.

**Осмысление и обратная связь:**
- Дальше итоги сессий территории резюмируются здесь, полная строка — в session-close-log. Хвост: AGENTS.md worktree-секция ссылается на несуществующую ветку `local` — кандидату на правку в следующей docs-сессии. Риск: журнал протухает без дисциплины — каждая нетривиальная сессия обязана оставлять запись.

**Операционный статус:** `repo_changed`
**Статус цикла:** `cycle_closed`

## 2026-09-27 — OPS-DEPLOY-001: публичный CI-деплой perigram.sodalab.pro

**Знание:**
- Хук staging не работал с 2026-09-19 (DEC-20260919-003): раннер и staging-хост poseidon `.230` исчезли, прогоны 31–34 падали на `npm ci` (ETIMEDOUT). Прод live на hera/perigram-01 (K3s, образ ebed7a78, отставал от staging HEAD). Координация Штаба (вечер 2026-09-27): раннер поднят на poseidon (метка deploy), egress — только LAN hiddify-релей `192.168.0.100:12334` (провайдер душит registry.npmjs.org; yandex-зеркало мертво). Live-факты сняты read-only: sqlite gitea.db (статусы прогонов/раннеров), конфиги nginx-края zeus (`/home/storage/nginx-mixed.conf`, общий у tls-front-443/tls-front/tls-portprobe), firewall poseidon (`[22,139,445]`, без 3001).

**Договорённость:**
- Штаб: чинить только staging-ветку и Dockerfile/deploy.yml; poseidon-раннер — зона Штаба; успех = job deploy зелёный + `perigram:staging` собран. Владелец: доступ «как было» (публичный URL), mongo/livekit — отдельные инстансы (позже снято); итоговое слово: «делай просто perigram.sodalab.pro» — публичное имя переключается с hera-прода на CI-деплой, hera остаётся датаплейном.

**Действие:**
- Dockerfile: `ENV NODE_OPTIONS=--dns-result-order=ipv4first` (run 35, не помог — подтверждён провайдерский блок), затем `ENV HTTP(S)_PROXY=…12334 + NO_PROXY` на слой npm ci (run 36 — зелёный). deploy.yml: env переведён на hera-датаплейн (mongo `192.168.0.248:27017/cutkit`, LiveKit URLs, BASE_URL) — коммиты d2cfc637, e7e968f0, d51c5f44. nginx zeus: блок `perigram.sodalab.pro` → `poseidon:3001` (флип, откат = строка), спящий блок staging.* без DNS. Firewall poseidon: +3001 декларативно (зеркало + источник R330, switch без ребута). forgejo-admin циклы токенов — чистые (owner-check evo, сирота отозвана). Эксперимент HTTP-01 на :80 откачен (mixed ssl-сокет nginx не лечится правками дефолта — задокументировано).

**Наблюдаемый результат:**
- `https://perigram.sodalab.pro` → 200, `/api/service/health` → `{"status":"ok"}` (живая база cutkit hera); run 38 (docs-пуш) перекатил публичное приложение — полный цикл push→деплой работает; hera-под жив на NodePort :30080; регрессий края нет (forgejo/netbird 200). Операционный статус: `verified_current_boot` (nginx reload + nixos switch без ребута, liveness проверена).

**Осмысление и обратная связь:**
- Пуш в staging теперь = redeploy публичного приложения: docs-коммиты тоже катят прод — помнить при правках доков. Хвосты: (1) Forgejo-секреты LIVEKIT_API_KEY/SECRET содержат ключи старого poseidon-staging и не совпадают с hera — видео-звонки не работают до вставки hera-значений (Settings → Actions → Secrets); (2) ConfigBot/Ollama на этом деплое отключён намеренно (прод-фича кластера); (3) серт-механика края: TLS терминирует perigram-серт на nginx (как раньше), имя прямое (grey) — при переводе зоны на CF-proxy сменить паттерн как у ntfy; (4) 19999 в R330-источнике не применён на живую poseidon (чужой дрейф Штаба, не тронут). Урок: pkill по паттерну совпадает с argv собственного шелла; кавычки через ssh — только файлом по stdin.

**Операционный статус:** `verified_current_boot`
**Статус цикла:** `cycle_closed`
