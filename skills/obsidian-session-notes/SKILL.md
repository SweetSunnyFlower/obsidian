---
name: obsidian-session-notes
description: "Summarize the current Codex conversation and save it as a linked Obsidian note. Use whenever the user asks to 总结这次对话、生成会话笔记、保存/归档到 Obsidian、做对话纪要、记录本次调试/搭建过程, or invokes /obsidian-session-notes or $obsidian-session-notes. It extracts decisions, commands, file paths, changes, open questions and next steps, writes a dated Markdown note into the user's vault, links it to the relevant knowledge map, and verifies wikilinks."
compatibility: Requires read/write access to the Obsidian vault and Python 3 for link verification.
---

# Obsidian Session Notes

Turn the current conversation into a useful knowledge note, not a raw transcript dump.

## Defaults

- Vault: `/Users/gao/sweetsunnyflower`
- Override with `OBSIDIAN_VAULT_PATH` when the user names another vault.
- Default folder: `Inbox/`
- Filename: `YYYY-MM-DD HHmm <Topic>.md`
- Timezone: Asia/Shanghai
- Default root index: `[[开发知识库]]`
- Expo index: `[[Expo 知识地图]]`

Read [vault conventions](references/vault-conventions.md) before writing if the vault is unfamiliar.

## Workflow

### 1. Establish the capture scope

Use the current conversation by default. If the user names a subset, capture only that subset. Do not ask for a title when a clear topic can be inferred; ask only when two different titles would lead to materially different notes.

Before writing, search the vault for:

- the same topic from the same day;
- an existing project MOC;
- an existing note that should be updated instead of duplicated.

### 2. Extract knowledge, not noise

Capture:

- the goal and relevant background;
- decisions and why they were made;
- verified commands and configuration;
- file paths and generated artifacts;
- changes made;
- errors, root causes and fixes;
- open questions and next steps;
- links to related concepts.

Compress repeated exploration. Do not copy the whole chat verbatim. When the user explicitly wants a cleaned dialogue, keep only the turns that carry decisions, reasoning or evidence.

### 3. Redact sensitive material

Never write passwords, API keys, cookies, tokens, SMS codes, private keys or account credentials. Mask phone numbers and device identifiers unless they are essential to reproduce the procedure. Replace secrets with forms like `sk-***` or `<redacted>`.

### 4. Create the note

Start from [the session note template](assets/session-note-template.md).

Use this structure:

1. Summary
2. Background and goal
3. Key decisions
4. Commands and configuration
5. Files and artifacts
6. Problems and fixes
7. Open questions and next steps
8. Related notes
9. Cleaned conversation digest

Omit empty sections rather than leaving filler.

### 5. Link it into the vault

Use Obsidian wikilinks such as `[[Expo 环境搭建]]`. Prefer note names over folder paths so links survive moving notes.

Add the new note to the most specific relevant index:

- Expo work → `Expo/Expo 知识地图.md`
- general development work → `开发知识库.md`
- otherwise → create or append a small project index note.

Use a `## 会话记录` section in the index. Append the link; do not rewrite existing user content.

### 6. Verify

Run:

```bash
python3 /Users/gao/.agents/skills/obsidian-session-notes/scripts/check_links.py /Users/gao/sweetsunnyflower
```

Fix missing wikilinks. Report the created/updated note path, the index that was updated, and the link-check result.

## Idempotency

If a note with the same topic and date already exists, update it in place and preserve the user's edits. Do not create a second note merely because the conversation continued.

## Quality bar

A reader who was not in the conversation should be able to answer:

- What problem was being solved?
- What was decided?
- What commands or files matter?
- What is still unresolved?
- Which notes should be read next?

## Resources

- [Vault conventions](references/vault-conventions.md)
- [Session note template](assets/session-note-template.md)
- [Link checker](scripts/check_links.py)
