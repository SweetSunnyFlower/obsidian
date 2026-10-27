const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  findObsidianRoot,
  updateObsidianIndex,
} = require("../scripts/update_obsidian_index.js");

function makeVault() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-vault-"));
  fs.mkdirSync(path.join(vault, ".obsidian"));
  fs.writeFileSync(
    path.join(vault, "开发知识库.md"),
    "# 开发知识库\n\n## 已有专题\n\n- [[已有笔记]]\n",
  );
  return vault;
}

test("finds nearest Obsidian root", () => {
  const vault = makeVault();
  const nested = path.join(vault, "A", "B");
  fs.mkdirSync(nested, { recursive: true });
  assert.equal(findObsidianRoot(nested), vault);
});

test("adds a MOC once and preserves unrelated content", () => {
  const vault = makeVault();
  const first = updateObsidianIndex(vault, "Harness 知识地图");
  const second = updateObsidianIndex(vault, "Harness 知识地图");
  const index = fs.readFileSync(
    path.join(vault, "开发知识库.md"),
    "utf8",
  );

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(index.match(/\[\[Harness 知识地图\]\]/g).length, 1);
  assert.match(index, /## 已有专题/);
  assert.match(index, /\[\[已有笔记\]\]/);
});

test("does not create a missing root index", () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-vault-empty-"));
  fs.mkdirSync(path.join(vault, ".obsidian"));

  assert.throws(
    () => updateObsidianIndex(vault, "测试 知识地图"),
    /开发知识库\.md/,
  );
  assert.equal(fs.existsSync(path.join(vault, "开发知识库.md")), false);
});
