"use client";

import { useEffect, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Spells                                                             */
/* ------------------------------------------------------------------ */

type Spell = "lightning" | "shield" | "fire" | "frost";
type RGB = [number, number, number];

const SPELL_ORDER: Spell[] = ["lightning", "shield", "fire", "frost"];

const SPELLS: Record<Spell, { rgb: RGB; emoji: string; label: string; glyph: string }> = {
  lightning: { rgb: [255, 216, 74], emoji: "⚡", label: "Lightning", glyph: "zigzag" },
  shield: { rgb: [120, 255, 170], emoji: "🛡️", label: "Shield", glyph: "circle" },
  fire: { rgb: [255, 112, 56], emoji: "🔥", label: "Fire", glyph: "triangle" },
  frost: { rgb: [120, 214, 255], emoji: "❄️", label: "Frost", glyph: "line" },
};

type Season = "winter" | "rainy" | "spring" | "summer";

const SEASON_ORDER: Season[] = ["winter", "rainy", "spring", "summer"];

/** Purely cosmetic themes — gameplay and scoring are identical in every season. */
const SEASONS: Record<
  Season,
  {
    label: string;
    tagline: string;
    accent: string;
    sky: [string, string, string, string];
    far: string;
    mist: RGB;
    stars: number;
    moon: number;
    aurora: number;
    clouds: number;
    meteors: number;
    bats: boolean;
    count: number;
  }
> = {
  winter: {
    label: "Winter night",
    tagline: "Snow falls on the Moonspire tonight",
    accent: "#cfe6ff",
    sky: ["#040a1c", "#0e1c40", "#25417a", "#3a5c94"],
    far: "#1b2a55",
    mist: [120, 150, 220],
    stars: 1,
    moon: 1,
    aurora: 1.7,
    clouds: 0.9,
    meteors: 0.6,
    bats: false,
    count: 90,
  },
  rainy: {
    label: "Stormy night",
    tagline: "A storm breaks over the Moonspire tonight",
    accent: "#b9c4ea",
    sky: ["#04050d", "#0c0f1c", "#1c2036", "#2a2e48"],
    far: "#171a30",
    mist: [80, 86, 124],
    stars: 0.25,
    moon: 0.45,
    aurora: 0,
    clouds: 2,
    meteors: 0,
    bats: false,
    count: 110,
  },
  spring: {
    label: "Spring night",
    tagline: "Petals drift past the Moonspire tonight",
    accent: "#ffc4dc",
    sky: ["#0a0620", "#23154a", "#4a2a6e", "#7a3f80"],
    far: "#2a1c52",
    mist: [150, 90, 170],
    stars: 0.9,
    moon: 1,
    aurora: 0.6,
    clouds: 0.8,
    meteors: 0.8,
    bats: true,
    count: 34,
  },
  summer: {
    label: "Summer night",
    tagline: "Fireflies circle the Moonspire tonight",
    accent: "#f1ef9c",
    sky: ["#07082a", "#171a52", "#33307a", "#6a4478"],
    far: "#1d1a4a",
    mist: [90, 80, 170],
    stars: 1,
    moon: 1,
    aurora: 0.8,
    clouds: 0.5,
    meteors: 2.2,
    bats: true,
    count: 26,
  },
};

const ROUND_SECONDS = 75;
const MAX_WARDS = 5;
const COMBO_WINDOW = 4.5;
const SWIFT_WINDOW = 1.6;
const SEED_BEST = { name: "FABLE 5.2", score: 7500 };
const BEST_KEY = "rune-duel:best";
const MUTE_KEY = "rune-duel:muted";
const SERIF = 'Georgia, "Times New Roman", serif';
const EMOJI = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"';

/* ------------------------------------------------------------------ */
/*  Gesture recognition ($1 Unistroke + shape heuristics)              */
/* ------------------------------------------------------------------ */

type Pt = { x: number; y: number };

const N_POINTS = 48;
const SQUARE = 250;
const HALF_DIAG = 0.5 * Math.hypot(SQUARE, SQUARE);
const ANGLE_RANGE = (45 * Math.PI) / 180;
const ANGLE_STEP = (2 * Math.PI) / 180;
const PHI = 0.5 * (-1 + Math.sqrt(5));

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(pts: Pt[]) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i]);
  return d;
}

function resample(points: Pt[], n: number): Pt[] {
  const pts = points.map((p) => ({ x: p.x, y: p.y }));
  const interval = pathLength(pts) / (n - 1);
  if (interval <= 0) return Array.from({ length: n }, () => ({ ...pts[0] }));
  let acc = 0;
  const out: Pt[] = [{ ...pts[0] }];
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (d > 0 && acc + d >= interval) {
      const k = (interval - acc) / d;
      const q = {
        x: pts[i - 1].x + k * (pts[i].x - pts[i - 1].x),
        y: pts[i - 1].y + k * (pts[i].y - pts[i - 1].y),
      };
      out.push(q);
      pts.splice(i, 0, q);
      acc = 0;
    } else {
      acc += d;
    }
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] });
  out.length = n;
  return out;
}

function centroid(pts: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

function rotateBy(pts: Pt[], rad: number): Pt[] {
  const c = centroid(pts);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return pts.map((p) => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }));
}

function bounds(pts: Pt[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, w: maxX - minX, h: maxY - minY };
}

function normalizeStroke(points: Pt[]): Pt[] {
  let pts = resample(points, N_POINTS);
  const c = centroid(pts);
  pts = rotateBy(pts, -Math.atan2(c.y - pts[0].y, c.x - pts[0].x));
  const b = bounds(pts);
  const w = Math.max(b.w, 1e-3);
  const h = Math.max(b.h, 1e-3);
  pts = pts.map((p) => ({ x: (p.x * SQUARE) / w, y: (p.y * SQUARE) / h }));
  const c2 = centroid(pts);
  return pts.map((p) => ({ x: p.x - c2.x, y: p.y - c2.y }));
}

function pathDistance(a: Pt[], b: Pt[]) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += dist(a[i], b[i]);
  return d / a.length;
}

function distanceAtBestAngle(pts: Pt[], tmpl: Pt[]) {
  let a = -ANGLE_RANGE;
  let b = ANGLE_RANGE;
  let x1 = PHI * a + (1 - PHI) * b;
  let f1 = pathDistance(rotateBy(pts, x1), tmpl);
  let x2 = (1 - PHI) * a + PHI * b;
  let f2 = pathDistance(rotateBy(pts, x2), tmpl);
  while (Math.abs(b - a) > ANGLE_STEP) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = PHI * a + (1 - PHI) * b;
      f1 = pathDistance(rotateBy(pts, x1), tmpl);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - PHI) * a + PHI * b;
      f2 = pathDistance(rotateBy(pts, x2), tmpl);
    }
  }
  return Math.min(f1, f2);
}

function poly(coords: number[][]): Pt[] {
  return coords.map(([x, y]) => ({ x: x * 100, y: y * 100 }));
}

function circlePts(dir: 1 | -1): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = -Math.PI / 2 + dir * (i / 40) * Math.PI * 2;
    out.push({ x: Math.cos(a) * 100, y: Math.sin(a) * 100 });
  }
  return out;
}

const TEMPLATES: { spell: Spell; pts: Pt[] }[] = (
  [
    ["shield", circlePts(1)],
    ["shield", circlePts(-1)],
    ["fire", poly([[0, -1], [1, 0.8], [-1, 0.8], [0, -1]])],
    ["fire", poly([[0, -1], [-1, 0.8], [1, 0.8], [0, -1]])],
    ["fire", poly([[0, 0.8], [1, 0.8], [0, -1], [-1, 0.8], [0, 0.8]])],
    ["fire", poly([[0, 0.8], [-1, 0.8], [0, -1], [1, 0.8], [0, 0.8]])],
    ["lightning", poly([[0, 1], [1, 0], [2, 1], [3, 0]])],
    ["lightning", poly([[0, 0], [1, 1], [2, 0], [3, 1]])],
    ["lightning", poly([[0, 1], [1, 0], [2, 1], [3, 0], [4, 1]])],
    ["lightning", poly([[0, 0], [1, 1], [2, 0], [3, 1], [4, 0]])],
    ["lightning", poly([[0, 1], [1, 0], [2, 1], [3, 0], [4, 1], [5, 0]])],
    ["lightning", poly([[0, 0], [1, 1], [2, 0], [3, 1], [4, 0], [5, 1]])],
    ["lightning", poly([[0, 0], [2, 0], [0, 2], [2, 2]])],
    ["lightning", poly([[2, 0], [0, 0], [2, 2], [0, 2]])],
  ] as [Spell, Pt[]][]
).map(([spell, pts]) => ({ spell, pts: normalizeStroke(pts) }));

/** Signs of the sharp corners along a stroke (+1 / -1 per corner). */
function cornerSigns(points: Pt[]): number[] {
  const n = 40;
  const k = 2;
  const pts = resample(points, n);
  const signs: number[] = [];
  let run = 0;
  for (let i = k; i < n - k; i++) {
    const a = Math.atan2(pts[i].y - pts[i - k].y, pts[i].x - pts[i - k].x);
    const b = Math.atan2(pts[i + k].y - pts[i].y, pts[i + k].x - pts[i].x);
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const s = Math.abs(d) > (68 * Math.PI) / 180 ? Math.sign(d) : 0;
    if (s !== 0 && s !== run) signs.push(s);
    run = s;
  }
  return signs;
}

/** 4πA / P² — 1 for a circle, ~0.6 for a triangle. */
function roundness(points: Pt[]): number {
  const pts = resample(points, 40);
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.x * b.y - b.x * a.y;
  }
  const perim = pathLength(pts) + dist(pts[0], pts[pts.length - 1]);
  return perim > 0 ? (4 * Math.PI * Math.abs(area / 2)) / (perim * perim) : 0;
}

