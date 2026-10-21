import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
const assets = {};
export async function loadAssets(onProgress) {
  let files = [
    "hoodie",
    "casual",
    "woman",
    "officer",
    "suit",
    "sedan",
    "police",
    "taxi",
  ];
  let n = 0;
  await Promise.all(
    files.map(async (name) => {
      assets[name] = await new GLTFLoader().loadAsync(
        "/assets/" + name + (files.indexOf(name) < 5 ? ".gltf" : ".glb"),
      );
      onProgress(++n / files.length);
    }),
  );
}
export class Human {
  constructor(scene, type = "hoodie", color) {
    this.group = new T.Group();
    this.model = clone(assets[type].scene);
    this.group.add(this.model);
    scene.add(this.group);
    const bb = new T.Box3().setFromObject(this.model),
      height = bb.max.y - bb.min.y;
    this.model.scale.setScalar(1.8 / height);
    this.model.position.y = -bb.min.y * this.model.scale.x;
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = true;
        o.material = o.material.clone();
        if (color && /shirt|cloth|top|hoodie/i.test(o.material.name))
          o.material.color.set(color);
      }
    });
    this.mixer = new T.AnimationMixer(this.model);
    this.actions = {};
    for (let clip of assets[type].animations) {
      let c = clip.clone(); // preserve skeletal motion but remove horizontal root drift
      for (const t of c.tracks)
        if (
          t.name.endsWith(".position") &&
          /root|hips|position/i.test(t.name)
        ) {
          for (let j = 0; j < t.values.length; j += 3) {
            t.values[j] = t.values[0];
            t.values[j + 2] = t.values[2];
          }
        }
      this.actions[clip.name] = this.mixer.clipAction(c);
    }
    this.play("Idle");
    this.hp = 100;
    this.cooldown = Math.random() * 2;
    this.dead = false;
    // Small stylized sidearm attached to animated hand, not to the camera.
    this.gun = new T.Group();
    let mesh = new T.Mesh(
      new T.BoxGeometry(0.1, 0.13, 0.3),
      new T.MeshStandardMaterial({
        color: 0x25363c,
        metalness: 0.7,
        roughness: 0.35,
      }),
    );
    mesh.position.z = 0.09;
    this.gun.add(mesh);
    let grip = new T.Mesh(
      new T.BoxGeometry(0.085, 0.18, 0.09),
      new T.MeshStandardMaterial({ color: 0x403d36 }),
    );
    grip.position.y = -0.1;
    this.gun.add(grip);
    let hand;
    this.model.traverse((o) => {
      if (o.isBone && /hand.?r|right.?hand|hand_r|wrist.?r/i.test(o.name))
        hand = o;
    });
    if (hand) {
      hand.add(this.gun);
      this.gun.scale.setScalar(1 / this.model.scale.x);
      this.gun.rotation.x = -Math.PI / 2;
    } else {
      this.group.add(this.gun);
      this.gun.position.set(-0.25, 1.28, 0.55);
    }
    this.gun.visible = false;
    this.hand = hand?.name;
  }
  get pos() {
    return this.group.position;
  }
  play(name, fade = 0.18) {
    if (this.current === name) return;
    const a = this.actions[name] || this.actions.Idle;
    if (!a) return;
    if (this.active) this.active.fadeOut(fade);
    a.reset().fadeIn(fade).play();
    this.active = a;
    this.current = name;
  }
  update(dt) {
    this.mixer.update(dt);
  }
  kill() {
    this.dead = true;
    this.hp = 0;
    this.gun.visible = false;
    this.play("Death", 0.08);
    this.active.setLoop(T.LoopOnce, 1);
    this.active.clampWhenFinished = true;
  }
}
export class Car {
  constructor(scene, type = "sedan", x = 0, z = 0, yaw = 0) {
    this.type = type;
    this.group = new T.Group();
    this.model = assets[type].scene.clone(true);
    let bb = new T.Box3().setFromObject(this.model),
      size = bb.getSize(new T.Vector3());
    let scale = 4.5 / Math.max(size.x, size.z);
    this.model.scale.setScalar(scale);
    this.model.position.y = -bb.min.y * scale + 0.08;
    this.group.add(this.model);
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.group.position.set(x, 0, z);
    this.group.rotation.y = yaw;
    scene.add(this.group);
    this.speed = 0;
    this.yaw = yaw;
    this.stolen = false;
    this.ai = false;
    this.route = [];
    this.wp = 0;
    this.wheels = [];
    this.model.traverse((o) => {
      if (/wheel/i.test(o.name)) this.wheels.push(o);
    });
    this.health = 100;
    this.light = new T.Mesh(
      new T.PlaneGeometry(3, 5),
      new T.MeshBasicMaterial({
        color: 0xffe9b1,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
      }),
    );
    this.light.rotation.x = -Math.PI / 2;
    this.light.position.set(0, 0.04, 4);
    this.group.add(this.light);
    if (type === "police") {
      this.beacons = [];
      for (let i of [-1, 1]) {
        let b = new T.Mesh(
          new T.BoxGeometry(0.35, 0.18, 0.28),
          new T.MeshBasicMaterial({ color: i < 0 ? 0xff405b : 0x55aeff }),
        );
        b.position.set(i * 0.35, 1.62, 0);
        this.group.add(b);
        this.beacons.push(b);
      }
    }
  }
  get pos() {
    return this.group.position;
  }
  update(dt, time) {
    this.group.rotation.y = this.yaw;
    for (let w of this.wheels) w.rotation.x += this.speed * dt * 0.7;
    if (this.beacons)
      for (let [i, b] of this.beacons.entries())
        b.visible = Math.sin(time * 13 + i * Math.PI) > 0.0;
    this.model.rotation.z = T.MathUtils.damp(
      this.model.rotation.z,
      -(this.steer || 0) * Math.min(Math.abs(this.speed), 15) * 0.004,
      6,
      dt,
    );
  }
}
