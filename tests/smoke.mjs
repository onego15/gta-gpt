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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [],
  failed = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) failed.push(r.url());
});
const state = () => page.evaluate(() => window.__game.state());
const wait = (ms) => page.waitForTimeout(ms);
const key = async (k, t) => {
  await page.keyboard.down(k);
  await wait(t);
  await page.keyboard.up(k);
};
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, pass: false, error: e.message });
    console.log("FAIL", name, e.message);
  }
}
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5181/?test");
  await page.waitForFunction(() => window.__game, { timeout: 60000 });
  await page.click("#start");
  await wait(900);
  await test("Assets and simulated population", async () => {
    let s = await state();
    assert.equal(s.pedestrians, 30);
    assert.equal(s.traffic.length, 12);
    assert.equal(s.hand, "WristR");
    assert.equal(s.started, true);
  });
  await test("Walk and sprint with real keyboard input", async () => {
    await page.evaluate(() => window.__game.teleport(22, 15, Math.PI));
    let s = await state();
    await key("w", 900);
    let w = await state();
    assert.ok(s.pos[2] - w.pos[2] > 1.5);
    await page.keyboard.down("Shift");
    await key("w", 900);
    await page.keyboard.up("Shift");
    let r = await state();
    assert.ok(w.pos[2] - r.pos[2] > 3);
  });
  await test("Building collision", async () => {
    await page.evaluate(() => window.__game.teleport(22, 44, -Math.PI / 2));
    await key("w", 900);
    let s = await state();
    assert.ok(s.pos[0] > 19.5);
  });
  await test("Enter car, accelerate, brake, exit", async () => {
    await page.evaluate(() => window.__game.teleport(22, 40));
    await page.keyboard.press("e");
    await wait(700);
    assert.equal((await state()).vehicle, "sedan");
    await key("w", 1800);
    assert.ok((await state()).speed > 4);
    await key("Space", 1000);
    assert.ok(Math.abs((await state()).speed) < 2);
    await page.keyboard.press("e");
    await wait(700);
    assert.equal((await state()).vehicle, undefined);
  });
  await test("Delivery mission end-to-end state progression", async () => {
    await page.evaluate(() => {
      window.__game.teleport(22, 40);
      window.__game.mission(0);
    });
    let cs = await page.evaluate(() => window.__game.cars());
    let owned = cs.find((c) => !c.ai);
    await page.evaluate(
      (p) => window.__game.teleport(p[0] + 2, p[2]),
      owned.pos,
    );
    await page.keyboard.press("e");
    await wait(700);
    assert.equal((await state()).vehicle, "sedan");
    await page.evaluate(() => window.__game.teleport(56, 88));
    await wait(500);
    assert.equal((await state()).mission, null);
    assert.equal((await state()).completed, 1);
    await page.keyboard.press("e");
    await wait(700);
  });
  await test("Shoot, recoil, NPC panic, wanted, police dispatch", async () => {
    await page.evaluate(() => window.__game.teleport(28, 8));
    await page.keyboard.press("q");
    await page.mouse.move(640, 400);
    await page.mouse.down({ button: "right" });
    await wait(300);
    await page.mouse.down();
    await wait(650);
    await page.mouse.up();
    await page.mouse.up({ button: "right" });
    let s = await state();
    assert.ok(s.ammo < 12);
    assert.ok(s.wanted > 0);
    assert.ok(s.panic > 0);
    await wait(7500);
    s = await state();
    assert.ok(s.police > 0);
    assert.ok(s.policeCars > 0);
    await page.screenshot({ path: "docs/combat.png" });
  });
  await test("Reload transfers ammunition", async () => {
    await page.evaluate(() => window.__game.setAmmo(2, 20));
    await page.keyboard.press("r");
    await wait(1900);
    let s = await state();
    assert.equal(s.ammo, 12);
    assert.equal(s.reserve, 10);
  });
  await test("Death penalty and safe respawn", async () => {
    let s = await state();
    await page.evaluate(() => window.__game.damage(999));
    await wait(2400);
    let n = await state();
    assert.equal(n.hp, 100);
    assert.equal(n.wanted, 0);
    assert.equal(n.police, 0);
    assert.equal(n.cash, Math.max(0, s.cash - 100));
  });
  await test("Pause freezes simulation and resume works", async () => {
    await page.keyboard.press("Escape");
    await wait(200);
    assert.equal((await state()).paused, true);
    let a = await state();
    await key("w", 500);
    let b = await state();
    assert.deepEqual(a.pos, b.pos);
    await page.click("#resume");
    assert.equal((await state()).paused, false);
  });
  await test("Traffic remains finite after combat", async () => {
    let s = await state();
    assert.ok(s.traffic.length === 12);
    assert.ok(
      s.traffic.every(
        (c) => c.pos.every(Number.isFinite) && Number.isFinite(c.speed),
      ),
    );
    assert.ok(s.traffic.some((c) => c.speed > 3));
  });
  await page.evaluate(() => window.__game.teleport(28, 10, Math.PI));
  await wait(500);
  await page.screenshot({ path: "docs/verified-street.png" });
} finally {
  const report = {
    timestamp: new Date().toISOString(),
    results,
    errors,
    failed,
    state: await state().catch(() => null),
  };
  fs.writeFileSync("docs/test-results.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ results, errors, failed }, null, 2));
  await browser.close();
  if (results.some((r) => !r.pass) || errors.length) process.exitCode = 1;
}
