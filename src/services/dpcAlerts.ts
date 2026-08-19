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

export interface DpcBulletinResolution {
  id: string;
  source: 'render' | 'github';
  endpoint: string;
  checkedAt: string;
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
  none: { label: 'No alert', color: '#5eead4', fill: '#0f766e', chip: 'bg-teal-500/10 text-teal-300 border-teal-500/30' },
  yellow: { label: 'Yellow alert', color: '#fde047', fill: '#ca8a04', chip: 'bg-yellow-500/20 text-yellow-200 border-yellow-400/60' },
  orange: { label: 'Orange alert', color: '#fdba74', fill: '#ea580c', chip: 'bg-orange-500/20 text-orange-200 border-orange-400/60' },
  red: { label: 'Red alert', color: '#fca5a5', fill: '#dc2626', chip: 'bg-red-500/20 text-red-200 border-red-400/60' }
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
 * Resolve the current bulletin and retain enough diagnostics for the UI to tell
 * whether the configured Render endpoint is working or the direct official
 * GitHub fallback was used. `refresh=1` bypasses proxy-side freshness caches.
 */
export async function resolveLatestBulletin(proxyUrl: string, forceRefresh = false): Promise<DpcBulletinResolution> {
  const endpoint = proxyUrl ? `${proxyUrl}/dpc/alerts/latest` : '';
  if (endpoint) {
    try {
      const url = forceRefresh ? `${endpoint}?refresh=1` : endpoint;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data?.id) {
          return {
            id: String(data.id),
            source: 'render',
            endpoint,
            checkedAt: typeof data.checkedAt === 'string' ? data.checkedAt : new Date().toISOString()
          };
        }
      }
    } catch {
      /* use the official browser-readable archive below */
    }
  }

  const res = await fetch(`https://api.github.com/repos/${DPC_BULLETIN_REPO}/git/trees/master?recursive=1`, {
    headers: { accept: 'application/vnd.github+json', 'cache-control': 'no-cache' },
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`Could not reach the DPC bulletin index (HTTP ${res.status})`);
  const tree = (await res.json()) as { tree?: Array<{ path?: string }> };
  let latest: string | null = null;
  for (const e of tree.tree ?? []) {
    const m = /^files\/(\d{8}_\d{4})\.json$/.exec(e.path ?? '');
    if (m && (!latest || m[1] > latest)) latest = m[1];
  }
  if (!latest) throw new Error('No DPC bulletins found in the official repository');
  return { id: latest, source: 'github', endpoint, checkedAt: new Date().toISOString() };
}

export async function fetchLatestBulletinId(proxyUrl: string, forceRefresh = false): Promise<string> {
  return (await resolveLatestBulletin(proxyUrl, forceRefresh)).id;
}

export function formatBulletinDate(id: string, locale = 'en-GB'): string {
  const match = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})$/.exec(id);
  if (!match) return id;
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
}

export function formatBulletinTime(id: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})$/.exec(id);
  return match ? `${match[4]}:${match[5]}` : '';
}

export function isBulletinToday(id: string): boolean {
  const match = /^(\d{4})(\d{2})(\d{2})_/.exec(id);
  if (!match) return false;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date()).replace(/-/g, '');
  return `${match[1]}${match[2]}${match[3]}` === today;
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
