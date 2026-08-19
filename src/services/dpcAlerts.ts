import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, Feature } from 'geojson';

/**
 * DPC Allerte — the official "Bollettino di Criticità" published by Protezione
 * Civile as JSON + TopoJSON on their GitHub org (pcm-dpc). The bulletin is
 * published daily (~13:00 CET) with per-"zona di allerta" polygons and three
 * risk types: idrogeologico, idraulico, temporali (level = nessuna/gialla/
 * arancione/rossa).
 *
 * raw.githubusercontent.com and api.github.com both send
 * `Access-Control-Allow-Origin: *`, so everything is fetchable client-side.
 * The only piece routed through the Render proxy is the "latest bulletin id"
 * lookup (the DPC mappe portal embeds it but sends no CORS headers).
 */

export const DPC_BULLETIN_REPO = 'pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica';
export const DPC_BULLETIN_RAW = `https://raw.githubusercontent.com/${DPC_BULLETIN_REPO}/master/files`;

export type DpcAlertLevel = 'none' | 'yellow' | 'orange' | 'red';

export interface DpcRiskInfo {
  level: DpcAlertLevel;
  label: string; // e.g. "Ordinaria / ALLERTA GIALLA"
}

export interface DpcZoneProperties {
  zoneName: string;
  municipalities: string[];
  combined: string;
  risks: {
    idrogeologico: DpcRiskInfo;
    idraulico: DpcRiskInfo;
    temporali: DpcRiskInfo;
  };
}

export interface DpcBulletinDay {
  description: string; // HTML from DPC
  topoUrl: string;
}

export interface DpcBulletin {
  id: string;
  name: string;
  date: string;
  today: DpcBulletinDay;
  tomorrow: DpcBulletinDay;
}

export interface DpcRainCell {
  lat: number;
  lon: number;
  maxMmH: number;
  meanMmH: number;
  areaPx: number;
  areaKm2: number;
  distanceKm: number;
  bearingDeg: number;
}

export interface DpcStormApproach {
  etaMinutes: number;
  intensity: number;
  distanceKm: number;
  speedKmH: number;
  headingDeg: number;
  cellLat: number;
  cellLon: number;
}

const ITALY_BBOX = { south: 35.3, north: 47.3, west: 6.5, east: 18.9 };

/** Rough national bounding box — used to default Italian users to the DPC radar. */
export function isInItaly(lat: number, lon: number): boolean {
  return lat >= ITALY_BBOX.south && lat <= ITALY_BBOX.north && lon >= ITALY_BBOX.west && lon <= ITALY_BBOX.east;
}

/** Parse a DPC risk string ("Ordinaria / ALLERTA GIALLA") into a level. */
export function parseLevel(raw: string | null | undefined): DpcRiskInfo {
  const label = (raw ?? '').trim();
  const u = label.toUpperCase();
  let level: DpcAlertLevel = 'none';
  if (u.includes('ROSSA')) level = 'red';
  else if (u.includes('ARANCIONE')) level = 'orange';
  else if (u.includes('GIALLA')) level = 'yellow';
  return { level, label };
}

/** Highest level across the three risk types for a zone feature. */
export function zoneLevel(props: Record<string, unknown>): DpcAlertLevel {
  const risks = [props['Per rischio idrogeologico'], props['Per rischio idraulico'], props['Per rischio temporali']];
  const rank = { none: 0, yellow: 1, orange: 2, red: 3 } as const;
  let max = 0;
  let lvl: DpcAlertLevel = 'none';
  for (const r of risks) {
    const { level } = parseLevel(typeof r === 'string' ? r : null);
    const rk = rank[level];
    if (rk > max) {
      max = rk;
      lvl = level;
    }
  }
  return lvl;
}

export function zoneProperties(props: Record<string, unknown>): DpcZoneProperties {
  return {
    zoneName: String(props['Nome zona'] ?? 'Unknown zone'),
    municipalities: Array.isArray(props['Comuni']) ? (props['Comuni'] as string[]) : [],
    combined: String(props['Rappresentata nella mappa'] ?? ''),
    risks: {
      idrogeologico: parseLevel(typeof props['Per rischio idrogeologico'] === 'string' ? (props['Per rischio idrogeologico'] as string) : null),
      idraulico: parseLevel(typeof props['Per rischio idraulico'] === 'string' ? (props['Per rischio idraulico'] as string) : null),
      temporali: parseLevel(typeof props['Per rischio temporali'] === 'string' ? (props['Per rischio temporali'] as string) : null)
    }
  };
}

