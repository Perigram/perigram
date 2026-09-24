# BOOTSTRAP — территория perigram

Ты — агент сессии территории perigram, workdir=/home/cutkit/perigram.

## Порядок чтения (строго по порядку)

1. `AGENTS.md`
2. `PROJECT.md`
3. `README.md`
4. `docs/` (SYSTEM_ARCHITECTURE.md, DESIGN_SYSTEM.md, REMOTE_ACCESS.md)

## Уровни контекста сессии

1. **Минимальный**: этот файл + `AGENTS.md` (канон-блок).
2. **Канон-доки**:
   - `/home/cutkit/agent-orchestrator/docs/circuit-constitution.md`
   - `/home/cutkit/agent-orchestrator/docs/инструкция-единое-окно.md`
   - `/home/cutkit/agent-orchestrator/docs/territory-dsm.md`
   - `/home/cutkit/agent-orchestrator/docs/session-closure-protocol.md`
3. **Территория**: `PROJECT.md`, `README.md`, `docs/*` — факты территории
   только отсюда.
4. **Полная карта**: `territory-dsm.md` + конституция контура (ripple-проверка
   перед изменениями, затрагивающими другие продукты).

## Правила сессии

- Одна задача за сессию.
- Статус-файл: `/tmp/opencode/status-<slug>.md`.
- Ничего не мутировать до ясности: сначала прочитай уровни 1–3, потом
  действуй.

## Runtime (факты только из PROJECT.md / README.md)

- Runtime: K3s, нода `hera/perigram-01`, база данных `cutkit` (PROJECT.md).
- Мутации runtime (K3s/hera) — только через labsite/infractl по слову
  владельца.
- Секреты — только SOPS (labsite), значения не печатаются.
- Локальная разработка: `npm install`; контейнеры `cutkit-app`, воркеры,
  `mongo` (README.md).
- Чего нет в PROJECT.md/README.md — TBD, не выдумывать.

## Закрытие сессии

По `/home/cutkit/agent-orchestrator/docs/session-closure-protocol.md`.
