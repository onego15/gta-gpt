import * as T from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  createWorld,
  solids,
  cover,
  roads,
  blocked,
  moveBody,
  visible,
  random,
} from "./world.js";
import { loadAssets, Human, Car } from "./actors.js";
import { createUI, $ } from "./ui.js";
import { AudioSystem } from "./audio.js";
import "./style.css";

createUI();
const scene = new T.Scene();
scene.background = new T.Color("#a9bdaf");
scene.fog = new T.Fog("#a9bdaf", 70, 230);
const renderer = new T.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.17;
renderer.domElement.className = "scene";
document.querySelector("#app").prepend(renderer.domElement);
const camera = new T.PerspectiveCamera(57, innerWidth / innerHeight, 0.1, 450);
const pmrem = new T.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.28;
pmrem.dispose();
scene.add(new T.HemisphereLight("#c4dde4", "#806b57", 1.55));
const sun = new T.DirectionalLight("#ffcd91", 3.0);
sun.position.set(-65, 43, 32);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -60,
  right: 60,
  top: 60,
  bottom: -60,
  near: 1,
  far: 190,
});
sun.shadow.normalBias = 0.035;
sun.shadow.bias = -0.00008;
scene.add(sun, sun.target);
const sky = new Sky();
sky.scale.setScalar(1000);
sky.material.uniforms.turbidity.value = 5;
sky.material.uniforms.rayleigh.value = 2;
sky.material.uniforms.mieCoefficient.value = 0.005;
sky.material.uniforms.sunPosition.value.copy(sun.position).normalize();
scene.add(sky);
const world = createWorld(scene),
  audio = new AudioSystem();
const keys = {};
let started = false,
  paused = false,
  time = 0,
  last = performance.now(),
  yaw = Math.PI,
  pitch = 0.25,
  aim = false,
  mouseDown = false,
  drag = false,
  lastMouse = 0;
let player,
  vehicle = null,
  armed = false,
  ammo = 12,
  reserve = 72,
  reload = 0,
  shotCooldown = 0,
  wanted = 0,
  heat = 0,
  hidden = 0,
  lastCrime = -100,
  cash = 250,
  damageFlash = 0,
  arrest = 0,
  transition = 0,
  entering = null,
  dispatchAt = 0;
let humans = [],
  cars = [],
  police = [],
  policeCars = [],
  enemies = [],
  effects = [],
  mission = null,
  missionIndex = 0,
  completed = 0,
  missionClock = 0,
  toastTime = 0,
  steps = 0,
  respawnTimer = 0;
let fps = 60,
  frames = 0,
  perfTimer = 0,
  lowQuality = false;
const vec = new T.Vector3(),
  target = new T.Vector3(),
  camDesired = new T.Vector3(),
  camTarget = new T.Vector3(),
  raycaster = new T.Raycaster();
const safehouse = new T.Vector3(-19, 0, 19);
const stories = [
  {
    name: "夕暮れの配達人",
    tag: "THE LAST DELIVERY",
    text: "カフェの車で、港の荷受け場へ。黄色のマーカーまで安全運転で届けよう。",
    reward: 350,
    target: new T.Vector3(56, 0, 88),
  },
  {
    name: "埠頭の用心棒",
    tag: "TROUBLE AT PIER 04",
    text: "倉庫の奥にいる3人を制圧。Qで装備、右クリックで照準、左クリックで射撃。",
    reward: 600,
    target: new T.Vector3(54, 0, 46),
  },
  {
    name: "夜にまぎれて",
    tag: "VANISH INTO THE CITY",
    text: "警察の視界を遮って追跡を振り切ろう。手配が消えたら、公園の救護所へ。",
    reward: 500,
    target: safehouse.clone(),
  },
];
function toast(s) {
  $("toast").textContent = s;
  $("toast").classList.add("show");
  toastTime = 4;
}
function money(n) {
  cash = Math.max(0, cash + n);
  try {
    localStorage.setItem("harbor-save", JSON.stringify({ cash, completed }));
  } catch {}
}
function crime(amount = 1) {
  if (!wanted) dispatchAt = time + 7;
  heat = Math.min(5, heat + amount);
  wanted = Math.max(1, Math.ceil(heat));
  lastCrime = time;
  hidden = 0;
}
function marker(color) {
  let g = new T.Group();
  const ring = new T.Mesh(
    new T.TorusGeometry(1.3, 0.055, 6, 48),
    new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  g.add(ring);
  let pin = new T.Mesh(
    new T.OctahedronGeometry(0.3),
    new T.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.5,
    }),
  );
  pin.position.y = 2.4;
  g.add(pin);
  scene.add(g);
  return g;
}
const objectiveMarker = marker("#f3bd6c"),
  healMarker = marker("#a4dcc5");
