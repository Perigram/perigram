# Маяк проекта: perigram (AOR-контракт)

```yaml
project: perigram
context_version: 1.2.0
doc_id: PERIGRAM-PROJECT-001
classification: reference
status: active
owner: product-owner
access: internal
created: 2026-09-22
updated: 2026-10-01
```

Навигационный стаб AOR-контракта (схема project-catalog: beacon = PROJECT.md).
Не источник проектных фактов: с реструктуризацией upstream 2026-09-30
документация территории — README-дерево (см. AGENTS.md). Канонический путь:
`/home/cutkit/perigram`.

## Источники истины территории

| Вопрос | Источник |
|---|---|
| Протокол репо (documentation-first, README-дерево) | `AGENTS.md` |
| Обзор системы (SYSTEM-уровень) | `README.md` |
| Спека процесса/CTS (human-write only) | `SPEC.md` |
| Архитектура, дизайн-система, remote-доступ | `docs/SYSTEM_ARCHITECTURE.md`, `docs/DESIGN_SYSTEM.md`, `docs/REMOTE_ACCESS.md` |
| Runtime (K3s, hera/perigram-01) | `/home/cutkit/labsite` |
| Каталог проектов контура | `/home/cutkit/agent-orchestrator/config/project-catalog.json` |

История: PROJECT.md удалён upstream 2026-09-30 (новая doc-модель);
воссоздан 2026-10-01 как минимальный маяк после канон-миграции ndcs
(перестройка 036312d1 → e2bf06a9). Прежняя шапка v1.1.0 — в теге
`ndcs/perigram-20260930`.
