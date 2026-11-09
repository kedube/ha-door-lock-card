/*!
 * Door Lock Card for Home Assistant
 * Animated lock card with built-in illustrations (Level Lock Pro, Schlage Encode Plus,
 * generic deadbolt) and support for your own per-state images, GIFs or videos.
 *
 * https://github.com/kedube/ha-door-lock-card
 * License: GPL-3.0
 */
(() => {
  "use strict";

  const VERSION = "1.0.0";
  const CARD_TAG = "door-lock-card";
  const EDITOR_TAG = "door-lock-card-editor";

  /* ------------------------------------------------------------------ */
  /* Catalog: finishes, lock types, states                               */
  /* ------------------------------------------------------------------ */

  const FINISHES = {
    matte_black: { label: "Matte black", base: "#2c2d30", light: "#55585e", dark: "#121315", detail: "#7a7d84" },
    satin_nickel: { label: "Satin nickel", base: "#a9adb2", light: "#e4e7ea", dark: "#6c7076", detail: "#4d5156" },
    satin_chrome: { label: "Satin chrome", base: "#bcc1c6", light: "#f4f6f8", dark: "#80868c", detail: "#585d63" },
    bright_chrome: { label: "Bright chrome", base: "#cfd4d9", light: "#ffffff", dark: "#767d84", detail: "#4a5056" },
    aged_bronze: { label: "Aged bronze", base: "#5d4636", light: "#8c6d52", dark: "#2c2018", detail: "#b08f6f" },
    polished_brass: { label: "Polished brass", base: "#c8a046", light: "#f5dc92", dark: "#86671f", detail: "#654d17" },
    satin_brass: { label: "Satin brass", base: "#b29660", light: "#ddc797", dark: "#7c6436", detail: "#5c4a27" },
    black_stainless: { label: "Black stainless", base: "#3e4044", light: "#6d7076", dark: "#1c1d20", detail: "#92959b" },
    white: { label: "White", base: "#e8e9eb", light: "#ffffff", dark: "#b4b7bb", detail: "#878a8e" },
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

  // pose drives the illustration, tone drives the colour.
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
    door_side: "right",
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
  /* SVG illustration                                                    */
  /* ------------------------------------------------------------------ */

  const ART_H = 220;
  const ART_CY = 110;

  function svgDefs(u) {
    const stop = (o, v) => `<stop offset="${o}" style="stop-color:var(${v})"/>`;
    return `<defs>
      <linearGradient id="${u}-md" x1="0" y1="0" x2="1" y2="1">${stop(0, "--dlc-metal-light")}${stop(0.5, "--dlc-metal-base")}${stop(1, "--dlc-metal-dark")}</linearGradient>
      <linearGradient id="${u}-mv" x1="0" y1="0" x2="0" y2="1">${stop(0, "--dlc-metal-light")}${stop(0.55, "--dlc-metal-base")}${stop(1, "--dlc-metal-dark")}</linearGradient>
      <linearGradient id="${u}-mi" x1="0" y1="0" x2="1" y2="1">${stop(0, "--dlc-metal-dark")}${stop(0.55, "--dlc-metal-base")}${stop(1, "--dlc-metal-light")}</linearGradient>
      <linearGradient id="${u}-mt" x1="0" y1="0" x2="1" y2="0">${stop(0, "--dlc-metal-dark")}${stop(0.45, "--dlc-metal-light")}${stop(1, "--dlc-metal-base")}</linearGradient>
      <radialGradient id="${u}-mr" cx="0.35" cy="0.3" r="0.85">${stop(0, "--dlc-metal-light")}${stop(0.55, "--dlc-metal-base")}${stop(1, "--dlc-metal-dark")}</radialGradient>
      <linearGradient id="${u}-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2e35"/><stop offset="0.5" stop-color="#121418"/><stop offset="1" stop-color="#07080a"/></linearGradient>
      <filter id="${u}-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2.2" stdDeviation="2.2" flood-color="#000" flood-opacity="0.38"/></filter>
      <filter id="${u}-soft" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000" flood-opacity="0.28"/></filter>
      <filter id="${u}-blur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>
      <filter id="${u}-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>`;
  }

  // Thumbturn (rotates). Drawn around 0,0; a transparent circle keeps the
  // bounding box symmetric so CSS rotation pivots on the centre.
  function thumbturn(u, { len, w, slim }) {
    const r = len / 2;
    const grip = slim
      ? `<rect x="-1" y="${-r + 6}" width="2" height="${r - 16}" rx="1" fill="var(--dlc-metal-light)" opacity=".5"/>`
      : `<path d="M ${-w * 0.22} ${-r + 9} h ${w * 0.44}" stroke="var(--dlc-metal-light)" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
         <path d="M ${-w * 0.22} ${-r + 14} h ${w * 0.44}" stroke="var(--dlc-metal-light)" stroke-width="1.4" stroke-linecap="round" opacity=".4"/>`;
    return `<g filter="url(#${u}-shadow)"><g class="turn">
      <circle r="${r + 2}" fill="none"/>
      <rect x="${-w / 2}" y="${-r}" width="${w}" height="${len}" rx="${w / 2}" fill="url(#${u}-mt)" stroke="var(--dlc-metal-dark)" stroke-width="1"/>
      ${grip}
      <circle r="${w * (slim ? 0.42 : 0.36)}" fill="url(#${u}-mr)" stroke="var(--dlc-metal-dark)" stroke-width="0.8"/>
    </g></g>`;
  }

  // Key cylinder with a keyway that rotates.
  function cylinder(u, R) {
    const p = R - 4;
    return `<circle r="${R}" fill="url(#${u}-mr)" stroke="var(--dlc-metal-dark)" stroke-width="1"/>
      <circle r="${p}" fill="url(#${u}-mi)" stroke="var(--dlc-metal-dark)" stroke-opacity=".6" stroke-width=".8"/>
      <g class="turn"><circle r="${p}" fill="none"/>
        <circle cy="${-p * 0.34}" r="${p * 0.27}" class="keyhole"/>
        <rect x="${-p * 0.11}" y="${-p * 0.36}" width="${p * 0.22}" height="${p * 1.06}" rx="${p * 0.1}" class="keyhole"/>
      </g>`;
  }

  // Arched "Camelot" escutcheon outline.
  function camelotPath(a, b, d) {
    const f = (n) => +n.toFixed(2);
    return `M ${f(-a)} ${f(-b + d)} C ${f(-a * 0.55)} ${f(-b + d * 0.95)} ${f(-a * 0.42)} ${f(-b)} 0 ${f(-b)} C ${f(a * 0.42)} ${f(-b)} ${f(a * 0.55)} ${f(-b + d * 0.95)} ${f(a)} ${f(-b + d)} L ${f(a)} ${f(b - d)} C ${f(a * 0.55)} ${f(b - d * 0.95)} ${f(a * 0.42)} ${f(b)} 0 ${f(b)} C ${f(-a * 0.42)} ${f(b)} ${f(-a * 0.55)} ${f(b - d * 0.95)} ${f(-a)} ${f(b - d)} Z`;
  }

  function escutcheon(u, style, a, b) {
    if (style === "camelot") {
      return `<path d="${camelotPath(a, b, 20)}" fill="url(#${u}-md)" stroke="var(--dlc-metal-dark)" stroke-width="1.2" filter="url(#${u}-soft)"/>
        <path d="${camelotPath(a - 4.5, b - 4.5, 17)}" fill="none" stroke="var(--dlc-metal-light)" stroke-opacity=".55" stroke-width="1.2"/>
        <path d="${camelotPath(a - 8, b - 8, 15)}" fill="none" stroke="var(--dlc-metal-dark)" stroke-opacity=".35" stroke-width=".8"/>`;
    }
    return `<rect x="${-a}" y="${-b}" width="${a * 2}" height="${b * 2}" rx="12" fill="url(#${u}-md)" stroke="var(--dlc-metal-dark)" stroke-width="1.2" filter="url(#${u}-soft)"/>
      <rect x="${-a + 3.5}" y="${-b + 3.5}" width="${a * 2 - 7}" height="${b * 2 - 7}" rx="9.5" fill="none" stroke="var(--dlc-metal-light)" stroke-opacity=".5" stroke-width="1"/>`;
  }

  function outlineFor(style, a, b, pad) {
    if (style === "camelot") return `<path d="${camelotPath(a + pad, b + pad, 22)}"/>`;
    return `<rect x="${-a - pad}" y="${-b - pad}" width="${(a + pad) * 2}" height="${(b + pad) * 2}" rx="${12 + pad}"/>`;
  }

  const ledGlyph = (u, x, y) => `<g class="led" transform="translate(${x} ${y})" filter="url(#${u}-glow)">
      <path class="led-shackle" d="M -2.9 -1.2 V -3.2 A 2.9 2.9 0 0 1 2.9 -3.2 V -1.2" fill="none" stroke-width="1.4"/>
      <rect class="led-body" x="-4.1" y="-1.4" width="8.2" height="6" rx="1.3"/>
    </g>`;

  /** Each renderer draws around the lock centre (0,0) and returns:
   *  body – SVG markup; py – y offset of the bolt axis; outline – ring shape. */
  const RENDERERS = {
    level_lock_pro(u, style, view) {
      if (view === "exterior") {
        return {
          py: 0,
          outline: `<circle r="64"/>`,
          body: `<circle r="58" fill="url(#${u}-mr)" stroke="var(--dlc-metal-dark)" stroke-width="1.2" filter="url(#${u}-soft)"/>
            <circle r="54" fill="none" stroke="var(--dlc-metal-light)" stroke-opacity=".5" stroke-width="1"/>
            <circle r="31" fill="url(#${u}-mi)" stroke="var(--dlc-metal-dark)" stroke-opacity=".5" stroke-width=".8"/>
            ${cylinder(u, 25)}`,
        };
      }
      return {
        py: 0,
        outline: `<circle r="70"/>`,
        body: `<circle r="64" fill="url(#${u}-mr)" stroke="var(--dlc-metal-dark)" stroke-width="1.2" filter="url(#${u}-soft)"/>
          <circle r="60" fill="none" stroke="var(--dlc-metal-light)" stroke-opacity=".55" stroke-width="1"/>
          <circle r="24" fill="url(#${u}-mi)" stroke="var(--dlc-metal-dark)" stroke-opacity=".55" stroke-width=".8"/>
          ${thumbturn(u, { len: 96, w: 15, slim: true })}`,
      };
    },

    schlage_encode_plus(u, style, view) {
      const camelot = style === "camelot";
      const a = camelot ? 45 : 44;
      const b = camelot ? 104 : 100;
      if (view === "interior") {
        const py = 54;
        return {
          py,
          outline: outlineFor(style, a, b, 6),
          body: `${escutcheon(u, style, a, b)}
            <path d="M ${-a + 12} -34 H ${a - 12}" stroke="var(--dlc-metal-dark)" stroke-opacity=".35" stroke-width="1"/>
            <path d="M ${-a + 12} -33 H ${a - 12}" stroke="var(--dlc-metal-light)" stroke-opacity=".35" stroke-width="1"/>
            <g opacity=".55">${[-12, -6, 0, 6, 12].map((x) => `<circle cx="${x}" cy="-62" r="1.5" fill="var(--dlc-metal-dark)"/>`).join("")}</g>
            ${ledGlyph(u, 0, -80)}
            <g transform="translate(0 ${py})">
              <circle r="27" fill="url(#${u}-mi)" stroke="var(--dlc-metal-dark)" stroke-opacity=".5" stroke-width=".8"/>
              ${thumbturn(u, { len: 70, w: 22 })}
            </g>`,
        };
      }
      const py = 74;
      const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]
        .map((n, i) => {
          const x = i === 9 ? 0 : ((i % 3) - 1) * 18;
          const y = i === 9 ? 33 : -38 + Math.floor(i / 3) * 23.5;
          return `<text class="key" style="--i:${i}" x="${x}" y="${y}">${n}</text>`;
        })
        .join("");
      return {
        py,
        outline: outlineFor(style, a, b, 6),
        body: `${escutcheon(u, style, a, b)}
          <rect x="-25" y="-90" width="50" height="20" rx="10" fill="url(#${u}-mv)" stroke="var(--dlc-metal-dark)" stroke-width=".8"/>
          ${ledGlyph(u, 0, -80.5)}
          <rect x="-32" y="-62" width="64" height="110" rx="8" fill="url(#${u}-glass)" stroke="#000" stroke-opacity=".55" stroke-width="1"/>
          <path d="M -30 -46 L -30 -54 Q -30 -60 -24 -60 L 8 -60 Z" fill="#fff" opacity=".08"/>
          <g class="keys">${keys}</g>
          <g transform="translate(0 ${py})">${cylinder(u, 15.5)}</g>`,
      };
    },

    deadbolt(u, style, view) {
      const square = style === "square";
      const rose = square
        ? `<rect x="-54" y="-54" width="108" height="108" rx="14" fill="url(#${u}-md)" stroke="var(--dlc-metal-dark)" stroke-width="1.2" filter="url(#${u}-soft)"/>
           <rect x="-49" y="-49" width="98" height="98" rx="10" fill="none" stroke="var(--dlc-metal-light)" stroke-opacity=".5" stroke-width="1"/>
           <rect x="-43" y="-43" width="86" height="86" rx="8" fill="none" stroke="var(--dlc-metal-dark)" stroke-opacity=".3" stroke-width=".8"/>`
        : `<circle r="56" fill="url(#${u}-mr)" stroke="var(--dlc-metal-dark)" stroke-width="1.2" filter="url(#${u}-soft)"/>
           <circle r="51" fill="none" stroke="var(--dlc-metal-light)" stroke-opacity=".5" stroke-width="1"/>
           <circle r="45" fill="none" stroke="var(--dlc-metal-dark)" stroke-opacity=".3" stroke-width=".8"/>`;
      const outline = square ? `<rect x="-60" y="-60" width="120" height="120" rx="20"/>` : `<circle r="62"/>`;
      if (view === "exterior") {
        return { py: 0, outline, body: `${rose}${cylinder(u, 24)}` };
      }
      return {
        py: 0,
        outline,
        body: `${rose}<circle r="22" fill="url(#${u}-mi)" stroke="var(--dlc-metal-dark)" stroke-opacity=".5" stroke-width=".8"/>
          ${thumbturn(u, { len: 74, w: 22 })}`,
      };
    },
  };

  function doorLayer(u, boltY, width, side) {
    // The bolt is clipped at the door edge so it stays hidden "inside" the
    // door even when door_color is translucent.
    const g = `
      <clipPath id="${u}-boltclip"><rect x="200" y="-400" width="1000" height="1020"/></clipPath>
      <rect class="frame" x="208" y="-400" width="1000" height="1020"/>
      <rect class="frame-edge" x="208" y="-400" width="3" height="1020"/>
      <rect x="212" y="${boltY - 23}" width="18" height="46" rx="3" fill="url(#${u}-mv)" stroke="var(--dlc-metal-dark)" stroke-width=".8"/>
      <rect class="strike-hole" x="215.5" y="${boltY - 9.5}" width="11" height="19" rx="2"/>
      <rect class="door-panel" x="-1000" y="-400" width="1200" height="1020"/>
      <rect class="door-edge" x="195" y="-400" width="5" height="1020"/>
      <g clip-path="url(#${u}-boltclip)"><g class="bolt"><rect x="164" y="${boltY - 7.5}" width="36" height="15" rx="3" fill="url(#${u}-mv)" stroke="var(--dlc-metal-dark)" stroke-width=".8"/></g></g>`;
    return side === "left" ? `<g class="door" transform="translate(${width} 0) scale(-1 1)">${g}</g>` : `<g class="door">${g}</g>`;
  }

  function buildArt(u, r) {
    const renderer = RENDERERS[r.type] || RENDERERS.deadbolt;
    const art = renderer(u, r.style, r.view);
    const width = r.showDoor ? 250 : 208;
    const cx = r.showDoor && r.doorSide === "left" ? width - 104 : 104;
    const boltY = ART_CY + art.py;
    return `<svg class="art" viewBox="0 0 ${width} ${ART_H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      ${svgDefs(u)}
      ${r.showDoor ? doorLayer(u, boltY, width, r.doorSide) : ""}
      <g transform="translate(${cx} ${ART_CY})">
        <circle class="halo" r="80" filter="url(#${u}-blur)"/>
        <g class="shake">
          ${art.body}
          ${r.showIndicator ? `<g class="ring">${art.outline}</g>` : ""}
          <g class="burst">${art.outline}</g>
        </g>
      </g>
    </svg>`;
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
      --dlc-door-color: color-mix(in srgb, var(--dlc-text) 6%, transparent);
      --dlc-frame-color: color-mix(in srgb, var(--dlc-text) 12%, transparent);
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
    .layout-compact .stage { height: var(--dlc-art-size, 60px); width: var(--dlc-art-size, 60px); border-radius: 50%; }
    .stage.no-tap { cursor: default; }
    .stage:focus-visible { box-shadow: 0 0 0 2px var(--primary-color, #03a9f4) inset; }
    .art { height: 100%; width: auto; max-width: none; display: block; overflow: visible; }
    .layout-compact .art { height: 100%; width: 100%; }
    .art text { font-family: var(--ha-font-family-body, Roboto, system-ui, sans-serif); }

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

    /* ---------- illustration ---------- */
    .door-panel { fill: var(--dlc-door-color); }
    .door-edge { fill: color-mix(in srgb, var(--dlc-text) 7%, transparent); }
    .frame { fill: var(--dlc-frame-color); }
    .frame-edge { fill: color-mix(in srgb, var(--dlc-text) 10%, transparent); }
    .strike-hole { fill: color-mix(in srgb, var(--dlc-metal-dark) 55%, #000); }
    .keyhole { fill: color-mix(in srgb, var(--dlc-metal-dark) 45%, #000); }

    .halo {
      fill: var(--dlc-state);
      opacity: .26;
      transition: fill var(--dlc-duration) ease, opacity .5s ease;
    }
    .pose-unknown .halo { opacity: .08; }
    .ring {
      fill: none;
      stroke: var(--dlc-state);
      stroke-width: 2.4;
      opacity: .9;
      transition: stroke var(--dlc-duration) ease, opacity .4s ease;
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
    .burst.go { animation: dlc-burst .95s ease-out; }

    .led-body { fill: var(--dlc-state); transition: fill var(--dlc-duration) ease; }
    .led-shackle { stroke: var(--dlc-state); transition: stroke var(--dlc-duration) ease, transform var(--dlc-duration) var(--dlc-ease); transform-box: fill-box; transform-origin: right bottom; }
    .pose-unlocked .led-shackle, .pose-open .led-shackle, .pose-unlocking .led-shackle, .pose-opening .led-shackle { transform: translateY(-1.3px); }

    .key {
      fill: color-mix(in srgb, var(--dlc-state) 30%, #eaf4ff);
      opacity: .45;
      font-size: 13px;
      font-weight: 500;
      text-anchor: middle;
      dominant-baseline: central;
      transition: fill var(--dlc-duration) ease, opacity .4s ease;
    }
    .keys.flash .key { animation: dlc-keyflash 2.6s ease-out both; animation-delay: calc(var(--i) * 45ms); }
    .pending .key { animation: dlc-keypulse 1.3s ease-in-out infinite; animation-delay: calc(var(--i) * 90ms); }

    .turn {
      transform-box: fill-box;
      transform-origin: center;
      transform: rotate(0deg);
      transition: transform var(--dlc-duration) var(--dlc-ease);
    }
    .pose-locked .turn { transform: rotate(calc(90deg * var(--dlc-dir, 1))); }
    .pose-locking .turn { transform: rotate(calc(58deg * var(--dlc-dir, 1))); }
    .pose-unlocking .turn { transform: rotate(calc(32deg * var(--dlc-dir, 1))); }
    .pose-jammed .turn { transform: rotate(calc(45deg * var(--dlc-dir, 1))); }
    .pose-open .turn, .pose-opening .turn { transform: rotate(calc(-25deg * var(--dlc-dir, 1))); }

    .bolt { transition: transform var(--dlc-duration) var(--dlc-ease); }
    .pose-locked .bolt { transform: translateX(22px); }
    .pose-locking .bolt { transform: translateX(14px); }
    .pose-unlocking .bolt { transform: translateX(8px); }
    .pose-jammed .bolt { transform: translateX(11px); }
    .pose-open .bolt, .pose-opening .bolt { transform: translateX(-6px); }

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

    @keyframes dlc-burst { 0% { opacity: .85; transform: scale(1); } 100% { opacity: 0; transform: scale(1.32); } }
    @keyframes dlc-keyflash { 0% { opacity: .45; } 12% { opacity: 1; } 65% { opacity: 1; } 100% { opacity: .45; } }
    @keyframes dlc-keypulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
    @keyframes dlc-halo { 0%, 100% { opacity: .18; } 50% { opacity: .45; } }
    @keyframes dlc-march { to { stroke-dashoffset: -21; } }
    @keyframes dlc-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3.5px); } 75% { transform: translateX(3.5px); } }
    @keyframes dlc-blink { 0%, 100% { opacity: .9; } 50% { opacity: .25; } }
    @keyframes dlc-imgpulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
    @keyframes dlc-armed { 0%, 100% { border-color: currentColor; } 50% { border-color: transparent; } }

    @media (prefers-reduced-motion: reduce) {
      .pending .halo, .pending .ring, .pending .key, .pose-jammed .shake, .pose-jammed .images,
      .pose-jammed .ring, .btn.armed, .pending .images.pulse .layer:last-child { animation: none; }
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
      this._uid = "dlc" + Math.random().toString(36).slice(2, 9);
      this._pending = null;
      this._armed = null;
      this._error = null;
      this._displayState = null;
      this._sig = null;
      this._buildKey = null;
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
      this._sig = null;
      this._render();
    }

    disconnectedCallback() {
      clearInterval(this._timer);
      clearTimeout(this._pendingTimer);
      clearTimeout(this._armTimer);
      clearTimeout(this._errorTimer);
      clearTimeout(this._holdTimer);
      clearTimeout(this._dblTimer);
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
        doorSide: c.door_side === "left" ? "left" : "right",
        showDoor: c.show_door !== undefined ? !!c.show_door : layout !== "compact",
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

    _palette(r) {
      if (r.finish === "custom" && r.customColor) {
        const c = r.customColor;
        return {
          base: c,
          light: `color-mix(in srgb, ${c} 50%, white)`,
          dark: `color-mix(in srgb, ${c} 50%, black)`,
          detail: `color-mix(in srgb, ${c} 45%, gray)`,
        };
      }
      return FINISHES[r.finish] || FINISHES[LOCK_TYPES[r.type].finish];
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
      const stage = r.hasImages
        ? `<div class="images t-${r.transition}"></div>`
        : buildArt(this._uid, r);
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

      // Theme variables derived from the config.
      const host = this.style;
      const pal = this._palette(r);
      host.setProperty("--dlc-metal-base", pal.base);
      host.setProperty("--dlc-metal-light", pal.light);
      host.setProperty("--dlc-metal-dark", pal.dark);
      host.setProperty("--dlc-metal-detail", pal.detail);
      // Only set inline when configured, so themes / card-mod can override it.
      if (this._config.animation_duration !== undefined && this._config.animation_duration !== "") {
        host.setProperty("--dlc-duration", `${r.duration}ms`);
      } else {
        host.removeProperty("--dlc-duration");
      }
      host.setProperty("--dlc-dir", r.doorSide === "left" ? "-1" : "1");
      host.setProperty("--dlc-art-size", `${r.artSize}px`);
      host.setProperty("--dlc-image-fit", r.imageFit);
      const colorVars = {
        locked_color: "--dlc-locked",
        unlocked_color: "--dlc-unlocked",
        jammed_color: "--dlc-jammed",
        pending_color: "--dlc-pending",
        unavailable_color: "--dlc-unavailable",
        door_color: "--dlc-door-color",
        frame_color: "--dlc-frame-color",
      };
      for (const [k, v] of Object.entries(colorVars)) {
        const col = cssColor(this._config[k]);
        if (col) host.setProperty(v, col);
        else host.removeProperty(v);
      }

      this._bindEvents();
      // Let the first paint happen without transitions, then enable them.
      requestAnimationFrame(() => requestAnimationFrame(() => this._el && this._el.card.classList.remove("no-anim")));
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
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach((t) => stage.addEventListener(t, cancelHold));
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
      if (prev && prev !== raw && !meta.pending) this._celebrate();

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
          this._clearPending();
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
    art_size: "Illustration height (px)",
    show_door: "Show door & bolt",
    door_side: "Door edge (bolt side)",
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
    images: "Use your own pictures instead of the built-in illustration. Enter a URL or a /local/… path (files in config/www). PNG, JPG, SVG, WebP, animated GIF, MP4 and WebM all work. Missing states fall back to the locked/unlocked image.",
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
          {
            name: "",
            type: "grid",
            schema: [
              { name: "show_door", selector: bool },
              {
                name: "door_side",
                selector: select([
                  { value: "right", label: "Right" },
                  { value: "left", label: "Left" },
                ]),
              },
              { name: "show_indicator", selector: bool },
            ],
          },
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
      show_door: layout !== "compact",
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
