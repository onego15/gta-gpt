import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const roads = [-84, -28, 28, 84];
export const solids = [];
export const cover = [];
const batches = new Map(),
  materials = new Map();
let scene;
let seed = 18;
export function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
export function mat(color, emissive = false) {
  let key = color + ":" + emissive;
  if (!materials.has(key))
    materials.set(
      key,
      new T.MeshStandardMaterial({
        color,
        roughness: 0.8,
        metalness: 0,
        emissive: emissive ? color : 0,
        emissiveIntensity: emissive ? 0.55 : 0,
      }),
    );
  return materials.get(key);
}
function batch(geo, m, x, y, z, ry = 0) {
  geo.rotateY(ry);
  geo.translate(x, y, z);
  if (!batches.has(m)) batches.set(m, []);
  batches.get(m).push(geo);
}
export function box(x, y, z, w, h, d, c, ry = 0) {
  batch(new T.BoxGeometry(w, h, d), mat(c), x, y, z, ry);
}
function cyl(x, y, z, r, h, c, r2 = r) {
  batch(new T.CylinderGeometry(r2, r, h, 10), mat(c), x, y, z);
}
function sphere(x, y, z, r, c, sx = 1, sy = 1, sz = 1) {
  const g = new T.IcosahedronGeometry(r, 1);
  g.scale(sx, sy, sz);
  batch(g, mat(c), x, y, z);
}
function obstacle(x, z, w, d, h) {
  solids.push({ x, z, w: w / 2, d: d / 2, h });
}
function label(text, x, y, z, w, h, color = "#f5e9c7", bg = "#153c3e", ry = 0) {
  const cv = document.createElement("canvas");
  cv.width = 768;
  cv.height = 160;
  const c = cv.getContext("2d");
  c.fillStyle = bg;
  c.fillRect(0, 0, 768, 160);
  c.strokeStyle = color;
  c.lineWidth = 3;
  c.strokeRect(10, 10, 748, 140);
  c.fillStyle = color;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = "600 58px sans-serif";
  c.fillText(text, 384, 83, 715);
  const tx = new T.CanvasTexture(cv);
  tx.colorSpace = T.SRGBColorSpace;
  const p = new T.Mesh(
    new T.PlaneGeometry(w, h),
    new T.MeshStandardMaterial({
      map: tx,
      roughness: 0.75,
      emissive: color,
      emissiveMap: tx,
      emissiveIntensity: 0.12,
    }),
  );
  p.position.set(x, y, z);
  p.rotation.y = ry;
  scene.add(p);
}
function tree(x, z, size = 1) {
  cyl(x, 1.5 * size, z, 0.18 * size, 3 * size, "#76614a");
  sphere(x, 3.9 * size, z, 1.6 * size, "#45694e", 1, 1.25, 1);
  sphere(x - 0.9 * size, 3.4 * size, z + 0.3, 1.1 * size, "#637e51");
  sphere(x + 0.8 * size, 4 * size, z, 1.05 * size, "#6d8756");
  box(x, 0.12, z, 2.4, 0.23, 2.4, "#b8ad91");
  obstacle(x, z, 0.6, 0.6, 3);
}
function bench(x, z, ry = 0) {
  const g = new T.Group();
  for (let i = 0; i < 3; i++)
    box(x + (i - 1) * 0.2, 0.6, z, 0.15, 0.12, 2, "#aa7750", ry);
  box(x - 0.4, 1, z, 0.12, 0.7, 2, "#aa7750", ry);
  for (let s of [-0.7, 0.7]) {
    box(x, 0.3, z + s, 0.6, 0.6, 0.1, "#36484a", ry);
  }
}
function lamp(x, z) {
  cyl(x, 2.7, z, 0.065, 5.4, "#334549");
  box(x + 0.45, 5.35, z, 1.1, 0.12, 0.15, "#334549");
  batch(
    new T.BoxGeometry(0.65, 0.06, 0.23),
    mat("#ffe0a2", true),
    x + 0.7,
    5.27,
    z,
  );
}
const shopNames = [
  "HARBOR COFFEE",
  "NORTH / RECORDS",
  "MERCADO",
  "LUNA BAKERY",
  "HOTEL MARIN",
  "ATELIER 08",
  "FRESH & LOCAL",
  "KIOSK 24",
  "SUNDAY BOOKS",
  "PORT CYCLES",
  "NOODLE HOUSE",
  "CINEMA",
];
const colors = [
  "#bd8264",
  "#cbb995",
  "#718b8c",
  "#d0a078",
  "#ab7465",
  "#b2b5a0",
  "#9da2a0",
  "#d2b391",
];
function building(x, z, w, d, h, index) {
  const c = colors[index % colors.length];
  box(x, h / 2, z, w, h, d, c);
  obstacle(x, z, w, d, h);
  box(x, 0.45, z, w + 0.2, 0.9, d + 0.2, "#817e70");
  box(x, 3.7, z, w + 0.35, 0.25, d + 0.35, "#e3d0a9");
  box(x, h + 0.2, z, w + 0.65, 0.45, d + 0.65, "#e0d1b5");
  box(x, h + 0.49, z, w - 0.65, 0.12, d - 0.65, "#737976");
  for (let y = 6; y < h - 1; y += 3.1) {
    box(x, y - 1.23, z, w + 0.18, 0.12, d + 0.18, "#bda98b");
    for (let side of [-1, 1]) {
      for (let j = -w / 2 + 1.5; j < w / 2 - 1; j += 2.5) {
        box(x + j, y, z + side * (d / 2 + 0.04), 1.35, 1.85, 0.13, "#3e5a61");
        box(
          x + j,
          y + 0.1,
          z + side * (d / 2 + 0.12),
          0.055,
          1.65,
          0.1,
          "#c4c4ad",
        );
        box(
          x + j,
          y - 0.86,
          z + side * (d / 2 + 0.2),
          1.65,
          0.13,
          0.42,
          "#ddc9a6",
        );
        if (random() > 0.62)
          batch(
            new T.BoxGeometry(0.5, 1.58, 0.02),
            mat("#e6c285", true),
            x + j + 0.3,
            y,
            z + side * (d / 2 + 0.13),
          );
      }
      for (let j = -d / 2 + 1.5; j < d / 2 - 1; j += 2.7) {
        box(x + side * (w / 2 + 0.04), y, z + j, 0.12, 1.8, 1.3, "#456069");
        box(
          x + side * (w / 2 + 0.15),
          y - 0.85,
          z + j,
          0.3,
          0.1,
          1.55,
          "#ddc9a6",
        );
      }
    }
  }
  for (let side of [-1, 1]) {
    for (let j = -w / 2 + 1.3; j < w / 2 - 1; j += 2.5) {
      box(x + j, 1.9, z + side * (d / 2 + 0.05), 1.9, 2.6, 0.12, "#294d53");
      box(x + j, 1.85, z + side * (d / 2 + 0.13), 0.06, 2.55, 0.1, "#e1d5be");
    }
    let face = z + side * (d / 2 + 0.16);
    label(
      shopNames[index % shopNames.length],
      x,
      3.15,
      face,
      w - 0.6,
      0.75,
      "#f4e3bf",
      index % 2 ? "#a44934" : "#234c4d",
      side < 0 ? Math.PI : 0,
    );
    if (h < 19) {
      for (let j = 0; j < Math.floor(w); j++)
        box(
          x - w / 2 + j + 0.5,
          2.65,
          z + side * (d / 2 + 0.75),
          0.98,
          0.14,
          1.5,
          j % 2 ? "#ede0bd" : index % 2 ? "#b95642" : "#537a6f",
        );
    }
  }
  // Street-facing shop windows, fascia and awnings on the side façades too.
  for (let side of [-1, 1]) {
    for (let j = -d / 2 + 1.6; j < d / 2 - 1; j += 2.65) {
      box(x + side * (w / 2 + 0.06), 1.7, z + j, 0.13, 2.7, 2.05, "#284b51");
      box(x + side * (w / 2 + 0.15), 1.7, z + j, 0.12, 2.7, 0.075, "#c4bc9e");
      box(x + side * (w / 2 + 0.16), 0.4, z + j, 0.16, 0.12, 2.15, "#dccaaa");
      box(x + side * (w / 2 + 0.17), 2.4, z + j, 0.03, 0.045, 1.9, "#91a9a2");
    }
    label(
      shopNames[index % shopNames.length],
      x + side * (w / 2 + 0.19),
      3.13,
      z,
      d - 0.6,
      0.75,
      "#f4e3bf",
      index % 2 ? "#944b38" : "#254f4d",
      (side * Math.PI) / 2,
    );
    if (index % 3 !== 1)
      for (let j = 0; j < Math.floor(d); j++)
        box(
          x + side * (w / 2 + 0.68),
          2.64,
          z - d / 2 + j + 0.5,
          1.25,
          0.14,
          0.98,
          j % 2 ? "#e9dab4" : index % 2 ? "#a9513b" : "#537a6f",
        );
  }
  // rooftop plant room, water tank, chimneys and setback
  box(x + 1, h + 0.75, z + 1, 2.4, 1.1, 2, "#8e9790");
  for (let k = 0; k < 3; k++)
    box(x + 1, h + 1.32, z + 0.4 + k * 0.5, 2.1, 0.07, 0.08, "#424f50");
  if (index % 3 === 0) {
    cyl(x - 2, h + 1.7, z - 1, 1.25, 2.2, "#65716b");
    cyl(x - 2, h + 2.87, z - 1, 1.4, 0.2, "#36484a");
  }
  if (index % 4 === 0) {
    for (let f = 5; f < h - 2; f += 3.1) {
      box(x + w / 2 + 0.65, f, z, 1.3, 0.15, 3, "#3b4b4a");
      for (let a = -1; a <= 1; a++)
        box(x + w / 2 + 1.25, f + 0.55, z + a, 0.06, 1.1, 0.07, "#344445");
      box(x + w / 2 + 1.25, f + 1.1, z, 0.07, 0.07, 3, "#344445");
    }
  }
}
function crate(x, z, w = 2) {
  box(x, w / 2, z, w, w, w, "#927150");
  for (let a of [-1, 1]) {
    box(x + a * w * 0.36, w / 2, z, 0.13, w + 0.05, w + 0.04, "#584f40");
    box(x, w / 2, z + a * w * 0.36, w + 0.04, w + 0.05, 0.13, "#584f40");
  }
  obstacle(x, z, w, w, w);
  cover.push(new T.Vector3(x, 0, z));
}
export function createWorld(s) {
  scene = s;
  // Generated fine asphalt grain: kept subtle to preserve the illustrated art direction.
  const asphalt = document.createElement("canvas");
  asphalt.width = 256;
  asphalt.height = 256;
  const ac = asphalt.getContext("2d"),
    pixels = ac.createImageData(256, 256);
  for (let i = 0; i < pixels.data.length; i += 4) {
    let n = 190 + random() * 45;
    pixels.data[i] = n;
    pixels.data[i + 1] = n;
    pixels.data[i + 2] = n;
    pixels.data[i + 3] = 255;
  }
  ac.putImageData(pixels, 0, 0);
  let tx = new T.CanvasTexture(asphalt);
  tx.wrapS = tx.wrapT = T.RepeatWrapping;
  tx.repeat.set(9, 90);
  mat("#525c5d").map = tx;
  mat("#525c5d").roughness = 0.96;
  box(0, -0.35, 0, 240, 0.6, 225, "#67776a");
  box(0, -0.2, 122, 280, 0.2, 52, "#40747a");
  for (let r of roads) {
    box(r, 0.005, 0, 12, 0.06, 210, "#525c5d");
    box(0, 0.006, r, 210, 0.065, 12, "#525c5d");
    for (let j = -101; j < 104; j += 5) {
      if (!roads.some((v) => Math.abs(v - j) < 8)) {
        box(r, 0.05, j, 0.13, 0.015, 2.5, "#d8c697");
        box(j, 0.05, r, 2.5, 0.015, 0.13, "#d8c697");
      }
    }
  }
  for (let x of roads)
    for (let z of roads) {
      for (let a = -4; a <= 4; a += 1.1) {
        box(x + a, 0.065, z + 7, 0.65, 0.018, 2, "#e2ddc6");
        box(x + a, 0.065, z - 7, 0.65, 0.018, 2, "#e2ddc6");
        box(x + 7, 0.065, z + a, 2, 0.018, 0.65, "#e2ddc6");
        box(x - 7, 0.065, z + a, 2, 0.018, 0.65, "#e2ddc6");
      }
      for (let d of [-1, 1]) {
        cyl(x + d * 7.6, 1.6, z + d * 7.6, 0.07, 3.2, "#344344");
        box(x + d * 7.6, 2.9, z + d * 7.6, 0.3, 0.8, 0.32, "#23383b");
        batch(
          new T.SphereGeometry(0.095, 8, 6),
          mat("#ffc96b", true),
          x + d * 7.6,
          3.12,
          z + d * 7.6 + 0.18,
        );
      }
      cyl(x + 3, 0.05, z - 3, 0.52, 0.035, "#394d50");
      for (let j = -2; j <= 2; j++)
        box(x + 3 + j * 0.14, 0.075, z - 3, 0.045, 0.012, 0.6, "#65716b");
    }
  let id = 0;
  for (let cx of [-56, 0, 56])
    for (let cz of [-56, 0, 56]) {
      box(cx, 0.1, cz, 43, 0.24, 43, "#bcb6a2");
      box(cx, 0.235, cz, 41, 0.025, 41, "#c8c0ac");
      // sidewalk seams and curb stones
      for (let j = -20; j <= 20; j += 2.5) {
        for (let e of [-20.4, 20.4]) {
          box(cx + j, 0.257, cz + e, 0.035, 0.01, 1.2, "#989c90");
          box(cx + e, 0.258, cz + j, 1.2, 0.01, 0.035, "#989c90");
        }
      }
      if (cx === 0 && cz === 0) {
        box(0, 0.27, 0, 35, 0.06, 35, "#7e925d");
        box(0, 0.31, 0, 5, 0.05, 38, "#d2c8a5");
        box(0, 0.32, 0, 38, 0.05, 5, "#d2c8a5");
        cyl(0, 0.65, 0, 4.2, 0.7, "#c4c4b2");
        cyl(0, 1.03, 0, 3.6, 0.05, "#629b9a");
        cyl(0, 1.6, 0, 0.7, 1.2, "#c7c8b5");
        sphere(0, 2.2, 0, 0.45, "#e4d7ab");
        for (let x of [-12, 12]) for (let z of [-12, 12]) tree(x, z, 1.3);
        for (let z of [-7, 7]) bench(6, z);
        label("MARIN SQUARE", 0, 1.8, 19, 5, 0.85);
      } else if (cx === 56 && cz === 56) {
        building(56, 68, 32, 12, 8, 11);
        label(
          "PIER 04 / FREIGHT",
          56,
          6,
          61.88,
          18,
          1.5,
          "#eadbb9",
          "#485956",
          Math.PI,
        );
        for (let k = 0; k < 7; k++)
          crate(43 + (k % 3) * 9, 39 + Math.floor(k / 3) * 8, k % 2 ? 2 : 2.8);
        for (let z of [41, 49]) {
          box(69, 1.8, z, 5, 3.4, 6, "#467a79");
          obstacle(69, z, 5, 6, 3.4);
        }
      } else {
        for (let dx of [-11, 11])
          for (let dz of [-11, 11])
            building(
              cx + dx,
              cz + dz,
              16 + random() * 2,
              16 + random() * 2,
              10 + Math.floor(random() * 5) * 3.1,
              id++,
            );
      }
      for (let off of [-15, 15]) {
        tree(cx + off, cz + 20, 0.85);
        tree(cx + 20, cz + off, 0.85);
        lamp(cx - 20, cz + off);
        lamp(cx + off, cz - 20);
      }
    }
  // Coastal promenade
  box(0, 0.14, 99, 218, 0.3, 13, "#b9ab8a");
  for (let x = -106; x < 108; x += 2) {
    box(x, 0.31, 99, 0.03, 0.02, 12, "#9c967d");
    cyl(x, 1, 105, 0.045, 1.6, "#35585c");
  }
  box(0, 1.8, 105, 218, 0.07, 0.07, "#35585c");
  box(0, 0.9, 105, 218, 0.07, 0.07, "#35585c");
  for (let x = -96; x <= 96; x += 16) {
    lamp(x, 95);
    bench(x, 102);
  }
  label("H A R B O R", 0, 2.2, 105, 9, 1.5, "#fff0c8", "#41666a");
  // outer skyline and port cranes
  for (let k = 0; k < 24; k++) {
    let x = -150 + k * 13,
      h = 15 + random() * 35,
      z = -120 - random() * 35;
    box(x, h / 2, z, 10, h, 12, ["#8c9c94", "#9ca59a", "#aaa996"][k % 3]);
    for (let y = 4; y < h - 1; y += 3) {
      box(x, y, z + 6.04, 8, 0.9, 0.05, "#788f8a");
      box(x + 5.04, y, z, 0.05, 0.9, 10, "#788f8a");
    }
    box(x, h + 0.7, z, 3, 1.3, 4, "#879992");
  }
  for (let x of [-90, 90]) {
    box(x, 9, 126, 1, 18, 1, "#a18c68");
    box(x + 8, 18, 126, 24, 0.6, 0.65, "#a18c68");
    box(x + 18, 12, 126, 0.08, 12, 0.08, "#525c56");
  }
  for (let x of [-95, 95]) for (let z = -95; z < 90; z += 20) tree(x, z, 1.2);
  // street furniture, café tables, terrace and kiosks
  for (let z of [37, 41, 45]) {
    cyl(21, 0.82, z, 0.55, 0.09, "#f2d8ad");
    cyl(21, 0.4, z, 0.06, 0.8, "#385254");
    for (let dz of [-0.9, 0.9]) {
      box(21, 0.48, z + dz, 0.45, 0.12, 0.5, "#b68959");
      box(21, 0.27, z + dz, 0.07, 0.5, 0.4, "#3e5050");
    }
    cyl(21, 1.0, z, 0.09, 0.2, "#f3e8d0");
  }
  label(
    "COFFEE / OPEN LATE",
    20.5,
    1.15,
    33,
    3,
    0.7,
    "#f7d694",
    "#244b4b",
    Math.PI / 2,
  );
  label("+  MARIN AID", -19, 1.85, 18, 3.3, 0.65, "#d8efd8", "#3c7066");
  for (let x of [-42, 49]) {
    const shape = new T.Shape();
    shape.moveTo(-2, -5);
    shape.lineTo(2, -5);
    shape.lineTo(2, 3);
    shape.lineTo(0, 5);
    shape.lineTo(-2, 3);
    shape.closePath();
    const hull = new T.ExtrudeGeometry(shape, {
      depth: 1,
      bevelEnabled: true,
      bevelSize: 0.2,
      bevelThickness: 0.2,
      bevelSegments: 1,
      steps: 1,
    });
    hull.rotateX(Math.PI / 2);
    batch(hull, mat("#d3c6a1"), x, 0.7, 124);
    box(x, 1.4, 123, 2.6, 1.4, 3.7, "#e2d6b6");
    box(x, 1.6, 125, 2, 0.7, 0.07, "#3b666b");
    cyl(x, 3.1, 123, 0.07, 3, "#647977");
  }
  // Flower beds, bollards and bicycles add life at pedestrian scale.
  for (let x of [-20, 20])
    for (let z of [-12, 12]) {
      box(x, 0.48, z, 1.25, 0.45, 3, "#b59571");
      box(x, 0.74, z, 1.12, 0.09, 2.85, "#4e6043");
      for (let j = 0; j < 6; j++) {
        sphere(
          x + (random() - 0.5) * 0.7,
          0.95,
          z - 1.1 + j * 0.4,
          0.18,
          j % 2 ? "#d4aa68" : "#9fa563",
        );
      }
    }
  for (let x of [-34, -22, 22, 34])
    for (let z of [-34, -22, 22, 34]) cyl(x, 0.65, z, 0.085, 0.85, "#3b5254");
  for (let z of [-48, 8, 64]) {
    let x = 34.7;
    for (let dz of [-0.6, 0.6]) {
      let g = new T.TorusGeometry(0.38, 0.035, 6, 16);
      g.rotateY(Math.PI / 2);
      batch(g, mat("#31494a"), x, 0.62, z + dz);
    }
    box(x, 0.85, z, 0.05, 0.07, 1.2, "#a16b4d");
    box(x, 1.08, z, 0.06, 0.8, 0.06, "#a16b4d", 0.25);
    box(x, 1.45, z + 0.55, 0.6, 0.06, 0.06, "#405453");
  }
  for (let x of [-76, -20, 36, 92])
    for (let z of [-42, 14, 70]) {
      box(x, 0.5, z, 0.7, 1, 0.7, "#41615a");
      box(x, 1.03, z, 0.8, 0.1, 0.8, "#263f3e");
    }
  for (let z of [-47, 9, 65]) {
    box(-35, 1.55, z, 0.15, 3, 4.5, "#3c5559");
    box(-35, 3.1, z, 2, 0.15, 5, "#384d50");
    box(-35, 0.6, z, 1.3, 0.2, 3, "#b1916f");
  }
  for (const [m, geos] of batches) {
    const mesh = new T.Mesh(mergeGeometries(geos), m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    geos.forEach((g) => g.dispose());
  }
  batches.clear();
  const waterGeo = new T.PlaneGeometry(400, 200, 40, 20);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new T.Mesh(
    waterGeo,
    new T.MeshStandardMaterial({
      color: "#4a8186",
      metalness: 0.55,
      roughness: 0.27,
      transparent: true,
      opacity: 0.88,
    }),
  );
  water.position.set(0, -0.02, 202);
  scene.add(water);
  return { water };
}
export function blocked(x, z, r = 0.35) {
  if (x < -107 || x > 107 || z < -106 || z > 104) return true;
  return solids.some(
    (b) => Math.abs(x - b.x) < b.w + r && Math.abs(z - b.z) < b.d + r,
  );
}
export function moveBody(pos, dx, dz, r = 0.35) {
  let hit = false;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.4));
  for (let i = 0; i < n; i++) {
    if (!blocked(pos.x + dx / n, pos.z, r)) pos.x += dx / n;
    else hit = true;
    if (!blocked(pos.x, pos.z + dz / n, r)) pos.z += dz / n;
    else hit = true;
  }
  return hit;
}
export function visible(a, b) {
  for (const s of solids) {
    if (s.h < 1.3) continue;
    let t0 = 0,
      t1 = 1;
    for (const axis of ["x", "z"]) {
      let delta = b[axis] - a[axis],
        lo = s[axis] - (axis === "x" ? s.w : s.d),
        hi = s[axis] + (axis === "x" ? s.w : s.d);
      if (Math.abs(delta) < 0.0001) {
        if (a[axis] < lo || a[axis] > hi) {
          t0 = 2;
          break;
        }
      } else {
        let u = (lo - a[axis]) / delta,
          v = (hi - a[axis]) / delta;
        if (u > v) [u, v] = [v, u];
        t0 = Math.max(t0, u);
        t1 = Math.min(t1, v);
      }
    }
    if (t0 <= t1 && t1 > 0 && t0 < 1) return false;
  }
  return true;
}
