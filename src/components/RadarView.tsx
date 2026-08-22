import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import L from 'leaflet';
import {
  Play,
  Pause,
  Layers,
  Crosshair,
  Zap,
  Info,
  Radio,
  Clock,
  MapPin,
  ZoomIn,
  ZoomOut,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Eye,
  Calendar,
  Sparkles,
  ArrowRight,
  Sun,
  CloudRain,
  Cloud,
  Sliders,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Navigation as NavIcon,
  Globe,
  Map as MapIcon,
  Compass,
  Check
} from 'lucide-react';
import {
  WeatherResponse,
  StormPredictionResponse,
  RadarMapsResponse,
  RadarFrame,
  StormRisk,
  AppSettings
} from '../types';
import { fetchRadarMaps, generateStormPrediction } from '../services/weatherApi';
import { formatTime, getWindDirection } from '../utils/weatherUtils';
import { t, getCurrentLanguage } from '../utils/i18n';
import {
  isInItaly,
  resolveLatestBulletin,
  fetchBulletin,
  formatBulletinDate,
  formatBulletinTime,
  isBulletinToday,
  fetchZones,
  zoneLevel,
  zoneProperties,
  pointInFeature,
  LEVEL_META,
  stripHtml,
  haversineKm
} from '../services/dpcAlerts';
import { RadarSatelliteInsights } from './RadarSatelliteInsights';
import type { DpcBulletin, DpcRainCell, DpcStormApproach } from '../services/dpcAlerts';
import type { FeatureCollection, Feature } from 'geojson';

interface RadarViewProps {
  weatherData: WeatherResponse | null;
  prediction: StormPredictionResponse | null;
  stormRisk?: StormRisk | null;
  onSelectLocation?: (lat: number, lon: number, locationName: string) => void;
  settings?: AppSettings;
  focusCoordinates?: { lat: number; lon: number; label?: string } | null;
  onDpcStormApproaching?: (info: DpcStormApproach) => void;
}

type MapTheme = 'dark' | 'streets' | 'satellite';
type RadarLayerType =
  | 'radar'
  | 'mtg-truecolor'
  | 'mtg-convection'
  | 'mtg-cloudtop'
  | 'mtg-li'
  | 'eumetsat-natural'
  | 'eumetsat-ir'
  | 'dwd-sat'
  | 'dpc-vmi'
  | 'dpc-sri'
  | 'dpc-dbz'
  | 'dpc-srt1'
  | 'dpc-srt3'
  | 'dpc-srt6'
  | 'dpc-srt12'
  | 'dpc-srt24'
  | 'dpc-ir';

const DPC_WMS_ENDPOINT = 'https://radar-geowebcache.protezionecivile.it/service/wms';

interface DpcTiledLayerConfig {
  wmsLayer: string;
  label: string;
  badge: string;
  tabLabel: string;
  attribution: string;
  intervalMinutes: number;
}

// Dipartimento Protezione Civile — national radar (ARPA regional composite).
// Pre-rendered WMS tiles load as plain <img> (no API key, no CORS requirement).
const DPC_TILED_LAYERS: Record<string, DpcTiledLayerConfig> = {
  'dpc-vmi':   { wmsLayer: 'radar:vmi',      label: 'DPC Radar (VMI)',  badge: 'DPC/ARPA Rain (VMI)',        tabLabel: 'VMI',  attribution: '&copy; DPC Radar Nazionale — VMI (mm/h)',   intervalMinutes: 5 },
  'dpc-sri':   { wmsLayer: 'radar:sri',      label: 'DPC SRI Rain',     badge: 'DPC/ARPA SRI Rain',          tabLabel: 'SRI',  attribution: '&copy; DPC Radar Nazionale — SRI (mm/h)',   intervalMinutes: 5 },
  'dpc-dbz':   { wmsLayer: 'radar:radardpc', label: 'DPC Reflectivity', badge: 'DPC/ARPA Reflectivity (dBZ)', tabLabel: 'dBZ',  attribution: '&copy; DPC Radar Nazionale — composite dBZ', intervalMinutes: 5 },
  'dpc-srt1':  { wmsLayer: 'radar:srt1',     label: 'DPC Rain 1h',      badge: 'DPC/ARPA Rain 1h',           tabLabel: 'Σ1h',  attribution: '&copy; DPC Radar Nazionale — SRT 1h',       intervalMinutes: 15 },
  'dpc-srt3':  { wmsLayer: 'radar:srt3',     label: 'DPC Rain 3h',      badge: 'DPC/ARPA Rain 3h',           tabLabel: 'Σ3h',  attribution: '&copy; DPC Radar Nazionale — SRT 3h',       intervalMinutes: 30 },
  'dpc-srt6':  { wmsLayer: 'radar:srt6',     label: 'DPC Rain 6h',      badge: 'DPC/ARPA Rain 6h',           tabLabel: 'Σ6h',  attribution: '&copy; DPC Radar Nazionale — SRT 6h',       intervalMinutes: 30 },
  'dpc-srt12': { wmsLayer: 'radar:srt12',    label: 'DPC Rain 12h',     badge: 'DPC/ARPA Rain 12h',          tabLabel: 'Σ12h', attribution: '&copy; DPC Radar Nazionale — SRT 12h',      intervalMinutes: 60 },
  'dpc-srt24': { wmsLayer: 'radar:srt24',    label: 'DPC Rain 24h',     badge: 'DPC/ARPA Rain 24h',          tabLabel: 'Σ24h', attribution: '&copy; DPC Radar Nazionale — SRT 24h',      intervalMinutes: 60 },
  'dpc-ir':    { wmsLayer: 'radar:ir108',    label: 'DPC IR Sat',       badge: 'DPC/ARPA IR 10.8µm',         tabLabel: 'IR',   attribution: '&copy; DPC Radar Nazionale — IR 10.8µm',    intervalMinutes: 15 }
};

// Playback: DPC historical frames are only published as raw GeoTIFFs behind a
// CORS-blocked S3 bucket, so scrubbing the last 5h is proxied through the
// Render web-service proxy (server/index.mjs) fetches, decodes, colorizes and serves PNGs.
// Each Italy tab maps to the DPC REST product that carries the same data.
// Note: 'dpc-dbz' (composite reflectivity) has no REST product → stays static WMS.
const DPC_PLAYBACK_PRODUCT: Partial<Record<RadarLayerType, string>> = {
  'dpc-vmi': 'VMI',
  'dpc-sri': 'SRI',
  'dpc-srt1': 'SRT1',
  'dpc-srt3': 'CUM3',
  'dpc-srt6': 'CUM6',
  'dpc-srt12': 'CUM12',
  'dpc-srt24': 'CUM24',
  'dpc-ir': 'IR_108'
};

const DPC_PLAYBACK_STEP: Partial<Record<RadarLayerType, number>> = {
  'dpc-vmi': 5,
  'dpc-sri': 5,
  'dpc-srt1': 5,
  'dpc-ir': 15,
  'dpc-srt3': 30,
  'dpc-srt6': 30,
  'dpc-srt12': 30,
  'dpc-srt24': 30
};

// Legend metadata per layer — keeps the scale bar honest for every product.
const getLayerLegend = (layer: RadarLayerType) => {
  if (layer === 'radar') {
    return {
      title: 'Doppler Reflectivity Scale (dBZ)',
      gradient: 'linear-gradient(90deg, #38bdf8, #34d399, #facc15, #fb923c, #ef4444)',
      labels: ['Light (10 dBZ)', 'Moderate (30 dBZ)', 'Heavy (45 dBZ)', 'Severe Hail (>55 dBZ)']
    };
  }
  const dpc = DPC_TILED_LAYERS[layer];
  if (dpc) {
    const isAccum = ['dpc-srt1', 'dpc-srt3', 'dpc-srt6', 'dpc-srt12', 'dpc-srt24'].includes(layer);
    return {
      title: `DPC/ARPA ${dpc.badge} — ${isAccum ? 'mm accumulation' : 'mm/h intensity'}`,
      gradient: 'linear-gradient(90deg, #9fd5f0, #5cafde, #2b7acd, #26a054, #f0e030, #f0ac20, #f06c1e, #e43434, #c0202c, #8c2aa8, #d440ca, #ffffff)',
      labels: ['<0.2', '1', '5', '10', '20', '30', '50', '75+']
    };
  }
  if (layer === 'eumetsat-ir' || layer === 'mtg-cloudtop' || DPC_PLAYBACK_PRODUCT[layer] === 'IR_108') {
    return {
      title: 'IR Satellite — Cloud Top Temperature',
      gradient: 'linear-gradient(90deg, #0d0d12, #3d3d4a, #9c9cac, #e9e9f2, #ffffff)',
      labels: ['Warm / low cloud', '', 'Cold tops', 'Very cold (white)']
    };
  }
  return {
    title: 'Satellite Imagery (RGB composite)',
    gradient: 'linear-gradient(90deg, #0d0d12, #3d3d4a, #9c9cac, #ffffff)',
    labels: ['', '', '', '']
  };
};

// DPC radar playback proxy — resolved at runtime in this order:
//   1. VITE_DPC_PROXY_URL (explicit override)
//   2. window.location.origin (same-origin deployment)
//   3. The known deployed Render proxy
// The component probes each candidate and keeps the first that answers /dpc/frames.
const DPC_PROXY_CANDIDATES = [
  ((import.meta.env.VITE_DPC_PROXY_URL as string | undefined) || '').replace(/\/+$/, ''),
  typeof window !== 'undefined' ? window.location.origin : '',
  'https://sturm1.onrender.com'
].filter(Boolean);
const DPC_PLAYBACK_HOURS = 5;

