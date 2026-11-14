#!/usr/bin/env node
// Version numbers for this card run 0.01, 0.02 … 0.99, 1.00, 1.01 …:
// a major number and a two-digit minor. The number lives in one place,
// the VERSION constant in dist/door-lock-card.js.
//
//   node .github/scripts/version.mjs current        print the current version
//   node .github/scripts/version.mjs check          fail unless it is well formed
//   node .github/scripts/version.mjs next minor     print what a minor (or major) bump would give
//   node .github/scripts/version.mjs bump minor     write that version into the card and print it
//
// A minor bump adds 0.01, and rolls 0.99 over to 1.00. A major bump goes to
// the next whole number: 0.37 → 1.00, 1.05 → 2.00.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CARD = fileURLToPath(new URL("../../dist/door-lock-card.js", import.meta.url));

const FORMAT = /^(0|[1-9]\d*)\.(\d{2})$/;
const VERSION_LINE = /^(\s*const VERSION = ")([^"]*)(";)$/gm;

export const isVersion = (v) => FORMAT.test(v);

export function nextVersion(current, bump) {
  const m = FORMAT.exec(current);
  if (!m) throw new Error(`"${current}" is not a version like 0.01 or 1.00`);
  if (bump !== "minor" && bump !== "major") throw new Error(`Unknown bump "${bump}": use minor or major`);
  let major = Number(m[1]);
  let minor = Number(m[2]);
  if (bump === "major" || minor === 99) {
    major += 1;
    minor = 0;
  } else {
    minor += 1;
  }
  return `${major}.${String(minor).padStart(2, "0")}`;
}

export function readVersion(file = CARD) {
  const found = [...readFileSync(file, "utf8").matchAll(VERSION_LINE)];
  if (found.length !== 1) throw new Error(`Expected one VERSION constant in ${file}, found ${found.length}`);
  return found[0][2];
}

export function writeVersion(version, file = CARD) {
  if (!isVersion(version)) throw new Error(`"${version}" is not a version like 0.01 or 1.00`);
  readVersion(file); // makes sure there is exactly one place to write to
  writeFileSync(file, readFileSync(file, "utf8").replace(VERSION_LINE, `$1${version}$3`));
}

function main([command, bump]) {
  const current = readVersion();
  switch (command) {
    case "current":
      console.log(current);
      return;
    case "check":
      if (!isVersion(current)) throw new Error(`VERSION is "${current}"; it should look like 0.01 or 1.00`);
      console.log(`VERSION ${current} is well formed`);
      return;
    case "next":
      console.log(nextVersion(current, bump));
      return;
    case "bump": {
      const next = nextVersion(current, bump);
      writeVersion(next);
      console.log(next);
      return;
    }
    default:
      throw new Error("Usage: version.mjs current | check | next <minor|major> | bump <minor|major>");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
