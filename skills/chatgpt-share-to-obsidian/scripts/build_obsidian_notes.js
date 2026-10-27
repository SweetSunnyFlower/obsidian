#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MANIFEST_NAME = ".chatgpt-share-notes.json";
const SEPARATOR = "\n\n---\n\n";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function chineseNumber(value) {
  const digits = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (/^\d+$/.test(value)) return Number(value);

  let total = 0;
  let section = 0;
  for (const character of value) {
    if (character === "百") {
      section = (section || 1) * 100;
    } else if (character === "十") {
      section = (section || 1) * 10;
      total += section;
      section = 0;
    } else if (character in digits) {
      section = digits[character];
    }
  }
  return total + section;
}

function headingChapter(text) {
  const match = text.match(
    /(?:第\s*(\d+|[零〇一二两三四五六七八九十百]+)\s*(课|章|讲)|(?:Lesson|Chapter)\s*(\d+))/i,
  );
  if (!match) return null;

  const rawPrefix = text.slice(0, match.index);
  if (/[、,，:：（）()]/.test(rawPrefix)) return null;

  const prefix = rawPrefix
    .replace(/^#+\s*/, "")
    .replace(/[\s:：，,。.-]+$/g, "")
    .trim();
  const value = match[1] || match[3];
  const number = chineseNumber(value);
  if (!Number.isFinite(number)) return null;
  const unit = match[2] || "课";

  return {
    number,
    unit,
    key: `${prefix.replace(/\s+/g, "").toLowerCase() || "default"}:${number}`,
  };
}

function findChapterHeadings(text) {
  const headings = [];
  const headingPattern = /^(#{1,3})\s+(.+)$/gm;
  for (const match of text.matchAll(headingPattern)) {
    const headingText = match[2].trim();
    if (/批改|答案|小测/.test(headingText)) continue;
    const chapter = headingChapter(headingText);
    if (!chapter) continue;
    headings.push({
      start: match.index,
      level: match[1].length,
      title: headingText,
      number: chapter.number,
      unit: chapter.unit,
      key: chapter.key,
    });
  }

  const lessons = headings.filter((heading) => heading.unit === "课");
  return lessons.length ? lessons : headings;
}

function cleanChunk(value) {
  return value
    .replace(/\n*---\s*$/u, "")
    .replace(/\n+$/u, "");
}

function splitAssistantText(text) {
  const headings = findChapterHeadings(text);
  if (!headings.length) {
    const firstHeading = text.match(/^#{1,3}\s+(.+)$/m);
    return [
      {
        order: "01",
        title: firstHeading?.[1]?.trim() || "正文",
        body: text.trimEnd(),
        key: firstHeading?.[1]?.trim() || "body",
        kind: "chapter",
      },
    ];
  }

  const preface = cleanChunk(text.slice(0, headings[0].start));
  const attachPreface =
    /批改|答案|小测/.test(preface) ||
    !preface.trim() ||
    preface.trim().length < 200;

  const articles = [];
  if (!attachPreface) {
    articles.push({
      order: "00",
      title: "导论",
      body: preface,
      key: "intro",
      kind: "intro",
    });
  }

  headings.forEach((heading, index) => {
    const next = headings[index + 1];
    let bodyStart = heading.start;
    if (index === 0 && attachPreface) bodyStart = 0;
    const body = cleanChunk(text.slice(bodyStart, next?.start ?? text.length));
    articles.push({
      order: String(index + 1).padStart(2, "0"),
      title: heading.title,
      body,
      key: heading.key,
      kind: "chapter",
    });
  });

  return articles;
}

function normalizeUser(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function chooseTurns(turns) {
  const valid = turns.filter((turn) => turn.assistant?.text?.trim());
  const mergedByPrompt = new Map();

  for (const turn of valid) {
    if (!turn.assistant.merged) continue;
    const key = normalizeUser(turn.user.text);
    const existing = mergedByPrompt.get(key);
    if (
      !existing ||
      turn.assistant.text.length >= existing.assistant.text.length
    ) {
      mergedByPrompt.set(key, turn);
    }
  }

  return valid
    .filter((turn) => {
      const key = normalizeUser(turn.user.text);
      const merged = mergedByPrompt.get(key);
      return !merged || merged.assistant.id === turn.assistant.id;
    })
    .sort(
      (left, right) =>
        left.assistant.linearPosition - right.assistant.linearPosition,
    );
}

function sanitizeFilePart(value) {
  return value
    .replace(/[/\\:*?"<>|#^[\]]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 110);
}

function readManifest(directory) {
  const manifestPath = path.join(directory, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function assertWritableDestination(
  directory,
  filenames,
  { sourceUrl = null } = {},
) {
  fs.mkdirSync(directory, { recursive: true });
  const manifest = readManifest(directory);
  const sameSource =
    manifest && !sourceUrl ? true : manifest?.sourceUrl === sourceUrl;
  const owned = new Set(
    sameSource ? manifest.files.map((file) => file.name) : [],
  );

  const conflicts = filenames.filter(
    (filename) =>
      fs.existsSync(path.join(directory, filename)) && !owned.has(filename),
  );
  if (conflicts.length) {
    throw new Error(
      `destination conflict: unmanaged file(s): ${conflicts.join(", ")}`,
    );
  }
}

function quote(text) {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function articleMarkdown(article, extraction, mocName) {
  const noteName = `${article.order} ${article.title}`;
  return [
    "---",
    `title: "${noteName.replaceAll('"', '\\"')}"`,
    "aliases:",
    `  - "${article.title.replaceAll('"', '\\"')}"`,
    "tags:",
    "  - chatgpt-share",
    "  - verbatim",
    `created: "${extraction.extractedAt}"`,
    `updated: "${extraction.extractedAt}"`,
    "type: imported-article",
    "status: active",
    `source_message_id: "${article.assistant.id}"`,
    `source_user_message_id: "${article.user.id}"`,
    "sources:",
    `  - "${extraction.sourceUrl}"`,
    "---",
    "",
    "> [!info] 原文映射",
    `> 原始章节：${article.title}  `,
    `> 合并消息 ID：\`${article.assistant.id}\`  `,
    `> 来源：[ChatGPT 分享对话](${extraction.sourceUrl})  `,
    "> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。",
    ">",
    "> **原始提问（逐字）**",
    ">",
    "> ~~~text",
    quote(article.user.text),
    "> ~~~",
    "",
    `返回：[[${mocName}]]`,
    "",
    "---",
    "",
    article.body,
    "",
  ].join("\n");
}

function mocMarkdown(topic, extraction, articles) {
  return [
    "---",
    `title: "${topic} 知识地图"`,
    "aliases:",
    `  - "${topic} MOC"`,
    "tags:",
    "  - moc",
    "  - chatgpt-share",
    "  - verbatim",
    `created: "${extraction.extractedAt}"`,
    `updated: "${extraction.extractedAt}"`,
    "type: knowledge-map",
    "status: active",
    "sources:",
    `  - "${extraction.sourceUrl}"`,
    "---",
    "",
    `# ${topic} 知识地图`,
    "",
    "> [!summary] 原文分章版",
    `> 从 ChatGPT 分享对话生成，共 ${articles.length} 篇文章。正文逐字保留，隐藏流式片段和重复章节不会重复收录。`,
    "",
    "返回：[[开发知识库]]",
    "",
    "## 文章",
    "",
    ...articles.map((article) => `- [[${article.noteName}]]`),
    "",
    "## 来源",
    "",
    `- 原始对话：<${extraction.sourceUrl}>`,
    "",
    `生成日期：${extraction.extractedAt}。`,
    "",
  ].join("\n");
}

function writeAtomic(filePath, content) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, content, "utf8");
  fs.renameSync(temporary, filePath);
}

function planArticles(extraction) {
  if (!extraction?.turns?.length) {
    throw new Error("extraction contains no turns");
  }
  if (!/^https:\/\/chatgpt\.com\/share\//.test(extraction.sourceUrl)) {
    throw new Error("sourceUrl is not a ChatGPT share URL");
  }

  const selectedTurns = chooseTurns(extraction.turns);
  const chapterCandidates = [];
  let sourceOrder = 0;

  for (const turn of selectedTurns) {
    const chunks = splitAssistantText(turn.assistant.text);
    for (const chunk of chunks) {
      if (
        chunk.body.trim().length < 200 &&
        !/课|章|讲|Lesson|Chapter/i.test(chunk.title)
      ) {
        continue;
      }
      chapterCandidates.push({
        ...chunk,
        user: turn.user,
        assistant: turn.assistant,
        sourceOrder,
      });
      sourceOrder += 1;
    }
  }

  const byKey = new Map();
  for (const candidate of chapterCandidates) {
    const existing = byKey.get(candidate.key);
    if (
      !existing ||
      candidate.body.length > existing.body.length ||
      (candidate.body.length === existing.body.length &&
        candidate.assistant.merged &&
        !existing.assistant.merged)
    ) {
      byKey.set(candidate.key, candidate);
    }
  }

  let articles = [...byKey.values()].sort(
    (left, right) => left.sourceOrder - right.sourceOrder,
  );
  const intro = articles.find((article) => article.kind === "intro");
  const chapters = articles.filter((article) => article.kind !== "intro");
  articles = intro ? [intro, ...chapters] : chapters;

  let chapterOrder = 0;
  articles = articles.map((article) => {
    const order =
      intro && article.kind === "intro"
        ? "00"
        : String((chapterOrder += 1)).padStart(2, "0");
    const title = sanitizeFilePart(article.title);
    return {
      ...article,
      order,
      title,
      noteName: `${order} ${title}`,
    };
  });

  return articles;
}

function buildNotes(extraction, destination, topic) {
  if (!/^https:\/\/chatgpt\.com\/share\//.test(extraction.sourceUrl)) {
    throw new Error("sourceUrl is not a ChatGPT share URL");
  }

  const articles = planArticles(extraction);
  const mocName = `${sanitizeFilePart(topic)} 知识地图`;
  const filenames = [
    ...articles.map((article) => `${article.noteName}.md`),
    `${mocName}.md`,
  ];
  assertWritableDestination(destination, filenames, {
    sourceUrl: extraction.sourceUrl,
  });

  const generatedFiles = [];
  for (const article of articles) {
    const filename = `${article.noteName}.md`;
    const content = articleMarkdown(article, extraction, mocName);
    writeAtomic(path.join(destination, filename), content);
    generatedFiles.push({
      name: filename,
      sha256: sha256(content),
      sourceMessageId: article.assistant.id,
    });
  }

  const mocContent = mocMarkdown(topic, extraction, articles);
  writeAtomic(path.join(destination, `${mocName}.md`), mocContent);
  generatedFiles.push({
    name: `${mocName}.md`,
    sha256: sha256(mocContent),
    sourceMessageId: null,
  });

  const previousManifest = readManifest(destination);
  if (previousManifest?.sourceUrl === extraction.sourceUrl) {
    const currentNames = new Set(generatedFiles.map((file) => file.name));
    for (const file of previousManifest.files) {
      if (!currentNames.has(file.name)) {
        const stalePath = path.join(destination, file.name);
        if (fs.existsSync(stalePath)) fs.unlinkSync(stalePath);
      }
    }
  }

  const selectedIds = new Set(articles.map((article) => article.assistant.id));
  const manifest = {
    version: 1,
    sourceUrl: extraction.sourceUrl,
    pageTitle: extraction.pageTitle,
    topic,
    generatedAt: extraction.extractedAt,
    files: generatedFiles,
    sourceMessageIds: [...selectedIds],
    skippedMessageIds: extraction.skippedMessageIds || [],
  };
  writeAtomic(
    path.join(destination, MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  return {
    destination: path.resolve(destination),
    topic,
    mocName,
    articles,
    manifest,
  };
}

function main(argv) {
  if (argv.length < 2 || argv.length > 3) {
    console.error(
      "usage: node build_obsidian_notes.js <extraction.json> <destination> [topic]",
    );
    return 2;
  }

  const [extractionPath, destination, explicitTopic] = argv;
  const extraction = JSON.parse(fs.readFileSync(extractionPath, "utf8"));
  const topic =
    explicitTopic || path.basename(path.resolve(destination)) || "ChatGPT 笔记";
  const result = buildNotes(extraction, destination, topic);
  console.log(
    JSON.stringify({
      destination: result.destination,
      topic: result.topic,
      articles: result.articles.length,
      files: result.manifest.files.length,
      moc: result.mocName,
    }),
  );
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  MANIFEST_NAME,
  articleMarkdown,
  assertWritableDestination,
  buildNotes,
  chooseTurns,
  findChapterHeadings,
  mocMarkdown,
  planArticles,
  sanitizeFilePart,
  sha256,
  splitAssistantText,
};
