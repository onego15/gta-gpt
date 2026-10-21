import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";

const url = process.env.GAME_URL || "http://127.0.0.1:4182/gta-gpt/";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [],
  failed = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) failed.push({ url: r.url(), status: r.status() });
});
page.on("request", (r) => {
  if (r.url().startsWith("http")) requests.push(r.url());
});
try {
  await page.goto(url + "?test", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
  await page.click("#start");
  await page.waitForTimeout(500);
  const initial = await page.evaluate(() => __game.state());
  await page.keyboard.down("w");
  await page.waitForTimeout(700);
  await page.keyboard.up("w");
  const walked = await page.evaluate(() => __game.state());
  assert.ok(initial.pos[2] - walked.pos[2] > 1);
  await page.keyboard.down("s");
  await page.waitForTimeout(700);
  await page.keyboard.up("s");
  await page.keyboard.press("e");
  await page.waitForTimeout(900);
  const entered = await page.evaluate(() => __game.state());
  assert.equal(entered.vehicle, "sedan");
  assert.ok(requests.filter((u) => /\.(gltf|glb)$/.test(u)).length === 8);
  assert.ok(
    requests.every((u) => u.startsWith(url)),
    "Every game request must stay under the deployment base path",
  );
  assert.equal(errors.length, 0);
  assert.equal(failed.length, 0);
  const screenshot = url.startsWith("https:")
    ? ".local/pages-live.png"
    : ".local/pages-local.png";
  await page.screenshot({ path: screenshot });
  const report = {
    url,
    passed: true,
    errors,
    failed,
    assetRequests: requests.filter((u) => /\.(gltf|glb)$/.test(u)),
    walked: true,
    enteredCar: true,
  };
  fs.writeFileSync(
    ".local/pages-verification.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
