// The map: valleys, landmarks and the flight route, in world metres (x east, z south).

function catmull(pts, step = 12) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

export const VALLEYS = [
  { id: 'chimney', pts: catmull([[-2700, 600], [-2350, 520], [-2050, 420], [-1800, 330], [-1550, 210], [-1350, 140], [-1150, 60], [-980, -40], [-860, -70]]),
    floorHalf: 115, wallL: 75, wallR: 75, floor0: 24, floor1: 12, steps: 4, rose: 0.15, chimneys: 1 },
  { id: 'love', pts: catmull([[-1380, 150], [-1420, -150], [-1500, -480], [-1560, -900], [-1640, -1350]]),
    floorHalf: 55, wallL: 60, wallR: 60, floor0: 16, floor1: 30, steps: 3, rose: 0.25, chimneys: 1 },
  { id: 'pigeon', pts: catmull([[-940, -60], [-780, 25], [-640, 100], [-500, 92], [-390, 40], [-290, 70], [-170, 210], [-80, 600], [-60, 1300]]),
    floorHalf: 34, wallL: 52, wallR: 52, floor0: 12, floor1: 8, steps: 5, rose: 0.1, chimneys: 0.35 },
  { id: 'river', pts: catmull([[170, -1350], [230, -700], [300, -300], [240, 0], [262, 160], [330, 500], [280, 900], [250, 1350]]),
    floorHalf: 190, wallL: 330, wallR: 230, floor0: 5.6, floor1: 5.6, steps: 2, rose: 0.0, chimneys: 0 },
  { id: 'rose', pts: catmull([[1100, -1350], [1150, -700], [1120, -300], [1180, 100], [1140, 500], [1200, 1350]]),
    floorHalf: 32, wallL: 140, wallR: 140, floor0: 22, floor1: 22, steps: 4, rose: 1.0, chimneys: 0.25, fins: 1 },
  { id: 'south', pts: catmull([[-1150, 60], [-1200, 400], [-1100, 800], [-1180, 1350]]),
    floorHalf: 40, wallL: 55, wallR: 55, floor0: 14, floor1: 26, steps: 4, rose: 0.3, chimneys: 0.6 },
];

export const RIVER = VALLEYS.find(v => v.id === 'river').pts;

export const SITES = {
  launch: { x: -1800, z: 330, r: 165, y: 26 },
  landing: { x: 1620, z: -10, r: 170, y: 58 },
  castle: { x: -190, z: -150, r: 240, rise: 62 },
  village: { x: -110, z: -60 },
  church: { x: -1040, z: -40 },
  caves: { x: -1180, z: 70 },
  dovecote: { x: -640, z: 100 },
  bridge: { x: 258, z: 120 },
  horses: { x: 360, z: 330 },
  vineyard: { x: 680, z: -150, r: 230 },
  orchard: { x: 560, z: 230, r: 150 },
};

// waypoints the autopilot steers for; alt is a scenic preference, not a command
export const ROUTE = [
  { x: -1800, z: 330, alt: 40 },
  { x: -1420, z: 175, alt: 45 },
  { x: -1060, z: 0, alt: 50 },
  { x: -650, z: 120, alt: 60 },
  { x: -230, z: -40, alt: 190 },
  { x: 250, z: 160, alt: 45 },
  { x: 690, z: -60, alt: 110 },
  { x: 1150, z: 100, alt: 90 },
  { x: 1620, z: -10, alt: 70 },
];

export const VOLCANO = { x: 6500, z: -17500, peak: 2750, R: 9800 };
