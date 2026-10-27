const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  extractShare,
} = require("../scripts/extract_chatgpt_share.js");

const fixtures = {
  harness:
    process.env.CHATGPT_HARNESS_HTML || "/tmp/chatgpt_share_2.html",
  computer:
    process.env.CHATGPT_COMPUTER_HTML || "/tmp/chatgpt_share_page.html",
};

test(
  "Harness share selects 13 final merged answers",
  { skip: !fs.existsSync(path.resolve(fixtures.harness)) },
  () => {
  const html = fs.readFileSync(fixtures.harness, "utf8");
  const extraction = extractShare(html);

  assert.equal(extraction.pageTitle, "中文问候交流");
  assert.equal(extraction.mergedAnswerCount, 13);
  assert.ok(extraction.turns.length >= 13);
  assert.ok(
    extraction.turns.some((turn) =>
      turn.assistant.text.includes(
        "# Harness 第十三课：状态机、事件驱动与并发调度",
      ),
    ),
  );
  },
);

test(
  "Computer share selects 34 final user turns",
  { skip: !fs.existsSync(path.resolve(fixtures.computer)) },
  () => {
  const html = fs.readFileSync(fixtures.computer, "utf8");
  const extraction = extractShare(html);

  assert.equal(extraction.pageTitle, "Go 1.26 新特性");
  assert.equal(extraction.turns.length, 34);
  assert.equal(extraction.turns[0].user.text, "go1.26新特性");
  assert.match(extraction.turns[0].assistant.text, /Go 1\.26/);
  assert.equal(
    new Set(extraction.turns.map((turn) => turn.assistant.id)).size,
    extraction.turns.length,
  );
  },
);
