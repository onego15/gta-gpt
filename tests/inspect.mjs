import { chromium } from "@playwright/test";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto("http://localhost:5181/?test");
await page.waitForFunction(() => window.__game, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: "docs/title.png" });
await page.click("#start");
await page.waitForTimeout(2000);
await page.screenshot({ path: "docs/street.png" });
console.log(
  JSON.stringify(
    { errors, state: await page.evaluate(() => window.__game.state()) },
    null,
    2,
  ),
);
await browser.close();
