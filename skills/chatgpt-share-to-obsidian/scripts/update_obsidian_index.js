#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

function findObsidianRoot(startDirectory) {
  let current = path.resolve(startDirectory);
  while (true) {
    if (fs.existsSync(path.join(current, ".obsidian"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function topicFromMocName(mocName) {
  return mocName.replace(/\s*知识地图$/u, "").trim() || "ChatGPT 分享";
}

function updateObsidianIndex(vaultRoot, mocName) {
  const indexPath = path.join(vaultRoot, "开发知识库.md");
  if (!fs.existsSync(indexPath)) {
    throw new Error(`开发知识库.md not found in ${vaultRoot}`);
  }

  const original = fs.readFileSync(indexPath, "utf8");
  const link = `[[${mocName}]]`;
  if (original.includes(link)) {
    return { changed: false, indexPath };
  }

  const heading = `## ${topicFromMocName(mocName)}`;
  let updated;
  const headingIndex = original.indexOf(heading);

  if (headingIndex === -1) {
    const prefix = original.endsWith("\n") ? original : `${original}\n`;
    updated = `${prefix}\n${heading}\n\n- ${link}\n`;
  } else {
    const insertionPoint = headingIndex + heading.length;
    updated = `${original.slice(0, insertionPoint)}\n\n- ${link}${original.slice(
      insertionPoint,
    )}`;
  }

  const temporary = `${indexPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, updated, "utf8");
  fs.renameSync(temporary, indexPath);
  return { changed: true, indexPath };
}

function main(argv) {
  if (argv.length !== 2) {
    console.error(
      "usage: node update_obsidian_index.js <vault-root> <moc-name>",
    );
    return 2;
  }
  const [vaultRoot, mocName] = argv;
  console.log(JSON.stringify(updateObsidianIndex(vaultRoot, mocName)));
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
  findObsidianRoot,
  topicFromMocName,
  updateObsidianIndex,
};
