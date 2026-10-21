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
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let held = new Set();
async function input(next) {
  for (const k of held) if (!next.includes(k)) await page.keyboard.up(k);
  for (const k of next) if (!held.has(k)) await page.keyboard.down(k);
  held = new Set(next);
}
let samples = [],
  ok = false;
try {
  await page.goto("http://localhost:5181/?test");
  await page.waitForFunction(() => window.__game, { timeout: 60000 });
  await page.click("#start");
  await page.keyboard.press("m");
  await page.keyboard.press("e");
  await page.waitForTimeout(700);
  const route = [
    [24.9, 28],
    [84, 28],
    [84, 86],
    [56, 88],
  ];
  let wp = 0,
    start = Date.now();
  while (Date.now() - start < 90000) {
    const s = await page.evaluate(() => __game.state());
    if (!s.mission) {
      ok = s.completed === 1;
      break;
    }
    if (!s.vehicle) throw Error("Vehicle unexpectedly exited");
    const [x, z] = route[wp],
      dx = x - s.pos[0],
      dz = z - s.pos[2],
      d = Math.hypot(dx, dz);
    if (d < 6 && wp < route.length - 1) {
      wp++;
      continue;
    }
    let delta = Math.atan2(dx, dz) - s.vehicleYaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const desired = Math.abs(delta) > 0.6 ? 4.5 : 9;
    let controls = [];
    if (wp === route.length - 1 && d < 6.5) controls.push("Space");
    else {
      if (s.speed < desired) controls.push("w");
      if (s.speed > desired + 1) controls.push("Space");
      if (delta > 0.055) controls.push("a");
      if (delta < -0.055) controls.push("d");
    }
    await input(controls);
    samples.push({ wp, x: s.pos[0], z: s.pos[2], speed: s.speed, hp: s.hp });
    await page.waitForTimeout(120);
  }
  await input([]);
  await page.screenshot({ path: "docs/delivery-finish.png" });
  console.log({
    ok,
    elapsed: samples.length * 0.12,
    last: samples.at(-1),
    state: await page.evaluate(() => __game.state()),
  });
} finally {
  fs.writeFileSync(
    "docs/driving-test.json",
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        passed: ok,
        method:
          "Real keyboard driving from spawn to delivery marker. No teleportation or direct vehicle-state changes.",
        errors,
        samples,
      },
      null,
      2,
    ),
  );
  await browser.close();
  if (!ok) process.exitCode = 1;
}
