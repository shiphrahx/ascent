// Basket and burner rig, all in basket-local space (floor centre at origin, +x along the basket).
// Woven wicker shell with leather rim, partitions, rope handles, padded uprights, burner frame,
// twin coil burners with blast valves and pilot jets, fuel cylinders in quilted covers, hoses.
import * as THREE from 'three';
import { tag, merge, tube, cyl } from './props.js';

export const BASKET = {
  L: 2.3, W: 1.36, H: 1.12, wall: 0.07, corner: 0.14,
  frameY: 2.42, frameX: 0.46, frameZ: 0.36,
  partX: 0.43,
};

function roundedRect(L, W, r, n = 6) {
  const pts = [];
  const cx = L / 2 - r, cz = W / 2 - r;
  const corners = [[cx, cz, 0], [-cx, cz, Math.PI / 2], [-cx, -cz, Math.PI], [cx, -cz, Math.PI * 1.5]];
  for (const [x, z, a0] of corners) for (let i = 0; i <= n; i++) {
    const a = a0 + i / n * Math.PI / 2;
    pts.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
  }
  return pts;
}

// extruded ring wall between two rounded rects, with uv = (perimeter metres, height)
function shell(L, W, r, t, h, y0 = 0) {
  const outer = roundedRect(L, W, r), inner = roundedRect(L - 2 * t, W - 2 * t, Math.max(0.02, r - t));
  const pos = [], uv = [], idx = [];
  const n = outer.length;
  let per = [0];
  for (let i = 1; i <= n; i++) { const a = outer[i - 1], b = outer[i % n]; per.push(per[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const ring = (pts, y, sign) => { const base = pos.length / 3; for (let i = 0; i <= n; i++) { const p = pts[i % n]; pos.push(p[0], y, p[1]); uv.push(per[i] * sign, y); } return base; };
  const o0 = ring(outer, y0, 1), o1 = ring(outer, y0 + h, 1);
  const i0 = ring(inner, y0, -1), i1 = ring(inner, y0 + h, -1);
  for (let i = 0; i < n; i++) {
    idx.push(o0 + i, o1 + i, o0 + i + 1, o0 + i + 1, o1 + i, o1 + i + 1);
    idx.push(i0 + i, i0 + i + 1, i1 + i, i0 + i + 1, i1 + i + 1, i1 + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// tube following a closed rounded rect (rim padding)
function rimTube(L, W, r, y, rad) {
  const pts = roundedRect(L, W, r, 5).map(p => new THREE.Vector3(p[0], y, p[1]));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  return new THREE.TubeGeometry(curve, 120, rad, 10, true);
}

function floor(L, W, r, y) {
  const pts = roundedRect(L, W, r);
  const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

function coil(cx, cz, y0, h, R, r, turns) {
  const pts = [];
  const N = turns * 24;
  for (let i = 0; i <= N; i++) {
    const a = i / 24 * Math.PI * 2;
    pts.push(new THREE.Vector3(cx + Math.cos(a) * R, y0 + i / N * h, cz + Math.sin(a) * R));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, r, 6, false);
}

export function buildRig(coverColor = [0.36, 0.06, 0.08], uprightColor = [0.06, 0.10, 0.16]) {
  const B = BASKET, parts = [];
  const wickerUV = (x, y, z) => [0, 0];
  // walls
  parts.push(tag(shell(B.L, B.W, B.corner, B.wall, B.H - 0.04), 0));
  // floor (wood) and skids
  parts.push(tag(floor(B.L - 0.1, B.W - 0.1, B.corner, 0.03), 6));
  const sk1 = new THREE.BoxGeometry(B.L - 0.2, 0.06, 0.08); sk1.translate(0, 0.0, B.W / 2 - 0.2);
  const sk2 = sk1.clone(); sk2.translate(0, 0, -(B.W - 0.4));
  parts.push(tag(sk1, 1), tag(sk2, 1));
  // leather rim: padded roll on the top edge, plus a band on the bottom
  parts.push(tag(rimTube(B.L - B.wall, B.W - B.wall, B.corner - 0.03, B.H - 0.02, 0.065), 1, [1, 1, 1], (x, y, z) => [Math.atan2(z, x) * 3, 0.5]));
  parts.push(tag(rimTube(B.L + 0.004, B.W + 0.004, B.corner, 0.06, 0.04), 1, [1, 1, 1], (x, y, z) => [Math.atan2(z, x) * 3, 0.5]));
  // partitions: pilot compartment in the middle
  for (const sx of [-1, 1]) {
    const pw = shellWall(B.partX * sx, B.W - 2 * B.wall - 0.02, B.H - 0.16);
    parts.push(tag(pw, 0));
    const trim = new THREE.CylinderGeometry(0.035, 0.035, B.W - 2 * B.wall, 10);
    trim.rotateX(Math.PI / 2); trim.translate(B.partX * sx, B.H - 0.14, 0);
    parts.push(tag(trim, 1, [1, 1, 1], (x, y, z) => [z * 3, 0.5]));
  }
  // rope handles on the outside
  const handles = [];
  for (const sx of [-1, 1]) for (const hx of [-0.65, 0.65]) handles.push([hx, B.W / 2 * sx, 'z', sx]);
  for (const sx of [-1, 1]) handles.push([B.L / 2 * sx, 0, 'x', sx]);
  for (const [hx, hz, ax, sx] of handles) {
    const loop = new THREE.TorusGeometry(0.1, 0.017, 6, 16, Math.PI);
    loop.rotateZ(Math.PI); // hang downward
    if (ax === 'x') loop.rotateY(Math.PI / 2);
    loop.translate(hx + (ax === 'x' ? sx * 0.035 : 0), B.H * 0.62, hz + (ax === 'z' ? sx * 0.035 : 0));
    parts.push(tag(loop, 5, [1, 1, 1], (x, y, z) => [x + z, y * 4]));
  }
  // uprights: steel rods in padded suede covers from the rim corners up to the frame
  const fc = [[B.frameX, B.frameZ], [-B.frameX, B.frameZ], [-B.frameX, -B.frameZ], [B.frameX, -B.frameZ]];
  const bc = [[B.L / 2 - 0.16, B.W / 2 - 0.13], [-B.L / 2 + 0.16, B.W / 2 - 0.13], [-B.L / 2 + 0.16, -B.W / 2 + 0.13], [B.L / 2 - 0.16, -B.W / 2 + 0.13]];
  for (let k = 0; k < 4; k++) {
    const a = new THREE.Vector3(bc[k][0], B.H - 0.1, bc[k][1]);
    const b = new THREE.Vector3(fc[k][0], B.frameY, fc[k][1]);
    parts.push(tag(segment(a, b, 0.024, 8), 2));
    const ca = a.clone().lerp(b, 0.02), cb = a.clone().lerp(b, 0.82);
    parts.push(tag(segment(ca, cb, 0.055, 14), 8, uprightColor));
  }
  // burner frame
  for (let k = 0; k < 4; k++) {
    const a = new THREE.Vector3(fc[k][0], B.frameY, fc[k][1]), b = new THREE.Vector3(fc[(k + 1) % 4][0], B.frameY, fc[(k + 1) % 4][1]);
    parts.push(tag(segment(a, b, 0.022, 8), 2));
  }
  // cross bars carrying the burner block
  parts.push(tag(segment(new THREE.Vector3(-B.frameX, B.frameY, 0), new THREE.Vector3(B.frameX, B.frameY, 0), 0.02, 8), 2));
  parts.push(tag(segment(new THREE.Vector3(0, B.frameY, -B.frameZ), new THREE.Vector3(0, B.frameY, B.frameZ), 0.02, 8), 2));
  // twin burners: cans, coils, manifold, jets
  const burners = [];
  for (const bx of [-0.19, 0.19]) {
    parts.push(tag(cyl(0.13, 0.13, 0.12, 20, bx, B.frameY + 0.02, 0, true), 2));
    parts.push(tag(cyl(0.135, 0.12, 0.03, 20, bx, B.frameY + 0.0, 0), 2));
    parts.push(tag(coil(bx, 0, B.frameY + 0.1, 0.34, 0.11, 0.016, 7), 2));
    parts.push(tag(cyl(0.05, 0.065, 0.12, 12, bx, B.frameY + 0.44, 0), 7));
    // jet ring
    const ring = new THREE.TorusGeometry(0.075, 0.012, 6, 20); ring.rotateX(Math.PI / 2); ring.translate(bx, B.frameY + 0.57, 0);
    parts.push(tag(ring, 2));
    burners.push(new THREE.Vector3(bx, B.frameY + 0.58, 0));
    // pilot light nozzle
    parts.push(tag(cyl(0.008, 0.008, 0.08, 6, bx + 0.09, B.frameY + 0.45, 0.04), 7));
  }
  // manifold block and blast valve handles hanging toward the pilot (+z side)
  const block = new THREE.BoxGeometry(0.62, 0.07, 0.16); block.translate(0, B.frameY - 0.03, 0);
  parts.push(tag(block, 2));
  const handles2 = [];
  for (const bx of [-0.19, 0.19]) {
    parts.push(tag(segment(new THREE.Vector3(bx, B.frameY - 0.05, 0.07), new THREE.Vector3(bx, B.frameY - 0.22, 0.2), 0.012, 6), 2));
    const grip = new THREE.CylinderGeometry(0.02, 0.02, 0.13, 10); grip.rotateZ(Math.PI / 2); grip.translate(bx, B.frameY - 0.24, 0.21);
    parts.push(tag(grip, 4));
    handles2.push(new THREE.Vector3(bx, B.frameY - 0.24, 0.21));
  }
  // fuel cylinders in the pilot compartment
  const cyls = [[0.2, 0.4], [-0.2, 0.4], [0.22, -0.38], [-0.22, -0.38]];
  for (const [x, z] of cyls) {
    parts.push(tag(cyl(0.18, 0.18, 0.8, 22, x, 0.04, z), 3, coverColor, (px, py, pz) => [Math.atan2(pz - z, px - x) / (Math.PI * 2), py]));
    // padded top roll
    const top = new THREE.TorusGeometry(0.16, 0.03, 8, 22); top.rotateX(Math.PI / 2); top.translate(x, 0.85, z);
    parts.push(tag(top, 3, coverColor.map(c => c * 0.8), (px, py, pz) => [px * 2, pz * 2]));
    parts.push(tag(cyl(0.16, 0.12, 0.06, 18, x, 0.84, z), 2));
    // valve and gauge
    parts.push(tag(cyl(0.025, 0.025, 0.09, 10, x, 0.9, z), 7));
    const wheel = new THREE.TorusGeometry(0.04, 0.008, 6, 14); wheel.rotateX(Math.PI / 2); wheel.translate(x, 0.99, z);
    parts.push(tag(wheel, 2));
  }
  // hoses from the front cylinders up the uprights to the manifold
  const hoses = [
    [[0.2, 0.98, 0.4], [0.35, 1.05, 0.48], [0.62, 1.3, 0.48], [0.56, 1.9, 0.42], [0.42, B.frameY - 0.02, 0.3], [0.2, B.frameY - 0.04, 0.06]],
    [[-0.2, 0.98, 0.4], [-0.35, 1.05, 0.48], [-0.62, 1.3, 0.48], [-0.56, 1.9, 0.42], [-0.42, B.frameY - 0.02, 0.3], [-0.2, B.frameY - 0.04, 0.06]],
  ];
  for (const h of hoses) parts.push(tag(tube(h, 0.017, 48, 8), 4));
  // karabiners at the frame corners where the flying wires attach
  for (const [x, z] of fc) {
    const k = new THREE.TorusGeometry(0.045, 0.01, 6, 14); k.translate(x, B.frameY + 0.05, z);
    parts.push(tag(k, 2));
  }
  // dark interior floor mat
  return {
    geo: merge(parts),
    frameCorners: fc.map(([x, z]) => new THREE.Vector3(x, B.frameY + 0.08, z)),
    burners, valves: handles2,
  };
}

function segment(a, b, r, seg) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1, false);
  g.translate(0, d.length() / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

function shellWall(x, w, h) {
  // a thin wicker partition across the basket at x
  const g = new THREE.BoxGeometry(0.05, h, w, 1, 1, 1);
  g.translate(x, h / 2 + 0.03, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) + 3, p.getY(i));
  return g;
}

export { segment };
