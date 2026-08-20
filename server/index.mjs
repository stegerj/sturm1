/**
 * DPC (Protezione Civile) radar playback proxy — tiny Node web service.
 *
 * Deploy as a Render Web Service (start command: `node server/index.mjs`).
 * The static Storm Alert app fetches frames from here because DPC serves
 * historical radar frames only as raw GeoTIFFs behind an S3 bucket with CORS
 * disabled — a browser can neither fetch the bytes nor render the projection.
 *
 * Endpoints:
 *   GET /healthz                                        → "ok"
 *   GET /dpc/frames?product=VMI&hours=5                 → { product, stepMinutes,
 *                                                            latest, frames, bounds }
 *   GET /dpc/tile?product=VMI&time=<ms>&z=<z>&x=<x>&y=<y> → 256×256 colorized tile
 *   GET /dpc/point?product=VMI&time=<ms>&lat=<lat>&lon=<lon> → value at location
 *   GET /dpc/frame?product=VMI&time=<ms>                → full colorized PNG (fallback)
 *   GET /dpc/cells?product=VMI&time=<ms>&lat=<lat>&lon=<lon>&radiusKm=150&minMmH=1
 *                                                     → connected rain cells (proximity alarm)
 *   GET /dpc/alerts/latest[?refresh=1]                 → current bulletin id + source diagnostics
 *
 * Products: VMI, SRI, SRT1, CUM3..24, IR_108, plus VIL, ETM, POH, CAPPI_1..10.
 * History requests are capped at 6 hours; the app currently uses 5 hours.
 */
import http from "node:http";
import { fromArrayBuffer } from "geotiff";
import pngjs from "pngjs";
import proj4 from "proj4";

const { PNG } = pngjs;

const PORT = Number(process.env.PORT || 10000);

const DPC_API = "https://radar-api.protezionecivile.it";
// DPC requires an `origin` header on every REST request.
const DPC_HEADERS = { origin: "https://radar.protezionecivile.it" };

const STEP_MINUTES = {
  VMI: 5,
  SRI: 5,
  SRT1: 5,
  IR_108: 15,
  TEMP: 60,
  CUM3: 30,
  CUM6: 30,
  CUM12: 30,
  CUM24: 30,
  CAPPI_1: 5, CAPPI_2: 5, CAPPI_3: 5, CAPPI_4: 5, CAPPI_5: 5,
  CAPPI_6: 5, CAPPI_7: 5, CAPPI_8: 5, CAPPI_9: 5, CAPPI_10: 5,
  VIL: 5,
  ETM: 5,
  POH: 5,
};

const UNITS = {
  VMI: "mm/h", SRI: "mm/h", SRT1: "mm", CUM3: "mm", CUM6: "mm",
  CUM12: "mm", CUM24: "mm", IR_108: "K", TEMP: "°C",
  VIL: "kg/m²", ETM: "km", POH: "%",
};

/**
 * DPC-style rain scale (mm/h or mm accumulation):
 * blue → green → yellow → orange → red → magenta → white.
 * Values below 0.2 mm/h are rendered transparent (radar noise floor).
 */
const RAIN_STOPS = [
  [0.2, [159, 213, 240]],
  [1, [92, 175, 222]],
  [2, [43, 122, 205]],
  [5, [38, 160, 84]],
  [10, [240, 224, 48]],
  [15, [240, 172, 32]],
  [20, [240, 108, 30]],
  [30, [228, 52, 52]],
  [40, [192, 32, 44]],
  [50, [140, 42, 168]],
  [75, [212, 64, 202]],
  [100, [255, 255, 255]],
];

/** Vertically Integrated Liquid (kg/m²) — severe storm core intensity. */
const VIL_STOPS = [
  [0.5, [120, 200, 120]],
  [2, [60, 180, 60]],
  [5, [240, 230, 40]],
  [10, [240, 150, 30]],
  [20, [230, 60, 40]],
  [35, [200, 30, 90]],
  [50, [150, 30, 180]],
];

