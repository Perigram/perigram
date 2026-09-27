# Маяк проекта: perigram (CNC-продукт)

```yaml
project: perigram
context_version: 1.1.0
updated: 2026-09-25
owner: product-owner
classification: internal
git_remote: r330:/srv/forgejo/git/repositories/perigram/perigram.git
```

Канонический путь: `/home/cutkit/perigram`. Прежнее имя — cutkit-demo
(передан и зачищен с R240 2026-09-21; cutkit — часть perigram как CNC
module, владелец 2026-09-21).

## Назначение

Multi-tenant CNC-приложение и песочница извлечения фреймворка:
Nuxt/Nitro модульный монолит + MongoDB + worker-сервисы. Продуктовая
линия CutKit (кассеты/фасадный конвейер) живёт здесь.

## Источники истины

| Вопрос | Источник |
|---|---|
| Протокол репо (documentation-first) | `/home/cutkit/perigram/AGENTS.md` |
| Архитектура системы | `/home/cutkit/perigram/README.md` |
| Runtime (K3s, hera/perigram-01, БД cutkit) | `/home/cutkit/labsite` + `/home/cutkit/Documents/cutkit-cortex/9_meta/hardware-inventory.md` |
| Конституция контура | `/home/cutkit/agent-orchestrator/docs/circuit-constitution.md` |
| Единое окно (workdir по умолчанию, роль Штаба) | `/home/cutkit/agent-orchestrator/docs/инструкция-единое-окно.md` §1 |
| DSM-карта продуктов (ripple-проверка изменений) | `/home/cutkit/agent-orchestrator/docs/territory-dsm.md` |
| Протокол закрытия сессии | `/home/cutkit/agent-orchestrator/docs/session-closure-protocol.md` |

## Границы

- Мутации runtime (K3s/hera) — через labsite/infractl по слову владельца.
- Секреты — только SOPS (labsite), значения не печатаются.
