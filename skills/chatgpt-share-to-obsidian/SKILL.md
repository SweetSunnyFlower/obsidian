---
name: chatgpt-share-to-obsidian
description: Use when the user supplies a ChatGPT share URL and asks to create, import, archive, convert, or update chapter notes in a local directory or Obsidian Vault.
compatibility: Requires Node.js 22 or newer, curl, the local Chrome browser, and Computer Use for browser interaction.
---

# ChatGPT Share to Obsidian

Turn one public ChatGPT share link into verbatim, chapter-based Markdown notes in
the destination directory selected by the user.

The standard request is:

```text
<ChatGPT share URL> + <destination directory>
```

If either item is missing, ask only for the missing item. Support only
`https://chatgpt.com/share/...` URLs.

## Core Contract

- Open the share URL in the user's local Chrome.
- Preserve final article text exactly.
- Do not summarize, rewrite, reorder, or translate the article body.
- Use the final merged assistant message; ignore hidden stream fragments.
- Create one article per original chapter.
- Write only inside the requested destination and the Vault root index.
- Do not save cookies, authorization headers, passwords, or browser session data.
- Do not overwrite unmanaged files.

## Workflow

### 1. Validate inputs

Accept exactly:

1. One ChatGPT share URL.
2. One local destination directory.

Derive the topic from the destination basename. Ask for a topic only if that
basename is not meaningful and the page title is also unusable.

### 2. Open the local browser

Use the available Computer Use REPL:

```js
const chrome = await cua.getApp("Google Chrome");
await chrome.pressKey("super+t");
await chrome.getAXState();
```

Focus the address bar, paste the share URL, press Return, then call
`getAXStateAndScreenshot({ disableDiffing: true })` until the page title is
visible.

If Chrome requests login, ask the user to complete login in Chrome. Do not
enter or read credentials.

Do not continue extraction until the browser visibly shows a ChatGPT page.

### 3. Save the share HTML

Use a desktop User-Agent and a temporary path:

```bash
share_html=$(mktemp /tmp/chatgpt-share.XXXXXX.html)
curl -L --fail --silent --show-error \
  --retry 2 --connect-timeout 15 --max-time 90 \
  --user-agent 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36' \
  --output "$share_html" \
  '<share-url>'
```

Do not use `--cookie`, `--cookie-jar`, authorization headers, or saved browser
profiles.

If the HTML lacks `streamController.enqueue`, stop and read
`references/chatgpt-share-format.md`.

### 4. Generate and verify

Run the bundled end-to-end script:

```bash
node <skill-dir>/scripts/e2e_local.js \
  "$share_html" \
  '<destination-directory>' \
  '<topic>'
```

The script:

1. Parses final visible/merged assistant responses.
2. Pairs each answer with its original user prompt.
3. Splits on original lesson/chapter headings.
4. Removes repeated stream fragments and duplicate chapters.
5. Writes numbered article files, a MOC, and a manifest.
6. Verifies article bodies against the extracted source.
7. Updates `开发知识库.md` when the destination is inside an Obsidian Vault.

Require both:

```text
"verification": {"ok": true, ...}
```

and success from the command. Do not report completion when verification fails.

### 5. Check the Vault

If the result includes a non-null `obsidian.vaultRoot`, run:

```bash
python3 /Users/gao/.agents/skills/obsidian-knowledge-system/scripts/check_links.py \
  '<vault-root>'
```

Report any missing wikilink instead of silently accepting a broken Vault.

### 6. Report

Report:

- Generated MOC.
- Number of articles.
- Exact verified character count.
- Destination path.
- Obsidian root-index update status.
- Any skipped duplicate chapter or ignored hidden fragment count.

Keep the final response concise and link the MOC with an absolute filesystem
path.

## Chapter Rules

Recognize headings such as:

```text
# 第 1 课
## 第二章
# Harness Engineering 第 9 课
# 操作系统第一课
## 第 1 讲
```

Rules:

- Preserve the complete original heading text and body.
- Create `00` for a substantial preface before the first chapter.
- Attach grading, quiz review, or a short preface to the following lesson.
- Exclude section headings such as `## 十、第十课总结` from chapter boundaries.
- Keep one longest complete candidate when the same chapter is repeated.
- Split only at source positions; never rebuild or paraphrase the article.

## File Safety

The generated directory includes:

```text
<topic>/
├── 00 导论.md
├── 01 第一章.md
├── 02 第二章.md
├── <topic> 知识地图.md
└── .chatgpt-share-notes.json
```

- Read `.chatgpt-share-notes.json` before updating.
- Replace files listed for the same source URL.
- Remove only stale files recorded in that same manifest.
- Never replace an unmanaged same-name file.
- If the script reports `destination conflict`, stop and ask for another
  destination unless the user explicitly authorizes a reviewed overwrite.

## Failure Handling

| Failure | Action |
| --- | --- |
| Non-ChatGPT URL | Stop before writing |
| Browser redirects to login | Ask user to log in in Chrome |
| HTML has no stream data | Read the format reference and report the structure mismatch |
| No final visible answers | Stop; do not create empty notes |
| Source mismatch | Stop; leave existing notes untouched |
| Filename conflict | Report the exact files; do not overwrite |
| Vault link failure | Fix the index or report the missing link |

Do not use `rm -rf`, broad globs, or Vault-wide cleanup.

## Troubleshooting Reference

Read [ChatGPT share format](references/chatgpt-share-format.md) only when
extraction fails or the page structure changes.

## Tests

Run:

```bash
cd /Users/gao/.agents/skills/chatgpt-share-to-obsidian
node --test tests/*.test.js
```

The suite covers final-message selection, chapter splitting, byte fidelity,
file conflicts, idempotent reruns, Obsidian index updates, and both saved
real-share fixtures.
