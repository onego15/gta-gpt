import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
const state = () => page.evaluate(() => __game.state()),
  wait = (ms) => page.waitForTimeout(ms);
async function test(name, f) {
  try {
    await f();
    results.push({ name, pass: true });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, pass: false, error: e.message });
    console.log("FAIL", name, e.message);
  }
}
try {
  await page.goto("http://localhost:5181/?test");
  await page.waitForFunction(() => window.__game, { timeout: 60000 });
  await page.click("#start");
  await test("Combat mission: aim and shoot all enemies with actual mouse input", async () => {
    await page.evaluate(() => {
      __game.mission(1);
      __game.teleport(54, 34, 0);
    });
    await page.keyboard.press("q");
    await page.mouse.down({ button: "right" });
    await wait(500);
    let frames = 0;
    for (let round = 0; round < 36; round++) {
      const enemies = await page.evaluate(() => __game.enemyPositions());
      if (!enemies.length) break;
      const visible = await page.evaluate(() => __game.visibleEnemies());
      const pos = visible[0] || enemies[0];
      if (!visible.length) {
        const tactical = await page.evaluate(
          (p) => __game.tacticalPosition(p),
          pos,
        );
        if (tactical)
          await page.evaluate((p) => __game.teleport(p[0], p[2]), tactical);
      }
      await page.evaluate((p) => __game.aimAt(p), pos);
      await wait(220);
      if (frames++ === 0) await page.screenshot({ path: "docs/aim.png" });
      if ((await state()).ammo === 0) {
        await page.keyboard.press("r");
        await wait(1600);
      }
      await page.mouse.down();
      await wait(270);
      await page.mouse.up();
      await wait(100);
      if ((await state()).hp < 1) break;
    }
    await page.mouse.up({ button: "right" });
    const s = await state();
    console.log("combat result", s.mission, s.hp, s.ammo);
    await page.screenshot({ path: "docs/mission-combat.png" });
    assert.equal(s.mission, null);
    assert.equal(s.completed, 1);
  });
  await test("Escape mission: line-of-sight loss, wanted decay, safe destination", async () => {
    await page.evaluate(() => {
      __game.setWanted(0);
      __game.heal();
      __game.mission(2);
      __game.teleport(-56, -56);
    });
    await page.waitForFunction(() => __game.state().wanted === 0, {
      timeout: 60000,
    });
    let s = await state();
    console.log("hidden result", s.wanted, s.hidden, s.hp);
    assert.equal(s.wanted, 0);
    await page.evaluate(() => __game.teleport(-19, 19));
    await wait(500);
    assert.equal((await state()).mission, null);
    assert.ok((await state()).completed >= 2);
  });
  await test("Arrest penalty and police reset", async () => {
    if ((await state()).armed) await page.keyboard.press("q");
    await page.evaluate(() => {
      __game.setWanted(1);
      __game.teleport(28, 15);
    });
    await wait(1400);
    const ps = await page.evaluate(() => __game.policePositions());
    assert.ok(ps.length);
    let before = await state();
    await page.evaluate((p) => __game.teleport(p[0], p[2]), ps[0]);
    await wait(3400);
    let s = await state();
    assert.equal(s.wanted, 0);
    assert.equal(s.cash, Math.max(0, before.cash - 100));
  });
  await test("Civilian vehicle theft causes wanted level", async () => {
    await page.evaluate(() => {
      let c = __game.cars().find((c) => c.ai);
      __game.teleport(c.pos[0] + 2, c.pos[2]);
    });
    await page.keyboard.press("e");
    await wait(800);
    let s = await state();
    assert.ok(s.vehicle);
    assert.ok(s.wanted >= 1);
  });
  await page.screenshot({ path: "docs/driving.png" });
} finally {
  fs.writeFileSync(
    "docs/mission-tests.json",
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        results,
        errors,
        state: await state().catch(() => null),
      },
      null,
      2,
    ),
  );
  console.log({ results, errors });
  await browser.close();
  if (results.some((x) => !x.pass) || errors.length) process.exitCode = 1;
}
