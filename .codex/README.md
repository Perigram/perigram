# COMPONENT: Codex Agent Assets

Repo-local Codex assets that help agents work inside CutKit Demo without
duplicating the canonical project documentation.

## Skills

| Skill | Purpose |
|---|---|
| [cutkit-project-workflow](./skills/cutkit-project-workflow/SKILL.md) | Thin entry point for the documentation-first workflow, validation closeout, TODO notes, and commit discipline. `AGENTS.md` remains authoritative. |
| [cutkit-backend-v24](./skills/cutkit-backend-v24/SKILL.md) | Backend Golden Path workflow for `server/features`, API routes, runtime registration, services, repositories, commands, tasks, and hooks. |
| [occs-compliance](./skills/occs-compliance/SKILL.md) | OCCS spec and runtime workflow for cassette documents, semantic layers, previews, baking, nesting inputs, and validation. |

## Conventions

- Keep skills concise and procedural; link to repo READMEs and specs instead of
  copying their content.
- Keep `AGENTS.md` as the mandatory project rule source.
- Use `agents/openai.yaml` only for UI metadata.
- Add detailed references, scripts, or assets only when they remove repeated
  manual work or avoid loading large docs into every skill invocation.
