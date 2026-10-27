# Vault conventions

## Vault

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
   ...
工具/
   Obsidian Session Notes Skill.md
```

## Topic system layout

```text
<Topic>/
  <Topic> 知识地图.md
  <Topic> 基础概念.md
  <Topic> 核心模型.md
  <Topic> 操作指南.md
  <Topic> 命令速查.md
  <Topic> 故障排查.md
```

Adapt the blueprint to the topic; do not create empty notes just to match this example.

## Frontmatter

- `title`
- `aliases`
- `tags`
- `created`
- `updated`
- `type`
- `status`
- `sources`

Use ISO dates in `YYYY-MM-DD`.

## Linking

- MOC links to every topic note.
- Every topic note returns to the MOC.
- Add the MOC to `开发知识库.md`.
- Use `[[Note Name]]`, not folder-qualified links unless disambiguation is necessary.
- Verify links after writing.
