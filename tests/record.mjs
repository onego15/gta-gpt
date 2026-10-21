import { chromium } from "@playwright/test";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const dir = ".local/capture";
fs.mkdirSync(dir, { recursive: true });
await page.goto("http://localhost:5181/?test");
await page.waitForFunction(() => window.__game, { timeout: 60000 });
await page.waitForTimeout(700);
const pause = (ms) => page.waitForTimeout(ms);
const key = async (k, t) => {
  await page.keyboard.down(k);
  await pause(t);
  await page.keyboard.up(k);
};
let done = false,
  frames = [],
  start = Date.now();
const play = async () => {
  await pause(1000);
  await page.click("#start");
  await pause(1100);
  await page.keyboard.press("m");
  await key("w", 1200);
  await key("s", 1200);
  await page.keyboard.press("e");
  await pause(800);
  await key("w", 2500);
  await key("Space", 1200);
  await page.keyboard.press("e");
  await pause(900);
  await page.keyboard.press("q");
  await page.mouse.down({ button: "right" });
  await pause(700);
  await page.mouse.down();
  await pause(600);
  await page.mouse.up();
  await page.mouse.up({ button: "right" });
  await pause(600);
  await page.keyboard.press("q");
  await key("w", 1400);
  await pause(1600);
  done = true;
};
const capture = async () => {
  while (!done) {
    let t = Date.now(),
      file = `${dir}/frame-${String(frames.length).padStart(4, "0")}.jpg`;
    await page.screenshot({ path: file, type: "jpeg", quality: 82 });
    frames.push({ file, time: t - start });
    await pause(Math.max(1, 110 - (Date.now() - t)));
  }
};
try {
  await Promise.all([play(), capture()]);
  await page.screenshot({ path: "docs/gameplay.png" });
  let state = await page.evaluate(() => __game.state());
  fs.writeFileSync(`${dir}/frames.json`, JSON.stringify(frames));
  fs.writeFileSync(
    "docs/recording.json",
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        frames: frames.length,
        durationMs: Date.now() - start,
        method:
          "Continuous screenshots of the running Chrome WebGL game; real keyboard and mouse inputs; no teleportation or generated imagery.",
        state,
      },
      null,
      2,
    ),
  );
  console.log({ frames: frames.length, durationMs: Date.now() - start, state });
} finally {
  await browser.close();
}