export const LEVEL_META: Record<DpcAlertLevel, { label: string; color: string; fill: string; chip: string }> = {
  none: { label: 'No alert', color: '#34d399', fill: '#059669', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  yellow: { label: 'Yellow alert', color: '#facc15', fill: '#eab308', chip: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40' },
  orange: { label: 'Orange alert', color: '#fb923c', fill: '#f97316', chip: 'bg-orange-500/15 text-orange-300 border-orange-500/40' },
  red: { label: 'Red alert', color: '#f87171', fill: '#ef4444', chip: 'bg-red-500/15 text-red-300 border-red-500/40' }
};

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/?b>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Caches — the bulletin is published once a day, zones once per bulletin.
// ---------------------------------------------------------------------------
let bulletinCache: { at: number; id: string; bulletin: DpcBulletin } | null = null;
let zonesCache: { at: number; url: string; zones: FeatureCollection } | null = null;

/**
 * Resolve the id of the current bulletin. Prefers the Render proxy (which reads
 * the official DPC mappe portal server-side); falls back to the GitHub trees
 * API (single request, no CORS problem, heavier payload).
 */
export async function fetchLatestBulletinId(proxyUrl: string): Promise<string> {
  if (proxyUrl) {
    try {
      const res = await fetch(`${proxyUrl}/dpc/alerts/latest`);
      if (res.ok) {
        const data = await res.json();
        if (data?.id) return String(data.id);
      }
    } catch {
      /* fall through to GitHub */
    }
  }
  const res = await fetch(`https://api.github.com/repos/${DPC_BULLETIN_REPO}/git/trees/master?recursive=1`, {
    headers: { accept: 'application/vnd.github+json' }
  });
  if (!res.ok) throw new Error(`Could not reach the DPC bulletin index (HTTP ${res.status})`);
  const tree = (await res.json()) as { tree?: Array<{ path?: string }> };
  let latest: string | null = null;
  for (const e of tree.tree ?? []) {
    const m = /^files\/(\d{8}_\d{4})\.json$/.exec(e.path ?? '');
    if (m && (!latest || m[1] > latest)) latest = m[1];
  }
  if (!latest) throw new Error('No DPC bulletins found in the official repository');
  return latest;
}

export async function fetchBulletin(id: string): Promise<DpcBulletin> {
  if (bulletinCache && bulletinCache.id === id && Date.now() - bulletinCache.at < 30 * 60_000) {
    return bulletinCache.bulletin;
  }
  const res = await fetch(`${DPC_BULLETIN_RAW}/${id}.json`);
  if (!res.ok) throw new Error(`DPC bulletin ${id} unavailable (HTTP ${res.status})`);
  const raw = (await res.json()) as {
    name?: string;
    date?: string;
    today?: { topo_json?: string; html_descrition?: string };
    tomorrow?: { topo_json?: string; html_descrition?: string };
  };
  const bulletin: DpcBulletin = {
    id,
    name: raw.name ?? `Bollettino ${id}`,
    date: raw.date ?? '',
    today: { description: raw.today?.html_descrition ?? '', topoUrl: raw.today?.topo_json ?? '' },
    tomorrow: { description: raw.tomorrow?.html_descrition ?? '', topoUrl: raw.tomorrow?.topo_json ?? '' }
  };
  bulletinCache = { at: Date.now(), id, bulletin };
  return bulletin;
}

/** Fetch a bulletin TopoJSON and convert it to a GeoJSON FeatureCollection. */
export async function fetchZones(topoUrl: string): Promise<FeatureCollection> {
  if (zonesCache && zonesCache.url === topoUrl && Date.now() - zonesCache.at < 60 * 60_000) {
    return zonesCache.zones;
  }
  const res = await fetch(topoUrl);
  if (!res.ok) throw new Error(`Warning-zone data unavailable (HTTP ${res.status})`);
  const topo = (await res.json()) as Topology;
  const key = Object.keys(topo.objects ?? {})[0];
  const geom = topo.objects[key] as GeometryCollection;
  const zones = feature(topo, geom) as unknown as FeatureCollection;
  zonesCache = { at: Date.now(), url: topoUrl, zones };
  return zones;
}

// ---------------------------------------------------------------------------
// Point-in-polygon (ray casting) over GeoJSON rings ([lon, lat] order).
// ---------------------------------------------------------------------------
function pointInRing(lat: number, lon: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInFeature(featureLike: Feature, lat: number, lon: number): boolean {
  const g = featureLike?.geometry;
  if (!g) return false;
  if (g.type === 'Polygon') {
    return (g.coordinates as number[][][]).some((ring) => pointInRing(lat, lon, ring));
  }
  if (g.type === 'MultiPolygon') {
    return (g.coordinates as number[][][][]).some((poly) => poly.some((ring) => pointInRing(lat, lon, ring)));
  }
  return false;
}

/** Great-circle helpers shared with the proximity storm alarm. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