/** Echo Top Maximum (km) — storm top height. */
const ETM_STOPS = [
  [3, [90, 170, 230]],
  [5, [60, 200, 120]],
  [8, [240, 220, 40]],
  [10, [240, 140, 30]],
  [12, [230, 60, 40]],
  [14, [190, 40, 160]],
  [16, [255, 255, 255]],
];

/** Probability of Hail (%) — 0-100. */
const POH_STOPS = [
  [10, [150, 210, 240]],
  [30, [90, 160, 230]],
  [50, [240, 230, 40]],
  [70, [240, 120, 30]],
  [85, [230, 50, 50]],
  [100, [190, 40, 160]],
];

function colorForValue(v, stops) {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  const first = stops[0];
  if (v < first[0]) return null;
  const last = stops[stops.length - 1];
  if (v >= last[0]) return last[1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [lo, cLo] = stops[i];
    const [hi, cHi] = stops[i + 1];
    if (v >= lo && v < hi) {
      const t = (v - lo) / (hi - lo);
      return [
        Math.round(cLo[0] + (cHi[0] - cLo[0]) * t),
        Math.round(cLo[1] + (cHi[1] - cLo[1]) * t),
        Math.round(cLo[2] + (cHi[2] - cLo[2]) * t),
      ];
    }
  }
  return last[1];
}

// ---------------------------------------------------------------------------
// Projection — DPC national grid is a custom Transverse Mercator
// (origin 42°N / 12.5°E, k=0.9996, WGS84). Verified live against the raster:
// it spans lon 5.92–20.48, lat 35.06–47.57 (Italy + margins).
// ---------------------------------------------------------------------------
const DPC_PROJ =
  "+proj=tmerc +lat_0=42 +lon_0=12.5 +k=0.9996 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs";
proj4.defs("DPC-RADAR", DPC_PROJ);
const toWgs = proj4("DPC-RADAR", "WGS84");
const toDpc = proj4("WGS84", "DPC-RADAR");

// ---------------------------------------------------------------------------
// Caches (frames list 90s, PNG tiles 10 min, bounds 10 min, decoded rasters LRU).
// ---------------------------------------------------------------------------
const frameListCache = new Map();
const pngCache = new Map();
const tileCache = new Map();
const boundsCache = new Map();
const cellsCache = new Map();
const tiffCache = new Map(); // product:time -> { img, w, h, origin, res }

function cacheSet(map, key, at, value, cap = 500) {
  if (map.size > cap) map.clear();
  map.set(key, { at, value });
}

async function computeBounds(raw) {
  const tiff = await fromArrayBuffer(raw);
  const img = await tiff.getImage();
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  const sw = toWgs.forward([minX, minY]);
  const ne = toWgs.forward([maxX, maxY]);
  return { south: sw[1], west: sw[0], north: ne[1], east: ne[0] };
}

// ---------------------------------------------------------------------------
// Raster access — decode once per (product, time), keep the decoded image in
// memory so windowed tile reads come from the in-memory buffer, not S3.
// ---------------------------------------------------------------------------
async function getRaster(product, time) {
  const key = `${product}:${time}`;
  const hit = tiffCache.get(key);
  if (hit) return hit.value;
  const s3 = await downloadUrl(product, time);
  if (!s3) return null;
  const raw = await (await fetch(s3)).arrayBuffer();
  const tiff = await fromArrayBuffer(raw);
  const img = await tiff.getImage();
  const entry = {
    img,
    w: img.getWidth(),
    h: img.getHeight(),
    origin: img.getOrigin(),   // [crsX, crsY] of the top-left pixel
    res: img.getResolution(),  // [rx, ry], ry negative for north-up rasters
  };
  cacheSet(tiffCache, key, Date.now(), entry, 8);
  return entry;
}

function pixelToCrs(entry, px, py) {
  const rx = entry.res[0];
  const ry = Math.abs(entry.res[1]);
  return [
    entry.origin[0] + px * rx,
    entry.origin[1] - py * ry,
  ];
}