healMarker.position.copy(safehouse);
objectiveMarker.position.set(18, 0, 39);
function startMission() {
  if (mission) {
    toast("進行中の仕事を終えてから、次の依頼を受けよう。");
    return;
  }
  let i = missionIndex % 3;
  mission = { index: i, stage: 0, elapsed: 0 };
  missionClock = 0;
  objectiveMarker.position.copy(stories[i].target);
  objectiveMarker.visible = true;
  if (i === 0) {
    toast("配達の依頼：車に乗って埠頭へ。");
  }
  if (i === 1) {
    for (let e of enemies) scene.remove(e.group);
    enemies = [];
    for (let k = 0; k < 3; k++) {
      const e = new Human(scene, k % 2 ? "suit" : "casual");
      e.pos.set(46 + k * 8, 0, 46 + (k % 2) * 5);
      e.group.rotation.y = Math.PI;
      e.gun.visible = true;
      e.hp = 68;
      e.home = e.pos.clone();
      e.cover = cover[(k + 2) % cover.length].clone();
      e.phase = k;
      enemies.push(e);
    }
    ammo = 12;
    reserve = Math.max(72, reserve);
    toast("埠頭に3人の武装した密輸業者。遮蔽物を使って近づこう。");
  }
  if (i === 2) {
    crime(2);
    toast("追跡を振り切り、公園の救護所へ。");
  }
  updateMissionUI();
}
function finishMission() {
  const m = stories[mission.index];
  completed++;
  money(m.reward);
  $("missiondone").style.display = "block";
  $("missiondone").querySelector("h2").textContent = m.name;
  $("missiondone").querySelector("p").textContent =
    `報酬 +$${m.reward} · 次の物語へ M`;
  setTimeout(() => ($("missiondone").style.display = "none"), 5000);
  audio.tone(880, 0.3, 0.12);
  setTimeout(() => audio.tone(1100, 0.4, 0.08), 180);
  missionIndex++;
  mission = null;
  objectiveMarker.visible = false;
  updateMissionUI();
}
function updateMissionUI() {
  let i = mission ? mission.index : missionIndex % 3,
    m = stories[i];
  $("missiontag").textContent = `CITY STORIES / 0${i + 1} · ${m.tag}`;
  $("missiontitle").textContent = m.name;
  $("missiontext").textContent = mission
    ? m.text
    : "小さな仕事から、この街の物語が始まる。自由に探索するか、M で依頼を受けよう。";
  if (!mission) $("progress").style.width = "0%";
  $("missionmeta").textContent = mission
    ? "進行中 · 黄色のマーカーへ"
    : `自由探索中 · M で開始 · 報酬 $${m.reward}`;
}
function setPause(v) {
  paused = v;
  $("pause").style.display = v ? "flex" : "none";
  if (v) {
    keysClear();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  last = performance.now();
}
function keysClear() {
  for (let k in keys) keys[k] = false;
  mouseDown = false;
  aim = false;
}
$("hud").style.visibility = "hidden";
$("start").onclick = () => {
  if (!player) return;
  started = true;
  $("intro").style.display = "none";
  $("hud").style.visibility = "visible";
  audio.start();
  toast("マリン湾へようこそ。Eでカフェの車へ、Mで最初の仕事。");
};
$("resume").onclick = () => setPause(false);
$("sound").onclick = () => {
  $("sound").textContent = audio.mute() ? "音声 OFF" : "音声 ON";
};
$("quality").onclick = () => {
  lowQuality = !lowQuality;
  renderer.setPixelRatio(lowQuality ? 1 : Math.min(devicePixelRatio, 1.5));
  sun.shadow.mapSize.set(lowQuality ? 1024 : 2048, lowQuality ? 1024 : 2048);
  if (sun.shadow.map) {
    sun.shadow.map.dispose();
    sun.shadow.map = null;
  }
  $("quality").textContent = "画質 " + (lowQuality ? "LOW" : "HIGH");
};
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
addEventListener("keydown", (e) => {
  if (
    [
      "Space",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Tab",
    ].includes(e.code)
  )
    e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === "Escape" && started) {
    setPause(!paused);
    return;
  }
  if (!started || paused) return;
  if (e.code === "KeyE") interact();
  if (e.code === "KeyQ" && !vehicle) {
    armed = !armed;
    if (armed) pitch = 0.035;
    toast(armed ? "サイドアーム装備 · 右クリックで照準" : "武器をしまった");
  }
  if (e.code === "KeyR") beginReload();
  if (e.code === "KeyM") startMission();
  if (e.code === "KeyC") yaw = vehicle ? vehicle.yaw : player.group.rotation.y;
  if (e.code === "KeyH") document.body.classList.toggle("hideui");
});
addEventListener("keyup", (e) => (keys[e.code] = false));
addEventListener("blur", () => {
  keysClear();
  if (started) setPause(true);
});
renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
renderer.domElement.addEventListener("mousedown", (e) => {
  if (!started || paused) return;
  audio.start();
  drag = true;
  if (e.button === 2) {
    aim = true;
    armed = !vehicle;
  }
  if (e.button === 0) {
    mouseDown = true;
    if (!document.pointerLockElement)
      renderer.domElement.requestPointerLock?.().catch(() => {});
  }
});
addEventListener("mouseup", (e) => {
  drag = false;
  if (e.button === 2) aim = false;
  if (e.button === 0) mouseDown = false;
});
addEventListener("mousemove", (e) => {
  if (started && !paused && (document.pointerLockElement || drag)) {
    yaw -= e.movementX * 0.0025;
    pitch = T.MathUtils.clamp(pitch + e.movementY * 0.002, -0.45, 0.85);
    lastMouse = time;
  }
});
function nearestCar() {
  let nearest = null,
    dist = 4;
  for (const c of cars) {
    const d = c.pos.distanceTo(player.pos);
    if (d < dist) {
      nearest = c;
      dist = d;
    }
  }
  return nearest;
}
function interact() {
  if (transition > 0) return;
  if (vehicle) {
    if (Math.abs(vehicle.speed) > 4) {
      toast("速度を落としてから降りてください。");
      return;
    }
    let exit = null;
    for (let side of [-1, 1]) {
      let p = vehicle.pos
        .clone()
        .add(
          new T.Vector3(
            Math.cos(vehicle.yaw) * side * 2,
            0,
            -Math.sin(vehicle.yaw) * side * 2,
          ),
        );
      if (!blocked(p.x, p.z, 0.4)) {
        exit = p;
        break;
      }
    }
    if (!exit) {
      toast("ドアの脇に空間がありません。少し車を動かしてください。");
      return;
    }
    player.pos.copy(exit);
    player.group.visible = true;
    player.group.rotation.y = vehicle.yaw;
    vehicle.speed = 0;
    vehicle = null;
    transition = 0.6;
    toast("車から降りた");
    return;
  }
  if (player.pos.distanceTo(safehouse) < 3) {
    player.hp = 100;
    ammo = 12;
    reserve = 72;
    toast("救護所：HPと弾薬を補給しました。");
    audio.tone(650, 0.2, 0.1);
    return;
  }
  let c = nearestCar();
  if (!c) return;
  if (c.ai && !c.stolen) {
    crime(1.1);
    toast("車両を強奪。警察に通報された！");
  } else toast("W/S アクセル・後退 · A/D ステア · SPACE ハンドブレーキ");
  c.stolen = true;
  c.ai = false;
  c.speed = 0;
  entering = c;
  armed = false;
  aim = false;
  player.play("Interact");
  transition = 0.55;
  player.group.rotation.y = Math.atan2(
    c.pos.x - player.pos.x,
    c.pos.z - player.pos.z,
  );
  yaw = c.yaw;
}
function beginReload() {
  if (!armed || vehicle || reload > 0 || ammo === 12 || reserve === 0) return;
  reload = 1.5;
  audio.tone(360, 0.07, 0.12, "square");
  toast("リロード中…");
}
function particle(p, c, size = 0.12, life = 0.3) {
  let m = new T.Mesh(
    new T.IcosahedronGeometry(size, 0),
    new T.MeshBasicMaterial({ color: c, transparent: true }),
  );
  m.position.copy(p);
  scene.add(m);
  effects.push({
    mesh: m,
    life,
    max: life,
    v: new T.Vector3((random() - 0.5) * 2, random() * 2, (random() - 0.5) * 2),
  });
}
function tracer(a, b, c = "#f6d7a2") {
  let geom = new T.BufferGeometry().setFromPoints([a, b]),
    line = new T.Line(
      geom,
      new T.LineBasicMaterial({ color: c, transparent: true, opacity: 0.7 }),
    );
  scene.add(line);
  effects.push({ mesh: line, life: 0.07, max: 0.07 });
}
function shoot() {
  if (!armed || vehicle || shotCooldown > 0 || reload > 0 || transition > 0)
    return;
  if (ammo <= 0) {
    beginReload();
    return;
  }
  ammo--;
  shotCooldown = 0.22;
  crime(0.15);
  audio.shot();
  yaw += (random() - 0.5) * 0.008;
  pitch = Math.min(0.8, pitch + 0.012);
  let start = player.pos
    .clone()
    .add(new T.Vector3(Math.sin(yaw) * 0.7, 1.36, Math.cos(yaw) * 0.7));
  particle(start, "#ffeec0", 0.15, 0.065);
  raycaster.setFromCamera(new T.Vector2(0, 0), camera);
  const enemiesAlive = [...enemies, ...police].filter((x) => !x.dead);
  let chosen = null,
    best = Infinity;
  for (const e of enemiesAlive) {
    let center = e.pos.clone().add(new T.Vector3(0, 1, 0));
    let d = raycaster.ray.distanceSqToPoint(center),
      along = center
        .clone()
        .sub(raycaster.ray.origin)
        .dot(raycaster.ray.direction);
    if (
      d < (aim ? 0.65 : 0.8) ** 2 &&
      along > 0 &&
      along < best &&
      visible(player.pos, e.pos)
    ) {
      best = along;
      chosen = e;
    }
  }
  let end = raycaster.ray.at(chosen ? best : 65, new T.Vector3());
  if (chosen) {
    chosen.hp -= 34;
    end.copy(chosen.pos).y += 1.2;
    particle(end, "#ffcd7d", 0.13, 0.2);
    $("crosshair").classList.add("hit");
    setTimeout(() => $("crosshair").classList.remove("hit"), 140);
    if (police.includes(chosen)) crime(0.65);
    if (chosen.hp <= 0) {
      chosen.kill();
      if (enemies.includes(chosen)) money(35);
    } else chosen.play("HitRecieve", 0.04);
  } else {
    // world hit point, limited to colliders for impact effect
    let nearest = 65;
    for (let s of solids) {
      let bb = new T.Box3(
          new T.Vector3(s.x - s.w, 0, s.z - s.d),
          new T.Vector3(s.x + s.w, s.h, s.z + s.d),
        ),
        p = raycaster.ray.intersectBox(bb, new T.Vector3());
      if (p) {
        let d = p.distanceTo(raycaster.ray.origin);
        if (d < nearest) {
          nearest = d;
          end.copy(p);
        }
      }
    }
    for (let k = 0; k < 3; k++) particle(end, "#e7c391", 0.06, 0.3);
  }
  tracer(start, end);
  player.play("Gun_Shoot", 0.04);
}
function hurt(n) {
  if (respawnTimer > 0) return;
  player.hp = Math.max(0, player.hp - n);
  damageFlash = 0.7;
  if (player.hp <= 0) {
    respawnTimer = 2;
    player.kill();
    toast("ダウンした… 救護所へ搬送中");
  }
}
function respawn(reason = "治療費") {
  vehicle = null;
  entering = null;
  player.group.visible = true;
  player.dead = false;
  player.hp = 100;
  player.pos.copy(safehouse);
  player.active?.stop();
  player.current = null;
  player.play("Idle");
  yaw = Math.PI;
  wanted = 0;
  heat = 0;
  hidden = 0;
  arrest = 0;
  money(-100);
  ammo = 12;
  reserve = 72;
  armed = false;
  for (let p of police) scene.remove(p.group);
  police = [];
  for (let c of policeCars) {
    scene.remove(c.group);
    cars.splice(cars.indexOf(c), 1);
  }
  policeCars = [];
  if (mission) {
    for (let e of enemies) scene.remove(e.group);
    enemies = [];
    mission = null;
    objectiveMarker.visible = false;
    updateMissionUI();
  }
  toast(`${reason} −$100 · 救護所から再開。Mで依頼を再挑戦できます。`);
}
function spawnOfficer() {
  let pos;
  for (let tries = 0; tries < 20; tries++) {
    let a = random() * Math.PI * 2,
      d = 25 + random() * 18;
    pos = player.pos
      .clone()
      .add(new T.Vector3(Math.sin(a) * d, 0, Math.cos(a) * d));
    if (!blocked(pos.x, pos.z, 0.5)) break;
    pos = null;
  }
  if (!pos) return;
  let p = new Human(scene, "officer");
  p.pos.copy(pos);
  p.gun.visible = true;
  p.hp = 100;
  police.push(p);
}
function roadRoute(a, b) {
  const nearest = (v) =>
    roads.reduce((p, c) => (Math.abs(c - v) < Math.abs(p - v) ? c : p));
  let ax = nearest(a.x),
    az = nearest(a.z),
    bx = nearest(b.x),
    bz = nearest(b.z);
  let nodes = [];
  if (Math.abs(a.x - ax) < Math.abs(a.z - az))
    nodes.push(new T.Vector3(ax, 0, az));
  else nodes.push(new T.Vector3(ax, 0, az));
  let x = ax,
    z = az;
  while (x !== bx) {
    x += Math.sign(bx - x) * 56;
    nodes.push(new T.Vector3(x, 0, z));
  }
  while (z !== bz) {
    z += Math.sign(bz - z) * 56;
    nodes.push(new T.Vector3(x, 0, z));
  }
  return nodes;
}
function spawnPoliceCar() {
  let x = roads.reduce((p, c) =>
    Math.abs(c - player.pos.x) < Math.abs(p - player.pos.x) ? c : p,
  );
  let z = player.pos.z < 0 ? 84 : -84;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (
      !cars.some((car) => Math.hypot(car.pos.x - (x - 2.6), car.pos.z - z) < 6)
    )
      break;
    z += z > 0 ? -7 : 7;
  }
  let c = new Car(scene, "police", x - 2.6, z, 0);
  c.ai = true;
  c.pursuit = true;
  c.route = roadRoute(c.pos, player.pos);
  c.refresh = 0;
  cars.push(c);
  policeCars.push(c);
}
function updatePolice(dt) {
  if (!wanted) {
    if (police.length || policeCars.length) {
      for (let p of police) scene.remove(p.group);
      police = [];
      for (let c of policeCars) {
        scene.remove(c.group);
        cars.splice(cars.indexOf(c), 1);
      }
      policeCars = [];
    }
    return;
  }
  if (time < dispatchAt) {
    $("search").textContent = "通報受理 · 警察が現場へ向かっています";
    return;
  }
  let living = police.filter((p) => !p.dead);
  if (
    living.length < wanted + 1 &&
    Math.floor(time * 1.5) !== updatePolice.spawn
  ) {
    updatePolice.spawn = Math.floor(time * 1.5);
    spawnOfficer();
  }
  if (policeCars.length < Math.min(3, wanted)) spawnPoliceCar();
  let seen = false;
  for (let p of police) {
    p.update(dt);
    p.pos.y = groundHeight(p.pos);
    if (p.dead) continue;
    const d = p.pos.distanceTo(player.pos),
      los = d < 48 && visible(p.pos, player.pos);
    if (los) {
      seen = true;
      p.lastSeen = player.pos.clone();
    }
    if (los || p.lastSeen) {
      let dest = los ? player.pos : p.lastSeen;
      let delta = dest.clone().sub(p.pos),
        distance = delta.length();
      let angle = Math.atan2(delta.x, delta.z);
      p.group.rotation.y = angle;
      const speed = 2.3 + wanted * 0.45;
      if (distance > 10 || !los) {
        let hit = moveBody(
          p.pos,
          Math.sin(angle) * speed * dt,
          Math.cos(angle) * speed * dt,
          0.4,
        );
        if (hit) {
          let side = Math.sin(time + p.pos.x) > 0 ? 1 : -1;
          moveBody(
            p.pos,
            Math.cos(angle) * speed * dt * side,
            -Math.sin(angle) * speed * dt * side,
            0.4,
          );
        }
        p.play("Run");
      } else p.play("Idle_Gun_Pointing");
      p.cooldown -= dt;
      if (los && distance < 25 && p.cooldown <= 0) {
        p.cooldown = 1.8 + random() * 0.8;
        tracer(
          p.pos.clone().add(new T.Vector3(0, 1.35, 0)),
          player.pos.clone().add(new T.Vector3(0, 1.1, 0)),
          "#f0ad74",
        );
        audio.shot(true);
        if (random() < 0.65) hurt(vehicle ? 1 : 2 + wanted);
        p.play("Gun_Shoot");
      }
      if (!los && distance < 2) p.lastSeen = null;
    } else p.play("Idle");
  }
  for (let c of policeCars)
    if (c.pos.distanceTo(player.pos) < 38 && visible(c.pos, player.pos))
      seen = true;
  if (!seen && time - lastCrime > 3) {
    hidden += dt;
    if (hidden > 9) {
      heat = Math.max(0, heat - 1);
      wanted = Math.ceil(heat);
      hidden = 0;
      if (!wanted) toast("追跡を振り切った。街はいつもの姿に戻った。");
    }
  } else hidden = Math.max(0, hidden - dt * 2);
  let near = living.some((p) => p.pos.distanceTo(player.pos) < 1.5);
  if (near && !armed && !vehicle) {
    arrest += dt;
    if (arrest > 2.5) respawn("逮捕・罰金");
  } else arrest = 0;
  $("search").textContent =
    arrest > 0
      ? "逮捕される前に離れよう！"
      : seen
        ? "追跡中 · 視線を遮ろう"
        : `捜索中 · あと ${Math.max(0, Math.ceil(9 - hidden))} 秒 隠れる`;
}
function updateEnemies(dt) {
  for (let e of enemies) {
    e.update(dt);
    e.pos.y = groundHeight(e.pos);
    if (e.dead) continue;
    let delta = player.pos.clone().sub(e.pos),
      d = delta.length();
    if (d > 42) {
      e.play("Idle_Gun");
      continue;
    }
    e.group.rotation.y = Math.atan2(delta.x, delta.z);
    let los = visible(e.pos, player.pos);
    e.phase += dt; // alternate between a physical cover position and an exposed firing edge
    let coverPoint = e.cover
      .clone()
      .add(
        new T.Vector3(
          Math.sin(e.phase * 0.2) * 2.9,
          0,
          Math.cos(e.phase * 0.2) * 2.9,
        ),
      );
    let dest =
      Math.floor(e.phase / 3) % 2 === 0
        ? coverPoint
        : e.home
            .clone()
            .add(
              new T.Vector3(Math.cos(e.phase) * 3, 0, Math.sin(e.phase) * 2),
            );
    let dif = dest.sub(e.pos);
    if (dif.length() > 1) {
      dif.normalize();
      const hit = moveBody(e.pos, dif.x * 2 * dt, dif.z * 2 * dt, 0.35);
      if (hit) moveBody(e.pos, -dif.z * 2 * dt, dif.x * 2 * dt, 0.35);
      e.play("Run_Shoot");
    } else e.play("Idle_Gun_Pointing");
    e.cooldown -= dt;
    if (los && d < 32 && e.cooldown <= 0) {
      e.cooldown = 2 + random();
      audio.shot(true);
      tracer(
        e.pos.clone().add(new T.Vector3(0, 1.3, 0)),
        player.pos.clone().add(new T.Vector3(0, 1, 0)),
        "#ffbd78",
      );
      particle(
        e.pos
          .clone()
          .add(
            new T.Vector3(
              Math.sin(e.group.rotation.y) * 0.6,
              1.3,
              Math.cos(e.group.rotation.y) * 0.6,
            ),
          ),
        "#ffe3a0",
        0.12,
        0.07,
      );
      if (random() < 0.55) hurt(vehicle ? 1 : 4);
      e.play("Gun_Shoot");
    }
  }
}
function setupTraffic() {
  const routes = [
    [
      [30.6, 30.6],
      [30.6, 86.6],
      [-81.4, 86.6],
      [-81.4, -25.4],
      [30.6, -25.4],
    ],
    [
      [81.4, 25.4],
      [-30.6, 25.4],
      [-30.6, -86.6],
      [81.4, -86.6],
    ],
    [
      [-25.4, -81.4],
      [86.6, -81.4],
      [86.6, 81.4],
      [-25.4, 81.4],
    ],
  ];
  for (let i = 0; i < 12; i++) {
    let route = routes[i % 3].map((p) => new T.Vector3(p[0], 0, p[1]));
    let wp = i % route.length;
    let next = (wp + 1) % route.length;
    let p = route[wp].clone().lerp(route[next], 0.15 + Math.floor(i / 3) * 0.2);
    let dir = route[next].clone().sub(p);
    let c = new Car(
      scene,
      i % 3 === 0 ? "taxi" : "sedan",
      p.x,
      p.z,
      Math.atan2(dir.x, dir.z),
    );
    c.ai = true;
    c.route = route;
    c.wp = next;
    c.cruise = 6 + random() * 3;
    cars.push(c);
  }
  const car = new Car(scene, "sedan", 24.9, 42, Math.PI);
  car.owned = true;
  cars.push(car);
  new Car(scene, "taxi", 91, 20, Math.PI);
}
function updateCars(dt) {
  for (let c of cars) {
    if (c === vehicle) {
      const throttle =
          (keys.KeyW || keys.ArrowUp ? 1 : 0) -
          (keys.KeyS || keys.ArrowDown ? 1 : 0),
        steer =
          (keys.KeyA || keys.ArrowLeft ? 1 : 0) -
          (keys.KeyD || keys.ArrowRight ? 1 : 0);
      c.speed += throttle * (c.speed * throttle < 0 ? 19 : 10) * dt;
      c.speed *= Math.exp(-(throttle ? 0.17 : 1.2) * dt);
      if (keys.Space) c.speed *= Math.exp(-5 * dt);
      c.speed = T.MathUtils.clamp(c.speed, -9, 26);
      c.steer = steer;
      c.yaw +=
        steer *
        Math.min(Math.abs(c.speed) / 5, 1) *
        1.25 *
        dt *
        Math.sign(c.speed || 1);
      let hit = moveBody(
        c.pos,
        Math.sin(c.yaw) * c.speed * dt,
        Math.cos(c.yaw) * c.speed * dt,
        1.05,
      );
      if (hit && Math.abs(c.speed) > 2) {
        hurt(Math.abs(c.speed) * 0.3);
        c.speed *= -0.25;
        audio.tone(75, 0.15, 0.18, "triangle");
      }
      player.pos.copy(c.pos);
      if (time - lastMouse > 2.5) {
        const diff =
          T.MathUtils.euclideanModulo(c.yaw - yaw + Math.PI, Math.PI * 2) -
          Math.PI;
        yaw += diff * (1 - Math.exp(-dt * 2));
      }
    } else if (c.ai) {
      if (c.pursuit) {
        c.refresh -= dt;
        if (c.refresh <= 0) {
          c.route = roadRoute(c.pos, player.pos);
          c.wp = 0;
          c.refresh = 4;
        }
      }
      let wp = c.route[c.wp];
      if (wp) {
        let d = wp.clone().sub(c.pos);
        if (d.length() < 2.5) {
          if (c.pursuit && c.wp === c.route.length - 1) {
            c.speed = 0;
            c.update(dt, time);
            continue;
          }
          c.wp = (c.wp + 1) % c.route.length;
          wp = c.route[c.wp];
          d = wp.clone().sub(c.pos);
        }
        let desired = Math.atan2(d.x, d.z),
          diff =
            T.MathUtils.euclideanModulo(
              desired - c.yaw + Math.PI,
              Math.PI * 2,
            ) - Math.PI;
        c.yaw += T.MathUtils.clamp(diff, -1.6 * dt, 1.6 * dt);
        let speed = c.pursuit ? 9 + wanted * 1.5 : c.cruise;
        let forward = new T.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
        for (let o of cars) {
          if (o === c) continue;
          let delta = o.pos.clone().sub(c.pos),
            dist = delta.length();
          if (
            dist < 7 &&
            delta.dot(forward) > 0 &&
            Math.abs(delta.x * forward.z - delta.z * forward.x) < 2.4
          )
            speed = 0;
        }
        // staggered stop at junction approach; emergency vehicles have priority
        if (!c.pursuit) {
          let nx = roads.find((x) => Math.abs(x - c.pos.x) < 8),
            nz = roads.find((z) => Math.abs(z - c.pos.z) < 8);
          if (nx !== undefined && nz !== undefined) {
            let horizontal = Math.abs(forward.x) > 0.7,
              green = Math.floor(time / 9) % 2 === 0;
            let remaining = horizontal
              ? (nx - c.pos.x) * forward.x
              : (nz - c.pos.z) * forward.z;
            if (horizontal !== green && remaining > 3 && remaining < 8)
              speed = 0;
          }
        }
        c.speed = T.MathUtils.damp(c.speed, speed, 2, dt);
        const previous = c.pos.clone();
        let hit = moveBody(
          c.pos,
          Math.sin(c.yaw) * c.speed * dt,
          Math.cos(c.yaw) * c.speed * dt,
          1,
        );
        // Swept position check also protects perpendicular intersection traffic.
        // A vehicle already in a tight gap may move away, but never closer.
        if (
          cars.some(
            (other) =>
              other !== c &&
              c.pos.distanceTo(other.pos) < 3.4 &&
              c.pos.distanceTo(other.pos) < previous.distanceTo(other.pos),
          )
        ) {
          c.pos.copy(previous);
          c.speed = 0;
        }
        if (hit) {
          c.speed = 0;
          c.stuck = (c.stuck || 0) + dt;
          if (c.stuck > 2) {
            c.yaw = desired;
            c.stuck = 0;
          }
        } else c.stuck = 0;
      }
    }
    if (c !== vehicle && vehicle) {
      let d = c.pos.distanceTo(vehicle.pos);
      if (d < 2.7 && Math.abs(vehicle.speed) > 3) {
        vehicle.speed *= -0.3;
        c.speed = 0;
        hurt(3);
        crime(0.12);
      }
    }
    c.update(dt, time);
  }
}
function updatePedestrians(dt) {
  for (let h of humans) {
    h.update(dt);
    h.pos.y = groundHeight(h.pos);
    let danger =
      (time - lastCrime < 5 && h.pos.distanceTo(player.pos) < 32) ||
      (vehicle &&
        Math.abs(vehicle.speed) > 8 &&
        h.pos.distanceTo(vehicle.pos) < 10);
    if (danger) h.panic = 5;
    h.panic = Math.max(0, h.panic - dt);
    let to = h.route[h.wp].clone().sub(h.pos);
    if (to.length() < 0.5) {
      h.wp = (h.wp + 1) % h.route.length;
      to = h.route[h.wp].clone().sub(h.pos);
    }
    let a = Math.atan2(to.x, to.z);
    if (h.panic > 0) {
      const away = h.pos.clone().sub(player.pos);
      a = Math.atan2(away.x, away.z);
      if (blocked(h.pos.x + Math.sin(a), h.pos.z + Math.cos(a), 0.3))
        a = Math.atan2(to.x, to.z);
    }
    let speed = h.panic > 0 ? 3.8 : h.walkSpeed;
    let stop = cars.some(
      (c) => Math.abs(c.speed) > 2 && c.pos.distanceTo(h.pos) < 4,
    );
    if (!stop) {
      moveBody(h.pos, Math.sin(a) * speed * dt, Math.cos(a) * speed * dt, 0.27);
      h.group.rotation.y = a;
      h.play(h.panic > 0 ? "Run" : "Walk");
    } else h.play("Idle");
  }
}
function groundHeight(p) {
  return p.z > 92
    ? 0.32
    : [-56, 0, 56].some((x) => Math.abs(p.x - x) < 21.5) &&
        [-56, 0, 56].some((z) => Math.abs(p.z - z) < 21.5)
      ? 0.27
      : 0.04;
}
function updatePlayer(dt) {
  player.update(dt);
  if (!vehicle) player.pos.y = groundHeight(player.pos);
  if (respawnTimer > 0) {
    respawnTimer -= dt;
    if (respawnTimer <= 0) respawn();
    return;
  }
  if (vehicle) return;
  let f =
      (keys.KeyW || keys.ArrowUp ? 1 : 0) -
      (keys.KeyS || keys.ArrowDown ? 1 : 0),
    side =
      (keys.KeyD || keys.ArrowRight ? 1 : 0) -
      (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let run = keys.ShiftLeft || keys.ShiftRight;
  let speed = aim ? 2.2 : run ? 6 : 3.1;
  vec.set(
    Math.sin(yaw) * f - Math.cos(yaw) * side,
    0,
    Math.cos(yaw) * f + Math.sin(yaw) * side,
  );
  let moving = vec.lengthSq() > 0.01;
  if (moving && transition <= 0) {
    vec.normalize();
    moveBody(player.pos, vec.x * speed * dt, vec.z * speed * dt, 0.35);
    let desired = aim ? yaw : Math.atan2(vec.x, vec.z),
      diff =
        T.MathUtils.euclideanModulo(
          desired - player.group.rotation.y + Math.PI,
          Math.PI * 2,
        ) - Math.PI;
    player.group.rotation.y += diff * Math.min(1, dt * 15);
    steps += dt;
    if (steps > (run ? 0.27 : 0.43)) {
      steps = 0;
      audio.tone(95 + random() * 35, 0.04, 0.025, "triangle");
    }
  } else if (aim) player.group.rotation.y = yaw;
  if (transition <= 0 && shotCooldown < 0.08)
    player.play(
      armed
        ? moving
          ? "Run_Shoot"
          : aim
            ? "Idle_Gun_Pointing"
            : "Idle_Gun"
        : moving
          ? run
            ? "Run"
            : "Walk"
          : "Idle",
    );
  player.gun.visible = armed;
  for (let c of cars) {
    if (c.ai && Math.abs(c.speed) > 4 && c.pos.distanceTo(player.pos) < 1.65) {
      hurt(12);
      moveBody(player.pos, Math.cos(c.yaw) * 2, -Math.sin(c.yaw) * 2, 0.35);
      c.speed = 0;
    }
  }
  if (mouseDown && armed) shoot();
}
function updateCamera(dt) {
  if (!started) {
    const t = time * 0.022;
    camTarget.set(9, 2, 36);
    camDesired.set(35 + Math.sin(t) * 6, 13, 63);
    camera.position.lerp(camDesired, 0.03);
    camera.lookAt(camTarget);
    return;
  }
  const driving = !!vehicle,
    dist = driving ? 8.8 : aim ? 3 : armed ? 3.7 : 5.1,
    height = driving ? 2.2 : 1.4;
  target.copy(player.pos).y += height;
  const shoulder = armed ? 0.72 : 0.35;
  target.x += Math.cos(yaw) * shoulder;
  target.z -= Math.sin(yaw) * shoulder;
  camDesired
    .copy(target)
    .add(
      new T.Vector3(
        -Math.sin(yaw) * dist,
        Math.sin(pitch) * dist + (armed ? 0 : 1),
        -Math.cos(yaw) * dist,
      ),
    );
  // Segment versus expanded building boxes prevents the orbit camera passing through façades.
  const ray = camDesired.clone().sub(target),
    length = ray.length();
  ray.normalize();
  raycaster.set(target, ray);
  let allowed = length;
  for (let b of solids) {
    let box = new T.Box3(
      new T.Vector3(b.x - b.w - 0.18, 0, b.z - b.d - 0.18),
      new T.Vector3(b.x + b.w + 0.18, b.h + 0.2, b.z + b.d + 0.18),
    );
    let hit = raycaster.ray.intersectBox(box, vec);
    if (hit)
      allowed = Math.min(allowed, Math.max(0.6, hit.distanceTo(target) - 0.22));
  }
  camDesired.copy(target).addScaledVector(ray, allowed);
  camera.position.lerp(camDesired, 1 - Math.exp(-dt * (aim ? 15 : 8)));
  if (armed && !vehicle) {
    camTarget
      .copy(camera.position)
      .add(
        new T.Vector3(
          Math.sin(yaw) * Math.cos(pitch),
          -Math.sin(pitch),
          Math.cos(yaw) * Math.cos(pitch),
        ).multiplyScalar(60),
      );
    camera.lookAt(camTarget);
  } else camera.lookAt(target);
  camera.fov = T.MathUtils.damp(
    camera.fov,
    aim ? 43 : driving ? 62 : 57,
    6,
    dt,
  );
  camera.updateProjectionMatrix();
  sun.position.copy(player.pos).add(new T.Vector3(-65, 43, 32));
  sun.target.position.copy(player.pos);
  sun.target.updateMatrixWorld();
}
function updateMission(dt) {
  if (!mission) return;
  mission.elapsed += dt;
  let i = mission.index,
    m = stories[i],
    dist = player.pos.distanceTo(m.target);
  if (i === 0) {
    $("progress").style.width = vehicle ? "55%" : "15%";
    $("missionmeta").textContent = vehicle
      ? `埠頭まで ${Math.round(dist)} m · 目的地では停車`
      : "E で車に乗る · カフェのセダンを利用できます";
    if (vehicle && dist < 7 && Math.abs(vehicle.speed) < 2) finishMission();
  } else if (i === 1) {
    let left = enemies.filter((e) => !e.dead).length;
    $("progress").style.width = ((3 - left) / 3) * 100 + "%";
    $("missionmeta").textContent = `残り ${left} 人 · 照準中は歩いて位置を調整`;
    if (left === 0) finishMission();
  } else {
    $("progress").style.width = wanted
      ? Math.max(5, (1 - wanted / 3) * 70) + "%"
      : "85%";
    $("missionmeta").textContent = wanted
      ? "建物や倉庫で警察の視界を遮る"
      : `追跡終了 · 救護所まで ${Math.round(dist)} m`;
    if (!wanted && dist < 4) finishMission();
  }
}
function minimap() {
  const c = $("minimap").getContext("2d"),
    w = 388,
    k = w / 230;
  const point = (p) => [(p.x + 115) * k, (p.z + 115) * k];
  c.fillStyle = "#173b40";
  c.fillRect(0, 0, w, w);
  c.fillStyle = "#c0b393";
  for (let x of [-56, 0, 56])
    for (let z of [-56, 0, 56]) {
      let p = point({ x: x - 21, z: z - 21 });
      c.fillStyle = x === 0 && z === 0 ? "#6f9278" : "#677d76";
      c.fillRect(p[0], p[1], 42 * k, 42 * k);
    }
  c.strokeStyle = "#b9bda0";
  c.lineWidth = 1;
  for (let r of roads) {
    let v = (r + 115) * k;
    c.beginPath();
    c.moveTo(v, 12);
    c.lineTo(v, 360);
    c.moveTo(12, v);
    c.lineTo(376, v);
    c.stroke();
  }
  c.fillStyle = "#477c80";
  c.fillRect(0, 365, 388, 23);
  for (let car of cars) {
    let p = point(car.pos);
    c.fillStyle = car.type === "police" ? "#e89474" : "#b5c9bc";
    c.fillRect(p[0] - 2, p[1] - 2, 4, 4);
  }
  for (let e of [...enemies, ...police])
    if (!e.dead) {
      let p = point(e.pos);
      c.fillStyle = "#ef8871";
      c.beginPath();
      c.arc(...p, 3, 0, Math.PI * 2);
      c.fill();
    }
  let p = point(safehouse);
  c.fillStyle = "#a6ddc5";
  c.fillRect(p[0] - 3, p[1] - 3, 6, 6);
  if (objectiveMarker.visible) {
    p = point(objectiveMarker.position);
    c.strokeStyle = "#f6c478";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(...p, 6, 0, Math.PI * 2);
    c.stroke();
  }
  p = point(player.pos);
  c.save();
  c.translate(...p);
  c.rotate(-(vehicle ? vehicle.yaw : player.group.rotation.y));
  c.fillStyle = "#fff6d8";
  c.beginPath();
  c.moveTo(0, 8);
  c.lineTo(-5, -5);
  c.lineTo(0, -2);
  c.lineTo(5, -5);
  c.closePath();
  c.fill();
  c.restore();
}
function updateUI(dt) {
  $("healthnum").textContent = Math.ceil(player.hp);
  $("health").style.width = player.hp + "%";
  $("cash").textContent = "$ " + cash.toLocaleString();
  $("ammo").innerHTML =
    reload > 0
      ? "RELOADING"
      : `${ammo.toString().padStart(2, "0")} <small>/ ${reserve} · ${armed ? "SIDEARM" : "HOLSTERED"}</small>`;
  $("wanted").innerHTML = wanted
    ? "★".repeat(wanted) + "<span>" + "★".repeat(5 - wanted) + "</span>"
    : "";
  if (!wanted) $("search").textContent = "";
  $("speed").classList.toggle("hidden", !vehicle);
  if (vehicle)
    $("speed").innerHTML =
      `${Math.round(Math.abs(vehicle.speed) * 3.6)}<small>KM/H · ${keys.Space ? "BRAKE" : vehicle.speed < -0.5 ? "REVERSE" : "CRUISE"}</small>`;
  let prompt = "";
  if (vehicle)
    prompt =
      "E  降りる" + (Math.abs(vehicle.speed) > 4 ? " · まず減速しよう" : "");
  else if (player.pos.distanceTo(safehouse) < 3)
    prompt = "E  救護所 · HP・弾薬を補給";
  else {
    let car = nearestCar();
    if (car)
      prompt =
        "E  " +
        (car.ai ? "車を強奪する" : "車に乗る") +
        "  /  " +
        (car.type === "taxi" ? "CITY TAXI" : "MARIN GT");
  }
  if (transition > 0) prompt = "乗降中…";
  $("prompt").textContent = prompt;
  $("crosshair").style.display = armed && !vehicle ? "block" : "none";
  $("crosshair").classList.toggle("aim", aim);
  $("damage").style.opacity = damageFlash;
  damageFlash = Math.max(0, damageFlash - dt * 2);
  toastTime -= dt;
  if (toastTime <= 0) $("toast").classList.remove("show");
  let area =
    player.pos.z > 91
      ? "HARBOR PROMENADE"
      : player.pos.x > 32 && player.pos.z > 30
        ? "PIER 04"
        : Math.abs(player.pos.x) < 25 && Math.abs(player.pos.z) < 25
          ? "MARIN SQUARE"
          : player.pos.z < -30
            ? "OLD TOWN"
            : "COFFEE ROW";
  $("location").innerHTML = area + "<span>マリン湾岸地区</span>";
  let total = 18 * 60 + 42 + Math.floor(time / 60);
  $("time").innerHTML =
    `${Math.floor(total / 60) % 24}:${String(total % 60).padStart(2, "0")} <span class="weather">☀ 21°</span>`;
  if (objectiveMarker.visible) {
    let p = objectiveMarker.position.clone();
    p.y = 3.5;
    p.project(camera);
    const show = p.z < 1 && Math.abs(p.x) < 0.94 && Math.abs(p.y) < 0.85;
    $("waypoint").style.display = show ? "block" : "none";
    $("waypoint").style.left = (p.x * 0.5 + 0.5) * innerWidth + "px";
    $("waypoint").style.top = (-p.y * 0.5 + 0.5) * innerHeight + "px";
    $("waypoint").innerHTML =
      `<b>◇</b>${Math.round(player.pos.distanceTo(objectiveMarker.position))} m`;
  } else $("waypoint").style.display = "none";
  minimap();
}
async function init() {
  try {
    await loadAssets((v) => {
      $("start").innerHTML = `街を読み込み中 <b>${Math.round(v * 100)}%</b>`;
    });
    player = new Human(scene, "hoodie");
    player.pos.set(22, 0.06, 40);
    player.group.rotation.y = Math.PI;
    setupTraffic();
    for (let i = 0; i < 30; i++) {
      let cx = [-56, 0, 56][i % 3],
        cz = [-56, 0, 56][Math.floor(i / 3) % 3];
      if (cx === 56 && cz === 56) cz = 0;
      let h = new Human(scene, ["casual", "woman", "suit"][i % 3]);
      h.route = [
        [-20, -20],
        [20, -20],
        [20, 20],
        [-20, 20],
      ].map(([x, z]) => new T.Vector3(cx + x, 0, cz + z));
      h.wp = i % 4;
      h.pos.copy(h.route[h.wp]).lerp(h.route[(h.wp + 1) % 4], random());
      h.wp = (h.wp + 1) % 4;
      h.walkSpeed = 1 + random() * 0.4;
      h.panic = 0;
      humans.push(h);
    }
    try {
      let save = JSON.parse(localStorage.getItem("harbor-save"));
      if (save) {
        cash = Number.isFinite(save.cash) ? save.cash : 250;
        completed = save.completed || 0;
      }
    } catch {}
    $("start").disabled = false;
    $("start").innerHTML = "街へ出かける <b>→</b>";
    camera.position.set(36, 13, 65);
    updateMissionUI();
    if (new URLSearchParams(location.search).has("test"))
      window.__game = {
        state: () => ({
          started,
          paused,
          armed,
          pos: player.pos.toArray(),
          yaw,
          vehicle: vehicle?.type,
          speed: vehicle?.speed,
          vehicleYaw: vehicle?.yaw,
          ammo,
          reserve,
          reload,
          hp: player.hp,
          wanted,
          hidden,
          police: police.filter((p) => !p.dead).length,
          policeCars: policeCars.length,
          pedestrians: humans.length,
          panic: humans.filter((p) => p.panic > 0).length,
          traffic: cars
            .filter((c) => c.ai)
            .map((c) => ({ pos: c.pos.toArray(), speed: c.speed })),
          mission: mission
            ? { ...mission, left: enemies.filter((e) => !e.dead).length }
            : null,
          completed,
          cash,
          fps,
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          animation: player.current,
          hand: player.hand,
        }),
        teleport: (x, z, a = Math.PI) => {
          player.pos.set(x, 0, z);
          if (vehicle) vehicle.pos.copy(player.pos);
          yaw = a;
          player.group.rotation.y = a;
        },
        setWanted: (n) => {
          heat = n;
          wanted = n;
          lastCrime = time;
          dispatchAt = time;
        },
        damage: hurt,
        heal: () => {
          player.hp = 100;
        },
        setAim: (y, p = 0.12) => {
          yaw = y;
          pitch = p;
        },
        enemyPositions: () =>
          enemies.filter((e) => !e.dead).map((e) => e.pos.toArray()),
        visibleEnemies: () =>
          enemies
            .filter((e) => !e.dead && visible(player.pos, e.pos))
            .map((e) => e.pos.toArray()),
        reset: () => respawn("テスト復帰"),
        tacticalPosition: (p) => {
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
            let v = new T.Vector3(
              p[0] + Math.sin(a) * 5,
              0,
              p[2] + Math.cos(a) * 5,
            );
            if (!blocked(v.x, v.z, 0.5) && visible(v, new T.Vector3(...p)))
              return v.toArray();
          }
          return null;
        },
        aimAt: (p) => {
          let dx = p[0] - player.pos.x,
            dz = p[2] - player.pos.z,
            d = Math.hypot(dx, dz);
          yaw = Math.atan2(dx, dz) - Math.asin(Math.min(0.7, 0.72 / d));
          pitch = Math.atan2(player.pos.y + 1.4 - (p[1] + 1), d);
        },
        policePositions: () =>
          police.filter((p) => !p.dead).map((p) => p.pos.toArray()),
        mission: (i) => {
          mission = null;
          missionIndex = i;
          startMission();
        },
        cars: () =>
          cars.map((c) => ({ type: c.type, pos: c.pos.toArray(), ai: c.ai })),
        setAmmo: (a, r) => {
          ammo = a;
          reserve = r;
        },
        setHealth: (h) => (player.hp = h),
        clearPolice: () => {
          for (let p of police) scene.remove(p.group);
          police = [];
        },
        camera: () => ({
          pos: camera.position.toArray(),
          target: target.toArray(),
        }),
        collision: blocked,
      };
  } catch (e) {
    console.error(e);
    $("start").innerHTML = "読み込みに失敗しました";
    document.querySelector(".intro-copy").textContent =
      "ページを再読み込みしてください。アセットをローカル配信できる Vite サーバーが必要です。";
  }
}
function animate(now) {
  requestAnimationFrame(animate);
  let realDt = (now - last) / 1000;
  last = now;
  let dt = Math.min(0.04, realDt);
  if (!paused) {
    time += dt;
    if (player) {
      if (started) {
        shotCooldown = Math.max(0, shotCooldown - dt);
        transition = Math.max(0, transition - dt);
        if (entering && transition <= 0) {
          vehicle = entering;
          entering = null;
          player.group.visible = false;
        }
        if (reload > 0) {
          reload -= dt;
          if (reload <= 0) {
            let n = Math.min(12 - ammo, reserve);
            ammo += n;
            reserve -= n;
            audio.tone(500, 0.05, 0.1);
          }
        }
        updatePlayer(dt);
        updateCars(dt);
        updatePedestrians(dt);
        updateEnemies(dt);
        updatePolice(dt);
        updateMission(dt);
        audio.update(vehicle?.speed || 0, !!vehicle, wanted, time);
        updateUI(dt);
      } else {
        updateCars(dt);
        updatePedestrians(dt);
        player.update(dt);
      }
      updateCamera(dt);
    }
    for (let m of [objectiveMarker, healMarker]) {
      m.children[1].rotation.y = time;
      m.children[1].position.y = 2.25 + Math.sin(time * 2) * 0.12;
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      let e = effects[i];
      e.life -= dt;
      if (e.life <= 0) {
        scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        effects.splice(i, 1);
      } else {
        e.mesh.material.opacity = e.life / e.max;
        if (e.v) e.mesh.position.addScaledVector(e.v, dt);
      }
    }
    world.water.position.y = -0.03 + Math.sin(time * 0.7) * 0.025;
  }
  renderer.render(scene, camera);
  frames++;
  perfTimer += realDt;
  if (perfTimer >= 1) {
    fps = Math.round(frames / perfTimer);
    frames = 0;
    perfTimer = 0;
  }
}
init();
requestAnimationFrame(animate);
