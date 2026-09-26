#!/usr/bin/env node
// Check every configured app locale, including interpolation compatibility.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../apps/web");
const { locales, baseLocale } = JSON.parse(
  fs.readFileSync(path.join(root, "project.inlang/settings.json"), "utf8"),
);
const read = (locale) =>
  JSON.parse(
    fs.readFileSync(path.join(root, `messages/${locale}.json`), "utf8"),
  );
const source = read(baseLocale);
const keys = Object.keys(source)
  .filter((key) => key !== "$schema")
  .sort();
const parameters = (value) =>
  [
    ...new Set(
      [...value.matchAll(/\{([A-Za-z_][A-Za-z_0-9]*)\}/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
for (const locale of locales) {
  const messages = read(locale);
  assert.deepEqual(
    Object.keys(messages)
      .filter((key) => key !== "$schema")
      .sort(),
    keys,
    `${locale}: missing or extra keys`,
  );
  for (const key of keys) {
    assert.equal(
      typeof messages[key],
      "string",
      `${locale}.${key}: expected a string`,
    );
    assert.ok(
      messages[key].trim().length || !source[key].trim().length,
      `${locale}.${key}: empty translation`,
    );
    assert.deepEqual(
      parameters(messages[key]),
      parameters(source[key]),
      `${locale}.${key}: interpolation mismatch`,
    );
  }
}
console.log(
  `${locales.join(", ")}: ${keys.length} messages per locale; keys and interpolation match.`,
);