function crsToPixel(entry, crsX, crsY) {
  const rx = entry.res[0];
  const ry = Math.abs(entry.res[1]);
  return [
    (crsX - entry.origin[0]) / rx,
    (entry.origin[1] - crsY) / ry,
  ];
}

// ---------------------------------------------------------------------------
// Rendering — colorize a raster band into a PNG.
// ---------------------------------------------------------------------------
function scaleForProduct(product) {
  if (product === "VIL") return (v) => colorForValue(v, VIL_STOPS);
  if (product === "ETM") return (v) => colorForValue(v, ETM_STOPS);
  if (product === "POH") return (v) => colorForValue(v, POH_STOPS);
  return (v) => colorForValue(v, RAIN_STOPS); // VMI, SRI, SRT1, CUM*, CAPPI*
}

function colorizeBand(band, width, height, scale) {
  const png = new PNG({ width, height });
  for (let i = 0; i < band.length; i++) {
    const c = scale(band[i]);
    if (!c) continue;
    const o = i * 4;
    png.data[o] = c[0];
    png.data[o + 1] = c[1];
    png.data[o + 2] = c[2];
    png.data[o + 3] = 255;
  }
  return PNG.sync.write(png);
}

async function irColorize(band, width, height) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < band.length; i++) {
    const v = band[i];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  const png = new PNG({ width, height });
  for (let i = 0; i < band.length; i++) {
    const v = band[i];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue;
    const g = Math.round(255 * (1 - (v - min) / span));
    const o = i * 4;
    png.data[o] = g;
    png.data[o + 1] = g;
    png.data[o + 2] = g;
    png.data[o + 3] = 255;
  }
  return PNG.sync.write(png);
}

async function renderPng(raw, product) {
  const tiff = await fromArrayBuffer(raw);
  const img = await tiff.getImage();
  const w = img.getWidth();
  const h = img.getHeight();
  const rasters = await img.readRasters();
  const data = rasters[0];
  if (product === "IR_108") return irColorize(data, w, h);
  return colorizeBand(data, w, h, scaleForProduct(product));
}

/**
 * Full-frame Web-Mercator reprojection. The client's image-overlay fallback
 * (/dpc/frame) stretches this PNG over WGS84 bounds, so the image must be
 * Mercator-aligned — the raw TM raster would visibly skew Italy. Per-tile
 * rendering already reprojects; this is the whole-frame equivalent for
 * proxies that don't serve the tile route yet.
 */