export const RadarView: React.FC<RadarViewProps> = ({
  weatherData,
  prediction: initialPrediction,
  stormRisk,
  onSelectLocation,
  settings,
  focusCoordinates,
  onDpcStormApproaching
}) => {
  const currentLang = getCurrentLanguage(settings?.language);
  const [radarMaps, setRadarMaps] = useState<RadarMapsResponse | null>(null);
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [radarOpacity, setRadarOpacity] = useState(0.80);
  const [prediction, setPrediction] = useState<StormPredictionResponse | null>(initialPrediction);
  const [loadingRadar, setLoadingRadar] = useState(true);
  const [mapTheme, setMapTheme] = useState<MapTheme>('dark');
  const [radarLayerType, setRadarLayerType] = useState<RadarLayerType>(() => {
    const la = weatherData?.latitude ?? 52.52;
    const lo = weatherData?.longitude ?? 13.405;
    return isInItaly(la, lo) ? 'dpc-vmi' : 'radar';
  });
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showRangeRings, setShowRangeRings] = useState<boolean>(true);
  const [showVectorArrow, setShowVectorArrow] = useState<boolean>(true);
  const [showContours, setShowContours] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [showOverlaysMenu, setShowOverlaysMenu] = useState<boolean>(false);
  const [smoothRadar, setSmoothRadar] = useState<boolean>(true);
  const [colorScheme, setColorScheme] = useState<number>(2); // 2 = Universal Rain/Snow (Titan/Rainbow)
  const [currentZoom, setCurrentZoom] = useState<number>(7);
  const [showDataProvenance, setShowDataProvenance] = useState<boolean>(false);
  const [lastSatRefresh, setLastSatRefresh] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [dpcPlaybackActive, setDpcPlaybackActive] = useState(false);
  const [dpcBounds, setDpcBounds] = useState<L.LatLngBoundsExpression | null>(null);
  const [dpcLoading, setDpcLoading] = useState(false);
  const [dpcError, setDpcError] = useState<string | null>(null);
  const [dpcPoint, setDpcPoint] = useState<{ value: number | null; unit: string; reason: string } | null>(null);
  const [dpcTileSupported, setDpcTileSupported] = useState(false);
  const [dpcProxyUrl, setDpcProxyUrl] = useState<string>(() => DPC_PROXY_CANDIDATES[0] || '');
  const [pendingFrameIdx, setPendingFrameIdx] = useState<number | null>(null);
  const [showAllerte, setShowAllerte] = useState(true);
  const [allerteZones, setAllerteZones] = useState<FeatureCollection | null>(null);
  const [allerteBulletin, setAllerteBulletin] = useState<DpcBulletin | null>(null);
  const [allerteResolution, setAllerteResolution] = useState<Awaited<ReturnType<typeof resolveLatestBulletin>> | null>(null);
  const [allerteLoading, setAllerteLoading] = useState(false);
  const [allerteError, setAllerteError] = useState<string | null>(null);
  const [dpcCells, setDpcCells] = useState<DpcRainCell[]>([]);
  const [dpcApproach, setDpcApproach] = useState<DpcStormApproach | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const radarTileLayerRef = useRef<L.TileLayer | L.TileLayer.WMS | null>(null);
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);
  const contoursTileLayerRef = useRef<L.TileLayer | L.TileLayer.WMS | null>(null);
  const labelsTileLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const dpcTileLayerRef = useRef<L.TileLayer | null>(null);
  const dpcTileBoundsRef = useRef<L.LatLngBoundsExpression | null>(null);
  const dpcTileTemplateRef = useRef<string | null>(null);
  const dpcImageOverlayRef = useRef<L.ImageOverlay | null>(null);
  const layerTouchedRef = useRef(false);
  const allerteLayerRef = useRef<L.GeoJSON | null>(null);
  const onDpcStormApproachingRef = useRef(onDpcStormApproaching);
  const lastApproachTriggerRef = useRef<{ at: number; intensity: number; eta: number } | null>(null);

  // Live second clock for accurate timestamp HUD
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch with a hard timeout so a hanging candidate can't block the proxy probe.
  const fetchWithTimeout = (url: string, timeoutMs: number) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { cache: 'no-store', signal: controller.signal }).finally(() =>
      window.clearTimeout(timer)
    );
  };

  // Resolve the best DPC proxy at runtime: explicit env var → same origin → known Render proxy.
  // Each candidate must return REAL JSON frames — a SPA host that answers every path with
  // index.html (HTTP 200) is rejected here, otherwise loading frames throws a JSON parse error.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const base of DPC_PROXY_CANDIDATES) {
        if (!base || cancelled) continue;
        try {
          const res = await fetchWithTimeout(`${base}/dpc/frames?product=VMI&hours=1`, 8000);
          if (!res.ok) continue;
          const contentType = res.headers.get('content-type') ?? '';
          if (!contentType.includes('application/json')) continue;
          const data = await res.json().catch(() => null);
          if (!data || !Array.isArray(data.frames)) continue;
          if (!cancelled) setDpcProxyUrl(base);
          return;
        } catch {
          // try the next candidate
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const lat = weatherData?.latitude ?? 52.52;
  const lon = weatherData?.longitude ?? 13.405;
  const locationName = weatherData?.locationName || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;

  // Manual layer picker — marks that the user has made an explicit choice so
  // the Italy auto-default below never overrides it.
  const selectLayer = useCallback((layer: RadarLayerType) => {
    layerTouchedRef.current = true;
    setRadarLayerType(layer);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('storm-alert:radar-layer-changed', { detail: layer }));
    }
  }, []);

  useEffect(() => {
    onDpcStormApproachingRef.current = onDpcStormApproaching;
  });

  // The focused Italy selector uses the same layer state as the legacy layer bar.
  useEffect(() => {
    const onDpcLayerSelected = (event: Event) => {
      const layer = (event as CustomEvent<RadarLayerType>).detail;
      if (!DPC_TILED_LAYERS[layer]) return;
      selectLayer(layer);
    };
    const onNowcastSelected = () => selectLayer('radar');
    window.addEventListener('storm-alert:select-dpc-layer', onDpcLayerSelected);
    window.addEventListener('storm-alert:select-radar-nowcast', onNowcastSelected);
    return () => {
      window.removeEventListener('storm-alert:select-dpc-layer', onDpcLayerSelected);
      window.removeEventListener('storm-alert:select-radar-nowcast', onNowcastSelected);
    };
  }, [selectLayer]);

  // Keep the shared DPC product selector in sync with the active layer on mount.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('storm-alert:radar-layer-changed', { detail: radarLayerType }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default Italian users to the national DPC radar once their location resolves.
  useEffect(() => {
    if (!weatherData) return;
    if (!layerTouchedRef.current && isInItaly(weatherData.latitude, weatherData.longitude)) {
      setRadarLayerType((prev) => (DPC_PLAYBACK_PRODUCT[prev] ? prev : 'dpc-vmi'));
    }
  }, [weatherData]);

  // Helper to get exact image / scan acquisition timestamp info for current view
  const getImageTimestampInfo = () => {
    const now = currentTime.getTime();

    if (radarLayerType === 'radar') {
      const currentFrame = frames[currentFrameIndex];
      if (currentFrame) {
        const frameDate = new Date(currentFrame.time * 1000);
        const isFuture = currentFrame.time > Math.floor(now / 1000);
        const isPast = currentFrame.time < Math.floor(now / 1000) - 600;
        const ageMin = Math.max(0, Math.floor((now - frameDate.getTime()) / 60000));
        return {
          label: isFuture ? 'Forecast Nowcast' : 'Radar Scan',
          date: frameDate,
          utcTime: frameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
          localTime: frameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          ageText: isFuture ? 'Nowcast +pred' : `${ageMin}m ago`,
          isFuture,
          isPast,
          interval: '10-min scan'
        };
      }
      const defaultDate = new Date(now - 10 * 60 * 1000);
      return {
        label: 'Radar Scan',
        date: defaultDate,
        utcTime: defaultDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
        localTime: defaultDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ageText: 'Live slot',
        isFuture: false,
        isPast: false,
        interval: '10-min scan'
      };
    }

    // DPC / ARPA national radar & IR satellite (Italy + central Mediterranean coverage)
    const dpcLayer = DPC_TILED_LAYERS[radarLayerType];
    if (dpcLayer) {
      const playbackFrame = dpcPlaybackActive ? frames[currentFrameIndex] : null;
      const intervalMinutes = playbackFrame
        ? (DPC_PLAYBACK_STEP[radarLayerType] ?? dpcLayer.intervalMinutes)
        : dpcLayer.intervalMinutes;
      const slotMs = Math.floor((now - intervalMinutes * 60 * 1000) / (intervalMinutes * 60 * 1000)) * (intervalMinutes * 60 * 1000);
      const dpcDate = playbackFrame ? new Date(playbackFrame.time * 1000) : new Date(slotMs);
      const ageMin = Math.max(0, Math.floor((now - dpcDate.getTime()) / 60000));
      return {
        label: playbackFrame ? `${dpcLayer.label} (playback)` : dpcLayer.label,
        date: dpcDate,
        utcTime: dpcDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
        localTime: dpcDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ageText: `${ageMin}m ago`,
        isFuture: false,
        isPast: true,
        interval: `${intervalMinutes}-min scan`
      };
    }

    // Satellite Layers (EUMETSAT MTG-I1 & MSG SEVIRI)
    // MTG-I1 FCI full-disc scan interval is 10 min with ~10-12 min dissemination latency
    // MSG SEVIRI full-disc scan interval is 15 min with ~12-15 min dissemination latency
    const isMtg = ['mtg-truecolor', 'mtg-convection', 'mtg-cloudtop', 'mtg-li'].includes(radarLayerType);
    const intervalMinutes = isMtg ? 10 : 15;
    const latencyMinutes = isMtg ? 12 : 15;

    const slotMs = Math.floor((now - latencyMinutes * 60 * 1000) / (intervalMinutes * 60 * 1000)) * (intervalMinutes * 60 * 1000);
    const satDate = new Date(slotMs);
    const ageMin = Math.max(0, Math.floor((now - satDate.getTime()) / 60000));

    return {
      label: isMtg ? 'MTG-I1 Sat' : 'Meteosat Sat',
      date: satDate,
      utcTime: satDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
      localTime: satDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ageText: `${ageMin}m ago`,
      isFuture: false,
      isPast: true,
      interval: `${intervalMinutes}-min scan`
    };
  };

  // Determine allowed max zoom per layer to prevent 404 / unsupported zoom levels
  const getMaxZoomForLayer = useCallback((layer: RadarLayerType) => {
    if (DPC_TILED_LAYERS[layer]) return 18; // DPC (ARPA) national radar — native ~1km, upscaled to 18
    switch (layer) {
      case 'mtg-truecolor':
      case 'mtg-convection':
      case 'mtg-cloudtop':
      case 'mtg-li':
      case 'eumetsat-natural':
      case 'eumetsat-ir':
      case 'dwd-sat':
        // WMS native resolution is ~z14; keep the layer visible (upscaled) at every
        // zoom so IR/satellite never vanishes on zoom-in — Zoom Earth behaviour.
        return 18;
      case 'radar':
      default:
        return 18; // RainViewer Doppler Radar with native zoom 12 + client-side upscaling
    }
  }, []);

  // Update frame list based on active layer
  const updateFramesForLayer = useCallback((layer: RadarLayerType, maps: RadarMapsResponse | null) => {
    if (!maps) return;
    setPendingFrameIdx(null);

    if (layer === 'radar') {
      const allFrames: RadarFrame[] = [];
      if (maps.radar?.past) allFrames.push(...maps.radar.past);
      if (maps.radar?.nowcast) allFrames.push(...maps.radar.nowcast);

      if (allFrames.length > 0) {
        setFrames(allFrames);
        setCurrentFrameIndex(allFrames.length - 1);
      }
    } else if (!DPC_PLAYBACK_PRODUCT[layer]) {
      setFrames([]);
      setCurrentFrameIndex(0);
    }
  }, []);

  // Fetch the last 5h of DPC frames for an Italy tab through the Render proxy.
  const loadDpcFrames = useCallback(async (layer: RadarLayerType, jumpToLatest = true) => {
    const product = DPC_PLAYBACK_PRODUCT[layer];
    if (!product || !dpcProxyUrl) {
      setDpcPlaybackActive(false);
      setDpcBounds(null);
      return;
    }
    setDpcLoading(true);
    setDpcError(null);
    setFrames([]); // clear any previous product's frames while loading
    setPendingFrameIdx(null);
    try {
      const res = await fetchWithTimeout(
        `${dpcProxyUrl}/dpc/frames?product=${product}&hours=${DPC_PLAYBACK_HOURS}`,
        45000
      );
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || !contentType.includes('application/json')) {
        const body = contentType.includes('application/json') ? await res.json().catch(() => null) : null;
        throw new Error(body?.error ?? `Playback backend error (HTTP ${res.status})`);
      }
      const data = await res.json();
      const list = (Array.isArray(data.frames) ? data.frames : []) as number[];
      const mapped = list.map((t) => ({
        time: Math.round(t / 1000),
        path: `${dpcProxyUrl}/dpc/frame?product=${product}&time=${t}`
      }));
      setDpcTileSupported(false);
      if (mapped.length > 0) {
        const probe = mapped[mapped.length - 1];
        fetch(`${dpcProxyUrl}/dpc/tile?product=${product}&time=${probe.time * 1000}&z=3&x=4&y=3`, { cache: 'no-store' })
          .then((response) => setDpcTileSupported(response.ok))
          .catch(() => setDpcTileSupported(false));
      }
      setFrames(mapped);
      setCurrentFrameIndex((prev) =>
        jumpToLatest ? Math.max(0, mapped.length - 1) : Math.min(prev, Math.max(0, mapped.length - 1))
      );
      if (data.bounds) {
        setDpcBounds([[data.bounds.south, data.bounds.west], [data.bounds.north, data.bounds.east]]);
      }
      setDpcPlaybackActive(mapped.length > 0);
      if (mapped.length === 0) setDpcError(`No DPC frames available for the last ${DPC_PLAYBACK_HOURS} hours`);
    } catch (err) {
      setDpcPlaybackActive(false);
      setDpcBounds(null);
      setDpcError(err instanceof Error ? err.message : 'DPC playback unavailable');
    } finally {
      setDpcLoading(false);
    }
  }, [dpcProxyUrl]);

  // Playback loop — schedules the next frame but only advances once that
  // frame's picture is actually ready (preload effect below), so the current
  // image stays on screen until the next one can replace it. A safety timeout
  // keeps playback from stalling on slow or missing sources.
  useEffect(() => {
    if (!isPlaying || frames.length < 2) return;
    const intervalMs = Math.round(2400 / playbackSpeed);
    const timer = window.setInterval(() => {
      setPendingFrameIdx((prev) => (prev == null ? (currentFrameIndex + 1) % frames.length : prev));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, frames.length, playbackSpeed, currentFrameIndex]);

  // Preload the pending frame; swap only when its picture is ready.
  useEffect(() => {
    if (pendingFrameIdx == null || !isPlaying) return;
    const next = frames[pendingFrameIdx];
    if (!next) return;

    let settled = false;
    const apply = () => {
      if (settled) return;
      settled = true;
      setCurrentFrameIndex(pendingFrameIdx);
      setPendingFrameIdx(null);
    };

    const img = new Image();
    img.onload = apply;
    img.onerror = apply;
    img.src = next.path;

    const safety = window.setTimeout(apply, 2000);
    return () => {
      window.clearTimeout(safety);
      settled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [pendingFrameIdx, isPlaying, frames, currentFrameIndex]);

  // Fetch RainViewer radar maps
  const loadRadarData = useCallback(async () => {
    try {
      setLoadingRadar(true);
      const maps = await fetchRadarMaps();
      setRadarMaps(maps);

      updateFramesForLayer(radarLayerType, maps);
      setLastSatRefresh(new Date());

      if (weatherData) {
        const pred = generateStormPrediction(weatherData, maps);
        setPrediction(pred);
      }
    } catch (err) {
      console.warn('Failed to fetch radar maps:', err);
      if (weatherData) {
        setPrediction(generateStormPrediction(weatherData));
      }
    } finally {
      setLoadingRadar(false);
    }
  }, [weatherData, radarLayerType, updateFramesForLayer]);

  useEffect(() => {
    loadRadarData();
  }, [lat, lon, loadRadarData]);

  // Auto-refresh radar data on the same 10-minute cadence as the RainViewer feed
  // (matches Zoom Earth's silent update behaviour so the map never goes stale)
  useEffect(() => {
    const timer = setInterval(() => {
      loadRadarData();
      const product = DPC_PLAYBACK_PRODUCT[radarLayerType];
      if (product && dpcProxyUrl) loadDpcFrames(radarLayerType, false);
    }, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [loadRadarData, radarLayerType, loadDpcFrames]);

  // When layer changes, update frames and enforce zoom limits
  useEffect(() => {
    if (radarMaps) {
      updateFramesForLayer(radarLayerType, radarMaps);
    }

    if (mapInstanceRef.current) {
      const maxAllowed = getMaxZoomForLayer(radarLayerType);
      mapInstanceRef.current.setMaxZoom(maxAllowed);
      if (mapInstanceRef.current.getZoom() > maxAllowed) {
        mapInstanceRef.current.setZoom(maxAllowed);
      }
    }
  }, [radarLayerType, radarMaps, getMaxZoomForLayer, updateFramesForLayer]);

  // Load DPC frame history whenever an Italy tab is activated (backend-gated).
  useEffect(() => {
    const product = DPC_PLAYBACK_PRODUCT[radarLayerType];
    if (product) {
      setDpcPlaybackActive(false);
      setDpcBounds(null);
      if (dpcProxyUrl) {
        loadDpcFrames(radarLayerType);
      } else {
        setDpcError(null);
      }
    } else {
      setDpcPlaybackActive(false);
      setDpcBounds(null);
      setDpcError(null);
    }
  }, [radarLayerType, loadDpcFrames, dpcProxyUrl]);

  // Live rain rate at the user's location for the current DPC frame.
  useEffect(() => {
    const product = DPC_PLAYBACK_PRODUCT[radarLayerType];
    const frame = frames[currentFrameIndex];
    if (!product || !dpcProxyUrl || !dpcPlaybackActive || !frame) {
      setDpcPoint(null);
      return;
    }
    if (weatherData?.latitude === undefined || weatherData?.longitude === undefined) {
      setDpcPoint(null);
      return;
    }
    let cancelled = false;
    fetch(
      `${dpcProxyUrl}/dpc/point?product=${product}&time=${Math.round(frame.time * 1000)}&lat=${weatherData.latitude}&lon=${weatherData.longitude}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setDpcPoint(d);
      })
      .catch(() => {
        if (!cancelled) setDpcPoint(null);
      });
    return () => {
      cancelled = true;
    };
  }, [radarLayerType, currentFrameIndex, dpcPlaybackActive, frames, weatherData?.latitude, weatherData?.longitude]);

  // Keep the shared image-first insight card in sync with the actual selected frame.
  useEffect(() => {
    const imageKind = radarLayerType === 'radar' || (DPC_TILED_LAYERS[radarLayerType] && radarLayerType !== 'dpc-ir') ? 'radar' : 'satellite';
    const imageTimestamp = getImageTimestampInfo();
    window.dispatchEvent(new CustomEvent('storm-alert:radar-insights', {
      detail: {
        layerLabel: getLayerLegend(radarLayerType).title,
        imageKind,
        timestamp: imageTimestamp.date.getTime(),
        ageText: imageTimestamp.ageText,
        locationName,
        dpcPoint,
        dpcApproach,
        dpcCells,
        dpcPlaybackActive,
        dpcProxyConfigured: Boolean(dpcProxyUrl),
        satelliteData: weatherData?.mtgData,
        currentPrecipitation: weatherData?.current?.precipitation ?? 0
      }
    }));
  }, [radarLayerType, currentFrameIndex, dpcPoint, dpcApproach, dpcCells, dpcPlaybackActive, currentTime, locationName, weatherData?.mtgData, weatherData?.current?.precipitation]);

  // Allerte — official DPC "Bollettino di Criticità" (warning zones + levels).
  // Bulletin is published once a day; refresh on a 30-min cadence.
  const loadAllerte = useCallback(async (forceRefresh = false) => {
    setAllerteLoading(true);
    setAllerteError(null);
    try {
      const resolution = await resolveLatestBulletin(dpcProxyUrl, forceRefresh);
      setAllerteResolution(resolution);
      const bulletin = await fetchBulletin(resolution.id);
      setAllerteBulletin(bulletin);
      if (bulletin.today.topoUrl) {
        const zones = await fetchZones(bulletin.today.topoUrl);
        setAllerteZones(zones);
      }
    } catch (err) {
      setAllerteError(err instanceof Error ? err.message : 'Allerte unavailable');
    } finally {
      setAllerteLoading(false);
    }
  }, [dpcProxyUrl]);

  useEffect(() => {
    loadAllerte();
    const timer = setInterval(loadAllerte, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, [loadAllerte]);

  // Proximity storm alarm — track DPC rain cells between consecutive frames,
  // project their track toward the user and raise the siren modal on a collision.
  useEffect(() => {
    const product = DPC_PLAYBACK_PRODUCT[radarLayerType];
    if (!product || !dpcProxyUrl || !dpcPlaybackActive || frames.length < 2) {
      setDpcCells([]);
      setDpcApproach(null);
      return;
    }
    if (weatherData?.latitude === undefined || weatherData?.longitude === undefined) return;
    const uLat = weatherData.latitude;
    const uLon = weatherData.longitude;
    let cancelled = false;

    const analyze = async () => {
      const t2 = frames[frames.length - 1].time * 1000;
      const t1 = frames[Math.max(0, frames.length - 2)].time * 1000;
      const base = `${dpcProxyUrl}/dpc/cells?product=${product}&lat=${uLat}&lon=${uLon}&radiusKm=150&minMmH=1`;
      try {
        const [r2, r1] = await Promise.all([
          fetch(`${base}&time=${t2}`).then((r) => (r.ok ? r.json() : null)),
          t1 !== t2 ? fetch(`${base}&time=${t1}`).then((r) => (r.ok ? r.json() : null)) : Promise.resolve(null)
        ]);
        if (cancelled) return;
        const cells2: DpcRainCell[] = r2?.cells ?? [];
        setDpcCells(cells2.slice(0, 10));
        const dtHours = (t2 - t1) / 3_600_000;
        const cells1: DpcRainCell[] = r1?.cells ?? [];
        if (dtHours <= 0) return;

        let best: DpcStormApproach | null = null;
        for (const c of cells2) {
          if (c.maxMmH < 2.5) continue;
          // Match to the nearest cell in the previous frame (storms move ~3-5 km/frame).
          let nearest: DpcRainCell | null = null;
          let nd = 40;
          for (const p of cells1) {
            const d = haversineKm(c.lat, c.lon, p.lat, p.lon);
            if (d < nd) {
              nd = d;
              nearest = p;
            }
          }
          if (!nearest) continue;
          const cosU = Math.cos((uLat * Math.PI) / 180);
          const vN = ((c.lat - nearest.lat) * 110.574) / dtHours;
          const vE = ((c.lon - nearest.lon) * 111.32 * cosU) / dtHours;
          const speed = Math.hypot(vN, vE);
          if (speed < 4) continue; // static speckle / radar noise
          const n0 = (c.lat - uLat) * 110.574;
          const e0 = (c.lon - uLon) * 111.32 * cosU;
          const v2 = vN * vN + vE * vE;
          const tStar = -(n0 * vN + e0 * vE) / v2;
          if (tStar <= 0 || tStar > 3) continue; // moving away or too far out
          const miss = Math.abs(n0 * vE - e0 * vN) / Math.sqrt(v2);
          if (miss > 35) continue;
          const etaMin = tStar * 60;
          if (!best || etaMin < best.etaMinutes) {
            best = {
              etaMinutes: Math.round(etaMin),
              intensity: c.maxMmH,
              distanceKm: Math.round(c.distanceKm),
              speedKmH: Math.round(speed),
              headingDeg: Math.round(((Math.atan2(vE, vN) * 180) / Math.PI + 360) % 360),
              cellLat: c.lat,
              cellLon: c.lon
            };
          }
        }
        setDpcApproach(best);
        if (best && best.etaMinutes <= 45 && best.intensity >= 2.5) {
          const last = lastApproachTriggerRef.current;
          const now = Date.now();
          const shouldFire =
            !last ||
            now - last.at > 15 * 60_000 ||
            (best.intensity > last.intensity * 1.3 && best.etaMinutes < last.eta);
          if (shouldFire) {
            lastApproachTriggerRef.current = { at: now, intensity: best.intensity, eta: best.etaMinutes };
            onDpcStormApproachingRef.current?.(best);
          }
        }
      } catch {
        if (!cancelled) {
          setDpcCells([]);
          setDpcApproach(null);
        }
      }
    };

    analyze();
    const timer = setInterval(analyze, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [radarLayerType, dpcPlaybackActive, frames, weatherData?.latitude, weatherData?.longitude]);

  // Base map URL generator
  const getBaseMapUrl = (theme: MapTheme) => {
    switch (theme) {
      case 'dark':
        return 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      case 'streets':
        return 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
      case 'satellite':
        return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      default:
        return 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    }
  };

  // Radar tile URL generator
  const getOverlayTileConfig = useCallback(() => {
    if (radarLayerType === 'radar') {
      if (!radarMaps) return null;
      const currentFrame = frames[currentFrameIndex];
      if (!currentFrame) return null;
      const smoothFlag = smoothRadar ? 1 : 0;
      const snowFlag = 1;
      return {
        url: `${radarMaps.host}${currentFrame.path}/512/{z}/{x}/{y}/${colorScheme}/${smoothFlag}_${snowFlag}.png`,
        tileSize: 512,
        zoomOffset: -1,
        maxNativeZoom: 12,
        maxZoom: 18,
        errorTileUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"/>'
      };
    }
    return null;
  }, [radarMaps, radarLayerType, frames, currentFrameIndex, smoothRadar, colorScheme]);

  // Initialize Leaflet Map
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const initialMax = getMaxZoomForLayer(radarLayerType);

    const map = L.map(container, {
      center: [lat, lon],
      zoom: 7,
      minZoom: 3,
      maxZoom: initialMax,
      zoomControl: false,
      scrollWheelZoom: false
    });

    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    // Base tile layer
    const baseLayer = L.tileLayer(getBaseMapUrl(mapTheme), {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 18
    }).addTo(map);
    baseTileLayerRef.current = baseLayer;

    // Create dedicated custom panes to guarantee proper z-stacking:
    // 1. Basemap in tilePane (zIndex 200)
    // 2. Weather layer (Radar / Satellite) in weatherPane (zIndex 350)
    // 3. Contours & Land Boundaries in contoursPane (zIndex 450)
    // 4. Place Names & City Labels in labelsPane (zIndex 500)
    // 5. Vectors, Markers, Rings in overlayPane (zIndex 600)
    if (!map.getPane('weatherPane')) {
      const p = map.createPane('weatherPane');
      p.style.zIndex = '350';
    }
    if (!map.getPane('contoursPane')) {
      const p = map.createPane('contoursPane');
      p.style.zIndex = '450';
      p.style.pointerEvents = 'none';
    }
    if (!map.getPane('allertePane')) {
      const p = map.createPane('allertePane');
      p.style.zIndex = '400';
      p.style.pointerEvents = 'none';
    }
    if (!map.getPane('labelsPane')) {
      const p = map.createPane('labelsPane');
      p.style.zIndex = '500';
      p.style.pointerEvents = 'none';
    }

    // Overlay layer group for range rings, vectors & pins
    const overlayGroup = L.layerGroup().addTo(map);
    overlayGroupRef.current = overlayGroup;

    // Custom Station Pin
    const customPin = L.divIcon({
      className: 'custom-weather-pin',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="w-8 h-8 rounded-full bg-sky-500/25 border-2 border-sky-400 animate-ping absolute"></div>
          <div class="w-4 h-4 rounded-full bg-sky-500 border-2 border-white shadow-xl flex items-center justify-center relative z-10">
            <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker([lat, lon], { icon: customPin }).addTo(map);
    marker.bindPopup(`
      <div class="p-2 text-slate-900 font-sans">
        <strong class="text-sm block font-bold">${locationName}</strong>
        <span class="text-xs text-slate-600">Active Weather Station (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)</span>
      </div>
    `);
    markerRef.current = marker;

    // Map click handler to select coordinates
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onSelectLocation) {
        onSelectLocation(e.latlng.lat, e.latlng.lng, `${e.latlng.lat.toFixed(2)}°, ${e.latlng.lng.toFixed(2)}°`);
      }
    });

    mapInstanceRef.current = map;

    // Invalidate size on mount
    const t1 = setTimeout(() => {
      if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
    }, 100);
    const t2 = setTimeout(() => {
      if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
    }, 350);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      });
      resizeObserver.observe(container);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (resizeObserver) resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      baseTileLayerRef.current = null;
      labelsTileLayerRef.current = null;
      radarTileLayerRef.current = null;
      dpcTileLayerRef.current = null;
      dpcTileBoundsRef.current = null;
      dpcTileTemplateRef.current = null;
      dpcImageOverlayRef.current = null;
      markerRef.current = null;
      overlayGroupRef.current = null;
    };
  }, []);

  // Handle station coordinate changes
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lon], mapInstanceRef.current.getZoom());
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lon]);
      }
    }
  }, [lat, lon]);

  // Handle focus coordinates passed from other views
  useEffect(() => {
    if (focusCoordinates && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([focusCoordinates.lat, focusCoordinates.lon], 9, {
        duration: 1.2
      });
    }
  }, [focusCoordinates]);

  // Update Base Map Theme
  useEffect(() => {
    if (!baseTileLayerRef.current || !mapInstanceRef.current) return;
    baseTileLayerRef.current.setUrl(getBaseMapUrl(mapTheme));
  }, [mapTheme]);

  // Manage high-visibility Contours (Coastlines & National Boundaries) and Labels overlay
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Remove existing contour layer if present
    if (contoursTileLayerRef.current) {
      mapInstanceRef.current.removeLayer(contoursTileLayerRef.current);
      contoursTileLayerRef.current = null;
    }
    // Remove existing labels layer if present
    if (labelsTileLayerRef.current) {
      mapInstanceRef.current.removeLayer(labelsTileLayerRef.current);
      labelsTileLayerRef.current = null;
    }

    // 1. High-Contrast Contours & Political Boundaries Overlay (above weather, below labels)
    if (showContours) {
      const contoursLayer = L.tileLayer.wms('https://view.eumetsat.int/geoserver/wms', {
        layers: 'backgrounds:ne_10m_coastline,backgrounds:ne_boundary_lines_land',
        format: 'image/png',
        transparent: true,
        maxZoom: 18,
        pane: 'contoursPane',
        zIndex: 450,
        opacity: 0.95,
        attribution: '&copy; Natural Earth / EUMETSAT Boundaries'
      }).addTo(mapInstanceRef.current);
      contoursTileLayerRef.current = contoursLayer;
    }

    // 2. High-Contrast City & Region Labels Overlay (above contours)
    if (showLabels) {
      const labelsUrl = mapTheme === 'satellite'
        ? 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png';

      const labelsLayer = L.tileLayer(labelsUrl, {
        maxZoom: 18,
        pane: 'labelsPane',
        zIndex: 500,
        opacity: 1.0,
        attribution: '&copy; CARTO'
      }).addTo(mapInstanceRef.current);
      labelsTileLayerRef.current = labelsLayer;
    }
  }, [showContours, showLabels, mapTheme]);

  // Update Radar / European Satellite Tile Layer (or DPC playback overlay)
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (radarTileLayerRef.current) {
      mapInstanceRef.current.removeLayer(radarTileLayerRef.current);
      radarTileLayerRef.current = null;
    }
    if (dpcImageOverlayRef.current) {
      mapInstanceRef.current.removeLayer(dpcImageOverlayRef.current);
      dpcImageOverlayRef.current = null;
    }
    const dpcProduct = DPC_PLAYBACK_PRODUCT[radarLayerType];

    // DPC playback mode: serve the selected historical frame as Web-Mercator
    // tiles (/dpc/tile) so playback stays sharp at every zoom — like Zoom Earth.
    if (dpcProduct && dpcPlaybackActive && frames.length > 0 && dpcBounds) {
      const frame = frames[Math.min(currentFrameIndex, frames.length - 1)];
      if (frame && !dpcTileSupported) {
        if (dpcTileLayerRef.current) {
          mapInstanceRef.current.removeLayer(dpcTileLayerRef.current);
          dpcTileLayerRef.current = null;
          dpcTileBoundsRef.current = null;
          dpcTileTemplateRef.current = null;
        }
        const overlay = L.imageOverlay(frame.path, dpcBounds, {
          opacity: radarOpacity,
          pane: 'weatherPane',
          interactive: false
        }).addTo(mapInstanceRef.current);
        dpcImageOverlayRef.current = overlay;
        return;
      }
      if (frame) {
        const template = `${dpcProxyUrl}/dpc/tile?product=${dpcProduct}&time=${Math.round(frame.time * 1000)}&z={z}&x={x}&y={y}`;
        const existing = dpcTileLayerRef.current;
        if (existing && dpcTileBoundsRef.current === dpcBounds) {
          if (dpcTileTemplateRef.current !== template) {
            // Leaflet reloads the visible tile set when the template changes.
            // Do not gate playback on tile events: one slow/404 tile can
            // otherwise freeze the whole animation indefinitely.
            existing.setUrl(template);
            dpcTileTemplateRef.current = template;
          }
          existing.setOpacity(radarOpacity);
        } else {
          if (existing) {
            mapInstanceRef.current.removeLayer(existing);
            dpcTileLayerRef.current = null;
          }
          const layer = L.tileLayer(template, {
            bounds: dpcBounds,
            minZoom: 3,
            maxZoom: 18,
            noWrap: true,
            opacity: radarOpacity,
            pane: 'weatherPane',
            zIndex: 350,
            errorTileUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>'
          }).addTo(mapInstanceRef.current);
          dpcTileLayerRef.current = layer;
          dpcTileBoundsRef.current = dpcBounds;
          dpcTileTemplateRef.current = template;
        }
      }
      return;
    }

    // Not in playback mode — drop any leftover playback tiles.
    if (dpcTileLayerRef.current) {
      mapInstanceRef.current.removeLayer(dpcTileLayerRef.current);
      dpcTileLayerRef.current = null;
      dpcTileBoundsRef.current = null;
      dpcTileTemplateRef.current = null;
    }

    const dpcLayer = DPC_TILED_LAYERS[radarLayerType];

    if (radarLayerType === 'radar') {
      const tileConfig = getOverlayTileConfig();
      if (tileConfig) {
        const tileLayer = L.tileLayer(tileConfig.url, {
          opacity: radarOpacity,
          tileSize: tileConfig.tileSize,
          zoomOffset: tileConfig.zoomOffset,
          maxNativeZoom: tileConfig.maxNativeZoom,
          maxZoom: tileConfig.maxZoom,
          errorTileUrl: tileConfig.errorTileUrl,
          pane: 'weatherPane',
          zIndex: 350
        }).addTo(mapInstanceRef.current);
        radarTileLayerRef.current = tileLayer;
      }
    } else if (radarLayerType === 'mtg-truecolor') {
      // EUMETSAT MTG-I1 / Meteosat-12 True Colour RGB (0.5–1km resolution FCI)
      const wmsLayer = L.tileLayer.wms('https://view.eumetsat.int/geoserver/wms', {
        layers: 'mtg_fd:rgb_truecolour',
        format: 'image/png',
        transparent: true,
        opacity: radarOpacity,
        maxNativeZoom: 14,
        maxZoom: 18,
        pane: 'weatherPane',
        attribution: '&copy; EUMETSAT MTG-I1 / Meteosat-12 True Colour (FCI Full-Disc)',
        zIndex: 350
      }).addTo(mapInstanceRef.current);
      radarTileLayerRef.current = wmsLayer;
    } else if (radarLayerType === 'mtg-li') {
      // EUMETSAT MTG-I1 Lightning Imager (LI) accumulated flash area
      const wmsLayer = L.tileLayer.wms('https://view.eumetsat.int/geoserver/wms', {
        layers: 'mtg_fd:li_afa',
        format: 'image/png',
        transparent: true,
        opacity: radarOpacity,
        maxNativeZoom: 14,
        maxZoom: 18,
        pane: 'weatherPane',
        attribution: '&copy; EUMETSAT MTG-I1 Lightning Imager (LI)',
        zIndex: 350
      }).addTo(mapInstanceRef.current);
      radarTileLayerRef.current = wmsLayer;
    } else if (radarLayerType === 'mtg-convection') {
      // EUMETSAT Severe Convective Storms RGB (highlights convective storm cores, updrafts & high ice crystals)
      const wmsLayer = L.tileLayer.wms('https://view.eumetsat.int/geoserver/wms', {
        layers: 'msg_fes:rgb_convection',
        format: 'image/png',
        transparent: true,
        opacity: radarOpacity,
        maxNativeZoom: 14,
        maxZoom: 18,
        pane: 'weatherPane',
        attribution: '&copy; EUMETSAT Severe Convective Storms RGB',
        zIndex: 350
      }).addTo(mapInstanceRef.current);
      radarTileLayerRef.current = wmsLayer;
    } else if (radarLayerType === 'mtg-cloudtop') {
      // EUMETSAT MTG High-Resolution Infrared Summit Temperature (FCI Channel 10.5 µm - Clean Window)
      const wmsLayer = L.tileLayer.wms('https://view.eumetsat.int/geoserver/wms', {
        layers: 'mtg_fd:ir105_hrfi',
        format: 'image/png',
        transparent: true,
        opacity: radarOpacity,
        maxNativeZoom: 14,
        maxZoom: 18,
        pane: 'weatherPane',
        attribution: '&copy; EUMETSAT MTG-I1 IR 10.5µm Clean Window (FCI High-Resolution)',
        zIndex: 350
      }).addTo(mapInstanceRef.current);
      radarTileLayerRef.current = wmsLayer;
    } else if (radarLayerType === 'eumetsat-natural') {
      // 15-minute European Meteosat SEVIRI Natural Colour Enhanced RGB
      const wmsLayer = L.tileLayer.wms('https://view.eumetsat.int/geoserver/wms', {
        layers: 'msg_fes:rgb_naturalenhncd',
        format: 'image/png',
        transparent: true,
        opacity: radarOpacity,
        maxNativeZoom: 14,
        maxZoom: 18,
        pane: 'weatherPane',
        attribution: '&copy; EUMETSAT Meteosat Natural Colour (15-min feed)',
        zIndex: 350
      }).addTo(mapInstanceRef.current);
      radarTileLayerRef.current = wmsLayer;
    } else if (radarLayerType === 'eumetsat-ir') {
      // 15-minute European Meteosat SEVIRI Thermal Infrared (10.8 µm - Day/Night)
      const wmsLayer = L.tileLayer.wms('https://view.eumetsat.int/geoserver/wms', {
        layers: 'msg_fes:ir108',
        format: 'image/png',
        transparent: true,
        opacity: radarOpacity,
        maxNativeZoom: 14,
        maxZoom: 18,
        pane: 'weatherPane',
        attribution: '&copy; EUMETSAT Meteosat IR 10.8µm (15-min feed)',
        zIndex: 350
      }).addTo(mapInstanceRef.current);
      radarTileLayerRef.current = wmsLayer;
    } else if (radarLayerType === 'dwd-sat') {
      // EUMETSAT Airmass RGB Composite (Jet streams, upper-level vorticity, tropopause folding)
      const wmsLayer = L.tileLayer.wms('https://view.eumetsat.int/geoserver/wms', {
        layers: 'msg_fes:rgb_airmass',
        format: 'image/png',
        transparent: true,
        opacity: radarOpacity,
        maxNativeZoom: 14,
        maxZoom: 18,
        pane: 'weatherPane',
        attribution: '&copy; EUMETSAT Airmass RGB Composite (15-min feed)',
        zIndex: 350
      }).addTo(mapInstanceRef.current);
      radarTileLayerRef.current = wmsLayer;
    } else if (dpcLayer) {
      // DPC / ARPA national radar — pre-rendered WMS tiles (Italy + central Mediterranean)
      const wmsLayer = L.tileLayer.wms(DPC_WMS_ENDPOINT, {
        layers: dpcLayer.wmsLayer,
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        opacity: radarOpacity,
        maxZoom: 18,
        errorTileUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>',
        pane: 'weatherPane',
        attribution: dpcLayer.attribution,
        zIndex: 350
      }).addTo(mapInstanceRef.current);
      radarTileLayerRef.current = wmsLayer;
    }
  }, [radarLayerType, radarOpacity, getOverlayTileConfig, frames, currentFrameIndex, smoothRadar, colorScheme, dpcPlaybackActive, dpcBounds, dpcTileSupported]);

  // Allerte zone overlay — DPC warning zones colored by criticality level.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (allerteLayerRef.current) {
      map.removeLayer(allerteLayerRef.current);
      allerteLayerRef.current = null;
    }
    if (!showAllerte || !allerteZones) return;
    const layer = L.geoJSON(allerteZones, {
      pane: 'allertePane',
      style: (f) => {
        const level = zoneLevel((f?.properties ?? {}) as Record<string, unknown>);
        const meta = LEVEL_META[level];
        return {
          color: meta.color,
          weight: level === 'red' ? 2.8 : level === 'orange' ? 2.4 : level === 'yellow' ? 2 : 1.25,
          fillColor: meta.fill,
          fillOpacity: level === 'red' ? 0.68 : level === 'orange' ? 0.58 : level === 'yellow' ? 0.48 : 0.16,
          opacity: 0.98
        };
      },
      onEachFeature: (f, lyr) => {
        const props = zoneProperties((f?.properties ?? {}) as Record<string, unknown>);
        const meta = LEVEL_META[zoneLevel((f?.properties ?? {}) as Record<string, unknown>)];
        const comuni =
          props.municipalities.length > 4
            ? `${props.municipalities.slice(0, 4).join(', ')}… (+${props.municipalities.length - 4})`
            : props.municipalities.join(', ');
        lyr.bindTooltip(
          `<div class="p-1.5 text-slate-900 text-xs max-w-[240px]"><strong>${props.zoneName}</strong><br/><span class="font-bold" style="color:${meta.color}">${meta.label}</span><div class="text-[10px] text-slate-600 mt-1">${comuni}</div></div>`,
          { sticky: true }
        );
      }
    }).addTo(map);
    allerteLayerRef.current = layer;
  }, [showAllerte, allerteZones]);

  // Draw Range Rings & Detected Rain Cell Overlays on Map
  useEffect(() => {
    if (!overlayGroupRef.current || !mapInstanceRef.current) return;
    overlayGroupRef.current.clearLayers();

    // 1. Range Rings (25km, 50km, 100km)
    if (showRangeRings) {
      const radii = [
        { km: 25, color: '#38bdf8', label: '25 km' },
        { km: 50, color: '#818cf8', label: '50 km' },
        { km: 100, color: '#a855f7', label: '100 km' }
      ];

      radii.forEach(({ km, color, label }) => {
        const circle = L.circle([lat, lon], {
          radius: km * 1000,
          color,
          weight: 1,
          dashArray: '4, 8',
          fill: false,
          opacity: 0.45
        });
        overlayGroupRef.current?.addLayer(circle);

        const angleRad = (45 * Math.PI) / 180;
        const earthRadiusKm = 6371;
        const dLat = (km / earthRadiusKm) * (180 / Math.PI) * Math.cos(angleRad);
        const dLon = ((km / earthRadiusKm) * (180 / Math.PI) * Math.sin(angleRad)) / Math.cos((lat * Math.PI) / 180);

        const ringMarker = L.marker([lat + dLat, lon + dLon], {
          icon: L.divIcon({
            className: 'text-[10px] font-mono font-bold text-slate-400 bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-700 pointer-events-none whitespace-nowrap shadow-sm',
            html: label,
            iconSize: [40, 16],
            iconAnchor: [20, 8]
          })
        });
        overlayGroupRef.current?.addLayer(ringMarker);
      });
    }

    // 2. Detected Approaching Rain Cells & Vectors
    const regionalCells = (weatherData?.regionalScanPoints || []).filter(
      (p) => p.precipitationMmH >= 0.1 || p.next1hPrecipMmH >= 0.2 || p.weatherCode >= 50
    );

    regionalCells.forEach((cell, idx) => {
      const heading = (cell.windDirDeg + 180) % 360;
      const headingRad = (heading * Math.PI) / 180;
      const arrowDistKm = 12 + Math.min(25, cell.windSpeedKmH * 0.4);
      const earthRadiusKm = 6371;

      const endLat = cell.latitude + (arrowDistKm / earthRadiusKm) * (180 / Math.PI) * Math.cos(headingRad);
      const endLon = cell.longitude + ((arrowDistKm / earthRadiusKm) * (180 / Math.PI) * Math.sin(headingRad)) / Math.cos((cell.latitude * Math.PI) / 180);

      // Cell pulse marker
      const cellMarker = L.circleMarker([cell.latitude, cell.longitude], {
        radius: 8,
        fillColor: cell.precipitationMmH > 2.5 ? '#ef4444' : '#f59e0b',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 0.9
      });
      cellMarker.bindTooltip(`
        <div class="p-1 text-slate-900 text-xs">
          <strong>Rain Cell #${idx + 1} (${cell.precipitationMmH.toFixed(1)} mm/h)</strong><br/>
          ${cell.distanceKm} km away • Moving towards ${getWindDirection(heading)} at ${Math.round(cell.windSpeedKmH)} km/h
        </div>
      `);
      overlayGroupRef.current?.addLayer(cellMarker);

      // Trajectory vector line
      const line = L.polyline(
        [
          [cell.latitude, cell.longitude],
          [endLat, endLon]
        ],
        {
          color: cell.precipitationMmH > 2.5 ? '#ef4444' : '#f59e0b',
          weight: 2.5,
          dashArray: '4, 4'
        }
      );
      overlayGroupRef.current?.addLayer(line);
    });

    // 3. Station Primary Storm Vector Arrow
    if (showVectorArrow && (prediction?.detectedCell || prediction?.movementVector)) {
      const cell = prediction.detectedCell?.activatingCell;
      const mv = prediction.movementVector;
      const bearing = cell?.vector?.headingDeg ?? mv?.headingDeg ?? mv?.originBearingDeg;
      const speedKmh = cell?.vector?.speedKmH ?? mv?.estimatedSpeedKmH ?? 25;

      if (bearing !== undefined && speedKmh > 0) {
        const bearingRad = (bearing * Math.PI) / 180;
        const arrowDistKm = 25 + Math.min(45, speedKmh * 0.5);
        const earthRadiusKm = 6371;

        const endLat = lat + (arrowDistKm / earthRadiusKm) * (180 / Math.PI) * Math.cos(bearingRad);
        const endLon = lon + ((arrowDistKm / earthRadiusKm) * (180 / Math.PI) * Math.sin(bearingRad)) / Math.cos((lat * Math.PI) / 180);

        const polyline = L.polyline(
          [
            [lat, lon],
            [endLat, endLon]
          ],
          {
            color: '#38bdf8',
            weight: 3,
            opacity: 0.95,
            dashArray: '6, 6'
          }
        );
        overlayGroupRef.current?.addLayer(polyline);

        const arrowHead = L.circleMarker([endLat, endLon], {
          radius: 7,
          fillColor: '#38bdf8',
          color: '#ffffff',
          weight: 2,
          fillOpacity: 1
        });
        arrowHead.bindTooltip(`Station Steering Vector: ${speedKmh} km/h towards ${bearing.toFixed(0)}°`);
        overlayGroupRef.current?.addLayer(arrowHead);
      }
    }

    // 4. MTG Lightning Imager (LI) Optical Strikes & Total Lightning Overlays
    const strikes = weatherData?.lightningStrikes || [];
    const isMtgLiActive = radarLayerType === 'mtg-li' || strikes.length > 0;

    if (isMtgLiActive && strikes.length > 0) {
      strikes.forEach((strike, idx) => {
        const isRecent = strike.ageMinutes <= 5;
        const color = isRecent ? '#fbbf24' : '#f59e0b';
        const pulseColor = isRecent ? 'rgba(251, 191, 36, 0.4)' : 'rgba(245, 158, 11, 0.2)';

        // Pulse ring around strike
        const pulseCircle = L.circle([strike.lat, strike.lon], {
          radius: (strike.energyPj ? Math.min(15000, strike.energyPj * 40) : 6000),
          color: color,
          weight: 1.5,
          fillColor: pulseColor,
          fillOpacity: 0.35,
          dashArray: '3, 4'
        });
        overlayGroupRef.current?.addLayer(pulseCircle);

        // Strike Icon Marker
        const strikeMarker = L.marker([strike.lat, strike.lon], {
          icon: L.divIcon({
            className: 'custom-lightning-marker cursor-pointer',
            html: `
              <div class="relative flex items-center justify-center">
                <div class="absolute w-7 h-7 rounded-full bg-amber-400/40 animate-ping"></div>
                <div class="relative w-6 h-6 rounded-full bg-amber-400 border-2 border-slate-950 flex items-center justify-center text-slate-950 shadow-lg font-bold text-[11px]">
                  ⚡
                </div>
              </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })
        });

        strikeMarker.bindPopup(`
          <div class="p-2 text-slate-900 text-xs font-sans space-y-1">
            <div class="font-bold text-amber-700 flex items-center gap-1 text-sm">
              <span>⚡ MTG LI Lightning Strike #${idx + 1}</span>
            </div>
            <div><strong>Type:</strong> ${strike.type || (strike.polarity === '-' ? 'Negative Cloud-to-Ground' : 'Positive Cloud-to-Ground / IC')}</div>
            <div><strong>Distance:</strong> ${strike.distanceKm.toFixed(1)} km (${strike.bearingDeg.toFixed(0)}° ${getWindDirection(strike.bearingDeg)})</div>
            <div><strong>Peak Current:</strong> ${strike.currentKa ? `${strike.polarity}${strike.currentKa} kA` : '15 kA'}</div>
            <div><strong>Optical Radiance:</strong> ${strike.energyPj || 145} pJ/sr/m²</div>
            <div><strong>Observed:</strong> ${strike.ageMinutes === 0 ? 'Just now (&lt;1 min)' : `${strike.ageMinutes} min ago`}</div>
            <div class="text-[10px] text-slate-500 pt-1 border-t border-slate-200">
              EUMETSAT MTG-I1 Lightning Imager (LI Level-2)
            </div>
          </div>
        `);
        overlayGroupRef.current?.addLayer(strikeMarker);
      });
    }

    // 5. DPC radar rain cells (Italy playback) — intensity-scaled markers
    // 6. Approaching-cell track line (proximity storm alarm)
    if (dpcPlaybackActive && dpcCells.length > 0) {
      dpcCells.forEach((cell) => {
        const color = cell.maxMmH >= 10 ? '#ef4444' : cell.maxMmH >= 5 ? '#f59e0b' : '#38bdf8';
        const marker = L.circleMarker([cell.lat, cell.lon], {
          radius: Math.min(14, 5 + cell.maxMmH * 0.5),
          fillColor: color,
          color: '#ffffff',
          weight: 1.5,
          fillOpacity: 0.75
        });
        marker.bindTooltip(
          `<div class="p-1 text-slate-900 text-xs"><strong>${cell.maxMmH} mm/h rain cell</strong><br/>${cell.distanceKm} km ${getWindDirection(cell.bearingDeg)}</div>`
        );
        overlayGroupRef.current?.addLayer(marker);
      });
    }

    if (dpcApproach) {
      const { cellLat, cellLon, headingDeg, etaMinutes, intensity } = dpcApproach;
      const endLat = cellLat + (45 / 110.574) * Math.cos((headingDeg * Math.PI) / 180);
      const endLon =
        cellLon + (45 / (111.32 * Math.cos((cellLat * Math.PI) / 180))) * Math.sin((headingDeg * Math.PI) / 180);
      const line = L.polyline(
        [
          [cellLat, cellLon],
          [endLat, endLon]
        ],
        { color: '#f43f5e', weight: 3, dashArray: '6, 5', opacity: 0.95 }
      );
      line.bindTooltip(`Approaching rain: ETA ~${etaMinutes} min, ${intensity} mm/h`);
      overlayGroupRef.current?.addLayer(line);
      const head = L.circleMarker([endLat, endLon], {
        radius: 6,
        fillColor: '#f43f5e',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 1
      });
      overlayGroupRef.current?.addLayer(head);
    }
  }, [lat, lon, showRangeRings, showVectorArrow, prediction, weatherData, radarLayerType, dpcPlaybackActive, dpcCells, dpcApproach]);

  // Prefetch the next frame while playing (warms the proxy raster cache so
  // the frame change paints almost instantly).
  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;
    if (!DPC_PLAYBACK_PRODUCT[radarLayerType]) return;
    const next = frames[(currentFrameIndex + 1) % frames.length];
    if (next && next.path) {
      const pre = new Image();
      pre.src = next.path;
    }
  }, [isPlaying, frames, currentFrameIndex, radarLayerType]);

  const currentFrame = frames[currentFrameIndex];
  const isFutureFrame = currentFrame && radarMaps?.radar?.nowcast?.some((f) => f.time === currentFrame.time);
  const isPastFrame = currentFrame && radarMaps?.radar?.past?.some((f) => f.time === currentFrame.time);

  const maxAllowedZoom = getMaxZoomForLayer(radarLayerType);

  const legend = getLayerLegend(radarLayerType);

  const dpcPointColor =
    dpcPoint?.value == null
      ? 'bg-slate-950 border-slate-800 text-slate-300'
      : dpcPoint.value >= 30
      ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
      : dpcPoint.value >= 15
      ? 'bg-red-500/15 border-red-500/40 text-red-300'
      : dpcPoint.value >= 5
      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
      : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300';

  const handleZoomIn = () => {
    if (mapInstanceRef.current && currentZoom < maxAllowedZoom) {
      mapInstanceRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current && currentZoom > 3) {
      mapInstanceRef.current.zoomOut();
    }
  };

  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([lat, lon], 8, { duration: 0.8 });
    }
  };

  const handleStepBack = () => {
    setIsPlaying(false);
    setPendingFrameIdx(null);
    setCurrentFrameIndex((prev) => (prev === 0 ? frames.length - 1 : prev - 1));
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    setPendingFrameIdx(null);
    setCurrentFrameIndex((prev) => (prev + 1) % frames.length);
  };

  const handleFlyToCell = (cellLat: number, cellLon: number) => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([cellLat, cellLon], Math.min(10, maxAllowedZoom), {
        duration: 1.2
      });
    }
  };

  const detectedCells = (weatherData?.regionalScanPoints || []).filter(
    (p) => p.precipitationMmH >= 0.1 || p.next1hPrecipMmH >= 0.2 || p.weatherCode >= 50
  );

  const rank = { none: 0, yellow: 1, orange: 2, red: 3 } as const;
  const allerteStats = useMemo(() => {
    if (!allerteZones) return null;
    const features = allerteZones.features as Feature[];
    const myZones = features.filter((f) => pointInFeature(f, lat, lon));
    const alerting = features
      .map((f) => ({
        feature: f,
        level: zoneLevel((f.properties ?? {}) as Record<string, unknown>),
        props: zoneProperties((f.properties ?? {}) as Record<string, unknown>)
      }))
      .filter((x) => x.level !== 'none')
      .sort((a, b) => rank[b.level] - rank[a.level]);
    return { myZones, alerting };
  }, [allerteZones, lat, lon]);

  return (
    <div className="w-full px-2 sm:px-4 py-4 space-y-4 mb-24 animate-fadeIn">
      {/* Top Header & Layer Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 flex-wrap">
              <span>{locationName}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-normal">
                {lat.toFixed(2)}°N, {lon.toFixed(2)}°E
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              All layers in one picker — Europe (RainViewer / EUMETSAT) and Italy (DPC/ARPA), shared playback
            </p>
          </div>
        </div>

        {/* Layers — one picker: Europe & Italy radar, satellite, refresh */}
        <div className="flex flex-col gap-3 w-full min-w-0">
          {/* RADAR group */}
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-start sm:items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400/80 shrink-0 w-16 pt-2">Radar</span>
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 flex-wrap min-w-0">
                <span className="px-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 shrink-0">Europe</span>
                {/* Doppler Radar (RainViewer) */}
                <button
                  onClick={() => selectLayer('radar')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    radarLayerType === 'radar'
                      ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="RainViewer European radar — live 10-min scans plus extrapolated nowcast frames"
                >
                  <CloudRain className="w-3.5 h-3.5" />
                  <span>Rain Radar (dBZ)</span>
                </button>

                <span className="px-1.5 text-[9px] font-bold uppercase tracking-wider text-teal-400/90 shrink-0 border-l border-slate-700 ml-1">Italy · DPC/ARPA</span>

                {/* DPC live products */}
                <button
                  onClick={() => selectLayer('dpc-vmi')}
                  title="VMI — rain rate · 5 min · five-hour playback"
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    radarLayerType === 'dpc-vmi'
                      ? 'bg-teal-500 text-white shadow-md shadow-teal-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  VMI
                </button>
                <button
                  onClick={() => selectLayer('dpc-sri')}
                  title="SRI — surface rain · 5 min · five-hour playback"
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    radarLayerType === 'dpc-sri'
                      ? 'bg-teal-500 text-white shadow-md shadow-teal-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  SRI
                </button>
                <button
                  onClick={() => selectLayer('dpc-dbz')}
                  title="dBZ — reflectivity · live WMS (no playback)"
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    radarLayerType === 'dpc-dbz'
                      ? 'bg-teal-500 text-white shadow-md shadow-teal-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  dBZ
                </button>

                {/* DPC accumulations */}
                <button
                  onClick={() => selectLayer('dpc-srt1')}
                  title="Σ1h — 1-hour accumulation · five-hour playback"
                  className={`px-2 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    radarLayerType === 'dpc-srt1'
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                      : 'text-amber-300/80 hover:text-amber-200'
                  }`}
                >
                  Σ1h
                </button>
                <button
                  onClick={() => selectLayer('dpc-srt3')}
                  title="Σ3h — 3-hour accumulation · five-hour playback"
                  className={`px-2 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    radarLayerType === 'dpc-srt3'
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                      : 'text-amber-300/80 hover:text-amber-200'
                  }`}
                >
                  Σ3h
                </button>
                <button
                  onClick={() => selectLayer('dpc-srt6')}
                  title="Σ6h — 6-hour accumulation · five-hour playback"
                  className={`px-2 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    radarLayerType === 'dpc-srt6'
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                      : 'text-amber-300/80 hover:text-amber-200'
                  }`}
                >
                  Σ6h
                </button>
                <button
                  onClick={() => selectLayer('dpc-srt12')}
                  title="Σ12h — 12-hour accumulation · five-hour playback"
                  className={`px-2 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    radarLayerType === 'dpc-srt12'
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                      : 'text-amber-300/80 hover:text-amber-200'
                  }`}
                >
                  Σ12h
                </button>
                <button
                  onClick={() => selectLayer('dpc-srt24')}
                  title="Σ24h — 24-hour accumulation · five-hour playback"
                  className={`px-2 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    radarLayerType === 'dpc-srt24'
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                      : 'text-amber-300/80 hover:text-amber-200'
                  }`}
                >
                  Σ24h
                </button>

                {/* Nowcast — RainViewer extrapolated forecast */}
                <button
                  onClick={() => selectLayer('radar')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap border ml-1 ${
                    radarLayerType === 'radar' && isFutureFrame
                      ? 'bg-sky-500 text-white border-sky-400 shadow-md shadow-sky-500/20'
                      : 'border-sky-500/25 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20'
                  }`}
                  title="Nowcast — RainViewer extrapolated short-range forecast, shown as future frames in the timeline"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Nowcast</span>
                </button>
              </div>
            </div>
          </div>

          {/* SATELLITE group */}
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-start sm:items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400/80 shrink-0 w-16 pt-2">Satellite</span>
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 flex-wrap min-w-0">
                <span className="px-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 shrink-0">MTG-I1</span>

                {/* MTG TrueColour GeoColour */}
                <button
                  onClick={() => selectLayer('mtg-truecolor')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    radarLayerType === 'mtg-truecolor'
                      ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="MTG-I1 True Colour Optical GeoColour — Meteosat-12, 10-min scan"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>TrueColour</span>
                </button>

                {/* MTG Severe Convection RGB */}
                <button
                  onClick={() => selectLayer('mtg-convection')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    radarLayerType === 'mtg-convection'
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="MTG-I1 Severe Convective Storms RGB — overshooting tops & updraft cores"
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Convection</span>
                </button>

                {/* MTG Cloud Top Temperatures (CTTH IR) */}
                <button
                  onClick={() => selectLayer('mtg-cloudtop')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    radarLayerType === 'mtg-cloudtop'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="MTG-I1 Cloud Top Height & cold infrared summit temperature"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Cloud Tops</span>
                </button>

                {/* MTG Lightning Imager (LI) */}
                <button
                  onClick={() => selectLayer('mtg-li')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    radarLayerType === 'mtg-li'
                      ? 'bg-yellow-500 text-slate-950 font-black shadow-md shadow-yellow-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="MTG-I1 Lightning Imager — optical flash density & strikes"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Lightning</span>
                </button>

                <span className="px-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 shrink-0 border-l border-slate-700 ml-1">Meteosat</span>

                {/* Live EUMETSAT Natural Colour (15-min) */}
                <button
                  onClick={() => selectLayer('eumetsat-natural')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    radarLayerType === 'eumetsat-natural'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Meteosat High-Rate 15-minute optical & cloud feed"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Natural</span>
                </button>

                {/* Live EUMETSAT Thermal IR 10.8µm (24/7 Day/Night) */}
                <button
                  onClick={() => selectLayer('eumetsat-ir')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    radarLayerType === 'eumetsat-ir'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Meteosat Thermal Infrared 10.8µm — day & night cold cloud tops"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>IR 24/7</span>
                </button>

                {/* EUMETSAT Airmass RGB */}
                <button
                  onClick={() => selectLayer('dwd-sat')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    radarLayerType === 'dwd-sat'
                      ? 'bg-slate-700 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="EUMETSAT Airmass RGB — jet streams, upper-level vorticity & tropopause folding"
                >
                  <span>Airmass</span>
                </button>

                <span className="px-1.5 text-[9px] font-bold uppercase tracking-wider text-indigo-400/90 shrink-0 border-l border-slate-700 ml-1">Italy</span>

                {/* DPC regional IR */}
                <button
                  onClick={() => selectLayer('dpc-ir')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    radarLayerType === 'dpc-ir'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="DPC/ARPA regional infrared composite — 15-min · five-hour playback"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>IR</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-between w-full border-t border-slate-800/70 pt-2.5">
            <span className="text-[10px] text-slate-500 leading-relaxed">
              Italy products play back the last 5h below the map · Nowcast appears as forecast frames in the timeline
            </span>
            <button
              onClick={() => {
                loadRadarData();
                const product = DPC_PLAYBACK_PRODUCT[radarLayerType];
                if (product && dpcProxyUrl) loadDpcFrames(radarLayerType, false);
              }}
              disabled={loadingRadar}
              className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer disabled:opacity-50 shrink-0"
              title="Refresh Live Data"
            >
              <RefreshCw className={`w-4 h-4 ${loadingRadar ? 'animate-spin text-sky-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Map Context Bar & Controls Toolbar (Above Map) */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-3 sm:p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
        {/* Active Layer & Satellite Image Timestamp HUD */}
        {(() => {
          const imageInfo = getImageTimestampInfo();
          return (
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Active Layer Badge */}
              <div className="bg-slate-950 px-3 py-1.5 rounded-2xl border border-slate-800 shadow-sm text-xs font-semibold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="truncate max-w-[180px] sm:max-w-xs md:max-w-sm">
                  {radarLayerType === 'radar'
                    ? 'Doppler Rain Reflectivity'
                    : radarLayerType === 'mtg-truecolor'
                    ? 'EUMETSAT MTG-I1 True Colour'
                    : radarLayerType === 'mtg-convection'
                    ? 'EUMETSAT Severe Convection'
                    : radarLayerType === 'mtg-cloudtop'
                    ? 'EUMETSAT MTG FCI 10.5µm IR'
                    : radarLayerType === 'mtg-li'
                    ? 'EUMETSAT MTG Lightning Imager'
                    : radarLayerType === 'eumetsat-natural'
                    ? 'EUMETSAT Meteosat Natural Colour'
                    : radarLayerType === 'eumetsat-ir'
                    ? 'EUMETSAT Meteosat Thermal IR'
                    : DPC_TILED_LAYERS[radarLayerType]
                    ? DPC_TILED_LAYERS[radarLayerType].badge
                    : 'EUMETSAT Airmass RGB'}
                </span>
              </div>

              {/* Exact Satellite Image / Radar Scan Timestamp HUD */}
              <div className="bg-slate-950 px-3.5 py-1.5 rounded-2xl border border-slate-800 shadow-sm text-xs flex items-center gap-2 text-slate-200 font-mono">
                <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400 font-sans font-medium">
                    {imageInfo.label}:
                  </span>
                  <span className="font-bold text-white">
                    {imageInfo.utcTime} UTC
                  </span>
                  <span className="text-[11px] text-slate-400 font-sans hidden sm:inline">
                    ({imageInfo.localTime} Local)
                  </span>
                  <span className="text-[10px] font-sans px-2 py-0.5 rounded-full bg-slate-800 text-sky-300 font-semibold border border-slate-700">
                    {imageInfo.ageText}
                  </span>
                  <span
                    className="text-[10px] font-sans px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30 hidden sm:inline-flex items-center gap-1"
                    title="Radar data auto-refreshes every 10 minutes (RainViewer feed cadence)"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Auto 10-min
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Map Actions Toolbar */}
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {/* Contours Quick Toggle */}
          <button
            onClick={() => setShowContours(!showContours)}
            className={`px-3 py-1.5 rounded-2xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
              showContours
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Toggle High-Contrast Coastlines & National Borders"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Contours</span>
          </button>

          {/* City Labels Quick Toggle */}
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`px-3 py-1.5 rounded-2xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
              showLabels
                ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Toggle City & Region Place Names"
          >
            <MapPin className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Labels</span>
          </button>

          {/* Overlays / Settings Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowOverlaysMenu(!showOverlaysMenu)}
              className={`p-2 rounded-2xl border shadow-sm transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                showOverlaysMenu
                  ? 'bg-sky-500 text-white border-sky-400'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
              }`}
              title="More Overlays & Map Settings"
            >
              <Layers className="w-4 h-4" />
              <span className="hidden md:inline">Layers</span>
            </button>

            {/* Overlays Dropdown Panel */}
            {showOverlaysMenu && (
              <div className="absolute right-0 top-11 w-64 bg-slate-900/98 backdrop-blur-xl border border-slate-700 rounded-3xl p-4 shadow-2xl space-y-3.5 z-40 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-sky-400" />
                    Overlay Layers
                  </span>
                  <button
                    onClick={() => setShowOverlaysMenu(false)}
                    className="text-slate-400 hover:text-white text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Contours & Coastlines Toggle */}
                <label className="flex items-center justify-between gap-2 cursor-pointer text-xs group">
                  <span className="text-slate-200 font-medium group-hover:text-white flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Borders & Contours</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={showContours}
                    onChange={(e) => setShowContours(e.target.checked)}
                    className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
                  />
                </label>

                {/* City & Place Labels Toggle */}
                <label className="flex items-center justify-between gap-2 cursor-pointer text-xs group">
                  <span className="text-slate-200 font-medium group-hover:text-white flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-sky-400" />
                    <span>City & Region Labels</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={showLabels}
                    onChange={(e) => setShowLabels(e.target.checked)}
                    className="rounded accent-sky-500 w-4 h-4 cursor-pointer"
                  />
                </label>

                {/* DPC Allerte Warning Zones Toggle */}
                <label className="flex items-center justify-between gap-2 cursor-pointer text-xs group">
                  <span className="text-slate-200 font-medium group-hover:text-white flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                    <span>Allerte DPC (warning zones)</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={showAllerte}
                    onChange={(e) => setShowAllerte(e.target.checked)}
                    className="rounded accent-red-500 w-4 h-4 cursor-pointer"
                  />
                </label>

                {/* Range Rings Toggle */}
                <label className="flex items-center justify-between gap-2 cursor-pointer text-xs group">
                  <span className="text-slate-200 font-medium group-hover:text-white flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-purple-400" />
                    <span>25/50/100km Rings</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={showRangeRings}
                    onChange={(e) => setShowRangeRings(e.target.checked)}
                    className="rounded accent-purple-500 w-4 h-4 cursor-pointer"
                  />
                </label>

                {/* Storm Movement Vectors Toggle */}
                <label className="flex items-center justify-between gap-2 cursor-pointer text-xs group">
                  <span className="text-slate-200 font-medium group-hover:text-white flex items-center gap-1.5">
                    <NavIcon className="w-3.5 h-3.5 text-amber-400" />
                    <span>Storm Vectors</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={showVectorArrow}
                    onChange={(e) => setShowVectorArrow(e.target.checked)}
                    className="rounded accent-amber-500 w-4 h-4 cursor-pointer"
                  />
                </label>

                {/* Weather Layer Opacity Slider */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Layer Opacity</span>
                    <span className="font-mono font-bold text-sky-400">{Math.round(radarOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={1.0}
                    step={0.05}
                    value={radarOpacity}
                    onChange={(e) => setRadarOpacity(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-sky-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Map Theme Toggle */}
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs">
            <button
              onClick={() => setMapTheme('dark')}
              className={`px-2.5 py-1 rounded-xl transition-all font-medium cursor-pointer ${
                mapTheme === 'dark' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Dark
            </button>
            <button
              onClick={() => setMapTheme('satellite')}
              className={`px-2.5 py-1 rounded-xl transition-all font-medium cursor-pointer ${
                mapTheme === 'satellite' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Hybrid
            </button>
            <button
              onClick={() => setMapTheme('streets')}
              className={`px-2.5 py-1 rounded-xl transition-all font-medium cursor-pointer ${
                mapTheme === 'streets' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Streets
            </button>
          </div>

          {/* Recenter Button */}
          <button
            onClick={handleRecenter}
            className="p-2 rounded-2xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white shadow-sm cursor-pointer hover:bg-slate-800 transition-all"
            title="Center on Station"
          >
            <Crosshair className="w-4 h-4 text-sky-400" />
          </button>

          {/* Custom Zoom Buttons */}
          <div className="flex items-center bg-slate-950 rounded-2xl border border-slate-800 shadow-sm overflow-hidden">
            <button
              onClick={handleZoomIn}
              disabled={currentZoom >= maxAllowedZoom}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30"
              title={currentZoom >= maxAllowedZoom ? `Max zoom reached for this layer (${maxAllowedZoom})` : 'Zoom In'}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              disabled={currentZoom <= 3}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer border-l border-slate-800 disabled:opacity-30"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 100% Clean & Unobstructed Map Window */}
      <div className="relative rounded-3xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 h-[75vh] min-h-[560px] lg:h-[82vh]">
        {/* Leaflet Map Canvas */}
        <div ref={mapContainerRef} className="w-full h-full z-0" />
      </div>

      {/* Dedicated Playback & Stream Console (Below Map) — one console for global radar and Italy DPC products */}
      {(radarLayerType === 'radar' || dpcPlaybackActive) && frames.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Playback Controls & Frame Info with Timestamp */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleStepBack}
                className="p-2.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-all cursor-pointer"
                title="Step Back"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  const nextPlay = !isPlaying;
                  setIsPlaying(nextPlay);
                  if (!nextPlay) setPendingFrameIdx(null);
                }}
                className="w-11 h-11 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white flex items-center justify-center shadow-lg shadow-sky-500/25 transition-all cursor-pointer shrink-0"
                title={isPlaying ? 'Pause Loop' : 'Play Loop'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>

              <button
                onClick={handleStepForward}
                className="p-2.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-all cursor-pointer"
                title="Step Forward"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white font-mono flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-sky-400 inline" />
                    {currentFrame ? formatTime(currentFrame.time) : '--:--'} UTC
                  </span>
                  {currentFrame && (
                    <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                      ({new Date(currentFrame.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} Local)
                    </span>
                  )}
                  {isFutureFrame && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                      Nowcast Forecast
                    </span>
                  )}
                  {isPastFrame && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      Live Past Frame
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {radarLayerType === 'radar'
                    ? `Radar Frame ${currentFrameIndex + 1} of ${frames.length} • 10-min interval scan`
                    : `DPC/ARPA ${DPC_PLAYBACK_PRODUCT[radarLayerType] ?? ''} frame ${currentFrameIndex + 1} of ${frames.length} • ${DPC_PLAYBACK_STEP[radarLayerType] ?? 5}-min scan • last ${DPC_PLAYBACK_HOURS}h`}
                  {radarLayerType !== 'radar' && currentFrameIndex === frames.length - 1 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 ml-1">
                      Latest
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Playback Speed & Radar Mode Toggles */}
            <div className="flex items-center gap-2 flex-wrap justify-start md:justify-end">
              <div className="flex items-center bg-slate-950 rounded-2xl p-1 border border-slate-800 text-xs text-slate-400">
                <span className="px-2 text-[10px] uppercase font-bold text-slate-500">Speed</span>
                {[0.5, 1, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => setPlaybackSpeed(s)}
                    className={`px-2.5 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                      playbackSpeed === s ? 'bg-sky-500 text-white' : 'hover:text-slate-200'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              {radarLayerType !== 'radar' && (
                <button
                  onClick={() => loadDpcFrames(radarLayerType, false)}
                  className="px-3 py-1.5 rounded-2xl border text-xs font-semibold transition-all cursor-pointer bg-slate-950 border-slate-800 text-slate-300 hover:text-white flex items-center gap-1.5"
                  title="Reload the DPC frame history"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-teal-400" />
                  Reload
                </button>
              )}

              <button
                onClick={() => setShowRangeRings(!showRangeRings)}
                className={`px-3 py-1.5 rounded-2xl border text-xs font-semibold transition-all cursor-pointer ${
                  showRangeRings
                    ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Range Rings
              </button>

              <button
                onClick={() => setShowVectorArrow(!showVectorArrow)}
                className={`px-3 py-1.5 rounded-2xl border text-xs font-semibold transition-all cursor-pointer ${
                  showVectorArrow
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Storm Vectors
              </button>

              <button
                onClick={() => setSmoothRadar(!smoothRadar)}
                className={`px-3 py-1.5 rounded-2xl border text-xs font-semibold transition-all cursor-pointer ${
                  smoothRadar
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {smoothRadar ? 'Smoothing: ON' : 'Raw Data'}
              </button>
            </div>
          </div>

          {/* Live DPC point sample + approaching-cell alarm (Italy products) */}
          {radarLayerType !== 'radar' && (dpcPoint?.value != null || dpcApproach) && (
            <div className="flex flex-wrap items-center gap-2">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border text-xs font-semibold ${dpcPointColor}`}>
                <MapPin className="w-3.5 h-3.5" />
                {dpcPoint?.value != null
                  ? `${dpcPoint.value} ${dpcPoint.unit} of rain over ${locationName}`
                  : `No precipitation over ${locationName} right now`}
              </div>
              {dpcApproach && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border text-xs font-semibold bg-rose-500/15 border-rose-500/40 text-rose-300 animate-pulse">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Rain cell {dpcApproach.distanceKm} km away • ETA ~{dpcApproach.etaMinutes} min • {dpcApproach.intensity} mm/h
                </div>
              )}
            </div>
          )}

          {/* Scrubber Progress Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400 font-mono">
              <span>{frames.length > 0 ? formatTime(frames[0].time) : '--:--'} UTC (Start)</span>
              <span className="text-sky-400 font-bold">Scrubber (Click / Drag to inspect)</span>
              <span>{frames.length > 0 ? formatTime(frames[frames.length - 1].time) : '--:--'} UTC (Latest)</span>
            </div>
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={currentFrameIndex}
              onChange={(e) => {
                setIsPlaying(false);
                setPendingFrameIdx(null);
                setCurrentFrameIndex(parseInt(e.target.value));
              }}
              className="w-full h-2.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
          </div>
        </div>
      )}

      {/* Radar + satellite insights — live read of the selected image and location */}
      <RadarSatelliteInsights />

      {/* Italy DPC product status — shown when 5h frame history is not available */}
      {DPC_PLAYBACK_PRODUCT[radarLayerType] && frames.length === 0 && (
        <div className="bg-slate-900 border border-amber-500/25 rounded-3xl p-4 sm:p-5 shadow-xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">
                Italy radar history — last {DPC_PLAYBACK_HOURS}h
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {dpcLoading
                  ? 'Fetching DPC frame history…'
                  : dpcError
                  ? dpcError
                  : !dpcProxyUrl
                  ? 'DPC playback proxy not reachable — showing the latest live frame only.'
                  : 'No DPC frames available right now — showing the latest live frame.'}
              </div>
            </div>
          </div>
          {dpcProxyUrl && !dpcLoading && (
            <button
              onClick={() => loadDpcFrames(radarLayerType, false)}
              className="px-3.5 py-2 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-teal-400" />
              Retry
            </button>
          )}
        </div>
      )}

      {/* Allerte — official DPC Bollettino di Criticità (warning zones + levels) */}
      {(isInItaly(lat, lon) || DPC_TILED_LAYERS[radarLayerType]) && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                  <span>Allerte — Bollettino di Criticità</span>
                  {allerteBulletin && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {allerteBulletin.name}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Official DPC warning zones — hydrogeological / hydraulic / thunderstorm criticality (published daily)
                </div>
              </div>
            </div>
            <button
              onClick={() => loadAllerte()}
              className="px-3.5 py-2 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-red-400 ${allerteLoading ? 'animate-spin' : ''}`} />
              Refresh bulletin
            </button>
          </div>

          {allerteLoading && !allerteBulletin && (
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-400" />
              Loading the latest DPC bulletin…
            </div>
          )}
          {allerteError && !allerteBulletin && (
            <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-2xl p-3">
              {allerteError} — the official bulletin is published once a day (~13:00 CET); try again later.
            </div>
          )}

          {allerteBulletin && (
            <div className="space-y-4">
              {allerteStats && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Your warning zone
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allerteStats.myZones.length > 0 ? (
                      allerteStats.myZones.slice(0, 3).map((f, i) => {
                        const props = zoneProperties((f.properties ?? {}) as Record<string, unknown>);
                        const meta = LEVEL_META[zoneLevel((f.properties ?? {}) as Record<string, unknown>)];
                        return (
                          <span key={i} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border text-xs font-semibold ${meta.chip}`}>
                            <MapPin className="w-3.5 h-3.5" />
                            {props.zoneName}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-xs text-slate-400">
                        Location not covered by the national bulletin (outside Italy).
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                {stripHtml(allerteBulletin.today.description)}
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800/70 text-xs text-slate-400 leading-relaxed whitespace-pre-line">
                <span className="font-bold text-slate-200">Tomorrow: </span>
                {stripHtml(allerteBulletin.tomorrow.description) || 'No forecast published yet.'}
              </div>

              {allerteStats && allerteStats.alerting.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {allerteStats.alerting.length} zone(s) under alert today
                  </div>
                  <div className="max-h-44 overflow-y-auto scrollbar-thin space-y-1 pr-1">
                    {allerteStats.alerting.slice(0, 12).map((x, i) => {
                      const meta = LEVEL_META[x.level];
                      return (
                        <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs">
                          <span className="text-slate-200 font-medium truncate">{x.props.zoneName}</span>
                          <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.chip}`}>{meta.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="text-[10px] text-slate-500">
                Source: Protezione Civile — Bollettino di Criticità (pcm-dpc open data). Zone colors match the official map.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dedicated Status & Telemetry Console for European Satellites (EUMETSAT & DWD) */}
      {radarLayerType !== 'radar' && (() => {
        const satInfo = getImageTimestampInfo();
        const isMtg = ['mtg-truecolor', 'mtg-convection', 'mtg-cloudtop', 'mtg-li'].includes(radarLayerType);
        return (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Cloud className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white">
                    {radarLayerType === 'mtg-truecolor'
                      ? 'EUMETSAT MTG-I1 True Colour Optical RGB (0.5-1km)'
                      : radarLayerType === 'mtg-convection'
                      ? 'EUMETSAT Severe Convective Storms RGB'
                      : radarLayerType === 'mtg-cloudtop'
                      ? 'EUMETSAT MTG FCI 10.5µm High-Res IR Clean Window'
                      : radarLayerType === 'mtg-li'
                      ? 'EUMETSAT MTG Lightning Imager (LI Level-2 Optical Flash)'
                      : radarLayerType === 'eumetsat-natural'
                      ? 'EUMETSAT Meteosat Natural Colour Enhanced (15-min)'
                      : radarLayerType === 'eumetsat-ir'
                      ? 'EUMETSAT Meteosat Thermal IR 10.8µm (24/7 Day/Night)'
                      : 'EUMETSAT Airmass RGB Composite (15-min)'}
                  </span>
                  <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {isMtg ? '10-min MTG FCI Scan' : '15-min SEVIRI Scan'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap pt-1">
                  <span className="flex items-center gap-1 font-mono text-slate-200">
                    <Clock className="w-3.5 h-3.5 text-sky-400 inline" />
                    Acquired: <strong className="text-white">{satInfo.utcTime} UTC</strong> ({satInfo.localTime} Local)
                  </span>
                  <span>•</span>
                  <span className="text-slate-300">
                    Image slot: {satInfo.date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, {satInfo.ageText}
                  </span>
                  <span>•</span>
                  <span className="text-slate-400">
                    Geostationary 0°/9.5°E Sub-Satellite Point
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (mapInstanceRef.current && radarTileLayerRef.current) {
                    radarTileLayerRef.current.redraw();
                    setLastSatRefresh(new Date());
                  }
                }}
                className="px-4 py-2 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-800 text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 shadow-sm"
              >
                <RefreshCw className="w-4 h-4 text-sky-400" />
                <span>Refresh Satellite Feed</span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* Approaching Rain & Storm Cells Matrix (Point C & D & E) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                Approaching Rain Cells & Radar Alerting
              </h3>
              <p className="text-xs text-slate-400">
                100km perimeter scan identifying individual rain cells, propagation vectors & arrival ETAs
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowDataProvenance(!showDataProvenance)}
            className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer font-medium"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{showDataProvenance ? 'Hide Data Sources' : 'Data Sources & Model Info'}</span>
          </button>
        </div>

        {/* Data Provenance Explanation */}
        {showDataProvenance && (
          <div className="p-4 rounded-2xl bg-slate-950 border border-sky-500/30 text-xs text-slate-300 space-y-3 animate-fadeIn">
            <div className="font-bold text-sky-300 flex items-center gap-1.5">
              <Info className="w-4 h-4" />
              Scientific Data Sources & Trajectory Algorithms:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <strong className="text-white block mb-1">1. Doppler Radar (dBZ):</strong>
                RainViewer composite radar network (aggregating DWD, NEXRAD, and EUMETNET ground radar stations). Calibrated in radar reflectivity (dBZ) and rain rate (mm/h).
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <strong className="text-white block mb-1">2. Cloud Trajectory Vectors:</strong>
                Calculated from 850 hPa (~1,500m) and 700 hPa (~3,000m) boundary layer steering winds (ECMWF IFS / ICON) combined with cross-correlation tracking between consecutive radar sweeps.
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <strong className="text-white block mb-1">3. Cloud Levels & EUMETSAT:</strong>
                Real-time satellite infrared cloud imagery from EUMETSAT / RainViewer IR feeds. Atmospheric cloud height distributions (Low 0-2km, Mid 2-6km, High &gt;6km) from European NWP models.
              </div>
            </div>
          </div>
        )}

        {/* Active Cells List */}
        {detectedCells.length > 0 ? (
          <div className="space-y-2.5">
            {detectedCells.map((cell, idx) => {
              const cellHeading = (cell.windDirDeg + 180) % 360;
              const headingCardinal = getWindDirection(cellHeading);
              const isApproaching = cell.distanceKm < 60;

              return (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${cell.precipitationMmH > 2.5 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      <NavIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <span>Rain Cell #{idx + 1}: {cell.directionLabel}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 font-normal">
                          {cell.precipitationMmH.toFixed(1)} mm/h
                        </span>
                        {isApproaching && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            Approaching
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Distance: <strong className="text-slate-200">{cell.distanceKm} km</strong> • Propagating <strong className="text-sky-300">towards {headingCardinal} ({Math.round(cellHeading)}°)</strong> at {Math.round(cell.windSpeedKmH)} km/h
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleFlyToCell(cell.latitude, cell.longitude)}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-sky-500 hover:text-white text-slate-300 text-xs font-semibold border border-slate-700 transition-all cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    Center on Map
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <strong className="text-slate-200 block">No Active Rain Cells Detected Within 100 km</strong>
              Doppler radar reflectivity indicates clear conditions across your regional scanning perimeter.
            </div>
          </div>
        )}
      </div>

      {/* Layer Scale Legend — adapts to the active layer */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <h3 className="font-bold text-white text-sm">{legend.title}</h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <span>Layer Opacity:</span>
              <input
                type="range"
                min="0.3"
                max="1.0"
                step="0.05"
                value={radarOpacity}
                onChange={(e) => setRadarOpacity(parseFloat(e.target.value))}
                className="w-20 h-1.5 bg-slate-950 rounded appearance-none cursor-pointer accent-sky-500"
              />
              <span className="font-mono text-slate-300 text-[11px]">{Math.round(radarOpacity * 100)}%</span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="h-3 rounded-full shadow-inner" style={{ background: legend.gradient }} />
          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            {legend.labels.map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
