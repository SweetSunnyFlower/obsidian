#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  MANIFEST_NAME,
  articleMarkdown,
  mocMarkdown,
  planArticles,
  sanitizeFilePart,
  sha256,
} = require("./build_obsidian_notes.js");

const RETURN_MARKER =
  /返回：\[\[[^\]]+\]\]\n\n---\n\n/u;

function normalizeFinalNewline(value) {
  return value.replace(/\n+$/u, "");
}

function extractArticleBody(note) {
  const match = RETURN_MARKER.exec(note);
  if (!match) {
    throw new Error("article return marker was not found");
  }
  const body = note.slice(match.index + match[0].length);
  return normalizeFinalNewline(body);
}

function verifyArticleBody(note, expected) {
  let actual;
  try {
    actual = extractArticleBody(note);
  } catch (error) {
    return { ok: false, error: error.message };
  }

  if (actual !== normalizeFinalNewline(expected)) {
    return {
      ok: false,
      error: "article body differs from the extracted source",
    };
  }
  return { ok: true };
}

function verifyManifest(manifest, directory) {
  const errors = [];
  if (!manifest || manifest.version !== 1) {
    return ["manifest is missing or has an unsupported version"];
  }

  for (const file of manifest.files || []) {
    const filePath = path.join(directory, file.name);
    if (!fs.existsSync(filePath)) {
      errors.push(`manifest file missing: ${file.name}`);
      continue;
    }
    const actualHash = sha256(fs.readFileSync(filePath));
    if (actualHash !== file.sha256) {
      errors.push(`manifest hash mismatch: ${file.name}`);
    }
  }
  return errors;
}

function verifyMocLinks(mocContent, articleNames) {
  return articleNames
    .filter((name) => !mocContent.includes(`[[${name}]]`))
    .map((name) => `MOC missing article link: ${name}`);
}

function verifyBacklinks(directory, articles, mocName) {
  const errors = [];
  for (const article of articles) {
    const filePath = path.join(directory, `${article.noteName}.md`);
    if (!fs.existsSync(filePath)) {
      errors.push(`article missing: ${article.noteName}`);
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    if (!content.includes(`返回：[[${mocName}]]`)) {
      errors.push(`article missing MOC backlink: ${article.noteName}`);
    }
  }
  return errors;
}

function verifyNotes(extraction, directory, explicitTopic) {
  const manifestPath = path.join(directory, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest not found: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.sourceUrl !== extraction.sourceUrl) {
    throw new Error("manifest source URL differs from extraction source URL");
  }

  const topic = explicitTopic || manifest.topic;
  const articles = planArticles(extraction);
  const mocName = `${sanitizeFilePart(topic)} 知识地图`;
  const errors = [];
  let verifiedCharacters = 0;

  for (const article of articles) {
    const filePath = path.join(directory, `${article.noteName}.md`);
    if (!fs.existsSync(filePath)) {
      errors.push(`article missing: ${article.noteName}`);
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8");
    const expected = articleMarkdown(article, extraction, mocName);
    if (normalizeFinalNewline(content) !== normalizeFinalNewline(expected)) {
      const bodyCheck = verifyArticleBody(content, article.body);
      errors.push(
        bodyCheck.ok
          ? `article wrapper differs: ${article.noteName}`
          : `${article.noteName}: ${bodyCheck.error}`,
      );
    }
    verifiedCharacters += article.body.length;
  }

  const mocPath = path.join(directory, `${mocName}.md`);
  if (!fs.existsSync(mocPath)) {
    errors.push(`MOC missing: ${mocName}`);
  } else {
    const mocContent = fs.readFileSync(mocPath, "utf8");
    errors.push(
      ...verifyMocLinks(
        mocContent,
        articles.map((article) => article.noteName),
      ),
    );
    const expectedMoc = mocMarkdown(topic, extraction, articles);
    if (normalizeFinalNewline(mocContent) !== normalizeFinalNewline(expectedMoc)) {
      errors.push("MOC content differs from the generated plan");
    }
  }

  errors.push(...verifyBacklinks(directory, articles, mocName));
  errors.push(...verifyManifest(manifest, directory));

  return {
    ok: errors.length === 0,
    destination: path.resolve(directory),
    topic,
    articles: articles.length,
    verifiedCharacters,
    errors,
  };
}

function main(argv) {
  if (argv.length < 2 || argv.length > 3) {
    console.error(
      "usage: node verify_notes.js <extraction.json> <destination> [topic]",
    );
    return 2;
  }

  const [extractionPath, directory, topic] = argv;
  const extraction = JSON.parse(fs.readFileSync(extractionPath, "utf8"));
  const result = verifyNotes(extraction, directory, topic);
  console.log(JSON.stringify(result));
  return result.ok ? 0 : 1;
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
  extractArticleBody,
  verifyArticleBody,
  verifyBacklinks,
  verifyManifest,
  verifyMocLinks,
  verifyNotes,
};
