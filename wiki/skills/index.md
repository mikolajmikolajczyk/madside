# Skills bundled with this repo

Both skills are vendored locally so any agent (or human) has them on hand without depending on a global `~/.claude/skills/` install.

| Skill | Canonical source | Local copies |
|-------|------------------|--------------|
| `radicle` | `~/.claude/skills/radicle/SKILL.md` | [`radicle.md`](radicle.md) (human-readable copy) and [`.claude/skills/radicle/SKILL.md`](../../.claude/skills/radicle/SKILL.md) (Claude Code auto-loads) |
| `radboard` | `~/src/llm_skills/radboard/SKILL.md` | [`radboard.md`](radboard.md) and [`.claude/skills/radboard/SKILL.md`](../../.claude/skills/radboard/SKILL.md) |

## Updating

These vendored copies can drift from the canonical source. When the canonical version changes substantively, refresh both the `wiki/skills/` mirror and `.claude/skills/` copy. Run:

```sh
cp ~/.claude/skills/radicle/SKILL.md .claude/skills/radicle/SKILL.md
cp ~/.claude/skills/radicle/SKILL.md wiki/skills/radicle.md
cp ~/src/llm_skills/radboard/SKILL.md .claude/skills/radboard/SKILL.md
cp ~/src/llm_skills/radboard/SKILL.md wiki/skills/radboard.md
```

## When to consult which

- **Driving `rad` CLI** (open issue, push patch, sync) → `radicle.md`.
- **Picking labels for an issue or patch** (state, priority, milestone, blocked, epic, parent) → `radboard.md`.
- **Patch ↔ issue linking** (hex7 prefixes in commit subjects) → `radboard.md`.
