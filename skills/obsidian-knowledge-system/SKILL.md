---
name: obsidian-knowledge-system
description: "Build a linked Obsidian knowledge system for a topic from scratch, even when there is no prior conversation. Use whenever the user asks to 生成/搭建/整理某主题知识体系、知识库、学习路线、知识地图、系统化笔记, or wants docs, URLs, repositories, or PDFs turned into linked notes — for example Docker, Kubernetes, Expo, React Native, or a new technology. Creates a MOC, atomic concept notes, how-to/reference/troubleshooting/security/project notes, links them into the vault, and verifies wikilinks."
compatibility: Requires read/write access to the Obsidian vault and network access for current documentation.
---

# Obsidian Knowledge System

Build a small, connected knowledge system that someone can actually learn from and navigate. Prefer a coherent map over a pile of generated stubs.

## Defaults

- Vault: `/Users/gao/sweetsunnyflower`
- Override with `OBSIDIAN_VAULT_PATH`.
- Topic folder: `<Topic>/`
- Main map: `<Topic>/<Topic> 知识地图.md`
- Root index: `开发知识库.md`
- Timezone: Asia/Shanghai

Read [vault conventions](references/vault-conventions.md) before filing notes.

## Modes

### Topic mode

No prior conversation is required. The user names a topic, such as Docker or Kubernetes.

Research current official documentation first, then build a structured knowledge system.

### Source mode

The user provides URLs, a GitHub repository, PDFs, or pasted documentation. Extract the stable concepts and workflows, preserve source URLs, and do not copy the source wholesale.

### Hybrid mode

Use both the current conversation and external sources. Keep conversation-specific decisions separate from general reference knowledge.

### Session mode

If the user asks to save the current conversation rather than build a topic, use the `obsidian-session-notes` skill instead.

## Workflow

### 1. Scope and inventory

Determine:

- topic;
- intended audience and depth;
- practical goal;
- existing notes that should be reused;
- whether the user wants a compact map or a deep course.

Default to practical/intermediate if the user gives no level. Ask only when the answer would materially change the structure.

Search the vault first. Reuse existing notes and link to them rather than creating duplicates.

### 2. Research current sources

For libraries, frameworks, SDKs, APIs, CLIs and cloud products, use `find-docs`/Context7 and official documentation. For general topics, prefer official docs and primary sources.

Record:

- source URL;
- retrieval date;
- the version the statement applies to when relevant.

If current documentation cannot be reached, say so explicitly. Do not invent version-specific details.

### 3. Choose a compact blueprint

Select 6–12 notes for a first version. A useful default is:

1. knowledge map / MOC;
2. foundational concepts;
3. mental model or architecture;
4. core workflow;
5. configuration or file format;
6. networking/storage/security as applicable;
7. command reference;
8. troubleshooting;
9. best practices;
10. a small end-to-end example.

Read [topic blueprints](references/topic-blueprint.md) for topic-specific suggestions.

Avoid one-note-per-heading fragmentation. A note should be read as a coherent unit.

### 4. Write the notes

Start from the templates:

- [MOC template](assets/moc-template.md)
- [Concept note template](assets/concept-note-template.md)
- [How-to template](assets/how-to-template.md)
- [Troubleshooting template](assets/troubleshooting-template.md)

Every note should include:

- what it is;
- why it matters;
- when to use it;
- a mental model;
- concrete commands or examples;
- pitfalls;
- related notes;
- sources.

Use Chinese by default. Keep official terms in English where that is how practitioners search for them.

### 5. Connect the system

- The MOC links to every note in the topic.
- Every note links back to the MOC.
- Add meaningful cross-links between related concepts.
- Add the MOC to `开发知识库.md`.
- Use `[[Note Name]]`; prefer note names over folder paths.

The map should make the reading order obvious without requiring the user to browse the filesystem.

### 6. Verify

Run:

```bash
python3 /Users/gao/.agents/skills/obsidian-knowledge-system/scripts/check_links.py /Users/gao/sweetsunnyflower
```

Fix missing links. Check that the MOC is not an orphan and that every generated note is reachable.

## Note quality

A good note answers:

- What problem does this concept solve?
- How does it work at a useful level of abstraction?
- What commands or configuration matter?
- What commonly goes wrong?
- Which adjacent note should I read next?

Prefer small worked examples over abstract prose. Cite sources near version-sensitive claims.

## Source and safety rules

- Do not write secrets, tokens, cookies, credentials or private keys.
- Do not copy long copyrighted passages.
- Distinguish official behavior from personal recommendation.
- Treat version-sensitive information carefully and include the retrieval date.
- Do not claim a command or API was verified unless it was actually run or clearly sourced.

## Related skill

Use `obsidian-session-notes` when the input is mainly the current conversation. Use this skill when the input is mainly a topic or external source.

## Resources

- [Vault conventions](references/vault-conventions.md)
- [Topic blueprints](references/topic-blueprint.md)
- [Source policy](references/source-policy.md)
- [Link checker](scripts/check_links.py)