async function renderMercatorFrame(entry, product) {
  const { w, h } = entry;
  const [x0, y0] = entry.origin;
  const rx = entry.res[0];
  const ry = Math.abs(entry.res[1]);

  // WGS84 bounds of the raster (TM corners -> WGS84; y0 is the top row).
  const sw = toWgs.forward([x0, y0 - h * ry]);
  const ne = toWgs.forward([x0 + w * rx, y0]);
  const west = sw[0];
  const east = ne[0];
  const south = sw[1];
  const north = ne[1];

  const toMerc = (phiDeg) => {
    const phi = (phiDeg * Math.PI) / 180;
    return Math.log(Math.tan(Math.PI / 4 + phi / 2));
  };
  const fromMerc = (yM) => (2 * Math.atan(Math.exp(yM)) - Math.PI / 2) * (180 / Math.PI);

  const OUT_W = 720;
  const northY = toMerc(north);
  const southY = toMerc(south);
  const lonSpanRad = ((east - west) * Math.PI) / 180;
  const OUT_H = Math.max(160, Math.round(((northY - southY) / lonSpanRad) * OUT_W));

  const rasters = await entry.img.readRasters();
  const band = rasters[0];
  const out = new PNG({ width: OUT_W, height: OUT_H });
  const sample = (px, py) => {
    const lat = fromMerc(southY + ((northY - southY) * py) / OUT_H);
    const lon = west + ((east - west) * px) / OUT_W;
    const [crsX, crsY] = toDpc.forward([lon, lat]);
    const sx = Math.round((crsX - x0) / rx);
    const sy = Math.round((y0 - crsY) / ry);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
    const v = band[sy * w + sx];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  if (product === "IR_108") {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < band.length; i++) {
      const v = band[i];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    const span = max - min || 1;
    for (let py = 0; py < OUT_H; py++) {
      for (let px = 0; px < OUT_W; px++) {
        const v = sample(px, py);
        if (v == null || v <= 0) continue;
        const g = Math.round(255 * (1 - (v - min) / span));
        const o = (py * OUT_W + px) * 4;
        out.data[o] = g;
        out.data[o + 1] = g;
        out.data[o + 2] = g;
        out.data[o + 3] = 255;
      }
    }
  } else {
    const scale = scaleForProduct(product);
    for (let py = 0; py < OUT_H; py++) {
      for (let px = 0; px < OUT_W; px++) {
        const v = sample(px, py);
        const c = v == null ? null : scale(v);
        if (!c) continue;
        const o = (py * OUT_W + px) * 4;
        out.data[o] = c[0];
        out.data[o + 1] = c[1];
        out.data[o + 2] = c[2];
        out.data[o + 3] = 255;
      }
    }
  }

  return PNG.sync.write(out);
}

// ---------------------------------------------------------------------------
// Web-Mercator tile math (slippy map)
// ---------------------------------------------------------------------------
function tileToLonLat(z, x, y) {
  const n = 2 ** z;
  const lonW = (x / n) * 360 - 180;
  const lonE = ((x + 1) / n) * 360 - 180;
  const latN = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * (180 / Math.PI);
  const latS = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * (180 / Math.PI);
  return { lonW, lonE, latN, latS };
}

// One 256×256 tile of the DPC raster, reprojected into Web Mercator.
async function renderTile(entry, product, z, x, y) {
  const { lonW, lonE, latN, latS } = tileToLonLat(z, x, y);
  const tl = toDpc.forward([lonW, latN]);
  const br = toDpc.forward([lonE, latS]);
  const [px0, py0] = crsToPixel(entry, tl[0], tl[1]);
  const [px1, py1] = crsToPixel(entry, br[0], br[1]);
  const { w, h } = entry;

  // Whole tile outside the raster → transparent (client shows errorTileUrl).
  if (px1 <= 0 || py1 <= 0 || px0 >= w || py0 >= h) return null;

  // Sub-rect of the tile (in tile pixels) that overlaps the raster.
  const tx0 = Math.max(0, ((0 - px0) * 256) / (px1 - px0));
  const ty0 = Math.max(0, ((0 - py0) * 256) / (py1 - py0));
  const tx1 = Math.min(256, ((w - px0) * 256) / (px1 - px0));
  const ty1 = Math.min(256, ((h - py0) * 256) / (py1 - py0));

  const winX0 = Math.max(0, Math.floor(px0 + (tx0 * (px1 - px0)) / 256));
  const winY0 = Math.max(0, Math.floor(py0 + (ty0 * (py1 - py0)) / 256));
  const winX1 = Math.min(w, Math.ceil(px0 + (tx1 * (px1 - px0)) / 256));
  const winY1 = Math.min(h, Math.ceil(py0 + (ty1 * (py1 - py0)) / 256));
  const readW = Math.max(1, winX1 - winX0);
  const readH = Math.max(1, winY1 - winY0);

  const rasters = await entry.img.readRasters({
    window: [winX0, winY0, winX1, winY1],
    width: Math.round(tx1 - tx0) || 1,
    height: Math.round(ty1 - ty0) || 1,
  });
  const band = rasters[0];

  // Place the sampled region into the 256×256 output at its tile offset.
  const out = new PNG({ width: 256, height: 256 });
  const outW = Math.round(tx1 - tx0);
  const outH = Math.round(ty1 - ty0);
  const offX = Math.round(tx0);
  const offY = Math.round(ty0);

  if (product === "IR_108") {
    // Grayscale: cold/high cloud tops → white.
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < band.length; i++) {
      const v = band[i];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    const span = max - min || 1;
    for (let sy = 0; sy < outH; sy++) {
      const oy = offY + sy;
      if (oy < 0 || oy >= 256) continue;
      for (let sx = 0; sx < outW; sx++) {
        const ox = offX + sx;
        if (ox < 0 || ox >= 256) continue;
        const v = band[sy * outW + sx];
        if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue;
        const g = Math.round(255 * (1 - (v - min) / span));
        const o = (oy * 256 + ox) * 4;
        out.data[o] = g;
        out.data[o + 1] = g;
        out.data[o + 2] = g;
        out.data[o + 3] = 255;
      }
    }
  } else {
    const scale = scaleForProduct(product);
    for (let sy = 0; sy < outH; sy++) {
      const oy = offY + sy;
      if (oy < 0 || oy >= 256) continue;
      for (let sx = 0; sx < outW; sx++) {
        const ox = offX + sx;
        if (ox < 0 || ox >= 256) continue;
        const c = scale(band[sy * outW + sx]);
        if (!c) continue;
        const o = (oy * 256 + ox) * 4;
        out.data[o] = c[0];
        out.data[o + 1] = c[1];
        out.data[o + 2] = c[2];
        out.data[o + 3] = 255;
      }
    }
  }
  return PNG.sync.write(out);
}

// ---------------------------------------------------------------------------
// DPC REST helpers
// ---------------------------------------------------------------------------
async function findLastProduct(product) {
  const res = await fetch(`${DPC_API}/findLastProductByType?type=${product}`, {
    headers: DPC_HEADERS,
  });
  if (!res.ok) return null;
  const json = await res.json();
  const time = json.lastProducts?.[0]?.time;
  return typeof time === "number" ? time : null;
}

async function downloadUrl(product, time) {
  const res = await fetch(`${DPC_API}/downloadProduct`, {
    method: "POST",
    headers: { "content-type": "application/json", ...DPC_HEADERS },
    body: JSON.stringify({ productType: product, productDate: time }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return typeof json.url === "string" ? json.url : null;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
async function handleFrames(url) {
  const product = (url.searchParams.get("product") ?? "VMI").toUpperCase();
  const step = STEP_MINUTES[product] ?? 5;
  const hours = Math.min(6, Math.max(1, Number(url.searchParams.get("hours") ?? 2) || 2));
  const cacheKey = `${product}:${hours}`;

  const cached = frameListCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 90_000) {
    return { status: 200, json: cached.value };
  }

  const latest = await findLastProduct(product);
  if (!latest) {
    return { status: 404, json: { error: `No recent '${product}' product available` } };
  }

  const stepMs = step * 60_000;
  const start = latest - hours * 3_600_000;
  const candidates = [];
  for (let t = latest; t >= start; t -= stepMs) candidates.push(t);

  // Probe availability in parallel (DPC rounds timestamps down to the step).
  const results = await Promise.allSettled(
    candidates.map(async (t) => ({ t, ok: (await downloadUrl(product, t)) !== null }))
  );
  const times = results
    .filter((r) => r.status === "fulfilled")
    .filter((r) => r.value.ok)
    .map((r) => r.value.t)
    .sort((a, b) => a - b);

  const body = { product, stepMinutes: step, latest, hours, frames: times, bounds: null };

  if (times.length > 0) {
    const latestT = times[times.length - 1];
    const bKey = `${product}:${latestT}`;
    let entry = boundsCache.get(bKey);
    if (!entry || Date.now() - entry.at > 600_000) {
      const s3 = await downloadUrl(product, latestT);
      if (s3) {
        try {
          const raw = await (await fetch(s3)).arrayBuffer();
          const bounds = await computeBounds(raw);
          cacheSet(boundsCache, bKey, Date.now(), bounds);
          entry = { at: Date.now(), value: bounds };
        } catch {
          // keep null — client falls back to its own bounds
        }
      }
    }
    body.bounds = entry?.value ?? null;
  }

  cacheSet(frameListCache, cacheKey, Date.now(), body);
  return { status: 200, json: body };
}

async function handleTile(url) {
  const product = (url.searchParams.get("product") ?? "VMI").toUpperCase();
  const time = Number(url.searchParams.get("time"));
  const z = Number(url.searchParams.get("z"));
  const x = Number(url.searchParams.get("x"));
  const y = Number(url.searchParams.get("y"));
  if (![time, z, x, y].every((v) => Number.isInteger(v) && v >= 0)) {
    return { status: 400, json: { error: "time/z/x/y must be non-negative integers" } };
  }
  if (z > 19 || x >= 2 ** z || y >= 2 ** z) {
    return { status: 400, json: { error: "tile coordinates out of range" } };
  }

  const cacheKey = `${product}:${time}:${z}:${x}:${y}`;
  const hit = tileCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 600_000) {
    return { status: 200, png: hit.value };
  }

  const entry = await getRaster(product, time);
  if (!entry) return { status: 404, json: { error: "frame not found" } };

  const png = await renderTile(entry, product, z, x, y);
  if (!png) return { status: 404, json: { error: "tile outside coverage" } };

  cacheSet(tileCache, cacheKey, Date.now(), png, 2000);
  return { status: 200, png };
}

async function handlePoint(url) {
  const product = (url.searchParams.get("product") ?? "VMI").toUpperCase();
  const time = Number(url.searchParams.get("time"));
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(time) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { status: 400, json: { error: "time/lat/lon required" } };
  }

  const entry = await getRaster(product, time);
  if (!entry) return { status: 404, json: { error: "frame not found" } };

  const [px, py] = crsToPixel(entry, ...toDpc.forward([lon, lat]));
  const { w, h } = entry;
  if (px < 0 || py < 0 || px >= w || py >= h) {
    return { status: 200, json: { product, time, value: null, reason: "outside-coverage", unit: UNITS[product] ?? "" } };
  }

  // Nearest-neighbor sample (radar cells are discontinuous; bilinear would
  // smear NoData across sparse rain cells and report false nulls).
  const fx = Math.round(px);
  const fy = Math.round(py);
  const winX = Math.max(0, Math.min(w - 1, fx));
  const winY = Math.max(0, Math.min(h - 1, fy));
  const rasters = await entry.img.readRasters({
    window: [winX, winY, winX + 1, winY + 1],
  });
  const v = rasters[0][0];
  const value = typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

  return {
    status: 200,
    json: {
      product,
      time,
      value: value === null ? null : Math.round(value * 100) / 100,
      reason: value === null ? "no-data" : "ok",
      unit: UNITS[product] ?? "",
    },
  };
}

async function handleFrame(url) {
  const product = (url.searchParams.get("product") ?? "VMI").toUpperCase();
  const time = Number(url.searchParams.get("time"));
  if (!Number.isFinite(time) || time <= 0) {
    return { status: 400, json: { error: "Missing or invalid 'time' (epoch ms)" } };
  }

  const key = `${product}:${time}`;
  const hit = pngCache.get(key);
  if (hit && Date.now() - hit.at < 600_000) {
    return { status: 200, png: hit.value };
  }

  const entry = await getRaster(product, time);
  if (!entry) return { status: 404, json: { error: `Frame not found for ${product} @ ${time}` } };

  const bytes = await renderMercatorFrame(entry, product);
  cacheSet(pngCache, key, Date.now(), bytes);
  return { status: 200, png: bytes };
}

// ---------------------------------------------------------------------------
// DPC Allerte — official 'Bollettino di Criticità' published by Protezione
// Civile as JSON + TopoJSON on their GitHub org (pcm-dpc). The mappe portal
// embeds the id of the current bulletin; resolve it here so the browser never
// needs CORS to DPC (and GitHub rate limits stay server-side).
// ---------------------------------------------------------------------------
const ALERT_REPO = "pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica";
const MAPPE_BOLLETTINO =
  "https://mappe.protezionecivile.gov.it/page-data/it/mappe-rischi/bollettino-di-criticita/page-data.json";
const latestBulletinCache = { at: 0, value: null };

async function resolvePortalBulletinId() {
  try {
    const res = await fetch(MAPPE_BOLLETTINO, {
      headers: { accept: "application/json", "cache-control": "no-cache" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.match(/"field_data_bollettino"\s*:\s*"(\d{8}_\d{4})"/)?.[1] ?? null;
  } catch {
    return null;
  }
}

async function resolveArchiveBulletinId() {
  try {
    const res = await fetch(`https://api.github.com/repos/${ALERT_REPO}/git/trees/master?recursive=1`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "storm-alert-proxy",
        "cache-control": "no-cache",
      },
    });
    if (!res.ok) return null;
    const tree = await res.json();
    return (tree.tree || [])
      .map((entry) => /^files\/(\d{8}_\d{4})\.json$/.exec(entry.path || "")?.[1] ?? null)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  } catch {
    return null;
  }
}

async function handleAlertsLatest(url) {
  const forceRefresh = url.searchParams.get("refresh") === "1";
  if (!forceRefresh && latestBulletinCache.value && Date.now() - latestBulletinCache.at < 5 * 60_000) {
    return { status: 200, json: latestBulletinCache.value };
  }

  // Compare both authoritative DPC publication paths. The mappe portal can be
  // CDN-stale for a few minutes after an update, while the official archive is
  // updated independently. Taking the newest id prevents yesterday's bulletin.
  const [portalId, archiveId] = await Promise.all([
    resolvePortalBulletinId(),
    resolveArchiveBulletinId(),
  ]);
  const ids = [portalId, archiveId].filter(Boolean).sort();
  const id = ids.at(-1) ?? null;
  if (!id) return { status: 502, json: { error: "Could not resolve the latest DPC bulletin" } };

  const value = {
    id,
    portalId,
    archiveId,
    source: "DPC mappe portal + official pcm-dpc archive",
    checkedAt: new Date().toISOString(),
    endpoint: "/dpc/alerts/latest",
  };
  latestBulletinCache.at = Date.now();
  latestBulletinCache.value = value;
  return { status: 200, json: value };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const f1 = (lat1 * Math.PI) / 180;
  const f2 = (lat2 * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ---------------------------------------------------------------------------
// Rain-cell detection — scan a window of the raster around a location and
// return connected components above an intensity threshold (proximity alarm).
// ---------------------------------------------------------------------------
async function handleCells(url) {
  const product = (url.searchParams.get("product") ?? "VMI").toUpperCase();
  const time = Number(url.searchParams.get("time"));
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const radiusKm = Math.min(300, Math.max(10, Number(url.searchParams.get("radiusKm") ?? 150) || 150));
  const minMmH = Math.max(0.1, Number(url.searchParams.get("minMmH") ?? 1) || 1);
  if (!Number.isFinite(time) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { status: 400, json: { error: "time/lat/lon required" } };
  }

  const cacheKey = `${product}:${time}:${lat.toFixed(3)}:${lon.toFixed(3)}:${radiusKm}:${minMmH}`;
  const cached = cellsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 90_000) {
    return { status: 200, json: cached.value };
  }

  const entry = await getRaster(product, time);
  if (!entry) return { status: 404, json: { error: "frame not found" } };

  const [cx, cy] = crsToPixel(entry, ...toDpc.forward([lon, lat]));
  const { w, h } = entry;
  const empty = { product, time, radiusKm, minMmH, cells: [] };
  if (cx < 0 || cy < 0 || cx >= w || cy >= h) {
    cacheSet(cellsCache, cacheKey, Date.now(), empty);
    return { status: 200, json: empty };
  }

  const res = Math.min(entry.res[0], Math.abs(entry.res[1]));
  const halfPx = Math.max(4, Math.ceil((radiusKm * 1000) / res));
  const x0 = Math.max(0, Math.floor(cx - halfPx));
  const y0 = Math.max(0, Math.floor(cy - halfPx));
  const x1 = Math.min(w, Math.ceil(cx + halfPx));
  const y1 = Math.min(h, Math.ceil(cy + halfPx));
  const winW = x1 - x0;
  const winH = y1 - y0;
  if (winW <= 0 || winH <= 0) {
    cacheSet(cellsCache, cacheKey, Date.now(), empty);
    return { status: 200, json: empty };
  }

  const rasters = await entry.img.readRasters({ window: [x0, y0, x1, y1] });
  const band = rasters[0];
  const visited = new Uint8Array(winW * winH);
  const cells = [];

  for (let py = 0; py < winH; py++) {
    for (let px = 0; px < winW; px++) {
      const idx = py * winW + px;
      if (visited[idx]) continue;
      const v = band[idx];
      if (typeof v !== "number" || !Number.isFinite(v) || v < minMmH) {
        visited[idx] = 1;
        continue;
      }

      // Flood-fill this component (8-connectivity).
      const stack = [[px, py]];
      visited[idx] = 1;
      let sum = 0;
      let max = v;
      let n = 0;
      let sx = 0;
      let sy = 0;
      while (stack.length) {
        const [qx, qy] = stack.pop();
        const qi = qy * winW + qx;
        const qv = band[qi];
        sum += qv;
        n++;
        if (qv > max) max = qv;
        sx += qx;
        sy += qy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = qx + dx;
            const ny = qy + dy;
            if (nx < 0 || ny < 0 || nx >= winW || ny >= winH) continue;
            const ni = ny * winW + nx;
            if (visited[ni]) continue;
            const nv = band[ni];
            visited[ni] = 1;
            if (typeof nv === "number" && Number.isFinite(nv) && nv >= minMmH) {
              stack.push([nx, ny]);
            }
          }
        }
      }
      if (n < 3) continue; // drop single-pixel speckle

      const [clon, clat] = toWgs.forward(pixelToCrs(entry, x0 + sx / n, y0 + sy / n));
      const d = haversineKm(lat, lon, clat, clon);
      cells.push({
        lat: clat,
        lon: clon,
        maxMmH: Math.round(max * 100) / 100,
        meanMmH: Math.round((sum / n) * 100) / 100,
        areaPx: n,
        areaKm2: Math.round((n * res * res) / 1e6 * 10) / 10,
        distanceKm: Math.round(d * 10) / 10,
        bearingDeg: Math.round(bearingDeg(lat, lon, clat, clon)),
      });
    }
  }

  cells.sort((a, b) => b.maxMmH - a.maxMmH);
  const value = { product, time, radiusKm, minMmH, cells: cells.slice(0, 12) };
  cacheSet(cellsCache, cacheKey, Date.now(), value);
  return { status: 200, json: value };
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    res.setHeader("access-control-allow-origin", "*");

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    let result;
    if (url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    } else if (url.pathname === "/dpc/frames") {
      result = await handleFrames(url);
    } else if (url.pathname === "/dpc/tile") {
      result = await handleTile(url);
    } else if (url.pathname === "/dpc/point") {
      result = await handlePoint(url);
    } else if (url.pathname === "/dpc/cells") {
      result = await handleCells(url);
    } else if (url.pathname === "/dpc/alerts/latest") {
      result = await handleAlertsLatest(url);
    } else if (url.pathname === "/dpc/frame") {
      result = await handleFrame(url);
    } else {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    if (result.png) {
      res.writeHead(result.status, {
        "content-type": "image/png",
        "cache-control": "public, max-age=300",
      });
      res.end(result.png);
    } else {
      res.writeHead(result.status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(result.json ?? { error: "Unknown error" }));
    }
    console.log(`${req.method} ${url.pathname} → ${result.status} (${Date.now() - started}ms)`);
  } catch (err) {
    console.error("proxy error:", err);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Internal proxy error" }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`DPC radar playback proxy listening on 0.0.0.0:${PORT}`);
});
