const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractArticleBody,
  verifyArticleBody,
} = require("../scripts/verify_notes.js");

test("article body extraction preserves content after the return marker", () => {
  const note = [
    "---",
    'title: "01 第一课"',
    "---",
    "",
    "> [!info] 原文映射",
    "> 内容策略：以下正文逐字保留。",
    "",
    "返回：[[测试 知识地图]]",
    "",
    "---",
    "",
    "## 第 1 课",
    "",
    "原文 A",
  ].join("\n");

  assert.equal(extractArticleBody(note), "## 第 1 课\n\n原文 A");
});

test("verifier detects one changed character in a body", () => {
  const note = [
    "返回：[[测试 知识地图]]",
    "",
    "---",
    "",
    "## 第 1 课",
    "",
    "原文 B",
  ].join("\n");

  const result = verifyArticleBody(note, "## 第 1 课\n\n原文 A");

  assert.equal(result.ok, false);
  assert.match(result.error, /differs/);
});

test("verifier accepts final-newline-only differences", () => {
  const note = [
    "返回：[[测试 知识地图]]",
    "",
    "---",
    "",
    "## 第 1 课",
    "",
    "原文 A",
  ].join("\n");

  assert.deepEqual(
    verifyArticleBody(note, "## 第 1 课\n\n原文 A\n"),
    { ok: true },
  );
});
