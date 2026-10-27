const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  assertWritableDestination,
  chooseTurns,
  splitAssistantText,
} = require("../scripts/build_obsidian_notes.js");

test("chapter splitting preserves the complete source text", () => {
  const text = [
    "导论内容".repeat(120),
    "",
    "---",
    "",
    "## 第 1 课：Agent Loop",
    "",
    "第一课正文",
    "",
    "---",
    "",
    "## 第 2 课：Tool Runtime",
    "",
    "第二课正文",
  ].join("\n");

  const articles = splitAssistantText(text);

  assert.deepEqual(
    articles.map((article) => article.order),
    ["00", "01", "02"],
  );
  assert.equal(
    articles.map((article) => article.body).join("\n\n---\n\n"),
    text,
  );
});

test("grading heading stays with the following lesson", () => {
  const text = [
    "# Harness 第十二课批改：答案 C，正确",
    "",
    "批改正文",
    "",
    "# Harness 第十三课：状态机",
    "",
    "第十三课正文",
  ].join("\n");

  const articles = splitAssistantText(text);

  assert.equal(articles.length, 1);
  assert.match(articles[0].title, /第十三课/);
  assert.equal(articles[0].body, text);
});

test("section headings that mention a lesson are not chapter boundaries", () => {
  const text = [
    "# Harness Engineering 第 10 课：Sandbox 与工具隔离",
    "",
    "第十课正文",
    "",
    "## 十、第十课总结：心智模型",
    "",
    "总结正文",
  ].join("\n");

  const articles = splitAssistantText(text);

  assert.equal(articles.length, 1);
  assert.equal(articles[0].body, text);
});

test("cross-references to other lessons are not chapter boundaries", () => {
  const text = [
    "# 第一课：网络到底是什么",
    "",
    "第一课正文",
    "",
    "## 面试高频（第一课）",
    "",
    "高频题正文",
    "",
    "## 下一课预告（计算机网络第二课）",
    "",
    "预告正文",
  ].join("\n");

  const articles = splitAssistantText(text);

  assert.equal(articles.length, 1);
  assert.equal(articles[0].body, text);
});

test("multiple internal H1 headings do not create chapter articles", () => {
  const text = [
    "# 最早的调度器",
    "",
    "第一节正文",
    "",
    "# 为什么差",
    "",
    "第二节正文",
  ].join("\n");

  const articles = splitAssistantText(text);

  assert.equal(articles.length, 1);
  assert.equal(articles[0].body, text);
});

test("lesson headings take precedence over internal chapter headings", () => {
  const text = [
    "# Go Runtime 第二课：Work Stealing",
    "",
    "课程正文",
    "",
    "# 第一章：最早的调度器",
    "",
    "章节正文",
  ].join("\n");

  const articles = splitAssistantText(text);

  assert.equal(articles.length, 1);
  assert.equal(articles[0].title, "Go Runtime 第二课：Work Stealing");
  assert.equal(articles[0].body, text);
});

test("repeated short user commands remain separate turns", () => {
  const turns = [
    {
      user: { id: "u1", text: "下一节", linearPosition: 1 },
      assistant: {
        id: "a1",
        text: "# 操作系统第三课\n\n第三课正文",
        merged: false,
        linearPosition: 2,
      },
    },
    {
      user: { id: "u2", text: "下一节", linearPosition: 3 },
      assistant: {
        id: "a2",
        text: "# 操作系统第四课\n\n第四课正文",
        merged: false,
        linearPosition: 4,
      },
    },
  ];

  assert.deepEqual(
    chooseTurns(turns).map((turn) => turn.assistant.id),
    ["a1", "a2"],
  );
});

test("a merged answer replaces a duplicate non-merged retelling", () => {
  const turns = [
    {
      user: { id: "u1", text: "教我 Harness", linearPosition: 1 },
      assistant: {
        id: "a1",
        text: "## 第 1 课：Agent Loop\n\n完整合并版",
        merged: true,
        linearPosition: 2,
      },
    },
    {
      user: { id: "u2", text: "教我 Harness", linearPosition: 3 },
      assistant: {
        id: "a2",
        text: "## 第一阶段：现在开始第一课\n\n较短重复版",
        merged: false,
        linearPosition: 4,
      },
    },
  ];

  assert.deepEqual(
    chooseTurns(turns).map((turn) => turn.assistant.id),
    ["a1"],
  );
});

test("unmanaged filename collision blocks writes", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "chatgpt-notes-build-"),
  );
  fs.writeFileSync(path.join(directory, "01 第一课.md"), "user content");

  assert.throws(
    () => assertWritableDestination(directory, ["01 第一课.md"]),
    /conflict/i,
  );
  assert.equal(
    fs.readFileSync(path.join(directory, "01 第一课.md"), "utf8"),
    "user content",
  );
});

test("manifest-owned filename can be updated", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "chatgpt-notes-owned-"),
  );
  fs.writeFileSync(path.join(directory, "01 第一课.md"), "old");
  fs.writeFileSync(
    path.join(directory, ".chatgpt-share-notes.json"),
    JSON.stringify({
      version: 1,
      sourceUrl: "https://chatgpt.com/share/example",
      files: [{ name: "01 第一课.md", sha256: "old" }],
    }),
  );

  assert.doesNotThrow(() =>
    assertWritableDestination(directory, ["01 第一课.md"], {
      sourceUrl: "https://chatgpt.com/share/example",
    }),
  );
});