/** Drop jittery, over-dense samples so local direction is meaningful. */
function simplify(points: Pt[]): Pt[] {
  const b = bounds(points);
  const minStep = Math.max(3, Math.hypot(b.w, b.h) * 0.035);
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (dist(points[i], out[out.length - 1]) >= minStep) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

function recognize(raw: Pt[]): Spell | "tap" | null {
  if (raw.length < 3) return "tap";
  if (pathLength(raw) < 36) return "tap";
  const points = simplify(raw);
  const len = pathLength(points);
  const first = points[0];
  const last = points[points.length - 1];
  const gap = dist(first, last);

  // Straight lines are degenerate for $1 (non-uniform scaling), so test first.
  if (gap / len > 0.87) {
    const ang = Math.atan2(Math.abs(last.y - first.y), Math.abs(last.x - first.x));
    return ang < (40 * Math.PI) / 180 ? "frost" : null;
  }

  const b = bounds(points);
  const closedRatio = gap / Math.max(Math.hypot(b.w, b.h), 1);
  const closed = closedRatio < 0.4;

  // Alternating sharp turns = zigzag, whatever the segment count.
  const signs = cornerSigns(points);
  if (signs.length >= 2 && closedRatio > 0.3 && signs.every((s, i) => i === 0 || s !== signs[i - 1])) {
    return "lightning";
  }

  const norm = normalizeStroke(points);
  let best: Spell | null = null;
  let bestScore = 0;
  for (const t of TEMPLATES) {
    let score = 1 - distanceAtBestAngle(norm, t.pts) / HALF_DIAG;
    if (t.spell === "lightning" ? closed : !closed) score *= 0.86;
    if (score > bestScore) {
      bestScore = score;
      best = t.spell;
    }
  }
  if (!best || bestScore < 0.62) return null;
  if (best === "lightning") return best;

  // Closed shape: sharp corners mean a triangle, smooth all the way round means a circle.
  if (signs.length >= 2) return "fire";
  if (signs.length === 0) return "shield";
  return roundness(points) > 0.74 ? "shield" : "fire";
}

/* ------------------------------------------------------------------ */
/*  Game                                                               */
/* ------------------------------------------------------------------ */

type Spirit = {
  type: Spell;
  x: number;
  y: number;
  baseX: number;
  speed: number;
  amp: number;
  freq: number;
  phase: number;
  age: number;
  doomed: boolean;
  dead: boolean;
};
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  key: string;
  grav: number;
};
type Projectile = { type: Spell; x0: number; y0: number; target: Spirit; t: number; dur: number; curve: number };
type Bolt = { pts: Pt[]; life: number; max: number; width: number };
type Fx = { kind: "ring" | "star"; x: number; y: number; r: number; vr: number; life: number; max: number; rgb: RGB };
type FloatText = { x: number; y: number; text: string; color: string; size: number; life: number; max: number };
type Candle = { x: number; y: number; phase: number; scale: number };
type Mote = { x: number; y: number; vx: number; vy: number; phase: number; size: number };
type Rect = { x: number; y: number; w: number; h: number };
type Button = Rect & { id: "again" | "copy" | "share" };

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function startRuneDuel(canvas: HTMLCanvasElement): () => void {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return () => {};
  const ctx = context;

  let disposed = false;
  let raf = 0;

  /* ---------- layout ---------- */
  let W = 1;
  let H = 1;
  let dpr = 1;
  let u = 1;
  let playerX = 0;
  let playerY = 0;
  let wandX = 0;
  let wandY = 0;
  let fieldL = 0;
  let fieldW = 0;
  let hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let legend: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let muteBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let buttons: Button[] = [];
  const bg = document.createElement("canvas");
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  /* ---------- sprites ---------- */
  const sprites: Record<string, HTMLCanvasElement> = {};
  function makeGlow(key: string, c: RGB) {
    const s = document.createElement("canvas");
    s.width = s.height = 64;
    const g = s.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.18, rgba(c, 0.9));
      grad.addColorStop(0.5, rgba(c, 0.28));
      grad.addColorStop(1, rgba(c, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    sprites[key] = s;
  }
  for (const s of SPELL_ORDER) makeGlow(s, SPELLS[s].rgb);
  makeGlow("white", [235, 235, 255]);
  makeGlow("amber", [255, 178, 80]);
  makeGlow("violet", [190, 150, 255]);
  makeGlow("red", [255, 70, 90]);
  makeGlow("firefly", [226, 240, 110]);

  /* ---------- state ---------- */
  let phase: "title" | "play" | "over" = "title";
  let time = 0;
  let elapsed = 0;
  let overT = 0;
  let score = 0;
  let shownScore = 0;
  let combo = 0;
  let bestCombo = 0;
  let comboTimer = 0;
  let sinceCast = 99;
  let wards = MAX_WARDS;
  let bubble = 0;
  let shieldCd = 0;
  let spawnTimer = 0;
  let swarmIdx = 0;
  let lastTick = 99;
  let shake = 0;
  let flash = 0;
  let hurt = 0;
  let comboPulse = 0;
  let endReason: "time" | "wards" = "time";
  let newBest = false;
  let best = { ...SEED_BEST };
  let prevBest = { ...SEED_BEST };
  let muted = false;
  let toast = { text: "", life: 0 };
  let kills: Record<Spell, number> = { lightning: 0, shield: 0, fire: 0, frost: 0 };
  let lastTypes: Spell[] = [];

  let spirits: Spirit[] = [];
  let particles: Particle[] = [];
  let projectiles: Projectile[] = [];
  let bolts: Bolt[] = [];
  let fxs: Fx[] = [];
  let texts: FloatText[] = [];
  let candles: Candle[] = [];
  let motes: Mote[] = [];

  // Living-sky layer (purely decorative).
  let moonX = 0;
  let moonY = 0;
  let moonR = 0;
  let twinkles: { x: number; y: number; phase: number; speed: number; size: number }[] = [];
  let clouds: { x: number; y: number; w: number; speed: number; alpha: number }[] = [];
  let bats: { x: number; y: number; vx: number; phase: number; scale: number }[] = [];
  let windows: { x: number; y: number; phase: number }[] = [];
  let meteors: { x: number; y: number; vx: number; vy: number; life: number; max: number }[] = [];
  let meteorTimer = 1.5;

  // Season (cosmetic): one is drawn at random for the first round, then it changes every replay.
  // Append ?season=winter|rainy|spring|summer to the URL to pin one.
  const pinned = SEASON_ORDER.find((x) => x === new URLSearchParams(window.location.search).get("season"));
  let season: Season = pinned ?? SEASON_ORDER[Math.floor(Math.random() * SEASON_ORDER.length)];
  let cfg = SEASONS[season];
  let roundsPlayed = 0;
  let weather: { x: number; y: number; vx: number; vy: number; phase: number; size: number }[] = [];
  let stormTimer = 3;
  let stormFlash = 0;
  const cloudSprite = document.createElement("canvas");
  cloudSprite.width = 256;
  cloudSprite.height = 96;
  {
    const g = cloudSprite.getContext("2d");
    const rnd = mulberry32(99);
    if (g) {
      for (let i = 0; i < 9; i++) {
        const x = 50 + rnd() * 156;
        const y = 38 + rnd() * 20;
        const r = 22 + rnd() * 24;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, "rgba(176,172,236,0.5)");
        grad.addColorStop(1, "rgba(176,172,236,0)");
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
  }

  let activePointer: number | null = null;
  let stroke: Pt[] = [];
  let ghost: { pts: Pt[]; key: string; rgb: RGB; life: number } | null = null;

  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    const parsed = raw ? (JSON.parse(raw) as { name?: unknown; score?: unknown }) : null;
    if (parsed && typeof parsed.score === "number" && typeof parsed.name === "string" && parsed.score >= SEED_BEST.score) {
      best = { name: parsed.name, score: parsed.score };
    } else {
      window.localStorage.setItem(BEST_KEY, JSON.stringify(SEED_BEST));
    }
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    /* storage unavailable — play without persistence */
  }

  /* ---------- audio ---------- */
  let actx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let rainGain: GainNode | null = null;

  function ensureAudio() {
    if (disposed) return;
    if (!actx) {
      const AC =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        actx = new AC();
      } catch {
        return;
      }
      master = actx.createGain();
      master.gain.value = muted ? 0 : 0.7;
      const comp = actx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(actx.destination);
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      // Quiet night-air drone.
      const pad = actx.createGain();
      pad.gain.value = 0.022;
      pad.connect(master);
      for (const f of [110, 164.8, 220.6]) {
        const o = actx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        o.connect(pad);
        o.start();
      }
      // Rain hiss, only audible in the stormy season.
      rainGain = actx.createGain();
      rainGain.gain.value = 0;
      const rainSrc = actx.createBufferSource();
      rainSrc.buffer = noiseBuf;
      rainSrc.loop = true;
      const rainFilter = actx.createBiquadFilter();
      rainFilter.type = "bandpass";
      rainFilter.frequency.value = 3200;
      rainFilter.Q.value = 0.4;
      rainSrc.connect(rainFilter);
      rainFilter.connect(rainGain);
      rainGain.connect(master);
      rainSrc.start();
      applySeasonAudio();
    }
    if (actx.state === "suspended") actx.resume().catch(() => {});
  }

  function tone(
    freq: number,
    dur: number,
    o: { type?: OscillatorType; vol?: number; to?: number; delay?: number; attack?: number } = {},
  ) {
    if (!actx || !master || muted) return;
    const t0 = actx.currentTime + (o.delay ?? 0);
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol ?? 0.15, t0 + (o.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(
    dur: number,
    o: { vol?: number; type?: BiquadFilterType; f0: number; f1?: number; q?: number; delay?: number },
  ) {
    if (!actx || !master || !noiseBuf || muted) return;
    const t0 = actx.currentTime + (o.delay ?? 0);
    const src = actx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = actx.createBiquadFilter();
    f.type = o.type ?? "bandpass";
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur);
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol ?? 0.15, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];
  const sfx = {
    chime(step: number, delay = 0) {
      const f = SCALE[clamp(step, 0, SCALE.length - 1)];
      tone(f, 0.55, { vol: 0.16, delay });
      tone(f * 2, 0.35, { vol: 0.05, delay });
      tone(f * 3.01, 0.2, { vol: 0.025, delay });
    },
    whoosh() {
      noise(0.26, { vol: 0.1, f0: 500, f1: 2600, q: 1.4 });
    },
    lightning() {
      noise(0.24, { vol: 0.28, type: "highpass", f0: 1800 });
      tone(1500, 0.2, { type: "sawtooth", vol: 0.1, to: 110 });
      tone(62, 0.34, { vol: 0.26, to: 34 });
    },
    fire() {
      noise(0.42, { vol: 0.3, type: "lowpass", f0: 1500, f1: 180 });
      tone(150, 0.36, { type: "triangle", vol: 0.2, to: 48 });
    },
    frost() {
      for (let i = 0; i < 5; i++) {
        tone(1700 + Math.random() * 2300, 0.24 + Math.random() * 0.2, { type: "triangle", vol: 0.05, delay: i * 0.03 });
      }
      noise(0.16, { vol: 0.09, type: "highpass", f0: 5200 });
    },
    shield() {
      tone(220, 0.5, { vol: 0.15, to: 660, attack: 0.04 });
      tone(330, 0.5, { vol: 0.09, to: 990, attack: 0.04 });
    },
    fizzle() {
      tone(320, 0.26, { type: "triangle", vol: 0.1, to: 90 });
      noise(0.16, { vol: 0.05, f0: 900 });
    },
    hurt() {
      tone(120, 0.5, { type: "sawtooth", vol: 0.2, to: 38 });
      noise(0.32, { vol: 0.26, type: "lowpass", f0: 520 });
    },
    tick() {
      tone(990, 0.07, { vol: 0.05 });
    },
    begin() {
      [0, 2, 4, 6].forEach((s, i) => sfx.chime(s, i * 0.08));
      sfx.whoosh();
    },
    end(win: boolean) {
      const seq = win ? [2, 4, 5, 7, 9] : [6, 4, 3, 1];
      seq.forEach((s, i) => sfx.chime(s, i * (win ? 0.11 : 0.16)));
    },
  };

  function setMuted(m: boolean) {
    muted = m;
    if (actx && master) master.gain.setTargetAtTime(m ? 0 : 0.7, actx.currentTime, 0.02);
    try {
      window.localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!m) sfx.chime(4);
  }

  function applySeasonAudio() {
    if (actx && rainGain) rainGain.gain.setTargetAtTime(season === "rainy" ? 0.05 : 0, actx.currentTime, 0.5);
  }

  /* ---------- seasons ---------- */
  function makeWeather(): (typeof weather)[number] {
    const base = { x: Math.random() * W, y: Math.random() * H, phase: Math.random() * 20 };
    if (season === "winter") {
      return { ...base, vx: (Math.random() - 0.5) * 14, vy: 28 + Math.random() * 46, size: 0.8 + Math.random() * 1.9 };
    }
    if (season === "rainy") {
      return { ...base, vx: -130, vy: 820 + Math.random() * 380, size: 12 + Math.random() * 12 };
    }
    if (season === "spring") {
      return { ...base, vx: 14 + Math.random() * 26, vy: 16 + Math.random() * 26, size: 2.6 + Math.random() * 2.4 };
    }
    return { ...base, y: H * (0.42 + Math.random() * 0.42), vx: 0, vy: 0, size: 8 + Math.random() * 8 };
  }

  function initWeather() {
    weather = [];
    for (let i = 0; i < cfg.count; i++) weather.push(makeWeather());
  }

  function setSeason(next: Season) {
    season = next;
    cfg = SEASONS[next];
    stormTimer = 2.5;
    stormFlash = 0;
    meteors = [];
    initWeather();
    renderBackground();
    applySeasonAudio();
  }

  /* ---------- background ---------- */
  function renderBackground() {
    bg.width = canvas.width;
    bg.height = canvas.height;
    const g = bg.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rnd = mulberry32(7);
    windows = [];

    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, cfg.sky[0]);
    sky.addColorStop(0.45, cfg.sky[1]);
    sky.addColorStop(0.8, cfg.sky[2]);
    sky.addColorStop(1, cfg.sky[3]);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    for (let i = 0; i < 150; i++) {
      const x = rnd() * W;
      const y = rnd() * H * 0.75;
      const r = rnd() * 1.1 + 0.25;
      g.fillStyle = `rgba(${220 + rnd() * 35},${225 + rnd() * 30},255,${(0.25 + rnd() * 0.6) * cfg.stars})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }

    // Moon with halo.
    const mx = (moonX = W * 0.74);
    const my = (moonY = H * 0.2);
    const mr = (moonR = Math.min(W, H) * 0.105);
    g.globalAlpha = cfg.moon;
    const halo = g.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 5);
    halo.addColorStop(0, "rgba(200,205,255,0.35)");
    halo.addColorStop(0.3, "rgba(150,150,240,0.12)");
    halo.addColorStop(1, "rgba(120,120,220,0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);
    const moon = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
    moon.addColorStop(0, "#fffef2");
    moon.addColorStop(0.7, "#e6e4f5");
    moon.addColorStop(1, "#b9b8de");
    g.fillStyle = moon;
    g.beginPath();
    g.arc(mx, my, mr, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(150,150,195,0.3)";
    for (const [dx, dy, r] of [[-0.3, 0.1, 0.2], [0.25, -0.3, 0.13], [0.2, 0.4, 0.16], [-0.1, -0.45, 0.08], [0.5, 0.1, 0.07]]) {
      g.beginPath();
      g.arc(mx + dx * mr, my + dy * mr, r * mr, 0, Math.PI * 2);
      g.fill();
    }

    g.globalAlpha = 1;

    // Thin clouds.
    for (let i = 0; i < 6; i++) {
      const x = rnd() * W;
      const y = H * (0.1 + rnd() * 0.45);
      const w = W * (0.35 + rnd() * 0.4);
      const cg = g.createRadialGradient(x, y, 0, x, y, w / 2);
      cg.addColorStop(0, "rgba(170,165,230,0.07)");
      cg.addColorStop(1, "rgba(170,165,230,0)");
      g.save();
      g.translate(x, y);
      g.scale(1, 0.16);
      g.translate(-x, -y);
      g.fillStyle = cg;
      g.fillRect(x - w / 2, y - w / 2, w, w);
      g.restore();
    }

    // Distant spires, two layers.
    const horizon = playerY - 6 * u;
    const layer = (color: string, count: number, minH: number, maxH: number, win: boolean) => {
      g.fillStyle = color;
      const step = W / count;
      for (let i = 0; i < count; i++) {
        const tw = step * (0.3 + rnd() * 0.3);
        const x = i * step + rnd() * (step - tw);
        const th = H * lerp(minH, maxH, rnd());
        const top = horizon - th;
        g.fillRect(x, top, tw, th + 40);
        g.beginPath();
        g.moveTo(x - tw * 0.18, top);
        g.lineTo(x + tw / 2, top - tw * (1.1 + rnd() * 0.8));
        g.lineTo(x + tw * 1.18, top);
        g.closePath();
        g.fill();
        // Connecting wall.
        g.fillRect(x - step, horizon - th * 0.32, step * 2, th * 0.32 + 40);
        if (win) {
          for (let k = 0; k < 3; k++) {
            if (rnd() < 0.6) {
              g.fillStyle = `rgba(255,190,95,${0.35 + rnd() * 0.5})`;
              const wx = x + tw * (0.25 + rnd() * 0.4);
              const wy = top + th * (0.12 + k * 0.2);
              g.fillRect(wx, wy, Math.max(1.5, tw * 0.12), Math.max(2.5, tw * 0.2));
              windows.push({ x: wx + tw * 0.06, y: wy + tw * 0.1, phase: rnd() * 20 });
              g.fillStyle = color;
            }
          }
        }
      }
    };
    layer(cfg.far, 7, 0.1, 0.24, false);
    const mist = g.createLinearGradient(0, horizon - H * 0.2, 0, horizon);
    mist.addColorStop(0, rgba(cfg.mist, 0));
    mist.addColorStop(1, rgba(cfg.mist, 0.28));
    g.fillStyle = mist;
    g.fillRect(0, horizon - H * 0.2, W, H * 0.2);
    layer("#0f0d2b", 5, 0.05, 0.17, true);

    // Foreground parapet of our own tower.
    g.fillStyle = "#0a0920";
    g.fillRect(0, playerY, W, H - playerY);
    const mw = 34 * u;
    const gapW = 22 * u;
    const mh = 18 * u;
    for (let x = W / 2 + 52 * u; x < W + mw; x += mw + gapW) {
      g.fillRect(x, playerY - mh, mw, mh + 1);
      g.fillRect(W - x - mw, playerY - mh, mw, mh + 1);
    }
    // Moonlit edge — or a cap of snow in winter.
    g.strokeStyle = season === "winter" ? "rgba(232,241,255,0.92)" : "rgba(150,160,255,0.22)";
    g.lineWidth = season === "winter" ? 4 * u : 1.5;
    g.beginPath();
    g.moveTo(W / 2 - 52 * u, playerY + 0.75);
    g.lineTo(W / 2 + 52 * u, playerY + 0.75);
    for (let x = W / 2 + 52 * u; x < W + mw; x += mw + gapW) {
      g.moveTo(x, playerY - mh + 0.75);
      g.lineTo(x + mw, playerY - mh + 0.75);
      g.moveTo(W - x - mw, playerY - mh + 0.75);
      g.lineTo(W - x, playerY - mh + 0.75);
    }
    g.stroke();
    g.strokeStyle = "rgba(120,120,200,0.08)";
    g.lineWidth = 1;
    for (let row = 0; row < 5; row++) {
      const y = playerY + 14 * u + row * 20 * u;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
      for (let x = (row % 2) * 24 * u; x < W; x += 48 * u) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 20 * u);
        g.stroke();
      }
    }
  }

  function layout() {
    W = Math.max(1, canvas.clientWidth || window.innerWidth);
    H = Math.max(1, canvas.clientHeight || window.innerHeight);
    dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    u = clamp(Math.min(W / 390, H / 760), 0.62, 1.5);

    const barW = Math.min(W - 16 * u, 460 * u);
    hud = { x: (W - barW) / 2, y: 8 * u, w: barW, h: 48 * u };
    legend = { x: (W - barW) / 2, y: H - 58 * u, w: barW, h: 50 * u };
    muteBtn = { x: hud.x + hud.w - 42 * u, y: hud.y + 7 * u, w: 34 * u, h: 34 * u };
    playerX = W / 2;
    playerY = legend.y - 34 * u;
    wandX = playerX + 22 * u;
    wandY = playerY - 68 * u;
    fieldW = Math.min(W - 56 * u, H * 0.72);
    fieldL = (W - fieldW) / 2;

    const rnd = mulberry32(21);
    candles = [];
    for (let i = 0; i < 9; i++) {
      candles.push({
        x: W * (0.06 + rnd() * 0.88),
        y: H * (0.16 + rnd() * 0.5),
        phase: rnd() * 10,
        scale: 0.7 + rnd() * 0.6,
      });
    }
    motes = [];
    for (let i = 0; i < 48; i++) {
      motes.push({
        x: rnd() * W,
        y: rnd() * H,
        vx: (rnd() - 0.5) * 8,
        vy: -2 - rnd() * 6,
        phase: rnd() * 10,
        size: 0.6 + rnd() * 1.4,
      });
    }
    twinkles = [];
    for (let i = 0; i < 46; i++) {
      twinkles.push({
        x: rnd() * W,
        y: rnd() * H * 0.62,
        phase: rnd() * 20,
        speed: 0.6 + rnd() * 2.2,
        size: 5 + rnd() * 9,
      });
    }
    clouds = [];
    for (let i = 0; i < 5; i++) {
      clouds.push({
        x: rnd() * W * 1.4 - W * 0.2,
        y: H * (0.08 + rnd() * 0.42),
        w: Math.max(W, 420) * (0.55 + rnd() * 0.5),
        speed: (5 + rnd() * 9) * (rnd() < 0.5 ? -1 : 1),
        alpha: 0.2 + rnd() * 0.25,
      });
    }
    bats = [];
    for (let i = 0; i < 3; i++) {
      bats.push({
        x: rnd() * W,
        y: H * (0.12 + rnd() * 0.3),
        vx: (26 + rnd() * 30) * (i % 2 ? -1 : 1),
        phase: rnd() * 10,
        scale: 0.7 + rnd() * 0.7,
      });
    }
    meteors = [];
    initWeather();
    renderBackground();
  }

  /* ---------- effects helpers ---------- */
  function burst(x: number, y: number, key: string, n: number, speed: number, size: number, life: number, grav = 0) {
    for (let i = 0; i < n; i++) {
      if (particles.length > 700) particles.shift();
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.25 + Math.random() * 0.75) * u;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: life * (0.6 + Math.random() * 0.4),
        max: life,
        size: size * (0.5 + Math.random() * 0.8) * u,
        key,
        grav: grav * u,
      });
    }
  }
  function ring(x: number, y: number, rgb: RGB, vr: number, life: number, r = 6) {
    fxs.push({ kind: "ring", x, y, r: r * u, vr: vr * u, life, max: life, rgb });
  }
  function floatText(x: number, y: number, text: string, color: string, size = 18) {
    texts.push({ x, y, text, color, size, life: 1, max: 1 });
  }
  function addShake(v: number) {
    if (!reduceMotion) shake = Math.max(shake, v * u);
  }
  function makeBolt(x0: number, y0: number, x1: number, y1: number, width: number): Bolt {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const segs = Math.max(5, Math.round(d / (26 * u)));
    const nx = -(y1 - y0) / (d || 1);
    const ny = (x1 - x0) / (d || 1);
    const pts: Pt[] = [{ x: x0, y: y0 }];
    for (let i = 1; i < segs; i++) {
      const p = i / segs;
      const off = (Math.random() - 0.5) * Math.min(d * 0.22, 60 * u);
      pts.push({ x: lerp(x0, x1, p) + nx * off, y: lerp(y0, y1, p) + ny * off });
    }
    pts.push({ x: x1, y: y1 });
    return { pts, life: 0.24, max: 0.24, width };
  }

  /* ---------- game logic ---------- */
  const multiplier = () => Math.min(6, 1 + Math.floor(combo / 4));

  function spawnSpirit(yStart?: number, forced?: Spell) {
    const p = clamp(elapsed / ROUND_SECONDS, 0, 1);
    let type = forced ?? SPELL_ORDER[Math.floor(Math.random() * 4)];
    if (!forced && lastTypes.length >= 2 && lastTypes[0] === type && lastTypes[1] === type) {
      type = SPELL_ORDER[(SPELL_ORDER.indexOf(type) + 1 + Math.floor(Math.random() * 3)) % 4];
    }
    lastTypes = [type, lastTypes[0]];
    const x = fieldL + Math.random() * fieldW;
    spirits.push({
      type,
      x,
      y: yStart ?? -40 * u,
      baseX: x,
      speed: (playerY / lerp(10.5, 5.2, p)) * (0.85 + Math.random() * 0.3),
      amp: (14 + Math.random() * 26) * u,
      freq: 0.9 + Math.random() * 1.3,
      phase: Math.random() * Math.PI * 2,
      age: 0,
      doomed: false,
      dead: false,
    });
  }

  function beginRound() {
    if (roundsPlayed > 0 && !pinned) {
      const others = SEASON_ORDER.filter((x) => x !== season);
      setSeason(others[Math.floor(Math.random() * others.length)]);
    }
    roundsPlayed += 1;
    phase = "play";
    elapsed = 0;
    score = 0;
    shownScore = 0;
    combo = 0;
    bestCombo = 0;
    comboTimer = 0;
    sinceCast = 99;
    wards = MAX_WARDS;
    bubble = 0;
    shieldCd = 0;
    swarmIdx = 0;
    lastTick = 99;
    newBest = false;
    kills = { lightning: 0, shield: 0, fire: 0, frost: 0 };
    spirits = [];
    projectiles = [];
    stroke = [];
    ghost = null;
    toast.life = 0;
    // Something to hit right away.
    spawnSpirit(H * 0.3, "frost");
    spawnSpirit(H * 0.18, "lightning");
    spawnSpirit(-20 * u, "fire");
    spawnTimer = 1.6;
    sfx.begin();
    floatText(W / 2, H * 0.42, "Match the glyph to the spirit!", "#ffe9b0", 17);
    floatText(W / 2, H * 0.42 - 26 * u, cfg.label, cfg.accent, 14);
  }

  function endRound(reason: "time" | "wards") {
    if (phase !== "play") return;
    phase = "over";
    overT = 0;
    endReason = reason;
    activePointer = null;
    stroke = [];
    for (const s of spirits) burst(s.x, s.y, s.type, 10, 120, 16, 0.7);
    spirits = [];
    projectiles = [];
    prevBest = { ...best };
    newBest = score > best.score;
    if (newBest) {
      best = { name: "YOU", score };
      try {
        window.localStorage.setItem(BEST_KEY, JSON.stringify(best));
      } catch {
        /* ignore */
      }
      for (let i = 0; i < 5; i++) burst(W * (0.2 + 0.15 * i), H * 0.3, SPELL_ORDER[i % 4], 26, 320, 18, 1.4, 160);
    }
    sfx.end(newBest);
  }

  function banish(s: Spirit, scored: boolean) {
    if (s.dead) return;
    s.dead = true;
    const { rgb } = SPELLS[s.type];
    const x = s.x;
    const y = s.y;
    burst(x, y, "white", 6, 260, 10, 0.3);
    if (s.type === "fire") {
      burst(x, y, "fire", 26, 260, 20, 0.75, -240);
      burst(x, y, "amber", 10, 150, 26, 0.5, -120);
      ring(x, y, rgb, 300, 0.4);
    } else if (s.type === "frost") {
      burst(x, y, "frost", 22, 230, 14, 0.8, 220);
      fxs.push({ kind: "star", x, y, r: 10 * u, vr: 210 * u, life: 0.45, max: 0.45, rgb });
      ring(x, y, rgb, 220, 0.4);
    } else if (s.type === "shield") {
      burst(x, y, "shield", 22, 200, 16, 0.8);
      ring(x, y, rgb, 260, 0.45);
      ring(x, y, rgb, 150, 0.6);
    } else {
      burst(x, y, "lightning", 26, 420, 12, 0.45);
      ring(x, y, rgb, 380, 0.3);
    }
    if (!scored) return;
    combo += 1;
    bestCombo = Math.max(bestCombo, combo);
    comboTimer = COMBO_WINDOW;
    comboPulse = 1;
    kills[s.type] += 1;
    const mult = multiplier();
    const swift = sinceCast < SWIFT_WINDOW;
    const pts = (100 + (swift ? 50 : 0)) * mult;
    score += pts;
    floatText(x, y - 26 * u, `+${fmt(pts)}`, rgba(rgb, 1), 18 + mult * 1.5);
    if (swift) floatText(x, y - 48 * u, "Swift!", "#fff3c4", 13);
    addShake(4 + mult);
    sfx.chime(Math.min(combo - 1, 10));
  }

  function fizzle(msg: string) {
    if (combo >= 4) floatText(W / 2, hud.y + hud.h + 62 * u, "Combo lost", "#ff9aa5", 14);
    combo = 0;
    comboTimer = 0;
    burst(wandX, wandY, "violet", 12, 110, 12, 0.5, 200);
    floatText(wandX, wandY - 30 * u, msg, "#cfc6ee", 14);
    sfx.fizzle();
  }

  function cast(type: Spell) {
    const { rgb } = SPELLS[type];
    const mult = multiplier();
    const maxTargets = mult >= 5 ? 3 : mult >= 3 ? 2 : 1;
    const targets = spirits
      .filter((s) => s.type === type && !s.doomed && !s.dead && s.y > -10 * u)
      .sort((a, b) => b.y - a.y)
      .slice(0, maxTargets);

    let raised = false;
    if (type === "shield" && shieldCd <= 0) {
      raised = true;
      bubble = 5;
      shieldCd = 10;
      ring(playerX, playerY - 40 * u, rgb, 200, 0.5, 30);
      if (targets.length === 0) floatText(playerX, playerY - 110 * u, "Ward raised", rgba(rgb, 1), 14);
    }
    if (targets.length === 0) {
      if (raised) sfx.shield();
      else fizzle(`No ${SPELLS[type].label.toLowerCase()} spirit`);
      return;
    }

    burst(wandX, wandY, type, 10, 160, 14, 0.4);
    sfx.whoosh();
    sfx[type]();
    for (const s of targets) {
      s.doomed = true;
      if (type === "lightning") {
        bolts.push(makeBolt(wandX, wandY, s.x, s.y, 5));
        bolts.push(makeBolt(wandX, wandY, s.x + (Math.random() - 0.5) * 30 * u, s.y, 2));
        flash = Math.max(flash, 0.55);
        banish(s, true);
      } else {
        projectiles.push({
          type,
          x0: wandX,
          y0: wandY,
          target: s,
          t: 0,
          dur: 0.2,
          curve: (Math.random() - 0.5) * 90 * u,
        });
      }
    }
    sinceCast = 0;
  }

  function finishStroke() {
    const pts = stroke;
    stroke = [];
    const res = recognize(pts);
    if (res === "tap") return;
    if (res) {
      ghost = { pts, key: res, rgb: SPELLS[res].rgb, life: 0.45 };
      cast(res);
    } else {
      ghost = { pts, key: "violet", rgb: [150, 140, 180], life: 0.3 };
      fizzle("Unclear glyph");
    }
  }

  function hitPlayer(s: Spirit) {
    if (bubble > 0) {
      bubble = 0;
      ring(playerX, playerY - 40 * u, SPELLS.shield.rgb, 320, 0.5, 40);
      floatText(playerX, playerY - 110 * u, "Warded!", rgba(SPELLS.shield.rgb, 1), 16);
      sfx.shield();
      banish(s, false);
      return;
    }
    banish(s, false);
    wards -= 1;
    if (combo >= 4) floatText(W / 2, hud.y + hud.h + 62 * u, "Combo lost", "#ff9aa5", 14);
    combo = 0;
    comboTimer = 0;
    hurt = 1;
    addShake(16);
    burst(playerX, playerY - 40 * u, "red", 24, 300, 18, 0.7);
    sfx.hurt();
    if (wards <= 0) endRound("wards");
  }

  function update(dt: number) {
    time += dt;
    shake = Math.max(0, shake - dt * 60 * u);
    flash = Math.max(0, flash - dt * 3.5);
    hurt = Math.max(0, hurt - dt * 1.8);
    comboPulse = Math.max(0, comboPulse - dt * 4);
    toast.life = Math.max(0, toast.life - dt);
    shownScore += (score - shownScore) * Math.min(1, dt * 12);
    if (ghost) {
      ghost.life -= dt;
      if (ghost.life <= 0) ghost = null;
    }

    if (phase === "over") overT += dt;

    if (phase === "play") {
      elapsed += dt;
      sinceCast += dt;
      bubble = Math.max(0, bubble - dt);
      shieldCd = Math.max(0, shieldCd - dt);
      const p = clamp(elapsed / ROUND_SECONDS, 0, 1);

      if (combo > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) {
          if (combo >= 4) floatText(W / 2, hud.y + hud.h + 62 * u, "Combo faded", "#cfc6ee", 13);
          combo = 0;
        }
      }

      spawnTimer -= dt;
      const live = spirits.length;
      if ((spawnTimer <= 0 || live === 0) && live < 9) {
        spawnSpirit();
        spawnTimer = lerp(1.55, 0.6, p) * (0.75 + Math.random() * 0.5);
      }
      const swarms = [20, 40, 58];
      if (swarmIdx < swarms.length && elapsed >= swarms[swarmIdx]) {
        swarmIdx += 1;
        for (let i = 0; i < 3; i++) spawnSpirit((-30 - i * 46) * u);
        floatText(W / 2, H * 0.36, "A swarm descends!", "#ffd9a0", 18);
        noise(0.7, { vol: 0.1, f0: 300, f1: 1400, q: 0.8 });
      }

      const remaining = ROUND_SECONDS - elapsed;
      const sec = Math.ceil(remaining);
      if (sec <= 10 && sec !== lastTick && sec > 0) {
        lastTick = sec;
        sfx.tick();
      }

      const reachY = playerY - 58 * u;
      for (const s of spirits) {
        s.age += dt;
        s.y += s.speed * dt;
        const near = clamp(s.y / reachY, 0, 1);
        s.baseX += (playerX - s.baseX) * dt * (0.15 + near * near * 1.6);
        s.x = s.baseX + Math.sin(time * s.freq + s.phase) * s.amp * (1 - near * 0.7);
        if (!s.dead && !s.doomed && s.y >= reachY) hitPlayer(s);
        if (phase !== "play") break;
      }

      for (const pr of projectiles) {
        pr.t += dt;
        const pos = projectilePos(pr);
        burst(pos.x, pos.y, pr.type, 2, 40, 12, 0.3);
        if (pr.t >= pr.dur) banish(pr.target, true);
      }
      projectiles = projectiles.filter((pr) => pr.t < pr.dur);
      spirits = spirits.filter((s) => !s.dead);

      if (phase === "play" && remaining <= 0) endRound("time");
    }

    for (const pt of particles) {
      pt.life -= dt;
      pt.vy += pt.grav * dt;
      pt.vx *= 1 - 1.8 * dt;
      pt.vy *= 1 - 1.8 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    particles = particles.filter((pt) => pt.life > 0);
    for (const b of bolts) b.life -= dt;
    bolts = bolts.filter((b) => b.life > 0);
    for (const f of fxs) {
      f.life -= dt;
      f.r += f.vr * dt;
    }
    fxs = fxs.filter((f) => f.life > 0);
    for (const tx of texts) {
      tx.life -= dt * 0.9;
      tx.y -= 34 * u * dt;
    }
    texts = texts.filter((tx) => tx.life > 0);
    if (season === "summer") {
      for (const w of weather) {
        w.x += (Math.sin(time * 0.7 + w.phase) * 14 + Math.cos(time * 0.31 + w.phase * 2) * 8) * u * dt;
        w.y += Math.cos(time * 0.9 + w.phase * 1.3) * 10 * u * dt;
      }
    } else {
      const sway = season === "rainy" ? 0 : 18;
      for (const w of weather) {
        w.x += (w.vx + Math.sin(time * 1.2 + w.phase) * sway) * u * dt;
        w.y += w.vy * u * dt;
        if (w.y > H + 12) {
          w.y = -12;
          w.x = Math.random() * (W + 80) - 40;
        }
        if (w.x < -40) w.x = W + 40;
        if (w.x > W + 40) w.x = -40;
      }
    }
    if (season === "rainy") {
      stormTimer -= dt;
      if (stormTimer <= 0) {
        stormTimer = 5 + Math.random() * 7;
        stormFlash = 1;
        noise(1.7, { vol: 0.2, type: "lowpass", f0: 240, f1: 60, delay: 0.45 });
        tone(58, 1.3, { vol: 0.1, to: 30, delay: 0.45 });
      }
    }
    stormFlash = Math.max(0, stormFlash - dt * 1.6);
    for (const c of clouds) {
      c.x += c.speed * u * dt;
      if (c.speed > 0 && c.x - c.w / 2 > W) c.x = -c.w / 2;
      if (c.speed < 0 && c.x + c.w / 2 < 0) c.x = W + c.w / 2;
    }
    for (const b of bats) {
      b.x += b.vx * u * dt;
      if (b.x > W + 40 * u || b.x < -40 * u) {
        b.vx = -b.vx;
        b.x = clamp(b.x, -40 * u, W + 40 * u);
        b.y = H * (0.1 + Math.random() * 0.34);
        b.scale = 0.7 + Math.random() * 0.7;
      }
    }
    meteorTimer -= dt;
    if (meteorTimer <= 0 && cfg.meteors > 0) {
      meteorTimer = (2.5 + Math.random() * 4.5) / cfg.meteors;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const ang = (20 + Math.random() * 25) * (Math.PI / 180);
      const v = (620 + Math.random() * 380) * u;
      const life = 0.55 + Math.random() * 0.4;
      meteors.push({
        x: W * (0.5 - dir * (0.1 + Math.random() * 0.4)),
        y: H * (0.02 + Math.random() * 0.22),
        vx: Math.cos(ang) * v * dir,
        vy: Math.sin(ang) * v,
        life,
        max: life,
      });
    }
    for (const m of meteors) {
      m.life -= dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
    }
    meteors = meteors.filter((m) => m.life > 0);
    for (const m of motes) {
      m.x += (m.vx + Math.sin(time * 0.6 + m.phase) * 6) * dt;
      m.y += m.vy * dt;
      if (m.y < -5) {
        m.y = H + 5;
        m.x = Math.random() * W;
      }
      if (m.x < -5) m.x = W + 5;
      if (m.x > W + 5) m.x = -5;
    }
  }

  function projectilePos(pr: Projectile): Pt {
    const p = clamp(pr.t / pr.dur, 0, 1);
    const e = p * p * (3 - 2 * p);
    const tx = pr.target.x;
    const ty = pr.target.y;
    const d = Math.hypot(tx - pr.x0, ty - pr.y0) || 1;
    const off = Math.sin(p * Math.PI) * pr.curve;
    return {
      x: lerp(pr.x0, tx, e) - ((ty - pr.y0) / d) * off,
      y: lerp(pr.y0, ty, e) + ((tx - pr.x0) / d) * off,
    };
  }

  /* ---------- drawing ---------- */
  const font = (px: number, weight = "normal") => `${weight} ${Math.round(px * u * 10) / 10}px ${SERIF}`;

  function glow(key: string, x: number, y: number, size: number, alpha: number) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprites[key], x - size / 2, y - size / 2, size, size);
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function parchment(x: number, y: number, w: number, h: number, r: number) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 14 * u;
    ctx.shadowOffsetY = 3 * u;
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, "#f4e6bc");
    g.addColorStop(0.55, "#e9d5a0");
    g.addColorStop(1, "#d3b97c");
    ctx.fillStyle = g;
    roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#7c5a2b";
    ctx.lineWidth = 1.5;
    roundRect(x, y, w, h, r);
    ctx.stroke();
    ctx.strokeStyle = "rgba(124,90,43,0.35)";
    ctx.lineWidth = 1;
    roundRect(x + 3 * u, y + 3 * u, w - 6 * u, h - 6 * u, Math.max(1, r - 3 * u));
    ctx.stroke();
  }

  function glyphPath(type: Spell, x: number, y: number, s: number) {
    ctx.beginPath();
    if (type === "lightning") {
      ctx.moveTo(x - 0.5 * s, y + 0.34 * s);
      ctx.lineTo(x - 0.17 * s, y - 0.34 * s);
      ctx.lineTo(x + 0.17 * s, y + 0.34 * s);
      ctx.lineTo(x + 0.5 * s, y - 0.34 * s);
    } else if (type === "shield") {
      ctx.arc(x, y, 0.42 * s, 0, Math.PI * 2);
    } else if (type === "fire") {
      ctx.moveTo(x, y - 0.45 * s);
      ctx.lineTo(x + 0.48 * s, y + 0.38 * s);
      ctx.lineTo(x - 0.48 * s, y + 0.38 * s);
      ctx.closePath();
    } else {
      ctx.moveTo(x - 0.5 * s, y);
      ctx.lineTo(x + 0.5 * s, y);
    }
  }

  function drawGlyph(type: Spell, x: number, y: number, s: number, alpha = 1) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    glyphPath(type, x, y, s);
    ctx.strokeStyle = `rgba(8,6,28,${0.75 * alpha})`;
    ctx.lineWidth = Math.max(4, s * 0.3);
    ctx.stroke();
    ctx.strokeStyle = rgba(SPELLS[type].rgb, alpha);
    ctx.lineWidth = Math.max(2, s * 0.14);
    ctx.stroke();
  }

  function glyphBadge(type: Spell, x: number, y: number, r: number) {
    ctx.fillStyle = "#1a1438";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(SPELLS[type].rgb, 0.8);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawGlyph(type, x, y, r * 1.15);
  }

  function drawSpirit(s: Spirit) {
    const { rgb } = SPELLS[s.type];
    const R = 22 * u;
    const a = clamp(s.age / 0.35, 0, 1);
    const x = s.x;
    const y = s.y + Math.sin(time * 3 + s.phase) * 3 * u;

    ctx.globalCompositeOperation = "lighter";
    glow(s.type, x, y, R * 4.6, 0.5 * a);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = a;

    ctx.beginPath();
    ctx.moveTo(x - R, y);
    ctx.arc(x, y, R, Math.PI, 0);
    ctx.lineTo(x + R, y + R * 0.9);
    const scallops = 4;
    for (let i = 0; i < scallops; i++) {
      const x0 = x + R - (i * 2 * R) / scallops;
      const x1 = x + R - ((i + 1) * 2 * R) / scallops;
      const dip = R * (1.4 + 0.14 * Math.sin(time * 7 + i * 1.7 + s.phase));
      ctx.quadraticCurveTo((x0 + x1) / 2, y + dip, x1, y + R * 0.9);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.1, x, y, R * 1.5);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.4, rgba(rgb, 0.9));
    g.addColorStop(1, rgba([rgb[0] * 0.45, rgb[1] * 0.45, rgb[2] * 0.6], 0.6));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Mischievous face.
    ctx.fillStyle = "#0b0820";
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(x + side * R * 0.36, y - R * 0.05);
      ctx.rotate(side * 0.35);
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 0.15, R * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = "#0b0820";
    ctx.lineWidth = 2 * u;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - R * 0.6, y - R * 0.42);
    ctx.lineTo(x - R * 0.2, y - R * 0.28);
    ctx.moveTo(x + R * 0.6, y - R * 0.42);
    ctx.lineTo(x + R * 0.2, y - R * 0.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y + R * 0.3, R * 0.3, 0.15, Math.PI - 0.15);
    ctx.stroke();

    drawGlyph(s.type, x, y - R * 1.95, R * 1.05, a);
    ctx.globalAlpha = 1;
  }

  const AURORA: RGB[] = [
    [90, 255, 200],
    [150, 120, 255],
    [90, 180, 255],
  ];

  function drawSky() {
    ctx.globalCompositeOperation = "lighter";

    // Aurora ribbons rippling across the upper sky.
    const steps = 22;
    AURORA.forEach((rgb, i) => {
      if (cfg.aurora <= 0) return;
      const baseY = H * (0.07 + 0.075 * i);
      const breathe = 0.55 + 0.45 * Math.sin(time * 0.23 + i * 2.1);
      const top = (x: number) =>
        baseY + Math.sin(x * 0.007 + time * 0.22 + i * 2) * H * 0.035 + Math.sin(x * 0.019 - time * 0.37 + i) * H * 0.013;
      const g = ctx.createLinearGradient(0, baseY - H * 0.05, 0, baseY + H * 0.24);
      g.addColorStop(0, rgba(rgb, 0));
      g.addColorStop(0.22, rgba(rgb, Math.min(0.3, 0.11 * breathe * cfg.aurora)));
      g.addColorStop(1, rgba(rgb, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let k = 0; k <= steps; k++) {
        const x = (k / steps) * W;
        if (k === 0) ctx.moveTo(x, top(x));
        else ctx.lineTo(x, top(x));
      }
      for (let k = steps; k >= 0; k--) {
        const x = (k / steps) * W;
        ctx.lineTo(x, top(x) + H * 0.15 * (0.75 + 0.25 * Math.sin(x * 0.011 + time * 0.31 + i * 1.3)));
      }
      ctx.closePath();
      ctx.fill();
    });

    // Distant storm lightning lighting up the clouds.
    const storm = reduceMotion ? 0 : stormFlash * (0.55 + 0.45 * Math.sin(time * 42));
    if (storm > 0.02) {
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.75);
      g.addColorStop(0, `rgba(190,205,255,${0.34 * storm})`);
      g.addColorStop(1, "rgba(190,205,255,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H * 0.75);
    }

    // Breathing moon halo and twinkling stars.
    glow(
      "white",
      moonX,
      moonY,
      moonR * (5.2 + 0.5 * Math.sin(time * 0.8)),
      (0.07 + 0.03 * Math.sin(time * 0.8)) * cfg.moon,
    );
    for (const s of twinkles) {
      const a = Math.pow(0.5 + 0.5 * Math.sin(time * s.speed + s.phase), 3) * cfg.stars;
      if (a > 0.04) glow("white", s.x, s.y, s.size * u * (0.6 + a * 0.6), a * 0.85);
    }

    // Shooting stars.
    ctx.lineCap = "round";
    for (const m of meteors) {
      const a = Math.sin((m.life / m.max) * Math.PI);
      const v = Math.hypot(m.vx, m.vy) || 1;
      const tx = m.x - (m.vx / v) * 110 * u;
      const ty = m.y - (m.vy / v) * 110 * u;
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      g.addColorStop(0, `rgba(255,250,235,${a})`);
      g.addColorStop(1, "rgba(180,190,255,0)");
      ctx.globalAlpha = 1;
      ctx.strokeStyle = g;
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      glow("white", m.x, m.y, 16 * u, a);
    }

    // Flickering windows in the distant spires.
    for (const w of windows) {
      const f = 0.5 + 0.5 * Math.sin(time * 2.3 + w.phase) * Math.sin(time * 5.1 + w.phase * 1.7);
      glow("amber", w.x, w.y, (12 + 8 * f) * u, 0.18 + 0.3 * f);
    }
    ctx.globalCompositeOperation = "source-over";

    // Clouds sliding past the moon.
    for (const c of clouds) {
      ctx.globalAlpha = Math.min(1, c.alpha * cfg.clouds);
      ctx.drawImage(cloudSprite, c.x - c.w / 2, c.y - c.w * 0.1875, c.w, c.w * 0.375);
    }
    ctx.globalAlpha = 1;

    // Bats flitting across the night.
    ctx.fillStyle = "rgba(6,5,22,0.9)";
    for (const b of cfg.bats ? bats : []) {
      const s = 9 * u * b.scale;
      const y = b.y + Math.sin(time * 1.7 + b.phase) * 14 * u;
      const flap = Math.sin(time * 15 + b.phase);
      const tipY = y - s * 0.9 * flap;
      ctx.beginPath();
      ctx.moveTo(b.x, y - s * 0.25);
      ctx.quadraticCurveTo(b.x + s * 0.9, y - s * 0.7 - s * 0.5 * flap, b.x + s * 1.9, tipY);
      ctx.quadraticCurveTo(b.x + s * 1.2, y + s * 0.1, b.x + s * 0.7, y + s * 0.35);
      ctx.quadraticCurveTo(b.x + s * 0.3, y + s * 0.1, b.x, y + s * 0.45);
      ctx.quadraticCurveTo(b.x - s * 0.3, y + s * 0.1, b.x - s * 0.7, y + s * 0.35);
      ctx.quadraticCurveTo(b.x - s * 1.2, y + s * 0.1, b.x - s * 1.9, tipY);
      ctx.quadraticCurveTo(b.x - s * 0.9, y - s * 0.7 - s * 0.5 * flap, b.x, y - s * 0.25);
      ctx.fill();
    }

    // Seasonal weather, kept dim and behind the spirits.
    if (season === "winter") {
      ctx.fillStyle = "rgba(240,246,255,0.8)";
      ctx.beginPath();
      for (const w of weather) {
        ctx.moveTo(w.x + w.size * u, w.y);
        ctx.arc(w.x, w.y, w.size * u, 0, Math.PI * 2);
      }
      ctx.fill();
    } else if (season === "rainy") {
      ctx.strokeStyle = "rgba(170,190,255,0.3)";
      ctx.lineWidth = 1.1 * u;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const w of weather) {
        ctx.moveTo(w.x, w.y);
        ctx.lineTo(w.x - (w.vx / w.vy) * w.size * u, w.y - w.size * u);
      }
      ctx.stroke();
    } else if (season === "spring") {
      ctx.fillStyle = "rgba(255,176,206,0.8)";
      for (const w of weather) {
        ctx.beginPath();
        ctx.ellipse(w.x, w.y, w.size * u, w.size * 0.55 * u, time * 1.5 + w.phase, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.globalCompositeOperation = "lighter";
      for (const w of weather) {
        const a = Math.pow(0.5 + 0.5 * Math.sin(time * 2.2 + w.phase), 2);
        if (a > 0.03) glow("firefly", w.x, w.y, w.size * u * (0.7 + a), a * 0.9);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
  }

  function drawCandle(c: Candle) {
    const s = c.scale * u;
    const x = c.x + Math.sin(time * 0.5 + c.phase) * 5 * u;
    const y = c.y + Math.sin(time * 0.9 + c.phase * 2) * 7 * u;
    const flick = 0.8 + 0.2 * Math.sin(time * 11 + c.phase * 5) * Math.sin(time * 7.3 + c.phase);
    ctx.globalCompositeOperation = "lighter";
    glow("amber", x, y - 12 * s, 90 * s * flick, 0.42);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(x - 3 * s, 0, x + 3 * s, 0);
    g.addColorStop(0, "#f6ecd2");
    g.addColorStop(1, "#a89a7c");
    ctx.fillStyle = g;
    ctx.fillRect(x - 3 * s, y - 6 * s, 6 * s, 20 * s);
    ctx.fillStyle = "#ffe9a8";
    ctx.beginPath();
    ctx.moveTo(x, y - 6 * s - 11 * s * flick);
    ctx.quadraticCurveTo(x + 4 * s, y - 9 * s, x, y - 6 * s);
    ctx.quadraticCurveTo(x - 4 * s, y - 9 * s, x, y - 6 * s - 11 * s * flick);
    ctx.fill();
  }

  function drawPlayer() {
    const x = playerX;
    const y = playerY;
    const bob = Math.sin(time * 2) * 1.5 * u;
    const casting = ghost && ghost.key !== "violet" ? ghost.life / 0.45 : 0;
    const tipKey = ghost && ghost.key !== "violet" ? ghost.key : "violet";

    if (bubble > 0) {
      const a = Math.min(1, bubble) * (0.55 + 0.15 * Math.sin(time * 6));
      const br = 62 * u;
      const by = y - 38 * u;
      const g = ctx.createRadialGradient(x, by, br * 0.5, x, by, br);
      g.addColorStop(0, rgba(SPELLS.shield.rgb, 0));
      g.addColorStop(0.85, rgba(SPELLS.shield.rgb, 0.16 * a));
      g.addColorStop(1, rgba(SPELLS.shield.rgb, 0.5 * a));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, by, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(SPELLS.shield.rgb, 0.8 * a);
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = "#07061a";
    ctx.strokeStyle = "rgba(160,170,255,0.4)";
    ctx.lineWidth = 1.2;
    // Robe.
    ctx.beginPath();
    ctx.moveTo(x - 20 * u, y);
    ctx.quadraticCurveTo(x - 14 * u, y - 30 * u, x - 8 * u, y - 46 * u + bob);
    ctx.lineTo(x + 8 * u, y - 46 * u + bob);
    ctx.quadraticCurveTo(x + 15 * u, y - 28 * u, x + 22 * u, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Hooded head.
    ctx.beginPath();
    ctx.moveTo(x - 11 * u, y - 44 * u + bob);
    ctx.quadraticCurveTo(x - 12 * u, y - 64 * u + bob, x + 1 * u, y - 68 * u + bob);
    ctx.quadraticCurveTo(x + 12 * u, y - 62 * u + bob, x + 10 * u, y - 44 * u + bob);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Arm + wand.
    ctx.strokeStyle = "#07061a";
    ctx.lineWidth = 5 * u;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + 5 * u, y - 40 * u + bob);
    ctx.lineTo(x + 14 * u, y - 52 * u + bob);
    ctx.stroke();
    ctx.strokeStyle = "#5b4630";
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.moveTo(x + 13 * u, y - 50 * u + bob);
    ctx.lineTo(wandX, wandY);
    ctx.stroke();
    ctx.globalCompositeOperation = "lighter";
    glow(tipKey, wandX, wandY, (26 + casting * 46 + Math.sin(time * 5) * 3) * u, 0.9);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  function strokeTrail(pts: Pt[], rgb: RGB, alpha: number) {
    if (pts.length < 2) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(rgb, 0.16 * alpha);
    ctx.lineWidth = 22 * u;
    ctx.stroke();
    ctx.strokeStyle = rgba(rgb, 0.5 * alpha);
    ctx.lineWidth = 9 * u;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.95 * alpha})`;
    ctx.lineWidth = 2.6 * u;
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawHud() {
    parchment(hud.x, hud.y, hud.w, hud.h, 9 * u);
    const ink = "#3a2913";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(58,41,19,0.7)";
    ctx.font = font(9, "bold");
    ctx.fillText("SCORE", hud.x + 14 * u, hud.y + 17 * u);
    ctx.fillStyle = ink;
    ctx.font = font(21, "bold");
    ctx.fillText(fmt(shownScore), hud.x + 14 * u, hud.y + 39 * u);

    const remaining = phase === "title" ? ROUND_SECONDS : Math.max(0, ROUND_SECONDS - elapsed);
    const sec = Math.ceil(remaining);
    const urgent = phase === "play" && sec <= 10;
    ctx.textAlign = "center";
    ctx.fillStyle = urgent ? "#a3162a" : ink;
    ctx.font = font(urgent ? 24 + 2 * Math.sin(time * 12) : 23, "bold");
    ctx.fillText(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`, hud.x + hud.w / 2, hud.y + 33 * u);

    // Mute toggle.
    const b = muteBtn;
    ctx.fillStyle = "rgba(58,41,19,0.1)";
    roundRect(b.x, b.y, b.w, b.h, 6 * u);
    ctx.fill();
    ctx.strokeStyle = "rgba(58,41,19,0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const k = b.w / 34;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(cx - 10 * k, cy - 4 * k);
    ctx.lineTo(cx - 5 * k, cy - 4 * k);
    ctx.lineTo(cx + 1 * k, cy - 9 * k);
    ctx.lineTo(cx + 1 * k, cy + 9 * k);
    ctx.lineTo(cx - 5 * k, cy + 4 * k);
    ctx.lineTo(cx - 10 * k, cy + 4 * k);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.8 * k;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (muted) {
      ctx.moveTo(cx + 4.5 * k, cy - 4 * k);
      ctx.lineTo(cx + 11 * k, cy + 4 * k);
      ctx.moveTo(cx + 11 * k, cy - 4 * k);
      ctx.lineTo(cx + 4.5 * k, cy + 4 * k);
    } else {
      ctx.arc(cx + 1 * k, cy, 5.5 * k, -0.8, 0.8);
      ctx.moveTo(cx + 1 * k + Math.cos(-0.8) * 9.5 * k, cy + Math.sin(-0.8) * 9.5 * k);
      ctx.arc(cx + 1 * k, cy, 9.5 * k, -0.8, 0.8);
    }
    ctx.stroke();

    if (phase === "title") return;

    // Wards (candle flames).
    const wy = hud.y + hud.h + 16 * u;
    for (let i = 0; i < MAX_WARDS; i++) {
      const wx = hud.x + 14 * u + i * 17 * u;
      if (i < wards) {
        ctx.globalCompositeOperation = "lighter";
        glow("amber", wx, wy, 26 * u, 0.9);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#fff0b8";
        ctx.beginPath();
        ctx.moveTo(wx, wy - 7 * u);
        ctx.quadraticCurveTo(wx + 4.5 * u, wy + 2 * u, wx, wy + 5 * u);
        ctx.quadraticCurveTo(wx - 4.5 * u, wy + 2 * u, wx, wy - 7 * u);
        ctx.fill();
      } else {
        ctx.fillStyle = "rgba(190,185,230,0.25)";
        ctx.beginPath();
        ctx.arc(wx, wy, 3 * u, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.textAlign = "right";
    ctx.font = font(11);
    ctx.fillStyle = "rgba(255,233,176,0.8)";
    ctx.fillText(`Best · ${best.name} ${fmt(best.score)}`, hud.x + hud.w - 6 * u, wy + 4 * u);

    // Combo.
    if (phase === "play" && combo >= 2) {
      const mult = multiplier();
      const cy2 = hud.y + hud.h + 44 * u;
      ctx.textAlign = "center";
      ctx.save();
      ctx.shadowColor = "rgba(255,200,90,0.9)";
      ctx.shadowBlur = 14 * u;
      ctx.fillStyle = "#ffe08a";
      ctx.font = font(24 + comboPulse * 8, "bold");
      ctx.fillText(`×${mult}`, W / 2, cy2);
      ctx.restore();
      ctx.font = font(11);
      ctx.fillStyle = "rgba(255,240,210,0.85)";
      ctx.fillText(`${combo} combo`, W / 2, cy2 + 14 * u);
      const bw = 64 * u;
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(W / 2 - bw / 2, cy2 + 19 * u, bw, 3 * u);
      ctx.fillStyle = "#ffd36b";
      ctx.fillRect(W / 2 - bw / 2, cy2 + 19 * u, bw * clamp(comboTimer / COMBO_WINDOW, 0, 1), 3 * u);
    }
  }

  function drawLegend() {
    parchment(legend.x, legend.y, legend.w, legend.h, 9 * u);
    const cw = legend.w / 4;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    SPELL_ORDER.forEach((type, i) => {
      const x = legend.x + cw * (i + 0.5);
      const y = legend.y + 19 * u;
      const r = 13 * u;
      glyphBadge(type, x, y, r);
      if (type === "shield" && shieldCd > 0 && phase === "play") {
        ctx.fillStyle = "rgba(244,230,188,0.6)";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, r + 1, -Math.PI / 2, -Math.PI / 2 + (shieldCd / 10) * Math.PI * 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = "#3a2913";
      ctx.font = font(10.5, "bold");
      ctx.fillText(SPELLS[type].label, x, legend.y + 44 * u);
    });
  }

  function drawTitle() {
    ctx.fillStyle = "rgba(5,4,20,0.5)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const cy = hud.y + hud.h + (legend.y - hud.y - hud.h) * 0.5;

    ctx.save();
    ctx.shadowColor = "rgba(255,190,90,0.9)";
    ctx.shadowBlur = 26 * u;
    ctx.fillStyle = "#ffe6a3";
    ctx.font = font(56, "bold");
    ctx.fillText("Rune Duel", W / 2, cy - 120 * u);
    ctx.restore();
    ctx.fillStyle = cfg.accent;
    ctx.font = font(14, "italic");
    ctx.fillText(cfg.tagline, W / 2, cy - 92 * u);

    const gap = Math.min(78 * u, (W - 40 * u) / 4);
    SPELL_ORDER.forEach((type, i) => {
      const x = W / 2 + (i - 1.5) * gap;
      const y = cy - 30 * u + Math.sin(time * 2 + i) * 3 * u;
      ctx.globalCompositeOperation = "lighter";
      glow(type, x, y, 76 * u, 0.4);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      glyphBadge(type, x, y, 22 * u);
      ctx.fillStyle = rgba(SPELLS[type].rgb, 1);
      ctx.font = font(12, "bold");
      ctx.fillText(SPELLS[type].label, x, cy + 10 * u);
    });

    ctx.fillStyle = "#fff6dc";
    ctx.font = font(17);
    ctx.fillText("Draw a glyph to cast its spell", W / 2, cy + 52 * u);
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 4);
    ctx.fillStyle = "#ffe6a3";
    ctx.font = font(21, "bold");
    ctx.fillText("Tap to begin", W / 2, cy + 96 * u);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(220,214,255,0.8)";
    ctx.font = font(12.5);
    ctx.fillText(`Score to beat — ${best.name}: ${fmt(best.score)}`, W / 2, cy + 128 * u);
  }

  function drawOver() {
    const a = clamp(overT / 0.4, 0, 1);
    ctx.fillStyle = `rgba(5,4,20,${0.6 * a})`;
    ctx.fillRect(0, 0, W, H);
    const cw = Math.min(W - 28 * u, 344 * u);
    const ch = 352 * u;
    const x = (W - cw) / 2;
    const y = clamp((H - ch) / 2, 4, Math.max(4, H - ch - 4)) + (1 - a) * 30 * u;
    ctx.globalAlpha = a;
    parchment(x, y, cw, ch, 14 * u);
    const ink = "#3a2913";
    const mid = W / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = newBest ? "#9a5b00" : ink;
    ctx.font = font(23, "bold");
    ctx.fillText(newBest ? "New High Score!" : endReason === "time" ? "The Duel Is Done" : "Your Wards Fell", mid, y + 38 * u);
    ctx.fillStyle = "rgba(58,41,19,0.65)";
    ctx.font = font(10, "bold");
    ctx.fillText("FINAL SCORE", mid, y + 60 * u);
    ctx.fillStyle = ink;
    ctx.font = font(48, "bold");
    ctx.fillText(fmt(score), mid, y + 106 * u);
    ctx.font = font(15);
    ctx.fillText(`Best combo ×${bestCombo} · ${cfg.label}`, mid, y + 132 * u);

    ctx.font = `${Math.round(17 * u)}px ${SERIF}, ${EMOJI}`;
    const cell = (cw - 32 * u) / 4;
    SPELL_ORDER.forEach((type, i) => {
      ctx.fillText(`${SPELLS[type].emoji} ${kills[type]}`, x + 16 * u + cell * (i + 0.5), y + 166 * u);
    });

    ctx.strokeStyle = "rgba(124,90,43,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 24 * u, y + 180 * u);
    ctx.lineTo(x + cw - 24 * u, y + 180 * u);
    ctx.stroke();

    ctx.fillStyle = "rgba(58,41,19,0.85)";
    ctx.font = font(12.5, "italic");
    const line = newBest
      ? `You dethroned ${prevBest.name} (${fmt(prevBest.score)})`
      : best.name === "YOU"
        ? `Your best: ${fmt(best.score)}`
        : `Score to beat — ${best.name}: ${fmt(best.score)}`;
    ctx.fillText(line, mid, y + 200 * u);

    const pad = 20 * u;
    const half = (cw - pad * 2 - 10 * u) / 2;
    buttons = [
      { id: "again", x: x + pad, y: y + 216 * u, w: cw - pad * 2, h: 46 * u },
      { id: "copy", x: x + pad, y: y + 272 * u, w: half, h: 42 * u },
      { id: "share", x: x + pad + half + 10 * u, y: y + 272 * u, w: half, h: 42 * u },
    ];
    for (const b of buttons) {
      const primary = b.id === "again";
      ctx.fillStyle = primary ? "#2a1f5c" : b.id === "share" ? "#15131f" : "rgba(58,41,19,0.12)";
      roundRect(b.x, b.y, b.w, b.h, 9 * u);
      ctx.fill();
      ctx.strokeStyle = primary ? "#ffd36b" : "#5c4320";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = b.id === "copy" ? ink : primary ? "#ffe6a3" : "#ffffff";
      ctx.font = font(primary ? 18 : 15, "bold");
      ctx.fillText(
        primary ? "Play again" : b.id === "copy" ? "Copy" : "Share on X",
        b.x + b.w / 2,
        b.y + b.h / 2 + (primary ? 6 : 5) * u,
      );
    }
    if (toast.life > 0) {
      ctx.globalAlpha = a * clamp(toast.life / 0.4, 0, 1);
      ctx.fillStyle = "#2f6b3a";
      ctx.font = font(13, "bold");
      ctx.fillText(toast.text, mid, y + 337 * u);
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    const sx = shake > 0.1 ? (Math.random() - 0.5) * 2 * shake : 0;
    const sy = shake > 0.1 ? (Math.random() - 0.5) * 2 * shake : 0;
    ctx.save();
    ctx.translate(sx, sy);
    const pad = shake > 0.1 ? shake + 2 : 0;
    ctx.drawImage(bg, -pad, -pad, W + pad * 2, H + pad * 2);

    drawSky();

    // Dust motes and candles.
    for (const m of motes) {
      ctx.fillStyle = `rgba(255,240,205,${0.12 + 0.22 * (0.5 + 0.5 * Math.sin(time * 1.4 + m.phase))})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size * u, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const c of candles) drawCandle(c);

    for (const f of fxs) {
      const a = f.life / f.max;
      if (f.kind === "ring") {
        ctx.strokeStyle = rgba(f.rgb, a * 0.9);
        ctx.lineWidth = (1 + 5 * a) * u;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = `rgba(235,250,255,${a})`;
        ctx.lineWidth = 2.2 * u;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 + 0.3;
          const cx = Math.cos(ang);
          const cy = Math.sin(ang);
          ctx.moveTo(f.x + cx * f.r * 0.25, f.y + cy * f.r * 0.25);
          ctx.lineTo(f.x + cx * f.r, f.y + cy * f.r);
          const bx = f.x + cx * f.r * 0.65;
          const by = f.y + cy * f.r * 0.65;
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(ang + 0.8) * f.r * 0.25, by + Math.sin(ang + 0.8) * f.r * 0.25);
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(ang - 0.8) * f.r * 0.25, by + Math.sin(ang - 0.8) * f.r * 0.25);
        }
        ctx.stroke();
      }
    }

    for (const s of spirits) drawSpirit(s);

    ctx.globalCompositeOperation = "lighter";
    for (const pr of projectiles) {
      const pos = projectilePos(pr);
      glow(pr.type, pos.x, pos.y, 58 * u, 1);
      glow("white", pos.x, pos.y, 22 * u, 1);
    }
    for (const b of bolts) {
      const a = b.life / b.max;
      ctx.globalAlpha = 1;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(b.pts[0].x, b.pts[0].y);
      for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i].x, b.pts[i].y);
      ctx.strokeStyle = rgba(SPELLS.lightning.rgb, 0.35 * a);
      ctx.lineWidth = b.width * 3.4 * u;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,240,${a})`;
      ctx.lineWidth = b.width * 0.7 * u;
      ctx.stroke();
    }
    for (const pt of particles) {
      const a = clamp(pt.life / pt.max, 0, 1);
      glow(pt.key, pt.x, pt.y, pt.size * (0.5 + a * 0.7), a);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    drawPlayer();
    ctx.restore();

    if (ghost) strokeTrail(ghost.pts, ghost.rgb, clamp(ghost.life / 0.3, 0, 1));
    if (stroke.length > 1) {
      strokeTrail(stroke, [200, 165, 255], 1);
      const tip = stroke[stroke.length - 1];
      ctx.globalCompositeOperation = "lighter";
      glow("white", tip.x, tip.y, 34 * u, 1);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    if (flash > 0.01) {
      ctx.fillStyle = `rgba(255,250,220,${flash * 0.28})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (hurt > 0.01) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, "rgba(255,40,70,0)");
      g.addColorStop(1, `rgba(255,40,70,${0.55 * hurt})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    drawLegend();
    drawHud();

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (const tx of texts) {
      const a = clamp(tx.life / 0.35, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = font(tx.size, "bold");
      ctx.lineWidth = 3.5 * u;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(8,6,28,0.8)";
      ctx.strokeText(tx.text, tx.x, tx.y);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;

    if (phase === "title") drawTitle();
    if (phase === "over") drawOver();
  }

  /* ---------- loop ---------- */
  let last = performance.now();
  function frame(now: number) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    draw();
  }

  /* ---------- sharing ---------- */
  function shareText() {
    const k = kills;
    const url = window.location.origin + window.location.pathname;
    return (
      `🪄 I scored ${fmt(score)} in Rune Duel on a ${cfg.label.toLowerCase()}! Best combo ×${bestCombo} · ` +
      `⚡${k.lightning} 🛡️${k.shield} 🔥${k.fire} ❄️${k.frost}\n` +
      `Think your wand hand is faster? Out-duel me: ${url}`
    );
  }

  function copyShare() {
    const text = shareText();
    const done = (ok: boolean) => {
      toast = { text: ok ? "Copied to clipboard!" : "Couldn't copy — try Share on X", life: 2.2 };
      if (ok) sfx.chime(6);
    };
    const fallback = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        done(ok);
      } catch {
        done(false);
      }
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => done(true), fallback);
    else fallback();
  }

  /* ---------- input ---------- */
  const inRect = (p: Pt, r: Rect, grow = 0) =>
    p.x >= r.x - grow && p.x <= r.x + r.w + grow && p.y >= r.y - grow && p.y <= r.y + r.h + grow;
  function eventPos(e: MouseEvent): Pt {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    ensureAudio();
    if (activePointer !== null) return;
    const p = eventPos(e);
    if (inRect(p, muteBtn, 6 * u) || phase === "over") return;
    activePointer = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    stroke = [p];
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerId !== activePointer || phase !== "play") return;
    const p = eventPos(e);
    const lastPt = stroke[stroke.length - 1];
    if (!lastPt || dist(lastPt, p) < 2.5) return;
    if (stroke.length < 600) stroke.push(p);
    if (Math.random() < 0.6) burst(p.x, p.y, "violet", 1, 50, 12, 0.45, 60);
  }

  function onPointerUp(e: PointerEvent) {
    ensureAudio();
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (phase === "title") {
      stroke = [];
      beginRound();
    } else if (phase === "play") {
      finishStroke();
    }
  }

  function onPointerCancel(e: PointerEvent) {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    stroke = [];
  }

  function onClick(e: MouseEvent) {
    ensureAudio();
    const p = eventPos(e);
    if (inRect(p, muteBtn, 6 * u)) {
      setMuted(!muted);
      return;
    }
    if (phase !== "over" || overT < 0.6) return;
    const hit = buttons.find((b) => inRect(p, b));
    if (!hit) return;
    if (hit.id === "again") beginRound();
    else if (hit.id === "copy") copyShare();
    else {
      window.open(
        `https://x.com/intent/post?text=${encodeURIComponent(shareText())}`,
        "_blank",
        "noopener,noreferrer",
      );
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "m" || e.key === "M") {
      ensureAudio();
      setMuted(!muted);
    } else if (e.key === " " || e.key === "Enter") {
      if (phase === "title" || (phase === "over" && overT >= 0.6)) {
        e.preventDefault();
        ensureAudio();
        beginRound();
      }
    }
  }

  const prevent = (e: Event) => e.preventDefault();
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) e.preventDefault();
  };
  function onVisibility() {
    last = performance.now();
    if (!actx) return;
    if (document.hidden) actx.suspend().catch(() => {});
    else actx.resume().catch(() => {});
  }
  function onResize() {
    layout();
  }

  layout();
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("contextmenu", prevent);
  canvas.addEventListener("touchmove", prevent, { passive: false });
  document.addEventListener("gesturestart", prevent);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  raf = requestAnimationFrame(frame);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("click", onClick);
    canvas.removeEventListener("contextmenu", prevent);
    canvas.removeEventListener("touchmove", prevent);
    document.removeEventListener("gesturestart", prevent);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onResize);
    if (actx) {
      actx.close().catch(() => {});
      actx = null;
      master = null;
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function RuneDuel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startRuneDuel(canvas);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "#05051a",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        overscrollBehavior: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label="Rune Duel — draw glyphs to cast spells at drifting spirits"
        style={{ display: "block", width: "100%", height: "100%", touchAction: "none", cursor: "crosshair" }}
      >
        Rune Duel: draw a zigzag for lightning, a circle for shield, a triangle for fire and a horizontal line for
        frost to banish the matching spirits.
      </canvas>
    </div>
  );
}
