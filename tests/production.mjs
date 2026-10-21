import { chromium } from "@playwright/test";
import fs from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let errors = [],
  failed = [],
  remote = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) failed.push(r.url());
});
page.on("request", (r) => {
  if (
    !r.url().startsWith("http://127.0.0.1:4181") &&
    !r.url().startsWith("data:") &&
    !r.url().startsWith("blob:http://127.0.0.1:4181/")
  )
    remote.push(r.url());
});
try {
  await page.goto("http://127.0.0.1:4181/?test");
  await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "docs/title.png" });
  await page.click("#start");
  await page.waitForTimeout(1700);
  await page.screenshot({ path: "docs/street.png" });
  await page.evaluate(() => {
    __game.teleport(22, 44);
    __game.setAim(Math.PI / 2, 0.25);
  });
  await page.waitForTimeout(600);
  let c = await page.evaluate(() => __game.camera());
  let intersects = await page.evaluate(
    (p) => __game.collision(p[0], p[2], 0.02),
    c.pos,
  );
  assert.equal(
    intersects,
    false,
    "Camera must stay outside building collision",
  );
  await page.setViewportSize({ width: 800, height: 600 });
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "docs/menu-800.png" });
  assert.equal(await page.locator("#resume").isVisible(), true);
  await page.click("#resume");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => __game.teleport(26, 9, Math.PI));
  await page.waitForTimeout(400);
  await page.screenshot({ path: "docs/final-street.png" });
  const state = await page.evaluate(() => __game.state());
  console.log({ errors, failed, remote });
  assert.equal(errors.length, 0);
  assert.equal(failed.length, 0);
  assert.equal(remote.length, 0);
  fs.writeFileSync(
    "docs/production-test.json",
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        passed: true,
        errors,
        failed,
        externalRequests: remote,
        cameraCollision: false,
        state,
      },
      null,
      2,
    ),
  );
  console.log({ passed: true, errors, failed, remote, state });
} finally {
  await browser.close();
}
