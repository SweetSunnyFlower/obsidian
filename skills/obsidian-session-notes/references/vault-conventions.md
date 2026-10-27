# Vault conventions

## Current vault

```text
/Users/gao/sweetsunnyflower
```

Override with `OBSIDIAN_VAULT_PATH`.

## Existing structure

```text
开发知识库.md
欢迎.md
Expo/
  Expo 知识地图.md
  Expo 环境搭建.md
  Expo 常用命令.md
  Expo 故障排查.md
  ...
```

## Naming

- Session note: `YYYY-MM-DD HHmm <Topic>.md`
- Use local time in Asia/Shanghai.
- Keep titles short and searchable.
- Avoid duplicate notes for the same date and topic.

## Frontmatter

Required fields:

- `title`
- `tags`
- `created`
- `updated`
- `type: session-note`
- `project`
- `status`
- `source: codex-conversation`

Add `aliases` only when the note has a common alternate name.

## Linking

- Use `[[Note Name]]` wikilinks.
- Add the note to the most specific MOC/index.
- Append to `## 会话记录`; do not replace existing content.
- Verify all wikilinks after writing.

## Filing

- General session note → `Inbox/`
- User explicitly asks for project filing → project folder, e.g. `Expo/`
- If the user names another destination, follow it.
