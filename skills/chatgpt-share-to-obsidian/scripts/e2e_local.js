#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { extractShare } = require("./extract_chatgpt_share.js");
const { buildNotes } = require("./build_obsidian_notes.js");
const { verifyNotes } = require("./verify_notes.js");
const {
  findObsidianRoot,
  updateObsidianIndex,
} = require("./update_obsidian_index.js");

function runEndToEnd(htmlPath, destination, topic) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const extraction = extractShare(html);
  const selectedTopic =
    topic || path.basename(path.resolve(destination)) || "ChatGPT 分享";
  const build = buildNotes(extraction, destination, selectedTopic);
  const verification = verifyNotes(
    extraction,
    destination,
    selectedTopic,
  );
  if (!verification.ok) {
    throw new Error(
      `verification failed: ${verification.errors.join("; ")}`,
    );
  }

  const vaultRoot = findObsidianRoot(destination);
  let obsidian = { vaultRoot, changed: false, indexPath: null };
  if (vaultRoot && fs.existsSync(path.join(vaultRoot, "开发知识库.md"))) {
    const indexResult = updateObsidianIndex(vaultRoot, build.mocName);
    obsidian = { vaultRoot, ...indexResult };
  }

  return {
    extraction: {
      pageTitle: extraction.pageTitle,
      sourceUrl: extraction.sourceUrl,
      turns: extraction.turns.length,
      mergedAnswers: extraction.mergedAnswerCount,
      skippedFragments: extraction.skippedMessageIds.length,
    },
    build: {
      destination: build.destination,
      topic: build.topic,
      articles: build.articles.length,
      mocName: build.mocName,
    },
    verification,
    obsidian,
  };
}

function main(argv) {
  if (argv.length < 2 || argv.length > 3) {
    console.error(
      "usage: node e2e_local.js <share.html> <destination> [topic]",
    );
    return 2;
  }
  const [htmlPath, destination, topic] = argv;
  console.log(
    JSON.stringify(runEndToEnd(htmlPath, destination, topic), null, 2),
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

module.exports = { runEndToEnd };
