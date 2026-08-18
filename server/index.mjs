/**
 * DPC (Protezione Civile) radar playback proxy — tiny Node web service.
 *
 * Deploy as a Render Web Service (start command: `node server/index.mjs`).
 * The static Storm Alert app fetches frames from here because DPC serves
 * historical radar frames only as raw GeoTIFFs behind an S3 bucket with CORS
 * disabled — a browser can neither fetch the bytes nor render the projection.
 *
 * Endpoints:
 *   GET /healthz                              → "ok"
 *   GET /dpc/frames?product=VMI&hours=2       → { product, stepMinutes, latest,
 *                                                  frames: epoch-ms[], bounds }
 *   GET /dpc/frame?product=VMI&time=<epoch-ms> → colorized PNG
 *
 * Products: VMI, SRI, SRT1, CUM3..24, IR_108, plus VIL, ETM, POH, CAPPI_1..10.
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

async function computeBounds(raw) {
  const tiff = await fromArrayBuffer(raw);
  const img = await tiff.getImage();
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  const sw = toWgs.forward([minX, minY]);
  const ne = toWgs.forward([maxX, maxY]);
  return { south: sw[1], west: sw[0], north: ne[1], east: ne[0] };
}

// ---------------------------------------------------------------------------
// Rendering — decode GeoTIFF, colorize, encode half-resolution PNG
// (1200×1400 → 600×700, plenty for the national view, 4× cheaper).
// ---------------------------------------------------------------------------
function scaleForProduct(product) {
  if (product === "VIL") return (v) => colorForValue(v, VIL_STOPS);
  if (product === "ETM") return (v) => colorForValue(v, ETM_STOPS);
  if (product === "POH") return (v) => colorForValue(v, POH_STOPS);
  return (v) => colorForValue(v, RAIN_STOPS); // VMI, SRI, SRT1, CUM*, CAPPI*
}

async function renderPng(raw, product) {
  const tiff = await fromArrayBuffer(raw);
  const img = await tiff.getImage();
  const w = img.getWidth();
  const h = img.getHeight();
  const rasters = await img.readRasters();
  const data = rasters[0];

  // IR satellite (IR_108, brightness temperature K): classic grayscale,
  // cold/high cloud tops → white.
  if (product === "IR_108") {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const span = max - min || 1;
    return renderRawPng(data, w, h, (v) => {
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
      const g = Math.round(255 * (1 - (v - min) / span));
      return [g, g, g];
    });
  }

  const scale = scaleForProduct(product);
  return renderRawPng(data, w, h, scale);
}

function renderRawPng(data, w, h, scale) {
  const sw = Math.round(w / 2);
  const sh = Math.round(h / 2);
  const png = new PNG({ width: sw, height: sh });
  for (let y = 0; y < sh; y++) {
    const sy = Math.min(h - 1, y * 2);
    const row = sy * w;
    for (let x = 0; x < sw; x++) {
      const v = data[row + Math.min(w - 1, x * 2)];
      const c = scale(v);
      if (!c) continue;
      const o = (y * sw + x) * 4;
      png.data[o] = c[0];
      png.data[o + 1] = c[1];
      png.data[o + 2] = c[2];
      png.data[o + 3] = 255;
    }
  }
  return PNG.sync.write(png);
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
// Caches (frames list 90s, PNG 10 min, bounds 10 min) with a size cap so a
// long-lived web service never grows without bound.
// ---------------------------------------------------------------------------
const frameListCache = new Map();
const pngCache = new Map();
const boundsCache = new Map();

function cacheSet(map, key, at, value) {
  if (map.size > 500) map.clear();
  map.set(key, { at, value });
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

  // Bounds come from the actual raster (same national grid for all products).
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

  const s3 = await downloadUrl(product, time);
  if (!s3) {
    return { status: 404, json: { error: `Frame not found for ${product} @ ${time}` } };
  }

  const raw = await (await fetch(s3)).arrayBuffer();
  const bytes = await renderPng(raw, product);
  cacheSet(pngCache, key, Date.now(), bytes);
  return { status: 200, png: bytes };
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
    } else if (url.pathname === "/dpc/frame") {
      result = await handleFrame(url);
    } else {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    if (result.json) {
      res.writeHead(result.status, {
        "content-type": "application/json",
        "cache-control": result.status === 200 ? "no-store" : "no-store",
      });
      res.end(JSON.stringify(result.json));
    } else if (result.png) {
      res.writeHead(result.status, {
        "content-type": "image/png",
        "cache-control": "public, max-age=300",
      });
      res.end(result.png);
    } else {
      res.writeHead(result.status, { "content-type": "application/json" });
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
