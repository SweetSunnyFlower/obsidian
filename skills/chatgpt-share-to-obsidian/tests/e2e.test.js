const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runEndToEnd } = require("../scripts/e2e_local.js");

const harnessFixture =
  process.env.CHATGPT_HARNESS_HTML || "/tmp/chatgpt_share_2.html";
const computerFixture =
  process.env.CHATGPT_COMPUTER_HTML || "/tmp/chatgpt_share_page.html";

test(
  "Harness fixture creates 14 exact articles and a 14-link MOC",
  { skip: !fs.existsSync(harnessFixture) },
  () => {
  const destination = fs.mkdtempSync(
    path.join(os.tmpdir(), "chatgpt-harness-e2e-"),
  );
  const result = runEndToEnd(
    harnessFixture,
    destination,
    "Harness",
  );

  assert.equal(result.verification.ok, true);
  assert.equal(result.verification.articles, 14);
  assert.equal(result.verification.verifiedCharacters > 170000, true);

  const moc = fs.readFileSync(
    path.join(destination, "Harness 知识地图.md"),
    "utf8",
  );
  assert.equal((moc.match(/^- \[\[/gm) || []).length, 14);
  },
);

test(
  "second run is idempotent for the same source",
  { skip: !fs.existsSync(harnessFixture) },
  () => {
  const destination = fs.mkdtempSync(
    path.join(os.tmpdir(), "chatgpt-harness-idempotent-"),
  );
  runEndToEnd(harnessFixture, destination, "Harness");
  const second = runEndToEnd(harnessFixture, destination, "Harness");

  assert.equal(second.verification.ok, true);
  assert.equal(second.verification.articles, 14);
  },
);

test(
  "Computer fixture creates 34 exact articles",
  { skip: !fs.existsSync(computerFixture) },
  () => {
  const destination = fs.mkdtempSync(
    path.join(os.tmpdir(), "chatgpt-computer-e2e-"),
  );
  const result = runEndToEnd(
    computerFixture,
    destination,
    "计算机基础",
  );

  assert.equal(result.verification.ok, true);
  assert.equal(result.verification.articles, 34);
  assert.equal(result.verification.verifiedCharacters, 143608);
  },
);

test(
  "inside a Vault, the MOC is added to the root index",
  { skip: !fs.existsSync(harnessFixture) },
  () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-vault-e2e-"));
  fs.mkdirSync(path.join(vault, ".obsidian"));
  fs.writeFileSync(
    path.join(vault, "开发知识库.md"),
    "# 开发知识库\n\n## 已有专题\n\n- [[已有笔记]]\n",
  );
  const destination = path.join(vault, "Harness");

  const result = runEndToEnd(harnessFixture, destination, "Harness");
  const index = fs.readFileSync(
    path.join(vault, "开发知识库.md"),
    "utf8",
  );

  assert.equal(result.obsidian.vaultRoot, vault);
  assert.match(index, /\[\[Harness 知识地图\]\]/);
  assert.match(index, /\[\[已有笔记\]\]/);
  },
);
