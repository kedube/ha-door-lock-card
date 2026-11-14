/*!
 * Door Lock Card for Home Assistant
 * Animated lock card with built-in renders (Level Lock Pro, Schlage Encode Plus,
 * generic deadbolt) and support for your own per-state images, GIFs or videos.
 *
 * https://github.com/kedube/ha-door-lock-card
 * License: GPL-3.0
 */
(() => {
  "use strict";

  const VERSION = "2.0.0";
  const CARD_TAG = "door-lock-card";
  const EDITOR_TAG = "door-lock-card-editor";

  /* ------------------------------------------------------------------ */
  /* Catalog: finishes, lock types, states                               */
  /* ------------------------------------------------------------------ */

  // How each finish answers light, in linear values. `f0` is the mirror
  // reflectance (the metal's colour); `alb` is the diffuse colour and marks a
  // painted or coated finish; `brush` is how strongly a brushed grain smears
  // highlights; `coat` is a thin glossy top coat; `wear` is the metal showing
  // through on the edges.
  const FINISHES = {
    matte_black: { label: "Matte black", alb: [0.019, 0.0193, 0.0205], f0: [0.04, 0.04, 0.043], rough: 0.46, grain: 0.05, coat: 0.006 },
    satin_nickel: { label: "Satin nickel", f0: [0.64, 0.6, 0.53], rough: 0.4, brush: 0.75, grain: 0.1 },
    satin_chrome: { label: "Satin chrome", f0: [0.6, 0.62, 0.65], rough: 0.34, brush: 0.75, grain: 0.09 },
    bright_chrome: { label: "Bright chrome", f0: [0.8, 0.81, 0.83], rough: 0.05 },
    aged_bronze: { label: "Aged bronze", f0: [0.07, 0.042, 0.028], rough: 0.42, brush: 0.2, grain: 0.07, wear: [0.42, 0.21, 0.09], coat: 0.012 },
    polished_brass: { label: "Polished brass", f0: [0.93, 0.7, 0.3], rough: 0.06 },
    satin_brass: { label: "Satin brass", f0: [0.8, 0.62, 0.32], rough: 0.4, brush: 0.75, grain: 0.1 },
    black_stainless: { label: "Black stainless", f0: [0.115, 0.115, 0.125], rough: 0.3, brush: 0.85, grain: 0.1 },
    white: { label: "White", alb: [0.6, 0.6, 0.59], f0: [0.045, 0.045, 0.045], rough: 0.3, coat: 0.05 },
  };

  const LOCK_TYPES = {
    level_lock_pro: {
      label: "Level Lock Pro",
      styles: { round: "Round" },
      finish: "matte_black",
      view: "interior",
    },
    schlage_encode_plus: {
      label: "Schlage Encode Plus",
      styles: { century: "Century (modern)", camelot: "Camelot (traditional)" },
      finish: "matte_black",
      view: "exterior",
    },
    deadbolt: {
      label: "Generic deadbolt",
      styles: { round: "Round rose", square: "Square rose" },
      finish: "satin_nickel",
      view: "interior",
    },
  };

  const TYPE_ALIASES = {
    level: "level_lock_pro",
    level_lock: "level_lock_pro",
    level_pro: "level_lock_pro",
    level_lock_plus: "level_lock_pro",
    schlage: "schlage_encode_plus",
    schlage_encode: "schlage_encode_plus",
    encode: "schlage_encode_plus",
    encode_plus: "schlage_encode_plus",
    generic: "deadbolt",
  };

  // pose drives the lock art, tone drives the colour.
  const STATES = {
    locked: { pose: "locked", tone: "locked", label: "Locked" },
    unlocked: { pose: "unlocked", tone: "unlocked", label: "Unlocked" },
    locking: { pose: "locking", tone: "pending", label: "Locking…", pending: true },
    unlocking: { pose: "unlocking", tone: "pending", label: "Unlocking…", pending: true },
    opening: { pose: "opening", tone: "pending", label: "Opening…", pending: true },
    open: { pose: "open", tone: "unlocked", label: "Open" },
    jammed: { pose: "jammed", tone: "jammed", label: "Jammed" },
    unavailable: { pose: "unknown", tone: "unavailable", label: "Unavailable" },
    unknown: { pose: "unknown", tone: "unavailable", label: "Unknown" },
  };

  // Which image to show for a state, in order of preference.
  const IMAGE_FALLBACK = {
    locked: ["locked"],
    unlocked: ["unlocked"],
    locking: ["locking", "locked"],
    unlocking: ["unlocking", "unlocked"],
    opening: ["opening", "open", "unlocking", "unlocked"],
    open: ["open", "unlocked"],
    jammed: ["jammed", "unlocked", "locked"],
    unavailable: ["unavailable", "unknown", "locked", "unlocked"],
    unknown: ["unknown", "unavailable", "locked", "unlocked"],
  };
  const IMAGE_STATES = ["locked", "unlocked", "locking", "unlocking", "jammed", "open", "opening", "unavailable"];

  const LAYOUT_ART_SIZE = { vertical: 190, horizontal: 150, compact: 60 };
  const SUPPORT_OPEN = 1;

  const DEFAULTS = {
    layout: "vertical",
    show_name: true,
    show_status: true,
    show_battery: true,
    show_last_changed: true,
    last_changed_format: "relative",
    show_changed_by: true,
    show_buttons: false,
    show_indicator: true,
    confirm: "none",
    animation_duration: 700,
    battery_low_threshold: 20,
    image_transition: "fade",
    image_fit: "contain",
  };

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */

  const cssColor = (c) => {
    if (Array.isArray(c) && c.length >= 3) return `rgb(${c.slice(0, 3).map(Number).join(", ")})`;
    if (typeof c === "string" && c.trim()) return c.trim();
    return null;
  };

  const fire = (node, type, detail) => {
    node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  };

  const normalizeType = (t) => {
    const key = String(t || "").toLowerCase().replace(/[\s-]+/g, "_");
    if (LOCK_TYPES[key]) return key;
    return TYPE_ALIASES[key] || null;
  };

  const isVideo = (src) => /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(src || "");

  const localize = (hass, key, fallback) => {
    try {
      const v = hass && hass.localize && hass.localize(key);
      return v || fallback;
    } catch (e) {
      return fallback;
    }
  };

  const ICONS = {
    locked:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/></svg>',
    unlocked:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 10.5V8a4.5 4.5 0 0 1 8.7-1.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/></svg>',
    open:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3H15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 4.2 17.6 2.6A1 1 0 0 1 18.8 3.6V20.4a1 1 0 0 1-1.2 1L9 19.8Z" fill="currentColor"/><path d="M3 21h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    clock:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    alert:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 20h19Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9.5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.1" fill="currentColor"/></svg>',
    battery:
      '<svg class="batt-icon" viewBox="0 0 26 12" aria-hidden="true"><rect x="0.8" y="0.8" width="21.4" height="10.4" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="23.2" y="3.6" width="2.2" height="4.8" rx="1" fill="currentColor"/><rect class="batt-fill" x="2.9" y="2.9" width="17.2" height="6.2" rx="1.2" fill="currentColor"/></svg>',
  };

  /* ------------------------------------------------------------------ */
  /* Lock renderer                                                       */
  /* ------------------------------------------------------------------ */
  // A lock is not a picture here. Every part is a signed-distance shape with
  // an edge profile, which gives each pixel a height; the surface that
  // results is lit by a small studio rig. That is what makes bevels catch
  // the light, keeps reflections in place while a thumbturn rotates beneath
  // them, and lets any finish render at any size without image files.

  const ART = 220; // the art box is ART × ART units with the lock at its centre
  const HALF = ART / 2;

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (v) => {
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    return v * v * (3 - 2 * v);
  };

  /* ----- shapes: signed distance, negative inside ----- */

  const sdCircle = (x, y, r) => Math.sqrt(x * x + y * y) - r;

  const sdBox = (x, y, hw, hh, r) => {
    const qx = Math.abs(x) - hw + r;
    const qy = Math.abs(y) - hh + r;
    const ox = qx > 0 ? qx : 0;
    const oy = qy > 0 ? qy : 0;
    return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
  };

  // Stadium standing on end: a segment from (0,-half) to (0,half), grown by r.
  const sdCapsule = (x, y, half, r) => {
    const dy = y - (y < -half ? -half : y > half ? half : y);
    return Math.sqrt(x * x + dy * dy) - r;
  };

  // Signed distance to an outline that is symmetric left to right. `half`
  // lists its right-hand side from the top centre to the bottom centre;
  // `soft` grows the shape, which rounds its corners.
  function sdOutline(half, soft) {
    const n = half.length;
    const X = Float64Array.from(half, (p) => p[0]);
    const Y = Float64Array.from(half, (p) => p[1]);
    return (x, y) => {
      x = Math.abs(x);
      let best = 1e9;
      let inside = false;
      for (let i = 1; i < n; i++) {
        const xj = X[i - 1];
        const yj = Y[i - 1];
        const xi = X[i];
        const yi = Y[i];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        const ex = xi - xj;
        const ey = yi - yj;
        const wx = x - xj;
        const wy = y - yj;
        const len = ex * ex + ey * ey;
        const t = len > 0 ? clamp01((wx * ex + wy * ey) / len) : 0;
        const dx = wx - ex * t;
        const dy = wy - ey * t;
        const q = dx * dx + dy * dy;
        if (q < best) best = q;
      }
      return (inside ? -1 : 1) * Math.sqrt(best) - soft;
    };
  }

  // Where two shapes overlap, with the corner between them rounded by r.
  const both = (d1, d2, r) => {
    const u = d1 + r;
    const v = d2 + r;
    return Math.min(Math.max(u, v), 0) + Math.sqrt((u > 0 ? u * u : 0) + (v > 0 ? v * v : 0)) - r;
  };

  /* ----- edge profiles: height at distance d from the outline ----- */
  // Both rise over `w` units to height `t`. Outside the shape the surface
  // falls away steeply, so the silhouette picks up grazing light.

  const bevel = (d, w, t) => (d >= 0 ? -3 * d : d <= -w ? t : (-d / w) * t);

  const fillet = (d, w, t) => {
    if (d >= 0) return -3 * d;
    if (d <= -w) return t;
    const u = 1 + d / w;
    return t * Math.sqrt(1 - u * u);
  };

  // Height on the bevel between two nested outlines: `lo` at the outer one,
  // `hi` on and inside the inner one. Corners come out mitred, like a frame.
  const loft = (dOuter, dInner, lo, hi) => {
    if (dInner <= 0) return hi;
    const t = -dOuter / (dInner - dOuter);
    return lo + (hi - lo) * (t + 0.28 * t * (1 - t)); // a touch convex, so a reflection travels across it
  };

  /* ----- noise, for brushed grain ----- */

  const hash2 = (ix, iy) => {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  const vnoise = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy);
    const b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1);
    const d = hash2(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };

  // u runs across the brush lines, v along them. Result is -1..1.
  const streak = (u, v) => (vnoise(u * 2.3, v * 0.045) * 0.6 + vnoise(u * 0.8 + 17.3, v * 0.02 + 5.1) * 0.4) * 2 - 1;
  const speckle = (x, y) => vnoise(x * 2.9, y * 2.9) * 2 - 1;

  /* ----- materials ----- */

  const toLinear = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };

  function material(o) {
    const rough = o.rough;
    const f0 = o.f0;
    const alb = o.alb || [0, 0, 0];
    const peak = Math.max(f0[0], f0[1], f0[2], 0.001);
    const metal = !o.alb;
    return {
      ar: alb[0], ag: alb[1], ab: alb[2],
      fr: f0[0], fg: f0[1], fb: f0[2],
      r2: rough * rough * 0.9,
      ihw: 0.5 / (0.2 + rough * 0.85), // how sharp the ceiling/floor line reflects
      fmax: 1 - rough * 0.75,
      k: o.brush || 0,
      iat2: 1 / Math.pow(0.07 + rough * 0.14, 2),
      iab2: 1 / (0.62 * 0.62),
      grain: o.grain || 0,
      coat: o.coat || 0,
      wear: o.wear ? 1 : 0,
      wr: o.wear ? o.wear[0] : 0, wg: o.wear ? o.wear[1] : 0, wb: o.wear ? o.wear[2] : 0,
      // response to the pointer "torch"
      pe: rough < 0.12 ? 6 : rough < 0.37 ? 4 : 3,
      pk: o.torch !== undefined ? o.torch : rough < 0.12 ? 0.9 : metal ? 0.55 : 0.3,
      pr: metal ? f0[0] / peak : 1, pg: metal ? f0[1] / peak : 1, pb: metal ? f0[2] / peak : 1,
    };
  }

  const MAT_ID = { body: 1, trim: 2, glass: 3, gloss: 4, cover: 5, screen: 6 };
  const PIT = 0.004; // the dark inside of a keyway
  const BRASS = [0.3, 0.17, 0.045]; // the first pin, seen at the foot of the keyway

  function materialsFor(fin) {
    const mats = {
      body: material(fin),
      trim: material({ ...fin, rough: fin.rough * 0.88 }),
      glass: material({ alb: [0.003, 0.0032, 0.004], f0: [0.026, 0.028, 0.033], rough: 0.05, torch: 0.34 }),
      gloss: material({ alb: [0.006, 0.006, 0.007], f0: [0.05, 0.051, 0.055], rough: 0.14, torch: 0.5 }),
      // Schlage's black battery cover and the face of its touchscreen.
      cover: material({ alb: [0.019, 0.0193, 0.0205], f0: [0.04, 0.04, 0.043], rough: 0.46, grain: 0.05, coat: 0.006 }),
      screen: material({ alb: [0.0042, 0.0044, 0.005], f0: [0.02, 0.021, 0.024], rough: 0.24, torch: 0.3 }),
    };
    mats.list = [null, mats.body, mats.trim, mats.glass, mats.gloss, mats.cover, mats.screen];
    return mats;
  }

  const customFinish = (rgb) => {
    const c = rgb.map(toLinear);
    return { f0: c.map((v) => v * 0.86 + 0.035), rough: 0.36, brush: 0.6, grain: 0.08 };
  };

  /* ----- lighting ----- */

  const unit = (x, y, z) => {
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  };

  // x right, y down, z towards the viewer.
  const RIG = [
    { at: [-0.52, -0.64, 0.57], c: [4.3, 4.25, 4.15], size: 0.045, diff: 0.62, aniso: 0.5 }, // key softbox, upper left
    { at: [0.88, -0.1, 0.46], c: [1.3, 1.42, 1.6], size: 0.02, diff: 0.18, aniso: 0.6 }, // cool strip, right
    { at: [0.05, -0.93, 0.36], c: [2.3, 2.3, 2.35], size: 0.07, diff: 0.12, aniso: 0.3 }, // overhead softbox
    { at: [-0.2, 0.86, 0.47], c: [0.26, 0.25, 0.25], size: 0.2, diff: 0.08, aniso: 0.3 }, // bounce from below
  ].map((l) => {
    const d = unit(...l.at);
    const h = unit(d[0], d[1], d[2] + 1);
    return { x: d[0], y: d[1], z: d[2], hx: h[0], hy: h[1], hz: h[2], r: l.c[0], g: l.c[1], b: l.c[2], size: l.size, diff: l.diff, aniso: l.aniso };
  });
  const SKY = [0.3, 0.31, 0.33];
  const FLOOR = [0.04, 0.04, 0.041];
  const AMBIENT = 0.1;
  const PERSP = 0.2 / HALF;
  const SHADOW_X = 0.32; // shadow offset per unit of height
  const SHADOW_Y = 0.55;
  const TORCH_H = 58;

  // shade() leaves its result (linear light) here.
  let SR = 0;
  let SG = 0;
  let SB = 0;

  function shade(m, nx, ny, nz, x, y, tx, ty) {
    // A flat face would reflect one colour. A little tilt that grows with
    // distance from the centre stands in for perspective and nearby lights.
    nx += x * PERSP;
    ny += y * PERSP;
    const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx *= il;
    ny *= il;
    nz *= il;
    const rx = 2 * nz * nx;
    const ry = 2 * nz * ny;
    const rz = 2 * nz * nz - 1;

    // The room: a dim studio, lighter overhead than underfoot. Grazing
    // reflections see the wall the lock is mounted on, which is dimmer still.
    let t = 0.5 - ry * m.ihw;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    t = t * t * (3 - 2 * t);
    const wall = rz >= 0 ? 1 : 0.3 + 0.7 * smooth(1 + rz * 1.1);
    let er = (FLOOR[0] + (SKY[0] - FLOOR[0]) * t) * wall;
    let eg = (FLOOR[1] + (SKY[1] - FLOOR[1]) * t) * wall;
    let eb = (FLOOR[2] + (SKY[2] - FLOOR[2]) * t) * wall;
    let dr = AMBIENT;
    let dg = AMBIENT;
    let db = AMBIENT;
    const coat = m.coat;
    let cr = 0;
    let cg = 0;
    let cb = 0;

    // Brushed metal smears highlights across the brush lines.
    const k = tx !== 0 || ty !== 0 ? m.k : 0;
    let Tx = 0, Ty = 0, Tz = 0, Bx = 0, By = 0, Bz = 0;
    if (k > 0) {
      const tn = tx * nx + ty * ny;
      Tx = tx - nx * tn;
      Ty = ty - ny * tn;
      Tz = -nz * tn;
      const tl = 1 / Math.sqrt(Tx * Tx + Ty * Ty + Tz * Tz);
      Tx *= tl;
      Ty *= tl;
      Tz *= tl;
      Bx = ny * Tz - nz * Ty;
      By = nz * Tx - nx * Tz;
      Bz = nx * Ty - ny * Tx;
    }

    for (let i = 0; i < RIG.length; i++) {
      const L = RIG[i];
      const w = L.size + m.r2;
      let s = Math.exp((rx * L.x + ry * L.y + rz * L.z - 1) / w) * Math.sqrt(L.size / w);
      if (k > 0) {
        const nh = nx * L.hx + ny * L.hy + nz * L.hz;
        if (nh > 0.05) {
          const th = Tx * L.hx + Ty * L.hy + Tz * L.hz;
          const bh = Bx * L.hx + By * L.hy + Bz * L.hz;
          s += (Math.exp(-(th * th * m.iat2 + bh * bh * m.iab2) / (nh * nh)) * L.aniso - s) * k;
        } else {
          s *= 1 - k;
        }
      }
      er += L.r * s;
      eg += L.g * s;
      eb += L.b * s;
      if (coat > 0) {
        // The clear top coat reflects the softbox sharply, whatever lies under it.
        const c = Math.exp((rx * L.x + ry * L.y + rz * L.z - 1) / (L.size + 0.02)) * coat;
        cr += L.r * c;
        cg += L.g * c;
        cb += L.b * c;
      }
      const nl = nx * L.x + ny * L.y + nz * L.z;
      if (nl > 0) {
        dr += L.r * nl * L.diff;
        dg += L.g * nl * L.diff;
        db += L.b * nl * L.diff;
      }
    }

    let f = 1 - nz;
    f = f * f * f * f * f * m.fmax;
    let fr = m.fr;
    let fg = m.fg;
    let fb = m.fb;
    if (m.wear) {
      // Aged finishes rub through to bare metal on the edges.
      let w = (1 - nz) * 2.4;
      w = w > 1 ? 1 : w;
      w *= w;
      fr += (m.wr - fr) * w;
      fg += (m.wg - fg) * w;
      fb += (m.wb - fb) * w;
    }
    SR = m.ar * dr + (fr + (1 - fr) * f) * er + cr;
    SG = m.ag * dg + (fg + (1 - fg) * f) * eg + cg;
    SB = m.ab * db + (fb + (1 - fb) * f) * eb + cb;
  }

  // Extra highlight from a small light held over (L.x, L.y): 0..1.
  function glint(m, nx, ny, nz, x, y, L) {
    const dx = L.x - x;
    const dy = L.y - y;
    const il = 1 / Math.sqrt(dx * dx + dy * dy + TORCH_H * TORCH_H);
    const lz = TORCH_H * il;
    let c = 2 * nz * ((nx * dx + ny * dy) * il + nz * lz) - lz;
    if (c <= 0) return 0;
    for (let i = m.pe; i > 0; i--) c *= c;
    return c * lz * m.pk * L.k;
  }

  // Linear light → display value. Indexed by the square root so the dark
  // end, where matte black lives, keeps its precision.
  const TONE = (() => {
    const t = new Float32Array(4097);
    for (let i = 0; i <= 4096; i++) {
      let v = Math.pow(i / 2048, 2);
      if (v > 0.6) v = 0.6 + 0.4 * (1 - Math.exp(-(v - 0.6) / 0.4)); // soft shoulder
      t[i] = 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    }
    return t;
  })();
  const tone = (v) => TONE[v <= 0 ? 0 : v >= 4 ? 4096 : (Math.sqrt(v) * 2048) | 0];

  let scratchH = new Float32Array(0);
  let scratchD = new Float32Array(0);
  const scratch = (n) => {
    if (scratchH.length < n) {
      scratchH = new Float32Array(n);
      scratchD = new Float32Array(n);
    }
  };

  // Everything that doesn't move, plus the shadow the lock casts on the wall.
  function renderBase(model, mats, px) {
    const N = px * px;
    const s = px / ART;
    const inv = ART / px;
    const acc = new Float32Array(N * 3);
    const cov = new Float32Array(N);
    const nrm = new Int8Array(N * 3);
    const mid = new Uint8Array(N);
    const layers = model.layers;

    // Front to back, so pixels hidden under another part are never shaded.
    for (let li = layers.length - 1; li >= 0; li--) {
      const L = layers[li];
      const m = mats[L.mat];
      const id = MAT_ID[L.mat];
      const br = L.brush;
      const x0 = Math.max(1, Math.floor((L.box[0] + HALF) * s) - 1);
      const y0 = Math.max(1, Math.floor((L.box[1] + HALF) * s) - 1);
      const x1 = Math.min(px - 2, Math.ceil((L.box[2] + HALF) * s) + 1);
      const y1 = Math.min(px - 2, Math.ceil((L.box[3] + HALF) * s) + 1);
      const w = x1 - x0 + 3;
      const h = y1 - y0 + 3;
      scratch(w * h);
      const H = scratchH;
      const D = scratchD;
      for (let j = 0, q = 0; j < h; j++) {
        const y = (y0 - 1 + j + 0.5) * inv - HALF;
        for (let i = 0; i < w; i++, q++) {
          const x = (x0 - 1 + i + 0.5) * inv - HALF;
          const d = L.sdf(x, y);
          D[q] = d;
          H[q] = L.h(x, y, d);
        }
      }
      for (let j = 1; j < h - 1; j++) {
        const py = y0 - 1 + j;
        const y = (py + 0.5) * inv - HALF;
        for (let i = 1; i < w - 1; i++) {
          const q = j * w + i;
          const d = D[q];
          let a = 0.5 - d * s;
          if (a <= 0) continue;
          if (a > 1) a = 1;
          const p = py * px + x0 - 1 + i;
          const rem = 1 - cov[p];
          if (rem < 0.004) continue;
          const x = (x0 - 1 + i + 0.5) * inv - HALF;

          let nx = (H[q - 1] - H[q + 1]) * 0.5 * s;
          let ny = (H[q - w] - H[q + w]) * 0.5 * s;
          const nl = 1 / Math.sqrt(nx * nx + ny * ny + 1);
          nx *= nl;
          ny *= nl;

          // Parts standing above this one shade it and darken the join.
          let occ = L.occ ? L.occ(x, y, d) : 1;
          for (let u = li + 1; u < layers.length; u++) {
            const U = layers[u];
            const lift = U.z - L.z;
            if (lift <= 0) continue;
            const far = lift * 1.2 + 5;
            if (x < U.box[0] - far || x > U.box[2] + far || y < U.box[1] - far || y > U.box[3] + far) continue;
            const pen = 0.6 + lift * 0.5;
            occ *= 1 - 0.5 * smooth(0.5 - U.sdf(x - SHADOW_X * lift, y - SHADOW_Y * lift) / (2 * pen));
            const dc = U.sdf(x, y);
            if (dc > 0) occ *= 1 - 0.34 * Math.exp(-dc / (0.6 + lift * 0.2));
          }

          let tx = 0;
          let ty = 0;
          let grain = 0;
          if (br) {
            if (br.r) {
              const bx = x - br.x;
              const by = y - br.y;
              const rr = Math.sqrt(bx * bx + by * by) + 1e-6;
              tx = -by / rr;
              ty = bx / rr;
              if (m.grain) grain = m.k ? streak(rr, (bx * 13 + by * 7) / rr) : speckle(x, y);
            } else {
              tx = br.x;
              ty = br.y;
              if (m.grain) grain = m.k ? streak(x * ty - y * tx, x * tx + y * ty) : speckle(x, y);
            }
          } else if (m.grain) {
            grain = speckle(x, y);
          }

          shade(m, nx, ny, nl, x, y, tx, ty);
          if (L.glare) {
            const glare = L.glare(x, y);
            SR += glare;
            SG += glare;
            SB += glare * 1.05;
          }
          const g = occ * (1 + grain * m.grain);
          const wgt = rem * a;
          acc[p * 3] += SR * g * wgt;
          acc[p * 3 + 1] += SG * g * wgt;
          acc[p * 3 + 2] += SB * g * wgt;
          cov[p] += wgt;
          if (!mid[p] && a > 0.5) {
            mid[p] = id;
            nrm[p * 3] = nx * 127;
            nrm[p * 3 + 1] = ny * 127;
            nrm[p * 3 + 2] = nl * 127;
          }
        }
      }
    }

    const rgba = new Uint8ClampedArray(N * 4);
    const outline = model.outline || layers[0].sdf;
    for (let py = 0, p = 0; py < px; py++) {
      const y = (py + 0.5) * inv - HALF;
      for (let pxi = 0; pxi < px; pxi++, p++) {
        const a = cov[p];
        let A = a;
        if (a < 0.996) {
          const x = (pxi + 0.5) * inv - HALF;
          const far = 0.3 * smooth(0.5 - outline(x - 2.5, y - 5.5) / 22);
          const near = 0.34 * smooth(0.5 - outline(x - 0.7, y - 1.5) / 4.4);
          A = a + (1 - a) * (far + near - far * near);
        }
        if (A < 0.003) continue;
        const o = p * 4;
        const dither = hash2(pxi, py) - 0.5;
        rgba[o] = tone(acc[p * 3] / A) + dither;
        rgba[o + 1] = tone(acc[p * 3 + 1] / A) + dither;
        rgba[o + 2] = tone(acc[p * 3 + 2] / A) + dither;
        rgba[o + 3] = A * 255;
      }
    }
    return { px, rgba, nrm, mid };
  }

  // The rotating part (thumbturn or key plug) and its shadow, drawn over
  // `under` into `dst`. Returns the rectangle it touched.
  function paintTurn(dst, under, base, model, mats, angle, torch) {
    const T = model.turn;
    const px = base.px;
    const s = px / ART;
    const inv = ART / px;
    const m = mats[T.mat];
    const br = T.brush;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const ox = SHADOW_X * T.lift;
    const oy = SHADOW_Y * T.lift;
    // The direction shadows fall, per unit of height, in the part's own frame.
    const ux = SHADOW_X * ca + SHADOW_Y * sa;
    const uy = SHADOW_Y * ca - SHADOW_X * sa;
    const pen = 0.6 + T.lift * 0.5;
    const reach = T.rad + 2;
    const x0 = Math.max(1, Math.floor((T.cx - reach + HALF) * s));
    const y0 = Math.max(1, Math.floor((T.cy - reach + HALF) * s));
    const x1 = Math.min(px - 2, Math.ceil((T.cx + reach + ox + pen + HALF) * s));
    const y1 = Math.min(px - 2, Math.ceil((T.cy + reach + oy + pen + HALF) * s));
    const w = x1 - x0 + 3;
    const h = y1 - y0 + 3;
    scratch(w * h);
    const H = scratchH;
    const D = scratchD;
    for (let j = 0, q = 0; j < h; j++) {
      const y = (y0 - 1 + j + 0.5) * inv - HALF - T.cy;
      for (let i = 0; i < w; i++, q++) {
        const x = (x0 - 1 + i + 0.5) * inv - HALF - T.cx;
        const lx = x * ca + y * sa;
        const ly = y * ca - x * sa;
        const d = T.sdf(lx, ly);
        D[q] = d;
        H[q] = T.h(lx, ly, d);
      }
    }
    for (let j = 1; j < h - 1; j++) {
      const py = y0 - 1 + j;
      const y = (py + 0.5) * inv - HALF - T.cy;
      for (let i = 1; i < w - 1; i++) {
        const q = j * w + i;
        const pxi = x0 - 1 + i;
        const o = (py * px + pxi) * 4;
        const x = (pxi + 0.5) * inv - HALF - T.cx;
        const d = D[q];
        let r = under[o];
        let g = under[o + 1];
        let b = under[o + 2];
        let alpha = under[o + 3];

        if (T.lift > 0 && alpha > 0 && d > -1) {
          const sx = x - ox;
          const sy = y - oy;
          let f = 1 - 0.36 * smooth(0.5 - T.sdf(sx * ca + sy * sa, sy * ca - sx * sa) / (2 * pen));
          if (d > 0) f *= 1 - 0.2 * Math.exp(-d / 1.5);
          r *= f;
          g *= f;
          b *= f;
        }

        let a = 0.5 - d * s;
        if (a > 0) {
          if (a > 1) a = 1;
          const lx = x * ca + y * sa;
          const ly = y * ca - x * sa;
          let nx = (H[q - 1] - H[q + 1]) * 0.5 * s;
          let ny = (H[q - w] - H[q + w]) * 0.5 * s;
          const nl = 1 / Math.sqrt(nx * nx + ny * ny + 1);
          nx *= nl;
          ny *= nl;

          let tx = 0;
          let ty = 0;
          let grain = 0;
          if (br) {
            if (br.r) {
              const rr = Math.sqrt(x * x + y * y) + 1e-6;
              tx = -y / rr;
              ty = x / rr;
              if (m.grain) grain = m.k ? streak(rr, (lx * 13 + ly * 7) / rr) : speckle(lx, ly);
            } else {
              tx = br.x * ca - br.y * sa;
              ty = br.x * sa + br.y * ca;
              if (m.grain) grain = m.k ? streak(lx * br.y - ly * br.x, lx * br.x + ly * br.y) : speckle(lx, ly);
            }
          } else if (m.grain) {
            grain = speckle(lx, ly);
          }

          shade(m, nx, ny, nl, x + T.cx, y + T.cy, tx, ty);
          const gain = (T.occ ? T.occ(lx, ly, d, ux, uy) : 1) * (1 + grain * m.grain);
          let cr = SR * gain;
          let cg = SG * gain;
          let cb = SB * gain;
          if (T.ink) {
            const ink = T.ink(lx, ly, s);
            cr += (PIT - cr) * ink;
            cg += (PIT - cg) * ink;
            cb += (PIT - cb) * ink;
          }
          if (T.pin) {
            const pin = T.pin(lx, ly, s);
            cr += (BRASS[0] - cr) * pin;
            cg += (BRASS[1] - cg) * pin;
            cb += (BRASS[2] - cb) * pin;
          }
          cr = tone(cr);
          cg = tone(cg);
          cb = tone(cb);
          if (torch) {
            const t = glint(m, nx, ny, nl, x + T.cx, y + T.cy, torch);
            if (t > 0) {
              cr += (255 - cr) * Math.min(1, t * m.pr);
              cg += (255 - cg) * Math.min(1, t * m.pg);
              cb += (255 - cb) * Math.min(1, t * m.pb);
            }
          }
          r += (cr - r) * a;
          g += (cg - g) * a;
          b += (cb - b) * a;
          if (a * 255 > alpha) alpha = a * 255;
        }
        dst[o] = r;
        dst[o + 1] = g;
        dst[o + 2] = b;
        dst[o + 3] = alpha;
      }
    }
    return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  }

  // The base picture with the pointer torch playing over it.
  function applyTorch(dst, base, mats, torch) {
    const { px, rgba, nrm, mid } = base;
    const inv = ART / px;
    const list = mats.list;
    dst.set(rgba);
    for (let py = 0, p = 0; py < px; py++) {
      const y = (py + 0.5) * inv - HALF;
      for (let pxi = 0; pxi < px; pxi++, p++) {
        const id = mid[p];
        if (!id) continue;
        const m = list[id];
        const t = glint(m, nrm[p * 3] / 127, nrm[p * 3 + 1] / 127, nrm[p * 3 + 2] / 127, (pxi + 0.5) * inv - HALF, y, torch);
        if (t <= 0.004) continue;
        const o = p * 4;
        dst[o] += (255 - dst[o]) * Math.min(1, t * m.pr);
        dst[o + 1] += (255 - dst[o + 1]) * Math.min(1, t * m.pg);
        dst[o + 2] += (255 - dst[o + 2]) * Math.min(1, t * m.pb);
      }
    }
  }

  /* ----- the locks ----- */
  // Shapes and proportions are measured off the manufacturers' product
  // photos, in units where the art box is 220 across. Layers are listed back
  // to front; `z` is how far a part's face stands off the door, which sets
  // the shadow it casts on the parts behind it.

  const disc = (cx, cy, r) => ({ box: [cx - r, cy - r, cx + r, cy + r], sdf: (x, y) => sdCircle(x - cx, y - cy, r) });
  const annulus = (rIn, rOut) => ({
    box: [-rOut, -rOut, rOut, rOut],
    sdf: (x, y) => {
      const r = Math.sqrt(x * x + y * y);
      return Math.max(r - rOut, rIn - r);
    },
  });
  const slab = (cx, cy, hw, hh, r) => ({
    box: [cx - hw, cy - hh, cx + hw, cy + hh],
    sdf: (x, y) => sdBox(x - cx, y - cy, hw, hh, r),
  });
  const spun = (x, y) => ({ r: 1, x, y }); // brushed in circles around a point
  const BRUSH_DOWN = { r: 0, x: 0, y: 1 }; // brushed top to bottom

  // Half outline of a four-sided plate that may taper: top centre → bottom centre.
  const taper = (top, wTop, bottom, wBottom, r) => [
    [0, top + r],
    [wTop - r, top + r],
    [wBottom - r, bottom - r],
    [0, bottom - r],
  ];

  // Points along an ellipse, for building outlines (angles run clockwise from
  // three o'clock, because y points down).
  const QUARTER = Math.PI / 2;
  const arcPoints = (cx, cy, rx, ry, a0, a1, n) =>
    Array.from({ length: n + 1 }, (v, i) => {
      const t = a0 + ((a1 - a0) * i) / n;
      return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
    });
  // A half outline has to start and end exactly on the centre line.
  const onAxis = (pts) => {
    pts[0][0] = 0;
    pts[pts.length - 1][0] = 0;
    return pts;
  };

  // Half outline of a Camelot plate: an arch between two shoulders at the
  // top, straight sides, and a shallower arc between shoulders at the bottom.
  function camelotHalf(a, top, shoulderTop, wTop, shoulderBottom, bottom, wBottom) {
    const f = 3.2; // the concave corner where an arch meets its shoulder
    return onAxis([
      ...arcPoints(0, shoulderTop - f, wTop, shoulderTop - f - top, -QUARTER, 0, 16),
      ...arcPoints(wTop + f, shoulderTop - f, f, f, Math.PI, QUARTER, 4),
      [a, shoulderTop],
      [a, shoulderBottom],
      ...arcPoints(wBottom + f, shoulderBottom + f, f, f, -QUARTER, -Math.PI, 4),
      ...arcPoints(0, shoulderBottom + f, wBottom, bottom - shoulderBottom - f, 0, QUARTER, 16),
    ]);
  }

  // Half outline of a panel that is arched on top and bowed along the bottom,
  // and may taper between the two.
  const archedHalf = (wTop, top, shoulderTop, wBottom, shoulderBottom, bottom) =>
    onAxis([
      ...arcPoints(0, shoulderTop, wTop, shoulderTop - top, -QUARTER, 0, 14),
      ...arcPoints(0, shoulderBottom, wBottom, bottom - shoulderBottom, 0, QUARTER, 14),
    ]);

  const outlinePath = (half) => {
    const f = (v) => +v.toFixed(2);
    const right = half.map((p) => `${f(p[0])} ${f(p[1])}`);
    const left = half.slice(1, -1).reverse().map((p) => `${f(-p[0])} ${f(p[1])}`);
    return `<path d="M ${right.concat(left).join(" L ")} Z"/>`;
  };

  // Key plug: sits flush in its cylinder with a hairline gap around it.
  // `pin` shows the brass of the first pin at the foot of the keyway.
  const plug = (cx, cy, r, pin) => ({
    cx, cy,
    lift: 0,
    rad: r,
    mat: "body",
    brush: spun(0, 0),
    sdf: (x, y) => sdCircle(x, y, r),
    h: (x, y, d) => fillet(d, 1.1, 0.7) + 1.6 * (1 - (x * x + y * y) / (r * r)),
    occ: (x, y, d) => 1 - 0.72 * smooth((d + 1) / 0.8),
    ink: (x, y, s) => {
      let d = sdBox(x, y + 0.1 * r, 0.085 * r, 0.42 * r, 0.04 * r);
      d = Math.min(d, sdCircle(x, y - 0.3 * r, 0.2 * r));
      d = Math.min(d, sdBox(x + 0.13 * r, y - 0.1 * r, 0.1 * r, 0.085 * r, 0.04 * r));
      return clamp01(0.5 - d * s);
    },
    pin: pin ? (x, y, s) => clamp01(0.5 - sdBox(x, y - 0.66 * r, 0.15 * r, 0.13 * r, 0.03 * r) * s) : null,
  });

  // Generic thumbturn: a pill standing `lift` above its seat. Drawn upright.
  const paddle = (cx, cy, half, r, lift) => ({
    cx, cy, lift,
    rad: half + r,
    mat: "trim",
    brush: BRUSH_DOWN,
    sdf: (x, y) => sdCapsule(x, y, half, r),
    h: (x, y, d) => fillet(d, r * 0.5, r * 0.42),
  });

  // Level's thumbturn: a round knob with a raised grip bar across the middle
  // and a finger scoop either side of it. Drawn with the bar upright.
  const gripKnob = (r) => {
    const bar = 0.14 * r; // half the width of the grip
    const rim = 2.2; // the knob's edge stands a little proud of the scoops
    const scoop = (x, d) => both(d + rim, bar - Math.abs(x), 6); // negative inside a scoop
    return {
      cx: 0, cy: 0,
      lift: 8,
      rad: r,
      mat: "body",
      brush: BRUSH_DOWN,
      sdf: (x, y) => sdCircle(x, y, r),
      h: (x, y, d) => {
        if (d >= 0) return -3 * d;
        const ax = Math.abs(x);
        const edge = fillet(d, 1.6, 1.4);
        const sc = scoop(x, d);
        if (sc < 0) {
          // Scoop: a floor that falls away from the bar, curving up at its edges.
          const wall = sc > -2.6 ? 2.4 * (1 - Math.sqrt(1 - Math.pow(1 + sc / 2.6, 2))) : 0;
          return edge + wall - 0.44 * (ax - bar);
        }
        // Bar: rounded across its width, running out to the rim at both ends.
        const rise = ax < bar ? fillet(ax - bar, bar * 0.8, 7.5) * smooth(-d / 7) : 0;
        return edge + 2.4 + rise;
      },
      // The bar shades the scoop on its far side and the corners where they meet.
      occ: (x, y, d, ux, uy) => {
        const sc = scoop(x, d);
        if (sc >= 0) return 1;
        // The light is low and to one side, so the bar's shadow reaches well across.
        const reach = smooth(1 - (Math.abs(x) - bar) / (75 * Math.abs(ux) + 1));
        // The near side also picks up light bounced off the bar.
        const lit = x * ux > 0 ? 1 - 0.5 * reach : 1 + 0.3 * Math.min(1, Math.abs(ux) * 3) * reach;
        return lit * (1 - 0.3 * Math.exp(sc / 2));
      },
    };
  };

  // Schlage's thumbturn: a tapered lever, narrow end up, standing on a low
  // foot of the same shape that turns with it.
  const lever = (cx, cy) => {
    const foot = sdOutline(taper(-36.5, 10.4, 36, 13.8, 2), 2);
    const grip = sdOutline(taper(-33, 7.9, 32, 11, 1.4), 1.4);
    return {
      cx, cy,
      lift: 6,
      rad: 39,
      mat: "trim",
      brush: BRUSH_DOWN,
      sdf: foot,
      h: (x, y, d) => {
        if (d >= 0) return -3 * d;
        const g = grip(x, y);
        if (g >= 0) return fillet(d, 1.5, 1.3);
        // Bevelled sides and a gently crowned top face that leans to the light.
        return 1.3 + bevel(g, 3.6, 7) + (1.3 * (1 - (x * x) / 121) - 0.07 * x - 0.03 * y) * smooth(-g / 3.6);
      },
    };
  };

  // The Encode touchscreen legend: outlined numerals, the tap-to-unlock mark
  // around the 5, and the home and lock keys either side of the 0.
  function keypadFx(col, rows) {
    const key = (i, x, y, body) => `<g class="key" style="--i:${i}" transform="translate(${x} ${y})">${body}</g>`;
    const digit = (n, i, x, y) => key(i, x, y, `<text>${n}</text>`);
    const outlined = (d, cls = "") => `<path class="rim ${cls}" d="${d}"/><path class="core" d="${d}"/>`;
    const waves =
      '<path class="wave" d="M -8.4 -4.4 A 6.2 6.2 0 0 0 -8.4 4.4 M -11.6 -6.4 A 9 9 0 0 0 -11.6 6.4 M 8.4 -4.4 A 6.2 6.2 0 0 1 8.4 4.4 M 11.6 -6.4 A 9 9 0 0 1 11.6 6.4"/>';
    const home = outlined("M -7.2 0 L 0 -6.4 L 7.2 0 M -5.3 -1.5 V 6 H 5.3 V -1.5");
    const padlock = `<g class="shackle">${outlined("M -3.5 -0.4 V -2.6 A 3.5 3.5 0 0 1 3.5 -2.6 V -0.4", "state")}</g>${outlined("M -5.8 -0.4 H 5.8 V 6 H -5.8 Z", "state")}`;
    return `<g class="keys">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n, i) => digit(n, i, ((i % 3) - 1) * col, rows[Math.floor(i / 3)])).join("")}
        ${key(4, 0, rows[1], waves)}
        ${key(9, -col, rows[3], home)}
        ${digit(0, 10, 0, rows[3])}
        <g class="padlock">${key(11, col, rows[3], padlock)}</g>
      </g>`;
  }

  const MODELS = {
    // A sloped bezel around a recessed centre. Outside, the centre is a glossy
    // touch face with the key cylinder set below the middle; inside, it is a
    // round knob with a grip bar.
    level_lock_pro(style, view) {
      const R = 84;
      const rIn = 0.735 * R;
      const bezel = {
        ...annulus(rIn, R),
        mat: "body",
        z: 11,
        brush: spun(0, 0),
        // Rises from the door towards the middle, then rolls over into the recess.
        h: (x, y) => {
          const r = Math.sqrt(x * x + y * y);
          const u = Math.min(1, (R - r) / (R - rIn));
          return fillet(r - R, 3, 2.6) + 11 * Math.sin(u * 1.5708) + fillet(rIn - r, 1.8, 1.8) - 1.8;
        },
      };
      const lip = {
        ...annulus(0.692 * R, rIn + 0.5),
        mat: "trim",
        z: 6.3,
        brush: spun(0, 0),
        h: (x, y, d) => fillet(d, 0.9, 0.6) + 0.45 * (Math.sqrt(x * x + y * y) - 0.692 * R),
      };
      const out = { outline: (x, y) => sdCircle(x, y, R), halo: [R + 24, R + 24], ring: `<circle r="${R + 6}"/>` };

      if (view === "exterior") {
        const rf = 0.694 * R;
        const seam = 0.355 * R;
        const cy = 0.132 * R;
        const face = {
          ...disc(0, 0, rf),
          mat: "glass",
          z: 5.6,
          // The lower segment is a separate piece, parted by a hairline.
          h: (x, y) => -0.5 * Math.exp(-Math.pow((y - seam) / 0.4, 2)),
          occ: (x, y) => 1 - 0.6 * Math.exp(-Math.pow((y - seam) / 0.32, 2)),
          // A softbox reflected in the glass: a lit field with one hard edge.
          glare: (x, y) => {
            const lower = y > seam;
            const edge = lower ? (x - 0.3 * rf) * 0.93 + (y - 0.54 * rf) * 0.36 : (x - 0.28 * rf) * 0.93 + (y + rf) * 0.36;
            const fade = 1 - 0.5 * clamp01((y + rf) / (1.9 * rf));
            return (lower ? 0.065 : 0.13) * fade * smooth(-edge / 2.6);
          },
        };
        const collar = {
          ...disc(0, cy, 0.283 * R),
          mat: "gloss",
          z: 7.4,
          h: (x, y, d) => fillet(d, 2.2, 1.8) - 1.3 * smooth((-d - 2.5) / 1),
        };
        return { ...out, layers: [face, lip, collar, bezel], turn: plug(0, cy, 0.238 * R, true), fx: "" };
      }

      const well = { ...disc(0, 0, 0.7 * R), mat: "body", z: 5.6, h: () => 0, occ: () => 0.55 };
      const dot = { ...disc(0, 0.668 * R, 1.5), mat: "gloss", z: 5.9, h: (x, y, d) => fillet(d, 1.5, 0.8) };
      return {
        ...out,
        layers: [well, dot, lip, bezel],
        turn: gripKnob(0.638 * R),
        fx: `<circle class="led-dot" cy="${(0.668 * R).toFixed(1)}" r="0.75"/>`,
      };
    },

    // Keypad deadbolt. Century is a bevelled slab; Camelot is an arched plate
    // with a raised rim. Inside, a battery cover sits above a tapered lever.
    schlage_encode_plus(style, view) {
      const camelot = style === "camelot";

      if (view === "interior") {
        const a = 52;
        const b = 100;
        const seam = 21;
        const half = camelot ? camelotHalf(a, -b, -86, 40.5, 80, b, 45) : null;
        const shape = camelot ? sdOutline(half, 0) : (x, y) => sdBox(x, y, a, b, 2.4);
        // The raised panel below the seam, bevelled down to the edges: broad
        // facets that widen towards the foot of the housing.
        const panel = camelot
          ? sdOutline(onAxis([[0, seam - 4], [52.5, seam - 4], ...arcPoints(0, 75, 41, 9.5, 0, QUARTER, 12)]), 0)
          : sdOutline(taper(seam - 4, 52.5, 86, 46, 2), 2);
        const base = {
          box: [-a, -b, a, b],
          sdf: shape,
          mat: "body",
          z: 10,
          brush: BRUSH_DOWN,
          h: (x, y, d) => (d >= 0 ? -3 * d : loft(d, panel(x, y), fillet(d, 1.2, 1), 5)),
        };
        // The battery cover is black whatever the finish.
        const edge = camelot ? (x) => seam + 11 * (1 - (x * x) / (a * a)) : () => seam;
        const cover = {
          box: [-a, -b, a, seam + 12],
          sdf: (x, y) => both(shape(x, y), y - edge(x), 0.5),
          mat: "cover",
          z: 11.6,
          h: (x, y, d) => fillet(d, 1.5, 1.3) + (camelot ? 3.4 : 1.2) * (1 - (x * x) / (a * a)),
        };
        return {
          layers: [base, cover],
          outline: shape,
          turn: lever(0, seam),
          halo: [a + 30, b + 12],
          ring: camelot ? outlinePath(camelotHalf(a + 6, -b - 6, -92, 44, 86, b + 6, 48.5)) : `<rect x="${-a - 6}" y="${-b - 6}" width="${a * 2 + 12}" height="${b * 2 + 12}" rx="7"/>`,
          fx: "",
        };
      }

      const a = 57;
      const rows = [-49.8, -31.5, -13.3, 4.9];
      const cy = 57;
      if (camelot) {
        const half = camelotHalf(a, -96, -75.5, 47.5, 68.8, 96, 46);
        const shape = sdOutline(half, 0);
        const screen = sdOutline(archedHalf(43.8, -73.4, -60.8, 43.8, 12.3, 21), 2);
        // The opening the screen sits in, cut deeper along its lower edge.
        const opening = (x, y) => Math.min(screen(x, y) - 2.4, screen(x, y - 5.6) - 2);
        const plate = {
          box: [-a, -96, a, 96],
          sdf: shape,
          mat: "body",
          z: 8,
          brush: BRUSH_DOWN,
          h: (x, y, d) => {
            if (d >= 0) return -3 * d;
            // The edge is a plain bevel that follows the outline and deepens at the foot.
            const u = Math.min(1, -d / (7.5 + 8.5 * smooth((y - 52) / 34)));
            const top = 6 * (u + 0.28 * u * (1 - u));
            const inside = opening(x, y);
            if (inside >= 0) return top;
            const toScreen = Math.max(0, screen(x, y));
            return top - 2 * (1 - toScreen / (toScreen - inside));
          },
        };
        const glass = { box: [-46, -76, 46, 24], sdf: screen, mat: "screen", z: 8.2, h: (x, y, d) => fillet(d, 0.8, 0.4), occ: (x, y, d) => 1 - 0.35 * Math.exp(d / 1.6) };
        const collar = { ...disc(0, cy, 12.2), mat: "trim", z: 10.6, brush: spun(0, cy), h: (x, y, d) => fillet(d, 2, 1.7) - 1.1 * smooth((-d - 2.1) / 0.9) };
        return {
          layers: [plate, glass, collar],
          outline: shape,
          turn: plug(0, cy, 9.6),
          halo: [a + 30, 110],
          ring: outlinePath(camelotHalf(a + 6, -102, -81.5, 50.5, 74.8, 102, 49)),
          fx: keypadFx(29, rows),
        };
      }

      const b = 95;
      // The raised field: a narrow border around the screen that widens into
      // deep bevels towards the foot of the plate.
      const field = sdOutline([[0, -85.5], [48, -85.5], [48, 20.4], [42.5, 77.5], [0, 77.5]], 1.5);
      const plate = {
        ...slab(0, 0, a, b, 2.6),
        mat: "body",
        z: 8,
        brush: BRUSH_DOWN,
        h: (x, y, d) => (d >= 0 ? -3 * d : loft(d, field(x, y), fillet(d, 1.2, 1), 6)),
      };
      const glass = { ...slab(0, -29.6, 45.5, 50, 2.7), mat: "screen", z: 8.3, h: (x, y, d) => fillet(d, 0.8, 0.4), occ: (x, y, d) => 1 - 0.3 * Math.exp(d / 1.6) };
      const collar = { ...disc(0, cy, 12.5), mat: "gloss", z: 9.6, h: (x, y, d) => fillet(d, 2, 1.6) - 1.1 * smooth((-d - 2.2) / 0.9) };
      return {
        layers: [plate, glass, collar],
        turn: plug(0, cy, 9.9),
        halo: [a + 30, b + 14],
        ring: `<rect x="${-a - 6}" y="${-b - 6}" width="${a * 2 + 12}" height="${b * 2 + 12}" rx="7.5"/>`,
        fx: keypadFx(29, rows),
      };
    },

    deadbolt(style, view) {
      const square = style === "square";
      const S = square ? 64 : 70;
      const body = square
        ? { ...slab(0, 0, S, S, 13), h: (x, y, d) => bevel(d, 5.5, 4.4) + 1.5 * smooth((-d - 11) / 2.4) }
        : { ...disc(0, 0, S), h: (x, y, d) => fillet(d, 8.5, 6.5) + 1.8 * smooth((-d - 14) / 2.6) + 1.2 * (1 - (x * x + y * y) / (S * S)) };
      Object.assign(body, { mat: "body", z: 9, brush: square ? BRUSH_DOWN : spun(0, 0) });
      const out = {
        halo: [S + 32, S + 32],
        ring: square ? `<rect x="${-S - 7}" y="${-S - 7}" width="${S * 2 + 14}" height="${S * 2 + 14}" rx="20"/>` : `<circle r="${S + 7}"/>`,
        fx: "",
      };
      if (view === "exterior") {
        const collar = {
          ...disc(0, 0, 30),
          mat: "trim",
          z: 13,
          brush: spun(0, 0),
          h: (x, y, d) => fillet(d, 8, 5) - 1.2 * smooth((-d - 7.4) / 1.6),
        };
        return { ...out, layers: [body, collar], turn: plug(0, 0, 19) };
      }
      const seat = { ...disc(0, 0, 20), mat: "trim", z: 11.2, brush: spun(0, 0), h: (x, y, d) => fillet(d, 3.4, 2.4) };
      return { ...out, layers: [body, seat], turn: paddle(0, 0, 22, 11, 9) };
    },
  };

  const modelCache = new Map();
  function lockModel(type, style, view) {
    const key = `${type}|${style}|${view}`;
    if (!modelCache.has(key)) modelCache.set(key, (MODELS[type] || MODELS.deadbolt)(style, view));
    return modelCache.get(key);
  }

  // Rendered bases are shared between cards that show the same lock.
  const baseCache = new Map();
  function lockBase(key, make) {
    let base = baseCache.get(key);
    if (base) baseCache.delete(key);
    else base = make();
    baseCache.set(key, base);
    if (baseCache.size > 16) baseCache.delete(baseCache.keys().next().value);
    return base;
  }

  // One render per frame at most, so a dashboard full of locks stays smooth.
  const renderQueue = [];
  let renderFrame = 0;
  function queueRender(card) {
    if (!renderQueue.includes(card)) renderQueue.push(card);
    if (!renderFrame) renderFrame = requestAnimationFrame(drainRenders);
  }
  function drainRenders() {
    renderFrame = 0;
    const start = performance.now();
    while (renderQueue.length && performance.now() - start < 8) renderQueue.shift()._renderArt();
    if (renderQueue.length) renderFrame = requestAnimationFrame(drainRenders);
  }

  // Rotation of the thumbturn / key plug for each pose, in radians.
  const DEG = Math.PI / 180;
  const POSE_ANGLE = {
    unlocked: 0,
    locked: 90 * DEG,
    locking: 62 * DEG,
    unlocking: 28 * DEG,
    jammed: 44 * DEG,
    open: -22 * DEG,
    opening: -22 * DEG,
    unknown: 0,
  };

  const REDUCED_MOTION = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  function artMarkup(model, showRing) {
    const pct = (v) => `${((v / ART) * 100).toFixed(1)}%`;
    return `<div class="art" style="--dlc-halo:${pct(model.halo[0])} ${pct(model.halo[1])}">
      <div class="halo"></div>
      <div class="shake">
        <canvas class="lock"></canvas>
        <svg class="fx" viewBox="${-HALF} ${-HALF} ${ART} ${ART}" aria-hidden="true" focusable="false">
          ${model.fx}
          ${showRing ? `<g class="ring">${model.ring}</g>` : ""}
          <g class="burst">${model.ring}</g>
        </svg>
      </div>
    </div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Styles                                                              */
  /* ------------------------------------------------------------------ */

  const STYLE = `
    :host {
      display: block;
      --dlc-locked: var(--state-lock-locked-color, var(--success-color, #43a047));
      --dlc-unlocked: var(--state-lock-unlocked-color, var(--error-color, #db4437));
      --dlc-jammed: var(--state-lock-jammed-color, var(--error-color, #db4437));
      --dlc-pending: var(--state-lock-pending-color, var(--warning-color, #ffa600));
      --dlc-unavailable: var(--state-unavailable-color, var(--disabled-text-color, #9e9e9e));
      --dlc-duration: 700ms;
      --dlc-ease: cubic-bezier(.65, 0, .35, 1);
      --dlc-text: var(--primary-text-color, #212121);
    }
    ha-card {
      height: 100%;
      box-sizing: border-box;
      padding: 16px;
      display: grid;
      gap: 10px 14px;
      overflow: hidden;
      position: relative;
      color: var(--dlc-text);
    }
    .tone-locked { --dlc-state: var(--dlc-locked); }
    .tone-unlocked { --dlc-state: var(--dlc-unlocked); }
    .tone-jammed { --dlc-state: var(--dlc-jammed); }
    .tone-pending { --dlc-state: var(--dlc-pending); }
    .tone-unavailable { --dlc-state: var(--dlc-unavailable); }

    /* ---------- layouts ---------- */
    .layout-vertical {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: "header" "stage" "info" "actions";
    }
    .layout-horizontal {
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-rows: auto 1fr auto;
      grid-template-areas: "stage header" "stage info" "stage actions";
      align-items: center;
    }
    .header {
      grid-area: header;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 6px 10px;
      min-width: 0;
    }
    .layout-horizontal .header { align-self: end; }
    .layout-compact .header { display: contents; }
    .layout-compact {
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas: "stage name battery" "stage info battery";
      padding: 10px 14px 10px 10px;
      gap: 0 12px;
      align-items: center;
    }
    .layout-compact.has-actions { grid-template-areas: "stage name battery" "stage info battery" "actions actions actions"; row-gap: 0; }
    .layout-compact.has-actions .actions { margin-top: 10px; }

    .name {
      grid-area: name;
      flex: 1 1 7em;
      min-width: 0;
      font-size: 1.1rem;
      font-weight: 500;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .layout-horizontal .name {
      white-space: normal;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow-wrap: anywhere;
    }
    .layout-compact .name { font-size: 1rem; align-self: end; }

    .battery {
      grid-area: battery;
      justify-self: end;
      align-self: center;
      flex: none;
      margin-inline-start: auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font: inherit;
      font-size: .85rem;
      font-variant-numeric: tabular-nums;
      color: var(--secondary-text-color, #727272);
      background: color-mix(in srgb, currentColor 11%, transparent);
      border: none;
      border-radius: 999px;
      padding: 4px 10px 4px 8px;
      cursor: pointer;
      white-space: nowrap;
    }
    .battery.warn { color: var(--warning-color, #ffa600); }
    .battery.low { color: var(--error-color, #db4437); }
    .batt-icon { width: 22px; height: 11px; display: block; }
    .batt-fill { transition: width .4s ease; }

    /* ---------- stage ---------- */
    .stage {
      grid-area: stage;
      position: relative;
      height: var(--dlc-art-size, 190px);
      min-width: 0;
      border-radius: 14px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      outline: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    .layout-horizontal .stage { align-self: stretch; height: auto; min-height: var(--dlc-art-size, 150px); }
    .layout-horizontal .stage .art { height: var(--dlc-art-size, 150px); }
    .layout-horizontal .stage.has-images { width: var(--dlc-art-size, 150px); }
    .layout-compact .stage { height: var(--dlc-art-size, 60px); width: var(--dlc-art-size, 60px); border-radius: 10px; }
    .stage.no-tap { cursor: default; }
    .stage:focus-visible { box-shadow: 0 0 0 2px var(--primary-color, #03a9f4) inset; }
    .art { position: relative; flex: none; height: 100%; aspect-ratio: 1 / 1; }
    .shake { position: absolute; inset: 0; transition: transform .16s ease-out; }
    .pressed .shake { transform: scale(.972); }
    .shake.thunk { animation: dlc-thunk .26s ease-out; }
    .lock, .fx { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .lock { opacity: 0; transition: opacity .3s ease; }
    .lock.ready { opacity: 1; }
    .fx { overflow: visible; pointer-events: none; }
    .fx text { font-family: var(--ha-font-family-body, Roboto, system-ui, sans-serif); }

    .hint {
      position: absolute;
      left: 50%;
      bottom: 10px;
      transform: translate(-50%, 6px);
      padding: 5px 12px;
      border-radius: 999px;
      font-size: .8rem;
      font-weight: 500;
      white-space: nowrap;
      color: #fff;
      background: color-mix(in srgb, var(--dlc-unlocked) 88%, black);
      box-shadow: 0 2px 8px rgba(0,0,0,.25);
      opacity: 0;
      pointer-events: none;
      transition: opacity .2s ease, transform .2s ease;
    }
    .hint.lock { background: color-mix(in srgb, var(--dlc-locked) 88%, black); }
    .armed-stage .hint { opacity: 1; transform: translate(-50%, 0); }
    .layout-compact .hint { display: none; }

    /* ---------- lock art ---------- */
    /* The glow the status light throws on the wall behind the lock. */
    .halo {
      position: absolute;
      inset: 0;
      background-color: var(--dlc-state);
      -webkit-mask-image: radial-gradient(ellipse var(--dlc-halo, 50% 50%) at center, #000 0%, rgba(0, 0, 0, .5) 48%, transparent 100%);
      mask-image: radial-gradient(ellipse var(--dlc-halo, 50% 50%) at center, #000 0%, rgba(0, 0, 0, .5) 48%, transparent 100%);
      opacity: .24;
      transition: background-color var(--dlc-duration) ease, opacity .5s ease;
    }
    .pose-unknown .halo { opacity: .08; }
    .ring {
      fill: none;
      stroke: var(--dlc-state);
      stroke-width: 1.3;
      opacity: .9;
      filter: drop-shadow(0 0 1.6px var(--dlc-state));
      transition: stroke var(--dlc-duration) ease, filter var(--dlc-duration) ease, opacity .4s ease;
    }
    .pose-unknown .ring { opacity: .35; }
    .burst {
      fill: none;
      stroke: var(--dlc-state);
      stroke-width: 3;
      opacity: 0;
      transform-box: fill-box;
      transform-origin: center;
      pointer-events: none;
    }
    .burst.go { animation: dlc-burst .8s ease-out; }

    /* Lit parts: the touchscreen legend and the small status light. */
    .led-dot { fill: var(--dlc-state); filter: drop-shadow(0 0 1.4px var(--dlc-state)); transition: fill var(--dlc-duration) ease, filter var(--dlc-duration) ease; }

    /* The legend is drawn the way it is printed: light outlines on dark glass. */
    .keys { --dlc-legend: #ece6d6; --dlc-glass: #1e1f22; filter: drop-shadow(0 0 .7px rgba(255, 238, 200, .35)); }
    .key { opacity: .84; transition: opacity .35s ease; }
    .key text {
      fill: var(--dlc-glass);
      stroke: var(--dlc-legend);
      stroke-width: .62;
      stroke-linejoin: round;
      font-size: 16.5px;
      font-weight: 600;
      text-anchor: middle;
      dominant-baseline: central;
    }
    .key path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .key .rim { stroke: var(--dlc-legend); stroke-width: 2.7; }
    .key .core { stroke: var(--dlc-glass); stroke-width: 1.5; }
    .key .wave { stroke: var(--dlc-legend); stroke-width: .62; }
    /* The lock key carries the state colour, and its shackle lifts when unlocked. */
    .key .state { stroke: color-mix(in srgb, var(--dlc-state) 62%, #ece6d6); transition: stroke var(--dlc-duration) ease; }
    .shackle { transition: transform var(--dlc-duration) var(--dlc-ease); }
    .pose-unlocked .shackle, .pose-open .shackle, .pose-unlocking .shackle, .pose-opening .shackle { transform: translate(1.6px, -2.6px) rotate(24deg); }
    /* Like the real keypad, it wakes when you reach for it. */
    .stage:hover .key, .pressed .key { opacity: 1; }
    .keys.flash .key { animation: dlc-keyflash 2.2s ease-out both; animation-delay: calc(var(--i) * 40ms); }
    .pending .key { animation: dlc-keypulse 1.3s ease-in-out infinite; animation-delay: calc(var(--i) * 80ms); }
    .pose-jammed .padlock .key { animation: dlc-blink 1s step-end infinite; }

    .pending .halo { animation: dlc-halo 1.2s ease-in-out infinite; }
    .pending .ring { stroke-dasharray: 12 9; animation: dlc-march .8s linear infinite; }
    .pose-jammed .shake { animation: dlc-shake .42s ease-in-out 3; }
    .pose-jammed .ring { animation: dlc-blink 1s step-end infinite; }

    .pose-unknown .art, .pose-unknown .images { filter: grayscale(1); opacity: .55; }
    .art, .images { transition: filter .5s ease, opacity .5s ease; }

    /* ---------- custom images ---------- */
    .images { position: relative; width: 100%; height: 100%; }
    .layer {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: var(--dlc-image-fit, contain);
      transition: opacity var(--dlc-duration) ease, transform var(--dlc-duration) var(--dlc-ease);
      will-change: opacity, transform;
    }
    .t-fade .layer.enter, .t-fade .layer.leave { opacity: 0; }
    .t-slide .layer.enter { opacity: 0; transform: translateX(35%); }
    .t-slide .layer.leave { opacity: 0; transform: translateX(-35%); }
    .t-zoom .layer.enter { opacity: 0; transform: scale(.82); }
    .t-zoom .layer.leave { opacity: 0; transform: scale(1.12); }
    .t-flip .layer { backface-visibility: hidden; }
    .t-flip .layer.enter { transform: perspective(700px) rotateY(90deg); opacity: 0; }
    .t-flip .layer:not(.enter):not(.leave) { transition-delay: calc(var(--dlc-duration) / 2); }
    .t-flip .layer.leave { transform: perspective(700px) rotateY(-90deg); opacity: 0; transition-duration: calc(var(--dlc-duration) / 2); }
    .t-none .layer { transition: none; }
    .pending .images.pulse .layer:last-child { animation: dlc-imgpulse 1.2s ease-in-out infinite; }
    .pose-jammed .images { animation: dlc-shake .42s ease-in-out 3; }

    /* ---------- info ---------- */
    .info {
      grid-area: info;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      text-align: center;
      min-width: 0;
    }
    .layout-horizontal .info { align-items: flex-start; text-align: start; align-self: center; }
    .layout-compact .info { flex-direction: row; flex-wrap: wrap; align-items: baseline; column-gap: 10px; row-gap: 0; text-align: start; align-self: start; }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 1.3rem;
      font-weight: 600;
      line-height: 1.35;
      color: var(--dlc-state);
      transition: color var(--dlc-duration) ease;
    }
    .layout-compact .status { font-size: .95rem; gap: 6px; }
    .status svg { width: 1.05em; height: 1.05em; flex: none; }
    .changed, .error {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: .85rem;
      line-height: 1.4;
      color: var(--secondary-text-color, #727272);
      min-width: 0;
    }
    .changed span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .changed svg, .error svg { width: 14px; height: 14px; flex: none; }
    .error { color: var(--error-color, #db4437); }
    [hidden] { display: none !important; }

    .actions { grid-area: actions; display: flex; gap: 8px; justify-content: center; }
    .layout-horizontal .actions { justify-content: flex-start; align-self: start; }
    .btn {
      flex: 1 1 0;
      max-width: 150px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font: inherit;
      font-size: .9rem;
      font-weight: 500;
      color: var(--dlc-text);
      background: color-mix(in srgb, var(--dlc-text) 7%, transparent);
      border: 1px solid transparent;
      border-radius: 12px;
      padding: 9px 12px;
      cursor: pointer;
      transition: background .25s ease, color .25s ease, border-color .25s ease;
      -webkit-tap-highlight-color: transparent;
    }
    .btn svg { width: 18px; height: 18px; }
    .btn:hover { background: color-mix(in srgb, var(--dlc-text) 12%, transparent); }
    .btn:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 1px; }
    .btn[data-service="lock"].active { color: var(--dlc-locked); background: color-mix(in srgb, var(--dlc-locked) 15%, transparent); }
    .btn[data-service="unlock"].active, .btn[data-service="open"].active { color: var(--dlc-unlocked); background: color-mix(in srgb, var(--dlc-unlocked) 15%, transparent); }
    .btn.armed { border-color: currentColor; color: var(--dlc-unlocked); animation: dlc-armed 1s ease-in-out infinite; }
    .btn[data-service="lock"].armed { color: var(--dlc-locked); }
    .btn:disabled { opacity: .45; cursor: default; }

    .warning { padding: 16px; color: var(--error-color, #db4437); display: flex; gap: 8px; align-items: center; }
    .warning svg { width: 20px; height: 20px; flex: none; }

    .no-anim, .no-anim * { transition: none !important; animation: none !important; }

    @keyframes dlc-burst { 0% { opacity: .85; transform: scale(1); } 100% { opacity: 0; transform: scale(1.14); } }
    @keyframes dlc-thunk { 0% { transform: scale(1); } 28% { transform: scale(.984) translateY(.7px); } 100% { transform: scale(1); } }
    @keyframes dlc-keyflash { 0% { opacity: .84; } 8% { opacity: .25; } 22% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: .84; } }
    @keyframes dlc-keypulse { 0%, 100% { opacity: .3; } 50% { opacity: 1; } }
    @keyframes dlc-halo { 0%, 100% { opacity: .18; } 50% { opacity: .45; } }
    @keyframes dlc-march { to { stroke-dashoffset: -21; } }
    @keyframes dlc-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3.5px); } 75% { transform: translateX(3.5px); } }
    @keyframes dlc-blink { 0%, 100% { opacity: .9; } 50% { opacity: .25; } }
    @keyframes dlc-imgpulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
    @keyframes dlc-armed { 0%, 100% { border-color: currentColor; } 50% { border-color: transparent; } }

    @media (prefers-reduced-motion: reduce) {
      .pending .halo, .pending .ring, .pending .key, .pose-jammed .shake, .pose-jammed .images,
      .pose-jammed .ring, .pose-jammed .padlock .key, .shake.thunk, .btn.armed,
      .pending .images.pulse .layer:last-child { animation: none; }
    }
  `;

  /* ------------------------------------------------------------------ */
  /* The card                                                            */
  /* ------------------------------------------------------------------ */

  class DoorLockCard extends HTMLElement {
    static getConfigElement() {
      return document.createElement(EDITOR_TAG);
    }

    static getStubConfig(hass) {
      const locks = Object.keys((hass && hass.states) || {}).filter((e) => e.startsWith("lock."));
      const entity = locks[0] || "lock.front_door";
      return { entity, lock_type: detectLockType(hass, entity) };
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._pending = null;
      this._armed = null;
      this._error = null;
      this._displayState = null;
      this._sig = null;
      this._buildKey = null;
      // Lock art: the rotating part, the pointer torch and the frame loop.
      this._turn = { angle: 0, vel: 0, target: 0, pending: false, still: false, wobble: 0, cheer: 0, rate: 8, last: 0 };
      this._torch = { x: 0, y: 0, k: 0, goalX: 0, goalY: 0, goal: 0 };
      this._sweep = 0;
      this._frame = this._frame.bind(this);
      this._onResize = () => this._el && this._el.canvas && queueRender(this);
    }

    setConfig(config) {
      if (!config || typeof config !== "object") throw new Error("Invalid configuration");
      if (!config.entity) throw new Error("Please set a lock entity, e.g. entity: lock.front_door");
      if (String(config.entity).split(".")[0] !== "lock") {
        throw new Error(`"${config.entity}" is not a lock entity (expected lock.*)`);
      }
      if (config.lock_type && !normalizeType(config.lock_type)) {
        throw new Error(`Unknown lock_type "${config.lock_type}". Use one of: ${Object.keys(LOCK_TYPES).join(", ")}`);
      }
      if (this._config && this._config.entity !== config.entity) {
        this._pending = null;
        this._displayState = null;
      }
      this._config = { ...config };
      this._buildKey = null;
      this._sig = null;
      this._batCache = null;
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      this._render();
    }

    get hass() {
      return this._hass;
    }

    connectedCallback() {
      this._timer = setInterval(() => this._updateChanged(), 30000);
      window.addEventListener("resize", this._onResize);
      this._sig = null;
      this._render();
      this._watchArt();
      if (this._model) this._wake();
    }

    disconnectedCallback() {
      clearInterval(this._timer);
      clearTimeout(this._pendingTimer);
      clearTimeout(this._armTimer);
      clearTimeout(this._errorTimer);
      clearTimeout(this._holdTimer);
      clearTimeout(this._dblTimer);
      window.removeEventListener("resize", this._onResize);
      if (this._resizeObserver) this._resizeObserver.disconnect();
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }

    getCardSize() {
      const r = this._config ? this._resolve() : null;
      if (!r) return 5;
      if (r.layout === "compact") return r.showButtons ? 2 : 1;
      if (r.layout === "horizontal") return Math.max(3, Math.ceil(r.artSize / 50));
      return 2 + Math.ceil(r.artSize / 50) + (r.showButtons ? 1 : 0);
    }

    getGridOptions() {
      const layout = (this._config && this._config.layout) || DEFAULTS.layout;
      if (layout === "compact") return { columns: 6, min_columns: 4, rows: "auto" };
      if (layout === "horizontal") return { columns: 12, min_columns: 6, rows: "auto" };
      return { columns: 6, min_columns: 4, rows: "auto" };
    }

    /* ----- configuration resolution ----- */

    _resolve() {
      const c = this._config;
      const opt = (k) => (c[k] !== undefined && c[k] !== null && c[k] !== "" ? c[k] : DEFAULTS[k]);
      const type = normalizeType(c.lock_type) || detectLockType(this._hass, c.entity);
      const info = LOCK_TYPES[type];
      const style = info.styles[c.lock_style] ? c.lock_style : Object.keys(info.styles)[0];
      const view = c.view === "exterior" || c.view === "interior" ? c.view : info.view;
      const layout = ["vertical", "horizontal", "compact"].includes(c.layout) ? c.layout : DEFAULTS.layout;
      const customColor = cssColor(c.color);
      let finish = c.finish || (customColor ? "custom" : info.finish);
      if (finish !== "custom" && !FINISHES[finish]) finish = info.finish;
      const images = c.images && typeof c.images === "object" ? c.images : {};
      const hasImages = IMAGE_STATES.some((s) => typeof images[s] === "string" && images[s].trim());
      const artSize = Number(c.art_size) > 0 ? Number(c.art_size) : LAYOUT_ART_SIZE[layout];
      return {
        type,
        style,
        view,
        layout,
        finish,
        customColor,
        images,
        hasImages,
        artSize,
        showIndicator: !!opt("show_indicator"),
        showName: !!opt("show_name"),
        showStatus: !!opt("show_status"),
        showBattery: !!opt("show_battery"),
        showChanged: !!opt("show_last_changed"),
        showChangedBy: !!opt("show_changed_by"),
        showButtons: !!opt("show_buttons"),
        changedFormat: ["relative", "absolute", "both"].includes(c.last_changed_format) ? c.last_changed_format : "relative",
        confirm: c.confirm === true ? "unlock" : ["none", "unlock", "lock", "both"].includes(c.confirm) ? c.confirm : DEFAULTS.confirm,
        duration: Math.max(0, Number(opt("animation_duration")) || 0),
        lowBattery: Number(opt("battery_low_threshold")) || 20,
        transition: ["fade", "slide", "zoom", "flip", "none"].includes(c.image_transition) ? c.image_transition : DEFAULTS.image_transition,
        imageFit: ["contain", "cover", "fill", "scale-down"].includes(c.image_fit) ? c.image_fit : DEFAULTS.image_fit,
      };
    }

    // The finish to render, and a key that names it in the render cache.
    _finish(r) {
      if (r.finish === "custom" && r.customColor) {
        const rgb = this._resolveColor(r.customColor);
        if (rgb) return { key: `rgb${rgb.join(",")}`, spec: customFinish(rgb) };
      }
      const name = FINISHES[r.finish] ? r.finish : LOCK_TYPES[r.type].finish;
      return { key: name, spec: FINISHES[name] };
    }

    // Any CSS colour (including a theme variable) → [r, g, b].
    _resolveColor(css) {
      try {
        const probe = document.createElement("span");
        probe.style.color = css;
        if (!probe.style.color) return null;
        this.shadowRoot.appendChild(probe);
        const resolved = getComputedStyle(probe).color || css;
        probe.remove();
        const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#000";
        ctx.fillStyle = resolved;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      } catch (e) {
        return null;
      }
    }

    /* ----- rendering ----- */

    _render() {
      if (!this._config || !this._hass) return;
      const stateObj = this._hass.states[this._config.entity];
      if (!stateObj) {
        this._renderWarning(`Entity not available: ${this._config.entity}`);
        return;
      }
      const r = this._resolve();
      const key = JSON.stringify([r, this._config.name]);
      if (key !== this._buildKey) {
        this._build(r);
        this._buildKey = key;
        this._r = r;
      }
      this._update(stateObj);
    }

    _renderWarning(text) {
      this._buildKey = null;
      this._sig = null;
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card><div class="warning">${ICONS.alert}<span></span></div></ha-card>`;
      this.shadowRoot.querySelector(".warning span").textContent = text;
    }

    _build(r) {
      const root = this.shadowRoot;
      this._model = r.hasImages ? null : lockModel(r.type, r.style, r.view);
      const stage = this._model ? artMarkup(this._model, r.showIndicator) : `<div class="images t-${r.transition}"></div>`;
      root.innerHTML = `<style>${STYLE}</style>
        <ha-card class="layout-${r.layout}${r.showButtons ? " has-actions" : ""} no-anim">
          <div class="header"${r.showName ? "" : " hidden"}>
            <div class="name"${r.showName ? "" : " hidden"}></div>
            <button class="battery" type="button" hidden>${ICONS.battery}<span class="batt-text"></span></button>
          </div>
          <div class="stage${r.hasImages ? " has-images" : ""}" role="button" tabindex="0">${stage}<div class="hint"></div></div>
          <div class="info">
            <div class="status"${r.showStatus ? "" : " hidden"}><span class="status-icon"></span><span class="status-text"></span></div>
            <div class="changed" hidden>${ICONS.clock}<span class="changed-text"></span></div>
            <div class="error" hidden>${ICONS.alert}<span class="error-text"></span></div>
          </div>
          <div class="actions"${r.showButtons ? "" : " hidden"}>
            <button class="btn" type="button" data-service="lock">${ICONS.locked}<span></span></button>
            <button class="btn" type="button" data-service="unlock">${ICONS.unlocked}<span></span></button>
            <button class="btn" type="button" data-service="open" hidden>${ICONS.open}<span></span></button>
          </div>
        </ha-card>`;

      const $ = (s) => root.querySelector(s);
      this._el = {
        card: $("ha-card"),
        header: $(".header"),
        name: $(".name"),
        battery: $(".battery"),
        battText: $(".batt-text"),
        battFill: $(".batt-fill"),
        stage: $(".stage"),
        images: $(".images"),
        art: $(".art"),
        shake: $(".shake"),
        canvas: $(".lock"),
        hint: $(".hint"),
        status: $(".status"),
        statusIcon: $(".status-icon"),
        statusText: $(".status-text"),
        changed: $(".changed"),
        changedText: $(".changed-text"),
        error: $(".error"),
        errorText: $(".error-text"),
        keys: $(".keys"),
        burst: $(".burst"),
        buttons: [...root.querySelectorAll(".btn")],
      };
      this._imgLayer = null;
      this._imgSrc = null;
      this._displayState = null;
      this._sig = null;
      // The canvas is new, so whatever was painted on the old one is gone.
      this._base = null;
      this._baseKey = null;
      this._ctx = null;
      this._torch.k = this._torch.goal = 0;
      this._sweep = 0;
      this._turn.cheer = 0;

      // Theme variables derived from the config.
      const host = this.style;
      // Only set inline when configured, so themes / card-mod can override it.
      if (this._config.animation_duration !== undefined && this._config.animation_duration !== "") {
        host.setProperty("--dlc-duration", `${r.duration}ms`);
      } else {
        host.removeProperty("--dlc-duration");
      }
      host.setProperty("--dlc-art-size", `${r.artSize}px`);
      host.setProperty("--dlc-image-fit", r.imageFit);
      const colorVars = {
        locked_color: "--dlc-locked",
        unlocked_color: "--dlc-unlocked",
        jammed_color: "--dlc-jammed",
        pending_color: "--dlc-pending",
        unavailable_color: "--dlc-unavailable",
      };
      for (const [k, v] of Object.entries(colorVars)) {
        const col = cssColor(this._config[k]);
        if (col) host.setProperty(v, col);
        else host.removeProperty(v);
      }

      this._bindEvents();
      this._watchArt();
      // Let the first paint happen without transitions, then enable them.
      requestAnimationFrame(() => requestAnimationFrame(() => this._el && this._el.card.classList.remove("no-anim")));
    }

    /* ----- lock art ----- */

    // Re-render whenever the art box gets a size or changes it.
    _watchArt() {
      if (this._resizeObserver) this._resizeObserver.disconnect();
      const art = this._el && this._el.art;
      if (!art || !this.isConnected) return;
      if (window.ResizeObserver) {
        this._resizeObserver = new ResizeObserver(() => queueRender(this));
        this._resizeObserver.observe(art);
      }
      queueRender(this);
    }

    // Draws everything that stays still. Called from the render queue.
    _renderArt() {
      const el = this._el;
      const r = this._r;
      if (!el || !el.canvas || !r || !this._model || !this.isConnected) return;
      const size = el.art.clientHeight;
      if (!size) return; // not laid out yet; the resize observer calls back
      const px = Math.max(48, Math.min(640, Math.round(size * Math.min(window.devicePixelRatio || 1, 2.5))));
      const finish = this._finish(r);
      const key = [r.type, r.style, r.view, finish.key, px].join("|");
      if (key === this._baseKey) return;
      this._baseKey = key;
      this._mats = materialsFor(finish.spec);
      this._base = lockBase(key, () => renderBase(this._model, this._mats, px));
      el.canvas.width = el.canvas.height = px;
      this._ctx = el.canvas.getContext("2d");
      this._img = this._ctx.createImageData(px, px);
      this._lit = true; // forces a full repaint
      this._paint();
      el.canvas.classList.add("ready");
    }

    // Composes one frame: the base, the torch if it is on, and the turning part.
    _paint(angle) {
      const base = this._base;
      if (!base || !this._ctx) return;
      if (angle === undefined) angle = this._turn.angle;
      const data = this._img.data;
      const torch = this._torch.k > 0.004 ? this._torch : null;
      if (torch || this._lit) {
        if (torch) applyTorch(data, base, this._mats, torch);
        else data.set(base.rgba);
        paintTurn(data, data, base, this._model, this._mats, angle, torch);
        this._ctx.putImageData(this._img, 0, 0);
        this._lit = !!torch;
        return;
      }
      const [x, y, w, h] = paintTurn(data, base.rgba, base, this._model, this._mats, angle, null);
      this._ctx.putImageData(this._img, 0, 0, x, y, w, h);
    }

    // Turns the thumbturn / key plug to match the lock's state.
    _setPose(pose, pending, cheer) {
      if (!this._model) {
        if (cheer) this._celebrate();
        return;
      }
      const turn = this._turn;
      turn.target = POSE_ANGLE[pose] || 0;
      turn.pending = pending;
      turn.cheer = cheer || 0;
      const ms = this._duration();
      turn.still = ms <= 0;
      // The spring settles in about the configured duration, with a slight overshoot.
      turn.rate = 4 / (0.74 * Math.max(0.12, ms / 1000));
      if (turn.still || this._el.card.classList.contains("no-anim")) {
        turn.angle = turn.target;
        turn.vel = 0;
        turn.cheer = 0;
        if (cheer) this._arrive(cheer);
        this._paint();
      }
      this._wake();
    }

    _duration() {
      const css = getComputedStyle(this).getPropertyValue("--dlc-duration").trim();
      const v = parseFloat(css);
      if (isNaN(v)) return this._r.duration;
      return /ms$/.test(css) ? v : v * 1000;
    }

    _wake() {
      if (!this._raf && this.isConnected) {
        this._turn.last = 0;
        this._raf = requestAnimationFrame(this._frame);
      }
    }

    _frame(now) {
      this._raf = 0;
      if (!this._el || !this._model) return;
      const turn = this._turn;
      const torch = this._torch;
      const dt = turn.last ? Math.min(0.05, (now - turn.last) / 1000) : 0.016;
      turn.last = now;
      let busy = false;

      // Spring towards the target angle.
      const w = turn.rate;
      const steps = Math.ceil(dt / 0.004);
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        turn.vel += (-w * w * (turn.angle - turn.target) - 2 * 0.74 * w * turn.vel) * h;
        turn.angle += turn.vel * h;
      }
      const off = Math.abs(turn.angle - turn.target);
      if (off < 0.002 && Math.abs(turn.vel) < 0.03) {
        turn.angle = turn.target;
        turn.vel = 0;
      } else {
        busy = true;
      }
      if (turn.cheer && off < 0.07) {
        const cheer = turn.cheer;
        turn.cheer = 0;
        this._arrive(cheer);
      }

      // While the lock is working, the turn strains a little against the motor.
      const calm = REDUCED_MOTION.matches || turn.still;
      turn.wobble = turn.pending && !calm ? Math.min(1, turn.wobble + dt * 2.5) : Math.max(0, turn.wobble - dt * 5);
      if (turn.wobble > 0) busy = true;
      const shown = turn.angle + Math.sin(now / 150) * 0.055 * turn.wobble;

      // A sweep of light across the lock when it lands, unless the pointer is already lighting it.
      if (this._sweep) {
        const t = (now - this._sweep) / 650;
        if (t >= 1 || torch.goal > 0) {
          this._sweep = 0;
          if (!torch.goal) torch.k = 0;
        } else if (t >= 0) {
          torch.x = -100 + 200 * t;
          torch.y = -55 + 50 * t;
          torch.k = Math.sin(Math.PI * t) * 0.8;
        }
        busy = true;
      } else {
        const ease = 1 - Math.exp(-dt * 14);
        torch.x += (torch.goalX - torch.x) * ease;
        torch.y += (torch.goalY - torch.y) * ease;
        torch.k += (torch.goal - torch.k) * (1 - Math.exp(-dt * 9));
        if (Math.abs(torch.goal - torch.k) < 0.004) torch.k = torch.goal;
        else busy = true;
        if (torch.k > 0 && Math.abs(torch.goalX - torch.x) + Math.abs(torch.goalY - torch.y) > 0.3) busy = true;
      }

      this._paint(shown);
      if (busy) this._raf = requestAnimationFrame(this._frame);
    }

    // The turn has reached its stop: a ring of light and, for a clean lock or
    // unlock, a small jolt and a glint.
    _arrive(cheer) {
      this._celebrate();
      const calm = REDUCED_MOTION.matches || this._turn.still || this._el.card.classList.contains("no-anim");
      if (calm || cheer !== 2) return;
      const shake = this._el.shake;
      shake.classList.remove("thunk");
      void shake.getBoundingClientRect();
      shake.classList.add("thunk");
      if (!this._torch.goal) this._sweep = performance.now();
    }

    // Points the torch at a pointer event, or switches it off.
    _aim(ev) {
      const canvas = this._el && this._el.canvas;
      if (!canvas) return;
      const torch = this._torch;
      if (!ev) {
        torch.goal = 0;
      } else {
        const box = canvas.getBoundingClientRect();
        if (!box.width) return;
        torch.goalX = ((ev.clientX - box.left) / box.width) * ART - HALF;
        torch.goalY = ((ev.clientY - box.top) / box.height) * ART - HALF;
        if (!torch.goal && torch.k < 0.01) {
          torch.x = torch.goalX;
          torch.y = torch.goalY;
        }
        torch.goal = 1;
      }
      this._wake();
    }

    _bindEvents() {
      const { stage, battery, buttons } = this._el;
      const hasDouble = () => {
        const a = this._actionConfig("double_tap");
        return a && a.action && a.action !== "none";
      };
      stage.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (this._held) {
          this._held = false;
          return;
        }
        if (hasDouble()) {
          if (this._dblTimer) {
            clearTimeout(this._dblTimer);
            this._dblTimer = null;
            this._runAction("double_tap");
          } else {
            this._dblTimer = setTimeout(() => {
              this._dblTimer = null;
              this._runAction("tap");
            }, 250);
          }
          return;
        }
        this._runAction("tap");
      });
      stage.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          this._runAction("tap");
        }
      });
      const cancelHold = () => clearTimeout(this._holdTimer);
      stage.addEventListener("pointerdown", (ev) => {
        if (ev.button !== undefined && ev.button !== 0) return;
        this._held = false;
        cancelHold();
        this._holdTimer = setTimeout(() => {
          this._held = true;
          this._runAction("hold");
        }, 500);
        // The lock gives a little under the finger, and catches the light.
        stage.classList.add("pressed");
        this._aim(ev);
      });
      stage.addEventListener("pointermove", (ev) => {
        if (ev.pointerType !== "touch" || stage.classList.contains("pressed")) this._aim(ev);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach((t) =>
        stage.addEventListener(t, (ev) => {
          cancelHold();
          stage.classList.remove("pressed");
          // A mouse keeps lighting the lock for as long as it hovers.
          if (t !== "pointerup" || ev.pointerType !== "mouse") this._aim(null);
        })
      );
      stage.addEventListener("contextmenu", (ev) => ev.preventDefault());

      battery.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const id = this._batteryEntityId();
        fire(this, "hass-more-info", { entityId: id || this._config.entity });
      });
      buttons.forEach((btn) =>
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this._request(btn.dataset.service, "button");
        })
      );
    }

    _update(stateObj) {
      const r = this._r;
      const el = this._el;
      if (!el) return;
      const hass = this._hass;

      // Optimistic pending state is cleared once HA reports anything new.
      if (this._pending && (stateObj.state !== this._pending.from || stateObj.last_changed !== this._pending.changed)) {
        this._clearPending();
      }
      const raw = this._pending ? this._pending.state : stateObj.state;
      const meta = STATES[raw] || STATES.unknown;
      const battery = r.showBattery ? this._batteryInfo(stateObj) : null;
      const supportsOpen = ((stateObj.attributes.supported_features || 0) & SUPPORT_OPEN) !== 0;

      const sig = JSON.stringify([
        raw,
        stateObj.last_changed,
        stateObj.attributes.friendly_name,
        stateObj.attributes.changed_by,
        battery,
        this._armed && this._armed.service,
        this._error,
        supportsOpen,
        hass.locale && hass.locale.language,
      ]);
      if (sig === this._sig) return;
      this._sig = sig;

      // State classes drive every animation.
      const card = el.card;
      [...card.classList].forEach((c) => {
        if (c.startsWith("pose-") || c.startsWith("tone-")) card.classList.remove(c);
      });
      card.classList.add(`pose-${meta.pose}`, `tone-${meta.tone}`);
      card.classList.toggle("pending", !!meta.pending);
      if (meta.pending && el.keys) el.keys.classList.remove("flash");

      const prev = this._displayState;
      this._displayState = raw;
      if (prev !== raw) {
        // A lock that has just landed in a settled state gets a flourish
        // once the turn arrives: 2 for a clean lock/unlock, 1 otherwise.
        const settled = !!prev && !meta.pending && !this._quiet;
        const clean = meta.tone === "locked" || meta.tone === "unlocked";
        this._quiet = false;
        this._setPose(meta.pose, !!meta.pending, settled ? (clean ? 2 : 1) : 0);
      }

      if (r.hasImages) this._setImage(raw, !!meta.pending);

      // Header
      const name = this._config.name || stateObj.attributes.friendly_name || this._config.entity;
      el.name.textContent = name;
      this._renderBattery(battery);

      // Status
      const stateLabel = this._stateLabel(stateObj, raw, meta);
      el.statusText.textContent = stateLabel;
      el.statusIcon.innerHTML =
        meta.pose === "locked" || meta.pose === "locking"
          ? ICONS.locked
          : meta.pose === "jammed" || meta.pose === "unknown"
            ? ICONS.alert
            : meta.pose === "open" || meta.pose === "opening"
              ? ICONS.open
              : ICONS.unlocked;

      // Last changed
      this._updateChanged(stateObj);

      // Error
      el.error.hidden = !this._error;
      el.errorText.textContent = this._error || "";

      // Confirmation hint
      const armedStage = this._armed && this._armed.source === "stage";
      el.stage.classList.toggle("armed-stage", !!armedStage);
      if (armedStage) {
        el.hint.textContent = this._confirmText(this._armed.service);
        el.hint.classList.toggle("lock", this._armed.service === "lock");
      }

      // Buttons
      const lockedish = raw === "locked" || raw === "locking";
      const unlockedish = raw === "unlocked" || raw === "unlocking";
      const openish = raw === "open" || raw === "opening";
      const unavailable = stateObj.state === "unavailable";
      for (const btn of el.buttons) {
        const svc = btn.dataset.service;
        if (svc === "open") btn.hidden = !supportsOpen;
        const armed = this._armed && this._armed.source === "button" && this._armed.service === svc;
        btn.classList.toggle("armed", !!armed);
        btn.classList.toggle("active", svc === "lock" ? lockedish : svc === "unlock" ? unlockedish : openish);
        btn.disabled = unavailable;
        btn.querySelector("span").textContent = armed ? this._confirmText(svc, true) : this._serviceLabel(svc);
      }

      // Accessibility + tap affordance
      const tap = this._actionConfig("tap");
      el.stage.classList.toggle("no-tap", !tap || tap.action === "none");
      const next = this._toggleService(stateObj.state);
      el.stage.setAttribute(
        "aria-label",
        `${name}: ${stateLabel}.` + (tap && tap.action === "toggle" && next ? ` Activate to ${this._serviceLabel(next).toLowerCase()}.` : "")
      );
    }

    _celebrate() {
      const { burst, keys } = this._el;
      const retrigger = (node, cls) => {
        if (!node) return;
        node.classList.remove(cls);
        void node.getBoundingClientRect();
        node.classList.add(cls);
      };
      if (this._el.card.classList.contains("no-anim")) return;
      retrigger(burst, "go");
      retrigger(keys, "flash");
    }

    _stateLabel(stateObj, raw, meta) {
      const hass = this._hass;
      try {
        if (hass.formatEntityState) {
          const s = raw === stateObj.state ? hass.formatEntityState(stateObj) : hass.formatEntityState(stateObj, raw);
          if (s && s !== raw) return s;
        }
      } catch (e) {
        /* fall through */
      }
      return meta.label;
    }

    _serviceLabel(svc) {
      const fallback = { lock: "Lock", unlock: "Unlock", open: "Open" }[svc] || svc;
      return localize(this._hass, `ui.card.lock.${svc}`, fallback);
    }

    _confirmText(svc, short) {
      const label = this._serviceLabel(svc).toLowerCase();
      return short ? `Confirm ${label}?` : `Tap again to ${label}`;
    }

    /* ----- last changed ----- */

    _updateChanged(stateObj) {
      const el = this._el;
      const r = this._r;
      if (!el || !r || !this._hass) return;
      stateObj = stateObj || this._hass.states[this._config.entity];
      if (!stateObj || !r.showChanged) {
        if (el.changed) el.changed.hidden = true;
        return;
      }
      const when = new Date(stateObj.last_changed);
      if (isNaN(when)) {
        el.changed.hidden = true;
        return;
      }
      const parts = [];
      if (r.changedFormat !== "absolute") parts.push(this._relative(when));
      if (r.changedFormat !== "relative") parts.push(this._absolute(when));
      const by = r.showChangedBy ? stateObj.attributes.changed_by : null;
      let text = parts.join(" · ");
      if (by && String(by).trim()) text += ` · ${by}`;
      el.changed.hidden = false;
      el.changedText.textContent = text;
      el.changed.title = this._absolute(when, true);
    }

    _lang() {
      const h = this._hass;
      return (h && ((h.locale && h.locale.language) || h.language)) || navigator.language || "en";
    }

    _relative(date) {
      const lang = this._lang();
      const secs = (date.getTime() - Date.now()) / 1000;
      const abs = Math.abs(secs);
      let rtf;
      try {
        rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
      } catch (e) {
        rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
      }
      if (abs < 45) return lang.startsWith("en") ? "Just now" : rtf.format(0, "second");
      const steps = [
        [60, "second", 1],
        [3600, "minute", 60],
        [86400, "hour", 3600],
        [604800, "day", 86400],
        [2629800, "week", 604800],
        [31557600, "month", 2629800],
        [Infinity, "year", 31557600],
      ];
      for (const [limit, unit, div] of steps) {
        if (abs < limit) {
          const s = rtf.format(Math.round(secs / div), unit);
          return s.charAt(0).toLocaleUpperCase(lang) + s.slice(1);
        }
      }
      return "";
    }

    _absolute(date, full) {
      const h = this._hass || {};
      const loc = h.locale || {};
      const opts = {};
      if (loc.time_format === "12") opts.hour12 = true;
      if (loc.time_format === "24") opts.hour12 = false;
      if (loc.time_zone === "server" && h.config && h.config.time_zone) opts.timeZone = h.config.time_zone;
      const sameDay = new Date().toDateString() === date.toDateString();
      const fmt = full
        ? { dateStyle: "full", timeStyle: "medium" }
        : sameDay
          ? { hour: "numeric", minute: "2-digit" }
          : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
      try {
        return new Intl.DateTimeFormat(this._lang(), { ...fmt, ...opts }).format(date);
      } catch (e) {
        return date.toLocaleString();
      }
    }

    /* ----- battery ----- */

    _batteryEntityId() {
      const c = this._config;
      const h = this._hass;
      if (c.battery_entity) return c.battery_entity;
      if (!h) return null;
      // The device scan only needs to rerun when the entity registry changes.
      if (!this._batCache || this._batCache.entities !== h.entities) {
        let id = null;
        const reg = h.entities && h.entities[c.entity];
        if (reg && reg.device_id) {
          const siblings = Object.values(h.entities)
            .filter((e) => e.device_id === reg.device_id && e.entity_id !== c.entity)
            .map((e) => h.states[e.entity_id])
            .filter(Boolean);
          const pick = (domain) =>
            siblings.find((s) => s.entity_id.startsWith(domain + ".") && s.attributes.device_class === "battery");
          const found = pick("sensor") || pick("binary_sensor");
          id = found ? found.entity_id : null;
        }
        this._batCache = { entities: h.entities, id };
      }
      if (this._batCache.id) return this._batCache.id;
      const obj = c.entity.split(".")[1];
      return [`sensor.${obj}_battery`, `sensor.${obj}_battery_level`].find((e) => h.states[e]) || null;
    }

    _batteryInfo(stateObj) {
      const h = this._hass;
      const id = this._batteryEntityId();
      if (id) {
        const b = h.states[id];
        if (!b || b.state === "unavailable" || b.state === "unknown") return null;
        if (id.startsWith("binary_sensor.")) return { low: b.state === "on", binary: true };
        const v = parseFloat(b.state);
        return isNaN(v) ? null : { level: v };
      }
      const attr = stateObj.attributes.battery_level ?? stateObj.attributes.battery;
      const v = parseFloat(attr);
      return isNaN(v) ? null : { level: v };
    }

    _renderBattery(info) {
      const { battery, battText, battFill, header } = this._el;
      // The header row disappears entirely when it would be empty.
      header.hidden = !this._r.showName && !info;
      if (!info) {
        battery.hidden = true;
        return;
      }
      battery.hidden = false;
      const low = this._r.lowBattery;
      let pct;
      if (info.binary) {
        pct = info.low ? 12 : 100;
        battText.textContent = info.low ? "Low" : "OK";
      } else {
        pct = Math.max(0, Math.min(100, info.level));
        battText.textContent = `${Math.round(pct)}%`;
      }
      const isLow = info.binary ? info.low : pct <= low;
      const isWarn = !info.binary && !isLow && pct <= low * 2;
      battery.classList.toggle("low", !!isLow);
      battery.classList.toggle("warn", !!isWarn);
      if (battFill) battFill.setAttribute("width", String(Math.max(1.2, (17.2 * pct) / 100)));
      battery.title = `Battery: ${battText.textContent}`;
      battery.setAttribute("aria-label", battery.title);
    }

    /* ----- custom images ----- */

    _imageFor(state) {
      const im = this._r.images;
      for (const k of IMAGE_FALLBACK[state] || IMAGE_FALLBACK.unknown) {
        if (typeof im[k] === "string" && im[k].trim()) return { src: im[k].trim(), exact: k === state };
      }
      return null;
    }

    _setImage(state, pending) {
      const box = this._el.images;
      if (!box) return;
      const img = this._imageFor(state);
      box.classList.toggle("pulse", !!(pending && img && !img.exact));
      if (!img || img.src === this._imgSrc) {
        if (this._imgLayer && this._imgLayer.tagName === "VIDEO") this._imgLayer.loop = pending;
        return;
      }
      const video = isVideo(img.src);
      const layer = document.createElement(video ? "video" : "img");
      layer.className = "layer";
      if (video) {
        Object.assign(layer, { muted: true, autoplay: true, playsInline: true, loop: pending });
        layer.setAttribute("muted", "");
        layer.setAttribute("playsinline", "");
      } else {
        layer.alt = "";
        layer.decoding = "async";
      }
      layer.src = img.src;
      const old = this._imgLayer;
      this._imgLayer = layer;
      this._imgSrc = img.src;
      const animate = old && this._r.transition !== "none" && !this._el.card.classList.contains("no-anim");
      if (animate) layer.classList.add("enter");
      box.appendChild(layer);
      if (video) layer.play && layer.play().catch(() => {});
      if (!old) return;
      if (!animate) {
        old.remove();
        return;
      }
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          layer.classList.remove("enter");
          old.classList.add("leave");
        })
      );
      setTimeout(() => old.remove(), this._r.duration + 100);
    }

    /* ----- actions ----- */

    _actionConfig(kind) {
      const c = this._config;
      const cfg = c[`${kind}_action`];
      if (cfg && typeof cfg === "object") return cfg;
      if (typeof cfg === "string") return { action: cfg };
      return { action: kind === "tap" ? "toggle" : kind === "hold" ? "more-info" : "none" };
    }

    _toggleService(state) {
      if (state === "locked" || state === "jammed" || state === "locking") return "unlock";
      if (state === "unlocked" || state === "open" || state === "unknown" || state === "unlocking") return "lock";
      return null;
    }

    _runAction(kind) {
      const cfg = this._actionConfig(kind);
      const hass = this._hass;
      if (!cfg || !hass) return;
      const entity = cfg.entity || this._config.entity;
      const confirmed = () => {
        if (!cfg.confirmation) return true;
        const text = (typeof cfg.confirmation === "object" && cfg.confirmation.text) || "Are you sure?";
        return window.confirm(text);
      };
      switch (cfg.action) {
        case "toggle": {
          if (this._pending) return;
          const st = hass.states[this._config.entity];
          const svc = st && this._toggleService(st.state);
          if (svc) this._request(svc, "stage");
          return;
        }
        case "lock":
        case "unlock":
        case "open":
          this._request(cfg.action, "stage");
          return;
        case "more-info":
          fire(this, "hass-more-info", { entityId: entity });
          return;
        case "navigate":
          if (!cfg.navigation_path || !confirmed()) return;
          history[cfg.navigation_replace ? "replaceState" : "pushState"](null, "", cfg.navigation_path);
          fire(window, "location-changed", { replace: !!cfg.navigation_replace });
          return;
        case "url":
          if (cfg.url_path && confirmed()) window.open(cfg.url_path, "_blank", "noopener");
          return;
        case "perform-action":
        case "call-service": {
          const svc = cfg.perform_action || cfg.service;
          if (!svc || !confirmed()) return;
          const [domain, service] = svc.split(".", 2);
          hass.callService(domain, service, cfg.data || cfg.service_data || {}, cfg.target);
          return;
        }
        case "none":
          return;
        default:
          fire(this, "hass-action", { config: { entity, [`${kind}_action`]: cfg }, action: kind });
      }
    }

    _needsConfirm(svc) {
      const mode = this._r.confirm;
      if (mode === "both") return true;
      if (mode === "unlock") return svc === "unlock" || svc === "open";
      if (mode === "lock") return svc === "lock";
      return false;
    }

    _request(svc, source) {
      if (this._needsConfirm(svc) && !(this._armed && this._armed.service === svc && this._armed.source === source)) {
        this._armed = { service: svc, source };
        clearTimeout(this._armTimer);
        this._armTimer = setTimeout(() => {
          this._armed = null;
          this._sig = null;
          this._render();
        }, 4000);
        this._sig = null;
        this._render();
        return;
      }
      clearTimeout(this._armTimer);
      this._armed = null;
      this._callLock(svc);
    }

    _callLock(svc) {
      const hass = this._hass;
      const entity = this._config.entity;
      const st = hass.states[entity];
      if (!st) return;
      const target = { lock: "locked", unlock: "unlocked", open: "open" }[svc];
      if (st.state !== target) {
        this._pending = {
          state: { lock: "locking", unlock: "unlocking", open: "opening" }[svc],
          from: st.state,
          changed: st.last_changed,
        };
        clearTimeout(this._pendingTimer);
        this._pendingTimer = setTimeout(() => {
          // The lock never answered, so fall back without the flourish.
          this._clearPending();
          this._quiet = true;
          this._sig = null;
          this._render();
        }, svc === "open" ? 10000 : 30000);
      }
      this._setError(null);
      this._sig = null;
      this._render();
      const data = { entity_id: entity };
      if (this._config.code) data.code = String(this._config.code);
      Promise.resolve(hass.callService("lock", svc, data)).catch((err) => {
        if (this._pending) this._quiet = true;
        this._clearPending();
        this._setError((err && err.message) || `Could not ${svc}`);
      });
    }

    _clearPending() {
      this._pending = null;
      clearTimeout(this._pendingTimer);
    }

    _setError(msg) {
      this._error = msg;
      clearTimeout(this._errorTimer);
      if (msg) {
        this._errorTimer = setTimeout(() => this._setError(null), 6000);
      }
      this._sig = null;
      this._render();
    }
  }

  function detectLockType(hass, entityId) {
    try {
      const reg = hass && hass.entities && hass.entities[entityId];
      const dev = reg && reg.device_id && hass.devices && hass.devices[reg.device_id];
      const text = [dev && dev.manufacturer, dev && dev.model, dev && dev.name, reg && reg.platform]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (/\blevel\b/.test(text)) return "level_lock_pro";
      if (/schlage|allegion|encode/.test(text)) return "schlage_encode_plus";
    } catch (e) {
      /* ignore */
    }
    return "deadbolt";
  }

  /* ------------------------------------------------------------------ */
  /* Visual editor                                                       */
  /* ------------------------------------------------------------------ */

  const LABELS = {
    entity: "Lock entity",
    name: "Name",
    lock_type: "Lock model",
    lock_style: "Style",
    view: "View",
    finish: "Finish",
    color: "Custom finish color",
    layout: "Layout",
    art_size: "Lock height (px)",
    show_indicator: "Show status ring",
    show_name: "Show name",
    show_status: "Show lock status",
    show_battery: "Show battery level",
    battery_entity: "Battery entity (auto-detected if empty)",
    battery_low_threshold: "Low battery threshold (%)",
    show_last_changed: "Show last changed",
    last_changed_format: "Last changed format",
    show_changed_by: "Show who/what changed it",
    show_buttons: "Show lock / unlock buttons",
    confirm: "Require confirmation",
    animation_duration: "Animation duration (ms)",
    tap_action: "Tap action",
    hold_action: "Hold action",
    double_tap_action: "Double tap action",
    locked_color: "Locked color",
    unlocked_color: "Unlocked color",
    pending_color: "Locking / unlocking color",
    jammed_color: "Jammed color",
    image_transition: "Image transition",
    image_fit: "Image fit",
    locked: "Locked image",
    unlocked: "Unlocked image",
    locking: "Locking image (optional)",
    unlocking: "Unlocking image (optional)",
    jammed: "Jammed image (optional)",
    open: "Open image (optional)",
    opening: "Opening image (optional)",
    unavailable: "Unavailable image (optional)",
  };

  const HELPERS = {
    images: "Use your own pictures instead of the built-in lock. Enter a URL or a /local/… path (files in config/www). PNG, JPG, SVG, WebP, animated GIF, MP4 and WebM all work. Missing states fall back to the locked/unlocked image.",
    battery_entity: "Leave empty to find the battery sensor on the lock's device automatically.",
    art_size: "Defaults: 190 vertical, 150 horizontal, 60 compact.",
  };

  const COLOR_KEYS = ["color", "locked_color", "unlocked_color", "pending_color", "jammed_color"];

  const hexToRgb = (hex) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  };

  const opts = (obj) => Object.entries(obj).map(([value, label]) => ({ value, label: typeof label === "string" ? label : label.label }));

  function editorSchema(config, hass) {
    const type = normalizeType(config.lock_type) || detectLockType(hass, config.entity);
    const info = LOCK_TYPES[type];
    const styles = opts(info.styles);
    const custom = (config.finish || (cssColor(config.color) ? "custom" : info.finish)) === "custom";
    const select = (options) => ({ select: { mode: "dropdown", options } });
    const bool = { boolean: {} };
    return [
      { name: "entity", required: true, selector: { entity: { domain: "lock" } } },
      { name: "name", selector: { text: {} } },
      {
        name: "appearance",
        type: "expandable",
        flatten: true,
        expanded: true,
        title: "Lock appearance",
        icon: "mdi:lock-smart",
        schema: [
          {
            name: "",
            type: "grid",
            schema: [
              { name: "lock_type", selector: select(opts(LOCK_TYPES)) },
              ...(styles.length > 1 ? [{ name: "lock_style", selector: select(styles) }] : []),
              {
                name: "view",
                selector: select([
                  { value: "exterior", label: "Exterior (outside)" },
                  { value: "interior", label: "Interior (inside)" },
                ]),
              },
              { name: "finish", selector: select([...opts(FINISHES), { value: "custom", label: "Custom color…" }]) },
            ],
          },
          ...(custom ? [{ name: "color", selector: { color_rgb: {} } }] : []),
          { name: "show_indicator", selector: bool },
        ],
      },
      {
        name: "layout_section",
        type: "expandable",
        flatten: true,
        title: "Layout & information",
        icon: "mdi:view-dashboard-outline",
        schema: [
          {
            name: "",
            type: "grid",
            schema: [
              {
                name: "layout",
                selector: select([
                  { value: "vertical", label: "Vertical" },
                  { value: "horizontal", label: "Horizontal" },
                  { value: "compact", label: "Compact" },
                ]),
              },
              { name: "art_size", selector: { number: { min: 40, max: 400, step: 5, mode: "box", unit_of_measurement: "px" } } },
              { name: "show_name", selector: bool },
              { name: "show_status", selector: bool },
              { name: "show_last_changed", selector: bool },
              { name: "show_changed_by", selector: bool },
              {
                name: "last_changed_format",
                selector: select([
                  { value: "relative", label: "Relative (5 minutes ago)" },
                  { value: "absolute", label: "Time (3:42 PM)" },
                  { value: "both", label: "Both" },
                ]),
              },
              { name: "show_buttons", selector: bool },
              { name: "show_battery", selector: bool },
              { name: "battery_low_threshold", selector: { number: { min: 1, max: 99, mode: "box", unit_of_measurement: "%" } } },
            ],
          },
          { name: "battery_entity", selector: { entity: { domain: ["sensor", "binary_sensor"], device_class: "battery" } } },
        ],
      },
      {
        name: "colors_section",
        type: "expandable",
        flatten: true,
        title: "Status colors",
        icon: "mdi:palette-outline",
        schema: [
          {
            name: "",
            type: "grid",
            schema: [
              { name: "locked_color", selector: { color_rgb: {} } },
              { name: "unlocked_color", selector: { color_rgb: {} } },
              { name: "pending_color", selector: { color_rgb: {} } },
              { name: "jammed_color", selector: { color_rgb: {} } },
            ],
          },
        ],
      },
      {
        name: "behavior_section",
        type: "expandable",
        flatten: true,
        title: "Interactions & animation",
        icon: "mdi:gesture-tap",
        schema: [
          {
            name: "",
            type: "grid",
            schema: [
              {
                name: "confirm",
                selector: select([
                  { value: "none", label: "Never" },
                  { value: "unlock", label: "Before unlocking" },
                  { value: "lock", label: "Before locking" },
                  { value: "both", label: "Always" },
                ]),
              },
              { name: "animation_duration", selector: { number: { min: 0, max: 3000, step: 50, mode: "box", unit_of_measurement: "ms" } } },
            ],
          },
          { name: "tap_action", selector: { ui_action: { default_action: "toggle" } } },
          { name: "hold_action", selector: { ui_action: { default_action: "more-info" } } },
          { name: "double_tap_action", selector: { ui_action: { default_action: "none" } } },
        ],
      },
      {
        name: "images_section",
        type: "expandable",
        flatten: true,
        title: "Custom images",
        icon: "mdi:image-multiple-outline",
        schema: [
          {
            name: "images",
            type: "expandable",
            expanded: true,
            title: "Image per state",
            schema: IMAGE_STATES.map((s) => ({ name: s, selector: { text: {} } })),
          },
          {
            name: "",
            type: "grid",
            schema: [
              {
                name: "image_transition",
                selector: select([
                  { value: "fade", label: "Cross-fade" },
                  { value: "slide", label: "Slide" },
                  { value: "zoom", label: "Zoom" },
                  { value: "flip", label: "Flip" },
                  { value: "none", label: "None" },
                ]),
              },
              {
                name: "image_fit",
                selector: select([
                  { value: "contain", label: "Contain" },
                  { value: "cover", label: "Cover" },
                  { value: "fill", label: "Stretch" },
                  { value: "scale-down", label: "Scale down" },
                ]),
              },
            ],
          },
        ],
      },
    ];
  }

  function editorDefaults(config, hass) {
    const type = normalizeType(config.lock_type) || detectLockType(hass, config.entity);
    const info = LOCK_TYPES[type];
    const layout = config.layout || DEFAULTS.layout;
    return {
      ...DEFAULTS,
      lock_type: type,
      lock_style: Object.keys(info.styles)[0],
      view: info.view,
      finish: cssColor(config.color) ? "custom" : info.finish,
      art_size: LAYOUT_ART_SIZE[layout] || LAYOUT_ART_SIZE.vertical,
    };
  }

  class DoorLockCardEditor extends HTMLElement {
    setConfig(config) {
      this._config = { ...config };
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      if (this._form) this._form.hass = hass;
      else this._render();
    }

    connectedCallback() {
      this._render();
    }

    async _loadForm() {
      if (customElements.get("ha-form") || this._loading) return;
      this._loading = true;
      try {
        const helpers = window.loadCardHelpers && (await window.loadCardHelpers());
        const card = helpers && (await helpers.createCardElement({ type: "tile", entity: "sun.sun" }));
        if (card && card.constructor.getConfigElement) await card.constructor.getConfigElement();
      } catch (e) {
        /* ignore – the form usually loads with the dialog anyway */
      }
      await Promise.race([customElements.whenDefined("ha-form"), new Promise((r) => setTimeout(r, 5000))]);
      this._loading = false;
      this._render();
    }

    _render() {
      if (!this._config || !this._hass) return;
      if (!customElements.get("ha-form")) {
        this._loadForm();
        return;
      }
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.computeLabel = (s) => LABELS[s.name] || s.title || s.name;
        this._form.computeHelper = (s) => HELPERS[s.name];
        this._form.addEventListener("value-changed", (ev) => this._changed(ev));
        this.appendChild(this._form);
      }
      const defaults = editorDefaults(this._config, this._hass);
      const data = { ...defaults, ...this._config };
      // HA's color picker only understands [r, g, b]. Convert hex strings and
      // hide anything else (CSS variables, named colors) so it can't break the
      // form; hidden values are preserved because _changed merges onto the config.
      for (const k of COLOR_KEYS) {
        if (typeof data[k] === "string") {
          const rgb = hexToRgb(data[k]);
          if (rgb) data[k] = rgb;
          else delete data[k];
        }
      }
      this._form.hass = this._hass;
      this._form.data = data;
      this._form.schema = editorSchema(this._config, this._hass);
    }

    _changed(ev) {
      ev.stopPropagation();
      const value = { ...this._config, ...ev.detail.value };
      const prevType = normalizeType(this._config.lock_type) || detectLockType(this._hass, this._config.entity);
      const nextType = normalizeType(value.lock_type) || prevType;
      // Switching models resets model-specific choices to that model's defaults.
      if (nextType !== prevType) {
        delete value.lock_style;
        delete value.view;
        if (!cssColor(value.color)) delete value.finish;
      }
      if (value.finish && value.finish !== "custom") delete value.color;
      const defaults = editorDefaults({ ...value, lock_type: nextType }, this._hass);
      const keep = new Set(["type", "entity", "lock_type"]);
      for (const [k, v] of Object.entries(value)) {
        if (keep.has(k)) continue;
        const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
        if (empty || (k in defaults && defaults[k] === v && !(k in this._config && this._config[k] === v))) delete value[k];
      }
      if (value.images && typeof value.images === "object") {
        const imgs = Object.fromEntries(Object.entries(value.images).filter(([, v]) => typeof v === "string" && v.trim()));
        if (Object.keys(imgs).length) value.images = imgs;
        else delete value.images;
      }
      this._config = value;
      fire(this, "config-changed", { config: value });
      this._render();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Registration                                                        */
  /* ------------------------------------------------------------------ */

  if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, DoorLockCard);
  if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, DoorLockCardEditor);

  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === CARD_TAG)) {
    window.customCards.push({
      type: CARD_TAG,
      name: "Door Lock Card",
      description: "Animated door lock card with Level Lock Pro, Schlage Encode Plus and custom image support.",
      preview: true,
      documentationURL: "https://github.com/kedube/ha-door-lock-card",
    });
  }

  // Exposed for the demo page / debugging.
  window.DoorLockCardInfo = { version: VERSION, finishes: FINISHES, lockTypes: LOCK_TYPES };

  console.info(
    `%c DOOR-LOCK-CARD %c v${VERSION} `,
    "color:#fff;background:#43a047;font-weight:700;border-radius:3px 0 0 3px",
    "color:#43a047;background:#1c1c1c;font-weight:700;border-radius:0 3px 3px 0"
  );
})();
