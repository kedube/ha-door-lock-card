// Run with: node --test .github/scripts/version.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { isVersion, nextVersion, readVersion, writeVersion } from "./version.mjs";

test("a minor bump adds 0.01", () => {
  assert.equal(nextVersion("0.00", "minor"), "0.01");
  assert.equal(nextVersion("0.01", "minor"), "0.02");
  assert.equal(nextVersion("0.09", "minor"), "0.10");
  assert.equal(nextVersion("0.98", "minor"), "0.99");
  assert.equal(nextVersion("1.00", "minor"), "1.01");
  assert.equal(nextVersion("12.41", "minor"), "12.42");
});

test("a minor bump rolls 0.99 over to 1.00", () => {
  assert.equal(nextVersion("0.99", "minor"), "1.00");
  assert.equal(nextVersion("1.99", "minor"), "2.00");
  assert.equal(nextVersion("9.99", "minor"), "10.00");
});

test("a major bump goes to the next whole number", () => {
  assert.equal(nextVersion("0.00", "major"), "1.00");
  assert.equal(nextVersion("0.37", "major"), "1.00");
  assert.equal(nextVersion("1.00", "major"), "2.00");
  assert.equal(nextVersion("1.05", "major"), "2.00");
  assert.equal(nextVersion("9.99", "major"), "10.00");
});

test("a hundred minor bumps from 0.00 walk 0.01 … 0.99, 1.00 in order", () => {
  let v = "0.00";
  let last = 0;
  for (let i = 1; i <= 100; i++) {
    v = nextVersion(v, "minor");
    assert.ok(isVersion(v), v);
    assert.ok(Number(v) > last, `${v} should come after ${last}`);
    last = Number(v);
  }
  assert.equal(v, "1.00");
});

test("anything that is not major.minor with two digits is refused", () => {
  for (const bad of ["2.0.0", "1.5", "v0.01", "0.100", "01.05", "1", "", "0.1a"]) {
    assert.equal(isVersion(bad), false, bad);
    assert.throws(() => nextVersion(bad, "minor"), /not a version/, bad);
  }
  assert.throws(() => nextVersion("0.01", "patch"), /Unknown bump/);
  assert.throws(() => nextVersion("0.01", undefined), /Unknown bump/);
});

test("the version is read from and written to the card's VERSION constant only", () => {
  const file = join(mkdtempSync(join(tmpdir(), "dlc-version-")), "card.js");
  const source = '(() => {\n  const VERSION = "0.41";\n  const OTHER = "0.41";\n  console.info(`v${VERSION}`);\n})();\n';
  writeFileSync(file, source);
  assert.equal(readVersion(file), "0.41");
  writeVersion("0.42", file);
  assert.equal(readFileSync(file, "utf8"), source.replace('VERSION = "0.41"', 'VERSION = "0.42"'));
  assert.throws(() => writeVersion("0.4", file), /not a version/);

  writeFileSync(file, "const NOTHING = 1;\n");
  assert.throws(() => readVersion(file), /found 0/);
});

test("the card itself carries a well-formed version", () => {
  assert.ok(isVersion(readVersion()), readVersion());
});
