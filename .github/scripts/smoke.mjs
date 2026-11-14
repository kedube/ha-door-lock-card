// Opens the demo page in headless Chrome and checks the card for real:
// nothing throws, every built-in lock paints, and a tap locks or unlocks.
//
// Run by the Validate workflow. To run it yourself:
//   npm install --no-save playwright-core && node .github/scripts/smoke.mjs
// It drives the Chrome that is already installed, so there is no browser download.

import { chromium } from "playwright-core";

const DEMO = new URL("../../demo/index.html", import.meta.url).href;
const problems = [];

const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (err) => problems.push(`Uncaught error: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`Console error: ${msg.text()}`);
  });

  await page.goto(DEMO);
  await page.waitForFunction(() => window.demo && window.DoorLockCardInfo && window.demo.cards.length > 0, null, { timeout: 15000 });

  // Locks are drawn a frame at a time; wait until every one of them has painted.
  await page
    .waitForFunction(() => window.demo.cards.every((card) => !card.shadowRoot.querySelector("canvas.lock:not(.ready)")), null, { timeout: 30000 })
    .catch(() => problems.push("Some locks never finished rendering"));

  const report = await page.evaluate(() => {
    // Share of a lock's canvas that is solid: an unpainted canvas scores 0.
    const cover = (card) => {
      const canvas = card.shadowRoot.querySelector("canvas.lock");
      if (!canvas) return null; // a custom-images card has no built-in lock
      const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let solid = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 200) solid++;
      return solid / (canvas.width * canvas.height);
    };
    const covers = window.demo.cards.map(cover);
    return {
      version: window.DoorLockCardInfo.version,
      cards: covers.length,
      locks: covers.filter((c) => c !== null).length,
      blank: covers.filter((c) => c !== null && c < 0.05).length,
      customImages: window.demo.cards.filter((card) => card.shadowRoot.querySelector(".images img, .images video")).length,
    };
  });
  if (report.locks < 10) problems.push(`Expected the demo to show at least 10 built-in locks, found ${report.locks}`);
  if (report.blank) problems.push(`${report.blank} of ${report.locks} locks rendered blank`);
  if (!report.customImages) problems.push("No custom-image card showed its image");

  // Tap the first lock: it should start working at once, then settle unlocked.
  const before = await page.evaluate(() => window.demo.hass.states["lock.front_door"].state);
  await page.evaluate(() => window.demo.cards[0].shadowRoot.querySelector(".stage").click());
  const pending = await page.evaluate(() => window.demo.cards[0].shadowRoot.querySelector("ha-card").classList.contains("pending"));
  if (!pending) problems.push("Tapping a lock did not show it as locking/unlocking straight away");
  const expected = before === "locked" ? "unlocked" : "locked";
  await page
    .waitForFunction(
      (state) =>
        window.demo.hass.states["lock.front_door"].state === state &&
        window.demo.cards[0].shadowRoot.querySelector("ha-card").classList.contains(`pose-${state}`),
      expected,
      { timeout: 10000 }
    )
    .catch(() => problems.push(`A tapped lock never settled as ${expected}`));

  console.log(`Door Lock Card ${report.version}: ${report.cards} demo cards, ${report.locks} built-in locks rendered, tap went ${before} → ${expected}.`);
} finally {
  await browser.close();
}

if (problems.length) {
  console.error(`\nSmoke test failed:\n${[...new Set(problems)].map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("Smoke test passed.");
