#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

function decodeHtmlEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function pageTitleFromHtml(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeHtmlEntities(match?.[1] || "").trim();
  return title.replace(/^ChatGPT\s*-\s*/i, "") || "ChatGPT 分享";
}

function sourceUrlFromHtml(html) {
  const match = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
  );
  return decodeHtmlEntities(match?.[1] || "");
}

function resolveTable(table, value, depth = 0, stack = new Set()) {
  if (typeof value === "number") {
    if (value < 0) return null;
    if (depth > 24) return "[max-depth]";
    return resolveTable(table, table[value], depth + 1, stack);
  }

  if (value === null || typeof value !== "object") return value;
  if (stack.has(value)) return "[cycle]";

  stack.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map((item) =>
      resolveTable(table, item, depth + 1, stack),
    );
  } else {
    result = {};
    for (const [encodedKey, item] of Object.entries(value)) {
      const key = encodedKey.startsWith("_")
        ? table[Number(encodedKey.slice(1))]
        : encodedKey;
      result[key] = resolveTable(table, item, depth + 1, stack);
    }
  }
  stack.delete(value);
  return result;
}

function messageText(message) {
  if (!Array.isArray(message?.content?.parts)) return "";
  return message.content.parts
    .filter((part) => typeof part === "string")
    .join("\n")
    .trim();
}

function parseStreamTable(html) {
  const chunkMatches = [
    ...html.matchAll(
      /streamController\.enqueue\(("(?:\\.|[^"\\])*")\)/g,
    ),
  ];
  if (!chunkMatches.length) {
    throw new Error("ChatGPT share stream data was not found");
  }

  const firstChunk = JSON.parse(chunkMatches[0][1]);
  const table =
    typeof firstChunk === "string" ? JSON.parse(firstChunk) : firstChunk;
  if (!Array.isArray(table)) {
    throw new Error("ChatGPT share stream root is not a reference table");
  }
  return table;
}

function selectAssistant(candidates) {
  if (!candidates.length) return null;

  const merged = candidates.filter((candidate) => candidate.merged);
  if (merged.length) return merged.at(-1);

  const completed = candidates.filter(
    (candidate) =>
      candidate.endTurn === true || candidate.isComplete === true,
  );
  if (completed.length) return completed.at(-1);

  return candidates
    .slice()
    .sort((left, right) => right.text.length - left.text.length)[0];
}

function extractShare(html) {
  const table = parseStreamTable(html);
  const linearConversation = resolveTable(table, table[86]);
  if (!Array.isArray(linearConversation)) {
    throw new Error("ChatGPT linear_conversation was not found");
  }

  const groups = [];
  let currentGroup = null;
  let mergedAnswerCount = 0;
  const skippedMessageIds = [];

  for (let linearPosition = 0; linearPosition < linearConversation.length; linearPosition += 1) {
    const node = linearConversation[linearPosition];
    const message = node?.message;
    if (!message) continue;

    const role = message.author?.role;
    const text = messageText(message);

    if (role === "user" && text) {
      currentGroup = {
        user: {
          id: node.id,
          text,
          linearPosition,
        },
        assistantCandidates: [],
      };
      groups.push(currentGroup);
      continue;
    }

    if (role !== "assistant" || !text || !currentGroup) continue;

    const merged = message.metadata?.is_merged_message === true;
    if (merged) mergedAnswerCount += 1;

    const hidden =
      message.metadata?.is_visually_hidden_from_conversation === true;
    if (hidden) {
      skippedMessageIds.push(node.id);
      continue;
    }

    currentGroup.assistantCandidates.push({
      id: node.id,
      text,
      linearPosition,
      merged,
      hidden,
      endTurn: message.end_turn === true,
      isComplete: message.metadata?.is_complete === true,
    });
  }

  const turns = [];
  for (const group of groups) {
    if (!group.user.text.trim()) continue;
    const assistant = selectAssistant(group.assistantCandidates);
    if (!assistant) continue;

    for (const candidate of group.assistantCandidates) {
      if (candidate.id !== assistant.id) {
        skippedMessageIds.push(candidate.id);
      }
    }

    turns.push({
      user: group.user,
      assistant: {
        id: assistant.id,
        text: assistant.text,
        linearPosition: assistant.linearPosition,
        merged: assistant.merged,
      },
    });
  }

  return {
    sourceUrl: sourceUrlFromHtml(html),
    pageTitle: pageTitleFromHtml(html),
    extractedAt: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
    }).format(new Date()),
    mergedAnswerCount,
    skippedMessageIds: [...new Set(skippedMessageIds)],
    turns,
  };
}

function writeJsonAtomic(outputPath, value) {
  const target = path.resolve(outputPath);
  const temporary = `${target}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
}

function main(argv) {
  if (argv.length !== 2) {
    console.error(
      "usage: node extract_chatgpt_share.js <share.html> <output.json>",
    );
    return 2;
  }

  const [htmlPath, outputPath] = argv;
  const extraction = extractShare(fs.readFileSync(htmlPath, "utf8"));
  writeJsonAtomic(outputPath, extraction);
  console.log(
    JSON.stringify({
      outputPath: path.resolve(outputPath),
      pageTitle: extraction.pageTitle,
      turns: extraction.turns.length,
      mergedAnswers: extraction.mergedAnswerCount,
      skippedFragments: extraction.skippedMessageIds.length,
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
  extractShare,
  messageText,
  parseStreamTable,
  resolveTable,
  selectAssistant,
  writeJsonAtomic,
};
