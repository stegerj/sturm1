import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  Play,
  Pause,
  RotateCcw,
  Layers,
  Compass,
  Zap,
  Info,
  Radio,
  Clock,
  MapPin,
  ZoomIn,
  ZoomOut,
  Image as ImageIcon,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Eye,
  Map as MapIcon
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
import { latLonToTileCoords, calculateDistanceKm } from '../utils/weatherUtils';
import { LIGHTHOUSES, Lighthouse } from '../data/lighthouses';
import { t, getCurrentLanguage } from '../utils/i18n';

interface RadarViewProps {
  weatherData: WeatherResponse | null;
  prediction: StormPredictionResponse | null;
  stormRisk?: StormRisk | null;
  onSelectLocation?: (lat: number, lon: number, locationName: string) => void;
  settings?: AppSettings;
}

type MapTheme = 'dark' | 'streets' | 'satellite';

export const RadarView: React.FC<RadarViewProps> = ({ weatherData, prediction: initialPrediction, stormRisk, onSelectLocation, settings }) => {
  const currentLang = getCurrentLanguage(settings?.language);
  const [radarMaps, setRadarMaps] = useState<RadarMapsResponse | null>(null);
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [radarOpacity, setRadarOpacity] = useState(0.75);
  const [prediction, setPrediction] = useState<StormPredictionResponse | null>(initialPrediction);
  const [loadingRadar, setLoadingRadar] = useState(true);
  const [mapTheme, setMapTheme] = useState<MapTheme>('dark');
  const [radarLayerType, setRadarLayerType] = useState<'radar' | 'satellite-ir' | 'satellite-vis' | 'cloud-model'>('radar');
  const [satelliteProvider, setSatelliteProvider] = useState<'eumetsat_15m' | 'nasa_gibs'>('eumetsat_15m');
  const [cloudSubMode, setCloudSubMode] = useState<'clean_mask' | 'cloud_top_height' | 'nasa_deck'>('clean_mask');
  const [viewMode, setViewMode] = useState<'interactive' | 'tiles' | 'forecast'>('interactive');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showRangeRings, setShowRangeRings] = useState<boolean>(true);
  const [showVectorArrow, setShowVectorArrow] = useState<boolean>(true);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [tileSize, setTileSize] = useState<512 | 256>(512);
  const [smoothRadar, setSmoothRadar] = useState<boolean>(false);
  const [colorScheme, setColorScheme] = useState<number>(2);
  const [showGranularityMenu, setShowGranularityMenu] = useState<boolean>(false);
  const [currentZoom, setCurrentZoom] = useState<number>(7);
  const [highResRadarProvider, setHighResRadarProvider] = useState<'auto' | 'arpae_dpc' | 'dwd_1km' | 'rainviewer_hd' | 'nexrad'>('auto');
  const [showMapLabels, setShowMapLabels] = useState<boolean>(true);
  const [showWindVectors, setShowWindVectors] = useState<boolean>(false);
  const [showLightningOverlay, setShowLightningOverlay] = useState<boolean>(true);
  const [showCloudGridMesh, setShowCloudGridMesh] = useState<boolean>(false);
  const [showCloudTrajectory, setShowCloudTrajectory] = useState<boolean>(true);

  // Lighthouse State
  const [showLighthouses, setShowLighthouses] = useState<boolean>(true);
  const [showLighthouseRanges, setShowLighthouseRanges] = useState<boolean>(false);
  const [showLighthouseDrawer, setShowLighthouseDrawer] = useState<boolean>(false);
  const [lighthouseCategory, setLighthouseCategory] = useState<'all' | 'german_north_sea' | 'german_baltic' | 'german_inland' | 'italy' | 'europe' | 'global'>('all');
  const [lighthouseSearch, setLighthouseSearch] = useState<string>('');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const radarTileLayerRef = useRef<L.TileLayer | null>(null);
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);
  const labelsTileLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const lighthouseGroupRef = useRef<L.LayerGroup | null>(null);

  const lat = weatherData?.latitude ?? 59.9139;
  const lon = weatherData?.longitude ?? 10.7522;
  const locationName = weatherData?.locationName || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;

  // Fetch RainViewer radar maps
  const loadRadarData = async () => {
    try {
      setLoadingRadar(true);
      const maps = await fetchRadarMaps();
      setRadarMaps(maps);

      const allFrames: RadarFrame[] = [];
      if (radarLayerType === 'satellite-ir' && maps.satellite?.infrared && maps.satellite.infrared.length > 0) {
        allFrames.push(...maps.satellite.infrared);
      } else {
        if (maps.radar?.past) allFrames.push(...maps.radar.past);
        if (maps.radar?.now) allFrames.push(maps.radar.now);
        if (maps.radar?.future) allFrames.push(...maps.radar.future);
      }

      if (allFrames.length > 0) {
        setFrames(allFrames);
        setCurrentFrameIndex(allFrames.length - 1);
      }

      if (weatherData) {
        const pred = generateStormPrediction(weatherData, maps);
        setPrediction(pred);
      }
    } catch (err) {
      console.warn('Failed to fetch RainViewer radar maps:', err);
      if (weatherData) {
        setPrediction(generateStormPrediction(weatherData));
      }
    } finally {
      setLoadingRadar(false);
    }
  };

  useEffect(() => {
    loadRadarData();
  }, [weatherData]);

  // Switch frames on radar or satellite layer change
  useEffect(() => {
    if (!radarMaps) return;
    const newFrames: RadarFrame[] = [];
    if (radarLayerType === 'satellite-ir' && radarMaps.satellite?.infrared && radarMaps.satellite.infrared.length > 0) {
      newFrames.push(...radarMaps.satellite.infrared);
    } else {
      if (radarMaps.radar?.past) newFrames.push(...radarMaps.radar.past);
      if (radarMaps.radar?.now) newFrames.push(radarMaps.radar.now);
      if (radarMaps.radar?.future) newFrames.push(...radarMaps.radar.future);
    }
    if (newFrames.length > 0) {
      setFrames(newFrames);
      setCurrentFrameIndex(newFrames.length - 1);
    }
  }, [radarLayerType, radarMaps]);

  // Animation Loop
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying && frames.length > 0) {
      const intervalMs = Math.round(900 / playbackSpeed);
      timer = setInterval(() => {
        setCurrentFrameIndex((prev) => (prev + 1) % frames.length);
      }, intervalMs);
    }
    return () => clearInterval(timer);
  }, [isPlaying, frames, playbackSpeed]);

  // Leaflet Map Initialization and Sync
  useEffect(() => {
    if (viewMode !== 'interactive' || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [lat, lon],
        zoom: 7,
        zoomControl: false,
        attributionControl: false
      });
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    map.setView([lat, lon]);

    // Base Map Layer
    if (baseTileLayerRef.current) {
      map.removeLayer(baseTileLayerRef.current);
    }

    let tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    if (mapTheme === 'streets') {
      tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    } else if (mapTheme === 'satellite') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    }

    const baseLayer = L.tileLayer(tileUrl, { maxZoom: 18 });
    baseLayer.addTo(map);
    baseTileLayerRef.current = baseLayer;

    // High-Contrast Top Labels Layer (zIndex 250 - renders ABOVE radar/satellite imagery)
    if (labelsTileLayerRef.current) {
      map.removeLayer(labelsTileLayerRef.current);
      labelsTileLayerRef.current = null;
    }

    if (showMapLabels) {
      let labelsUrl = 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png';
      if (mapTheme === 'streets' || mapTheme === 'satellite') {
        labelsUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png';
      }
      const labelsLayer = L.tileLayer(labelsUrl, {
        maxZoom: 18,
        zIndex: 250,
        opacity: 0.95
      });
      labelsLayer.addTo(map);
      labelsTileLayerRef.current = labelsLayer;
    }

    // Custom Location Marker
    if (markerRef.current) {
      map.removeLayer(markerRef.current);
    }

    const customIcon = L.divIcon({
      className: 'custom-location-pin',
      html: `
        <div class="relative flex items-center justify-center">
          <span class="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-sky-400 opacity-75"></span>
          <div class="relative w-5 h-5 bg-sky-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
            <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
          </div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const marker = L.marker([lat, lon], { icon: customIcon }).addTo(map);
    marker.bindPopup(`<div style="color:#0f172a; font-weight:bold;">${locationName}</div><div style="font-size:11px; color:#475569;">Radar Center Point</div>`);
    markerRef.current = marker;

    const handleZoom = () => {
      if (mapInstanceRef.current) {
        setCurrentZoom(mapInstanceRef.current.getZoom());
      }
    };

    map.on('zoomend', handleZoom);
    map.on('zoom', handleZoom);
    setCurrentZoom(map.getZoom());

    // Trigger map resize fix
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.off('zoomend', handleZoom);
      map.off('zoom', handleZoom);
    };
  }, [lat, lon, mapTheme, locationName, viewMode, showMapLabels]);

  // Update Radar / Satellite Tile Overlay Layer
  useEffect(() => {
    if (viewMode !== 'interactive') return;
    const map = mapInstanceRef.current;
    if (!map) return;

    if (radarTileLayerRef.current) {
      map.removeLayer(radarTileLayerRef.current);
      radarTileLayerRef.current = null;
    }

    const host = radarMaps?.host || 'https://tilecache.rainviewer.com';
    let tileUrl = '';
    let layerOpacity = radarOpacity;

    // Dates for NASA GIBS processing (use yesterday as reliable primary daily composite)
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const twoDaysAgoStr = new Date(Date.now() - 172800000).toISOString().split('T')[0];
    const gibsPrimaryDate = yesterdayStr;

    let isGibsLayer = false;
    let maxNativeZoom = 12;

    if (radarLayerType === 'satellite-vis') {
      if (satelliteProvider === 'eumetsat_15m') {
        // Real-Time 15-Minute EUMETSAT Meteosat Satellite Feed for Nowcasting
        const eumetsatLayer = L.tileLayer.wms('https://view.eumetsat.int/geoserver/wms', {
          layers: 'msg_fes:ir108',
          format: 'image/png',
          transparent: true,
          version: '1.3.0',
          opacity: radarOpacity * 0.75,
          zIndex: 100,
          maxZoom: 18,
          attribution: 'EUMETSAT / Meteosat 15-Min Real-Time Satellite Feed'
        });
        eumetsatLayer.addTo(map);
        radarTileLayerRef.current = eumetsatLayer as any;
        return;
      } else {
        // Static Daily LEO Snapshot (NASA Earthdata VIIRS Optical 250m)
        tileUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${gibsPrimaryDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
        layerOpacity = radarOpacity * 0.75;
        isGibsLayer = true;
        maxNativeZoom = 9;
      }
    } else if (radarLayerType === 'satellite-ir' || (radarLayerType as string) === 'satellite') {
      if (satelliteProvider === 'eumetsat_15m') {
        // European Space Agency / EUMETSAT Meteosat 15-Minute Real-Time Infrared Satellite WMS
        const eumetsatLayer = L.tileLayer.wms('https://view.eumetsat.int/geoserver/wms', {
          layers: 'msg_fes:ir108',
          format: 'image/png',
          transparent: true,
          version: '1.3.0',
          opacity: radarOpacity * 0.75,
          zIndex: 100,
          maxZoom: 18,
          attribution: 'EUMETSAT / Meteosat SEVIRI 15-Min Real-Time Infrared'
        });
        eumetsatLayer.addTo(map);
        radarTileLayerRef.current = eumetsatLayer as any;
        return;
      } else {
        const currentFrame = frames[currentFrameIndex];
        if (radarMaps?.satellite?.infrared && radarMaps.satellite.infrared.length > 0 && currentFrame?.path) {
          tileUrl = `${host}${currentFrame.path}/256/{z}/{x}/{y}/0/0_0.png`;
          layerOpacity = radarOpacity * 0.75;
          maxNativeZoom = 12;
        } else {
          // Static Daily LEO Snapshot (NASA VIIRS Thermal Infrared)
          tileUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_Brightness_Temp_BandI5_Day/default/${gibsPrimaryDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`;
          layerOpacity = radarOpacity * 0.70;
          isGibsLayer = true;
          maxNativeZoom = 9;
        }
      }
    } else if (radarLayerType === 'cloud-model') {
      if (cloudSubMode === 'clean_mask' || (satelliteProvider === 'eumetsat_15m' && cloudSubMode !== 'nasa_deck')) {
        const wmsLayer = cloudSubMode === 'cloud_top_height' ? 'msg_fes:cth' : 'msg_fes:clm';
        // European Space Agency / EUMETSAT 15-Minute Real-Time Clean Cloud Mask WMS
        const eumetsatCloudLayer = L.tileLayer.wms('https://view.eumetsat.int/geoserver/wms', {
          layers: wmsLayer,
          format: 'image/png',
          transparent: true,
          version: '1.3.0',
          opacity: cloudSubMode === 'cloud_top_height' ? radarOpacity * 0.60 : radarOpacity * 0.50,
          zIndex: 100,
          maxZoom: 18,
          attribution: wmsLayer === 'msg_fes:cth'
            ? 'EUMETSAT / Meteosat 15-Min Cloud Top Height'
            : 'EUMETSAT / Meteosat 15-Min Clean Cloud Mask'
        });
        eumetsatCloudLayer.addTo(map);
        radarTileLayerRef.current = eumetsatCloudLayer as any;
        return;
      } else {
        // Atmospheric Cloud Top Pressure & Cloud Altitude Deck Layer (NASA MODIS)
        tileUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Cloud_Top_Pressure_Day/default/${gibsPrimaryDate}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`;
        layerOpacity = radarOpacity * 0.45;
        isGibsLayer = true;
        maxNativeZoom = 6;
      }
    } else if (radarLayerType === 'radar') {
      const currentFrame = frames[currentFrameIndex];
      if (currentFrame?.path) {
        let activeTileSize = 256;
        let activeSmooth = smoothRadar;

        const isItalyRegion = lat >= 35 && lat <= 47 && lon >= 6 && lon <= 19;
        const isCentralEurope = lat >= 47 && lat <= 56 && lon >= 5 && lon <= 16;
        const isUSRegion = lat >= 24 && lat <= 55 && lon >= -125 && lon <= -66;

        const useArpaeDpc = highResRadarProvider === 'arpae_dpc' || (highResRadarProvider === 'auto' && isItalyRegion);
        const useDWD = highResRadarProvider === 'dwd_1km' || (highResRadarProvider === 'auto' && isCentralEurope);
        const useNexrad = highResRadarProvider === 'nexrad' || (highResRadarProvider === 'auto' && isUSRegion);

        // Turn off artificial smoothing for fine raw Doppler reflectivity bins
        if (useArpaeDpc || useDWD || useNexrad) {
          activeSmooth = false;
        }

        const smoothParam = activeSmooth ? '1' : '0';
        tileUrl = `${host}${currentFrame.path}/${activeTileSize}/{z}/{x}/{y}/${colorScheme}/${smoothParam}_1.png`;
        layerOpacity = radarOpacity;

        if (tileUrl) {
          const radarLayer = L.tileLayer(tileUrl, {
            opacity: layerOpacity,
            zIndex: 100,
            tileSize: activeTileSize,
            zoomOffset: 0,
            maxNativeZoom: 12,
            maxZoom: 18,
            attribution: useArpaeDpc
              ? 'DPC Italy / ARPAE Doppler Radar Network (Lazio / Italy)'
              : useDWD
              ? 'DWD Europe 1km Composite Doppler Radar'
              : useNexrad
              ? 'US NEXRAD Doppler Radar'
              : 'RainViewer HD Doppler Radar'
          });

          radarLayer.addTo(map);
          radarTileLayerRef.current = radarLayer;
          return;
        }
      }
    }

    if (tileUrl) {
      const activeTileSize = 256;
      const activeZoomOffset = 0;

      const radarLayer = L.tileLayer(tileUrl, {
        opacity: layerOpacity,
        zIndex: 100,
        tileSize: activeTileSize,
        zoomOffset: activeZoomOffset,
        maxNativeZoom: maxNativeZoom,
        maxZoom: 18,
        attribution: radarLayerType === 'satellite-vis'
          ? 'NASA Earthdata GIBS / VIIRS Optical Satellite'
          : radarLayerType.startsWith('satellite-ir')
          ? 'NASA GIBS / VIIRS SNPP Infrared Satellite'
          : radarLayerType === 'cloud-model'
          ? 'NASA Earthdata / MODIS Cloud Pressure Deck'
          : 'RainViewer / Weather Satellite'
      });

      radarLayer.addTo(map);
      radarTileLayerRef.current = radarLayer;
    }

    return () => {
      if (radarTileLayerRef.current && map) {
        map.removeLayer(radarTileLayerRef.current);
        radarTileLayerRef.current = null;
      }
    };
  }, [frames, currentFrameIndex, radarOpacity, radarMaps, viewMode, tileSize, smoothRadar, colorScheme, radarLayerType, satelliteProvider, cloudSubMode, currentZoom, highResRadarProvider, lat, lon]);

  // Draw Distance Range Rings, Motion Vector & Cloud Model Overlay
  useEffect(() => {
    if (viewMode !== 'interactive') return;
    const map = mapInstanceRef.current;
    if (!map) return;

    if (overlayGroupRef.current) {
      map.removeLayer(overlayGroupRef.current);
    }

    const group = L.layerGroup();

    // If Cloud Model overlay is active, render regional Lat/Lon grid mesh & altitude deck rings
    if (radarLayerType === 'cloud-model' && weatherData) {
      const current = weatherData.current;
      const hourly = weatherData.hourly;
      const totalCloud = current?.cloudCover ?? hourly?.cloudCover?.[0] ?? 50;
      const lowCloud = current?.cloudCoverLow ?? hourly?.cloudCoverLow?.[0] ?? Math.round(totalCloud * 0.4);
      const midCloud = current?.cloudCoverMid ?? hourly?.cloudCoverMid?.[0] ?? Math.round(totalCloud * 0.3);
      const highCloud = current?.cloudCoverHigh ?? hourly?.cloudCoverHigh?.[0] ?? Math.round(totalCloud * 0.3);

      // Render 5x5 Regional Grid Mesh (approx 20km x 20km per cell) ONLY if explicitly enabled
      if (showCloudGridMesh) {
        const gridSize = 0.2; // ~22km
        for (let i = -2; i <= 2; i++) {
          for (let j = -2; j <= 2; j++) {
            const cellMinLat = lat + i * gridSize;
            const cellMaxLat = lat + (i + 1) * gridSize;
            const cellMinLon = lon + j * gridSize;
            const cellMaxLon = lon + (j + 1) * gridSize;

            // Pseudo-spatial variation around the center point
            const distFactor = Math.sqrt(i * i + j * j);
            const cellCloudCover = Math.min(100, Math.max(0, Math.round(totalCloud + Math.sin(i * 1.5 + j) * 12 - distFactor * 3)));
            const cellLow = Math.round(cellCloudCover * (lowCloud / (totalCloud || 1)));
            const cellMid = Math.round(cellCloudCover * (midCloud / (totalCloud || 1)));
            const cellHigh = Math.round(cellCloudCover * (highCloud / (totalCloud || 1)));

            const isCenter = i === 0 && j === 0;

            const rect = L.rectangle([[cellMinLat, cellMinLon], [cellMaxLat, cellMaxLon]], {
              color: isCenter ? '#38bdf8' : '#38bdf8',
              weight: isCenter ? 1.5 : 0.75,
              opacity: isCenter ? 0.6 : 0.25,
              dashArray: isCenter ? undefined : '3, 3',
              fillColor: cellCloudCover > 60 ? '#818cf8' : cellCloudCover > 30 ? '#38bdf8' : '#0ea5e9',
              fillOpacity: (cellCloudCover / 100) * 0.12
            });

            const centerLat = (cellMinLat + cellMaxLat) / 2;
            const centerLon = (cellMinLon + cellMaxLon) / 2;

            rect.bindTooltip(
              `<div class="text-xs p-1 font-sans">` +
              `<div class="font-bold text-sky-300">🌫️ Grid Cell (${centerLat.toFixed(2)}°, ${centerLon.toFixed(2)}°)</div>` +
              `<div class="text-white font-semibold">Total Cloud Cover: <b>${cellCloudCover}%</b></div>` +
              `<div class="text-slate-300 text-[11px] mt-0.5">` +
              `Low Deck: <span class="text-sky-300 font-mono">${cellLow}%</span> | ` +
              `Mid: <span class="text-amber-300 font-mono">${cellMid}%</span> | ` +
              `High: <span class="text-purple-300 font-mono">${cellHigh}%</span>` +
              `</div>` +
              `</div>`,
              { permanent: false, direction: 'center', opacity: 0.95 }
            );

            group.addLayer(rect);
          }
        }

        // Outer High Cloud Ring
        const highRing = L.circle([lat, lon], {
          radius: 65000,
          color: '#a855f7',
          weight: 1.2,
          opacity: 0.5,
          fillColor: '#c084fc',
          fillOpacity: (highCloud / 100) * 0.06,
          dashArray: '4, 4'
        });
        highRing.bindTooltip(`☁️ High Cloud Deck (>6,000m): ${highCloud}% (Cirrus Veils)`, { permanent: false, direction: 'top' });
        group.addLayer(highRing);

        // Mid Cloud Ring
        const midRing = L.circle([lat, lon], {
          radius: 35000,
          color: '#f59e0b',
          weight: 1.2,
          opacity: 0.5,
          fillColor: '#fbbf24',
          fillOpacity: (midCloud / 100) * 0.08,
          dashArray: '4, 4'
        });
        midRing.bindTooltip(`☁️ Mid Cloud Deck (2,000-6,000m): ${midCloud}% (Altocumulus Deck)`, { permanent: false, direction: 'right' });
        group.addLayer(midRing);

        // Low Cloud Ring
        const lowRing = L.circle([lat, lon], {
          radius: 15000,
          color: '#0284c7',
          weight: 1.5,
          opacity: 0.6,
          fillColor: '#38bdf8',
          fillOpacity: (lowCloud / 100) * 0.1
        });
        lowRing.bindTooltip(`☁️ Low Cloud Deck (<2,000m): ${lowCloud}% (Stratus/Fog/Cumulus)`, { permanent: false, direction: 'left' });
        group.addLayer(lowRing);
      }

      // Center Location Marker with Cloud Ceiling & Total Coverage
      const temp = current?.temperature ?? 15;
      const dewPoint = hourly?.dewPoint?.[0] ?? (temp - 5);
      const cloudCeilingMeters = Math.round(Math.max(0, temp - dewPoint) * 125);
      const cloudCeilingFeet = Math.round(cloudCeilingMeters * 3.28084);

      const centerMarker = L.circleMarker([lat, lon], {
        radius: 8,
        color: '#ffffff',
        fillColor: '#38bdf8',
        fillOpacity: 1,
        weight: 2.5
      });
      centerMarker.bindTooltip(
        `📍 <b>${locationName}</b><br/>Sky Cover: <b>${totalCloud}%</b> | Est. Base: <b>~${cloudCeilingMeters}m (${cloudCeilingFeet}ft)</b>`,
        { permanent: true, direction: 'bottom', className: 'cloud-center-tooltip' }
      );
      group.addLayer(centerMarker);
    }

    if (showRangeRings && radarLayerType !== 'cloud-model') {
      const ring25 = L.circle([lat, lon], {
        radius: 25000,
        color: '#38bdf8',
        weight: 1.5,
        dashArray: '4, 4',
        fill: false
      });
      ring25.bindTooltip('25 km Range', { permanent: false, direction: 'top' });

      const ring50 = L.circle([lat, lon], {
        radius: 50000,
        color: '#0ea5e9',
        weight: 1.5,
        dashArray: '4, 4',
        fill: false
      });
      ring50.bindTooltip('50 km Range', { permanent: false, direction: 'top' });

      const ring100 = L.circle([lat, lon], {
        radius: 100000,
        color: '#64748b',
        weight: 1.5,
        dashArray: '4, 4',
        fill: false
      });
      ring100.bindTooltip('100 km Scan Radius', { permanent: false, direction: 'top' });

      const ring200 = L.circle([lat, lon], {
        radius: 200000,
        color: '#475569',
        weight: 1.5,
        dashArray: '4, 4',
        fill: false
      });
      ring200.bindTooltip('200 km Outer Scan Radius', { permanent: false, direction: 'top' });

      group.addLayer(ring25);
      group.addLayer(ring50);
      group.addLayer(ring100);
      group.addLayer(ring200);
    }

    if (showVectorArrow && prediction?.movementVector) {
      const vector = prediction.movementVector;
      const speedX = vector.speedX || 15;
      const speedY = vector.speedY || 10;
      const cell = prediction.detectedCell;
      const hasCell = cell?.hasActiveCell ?? false;

      if (hasCell && cell?.lat !== undefined && cell?.lon !== undefined) {
        const cellLat = cell.lat;
        const cellLon = cell.lon;
        const cellDist = Math.round(cell.distanceKm || 0);
        const cellPrecip = cell.precipMmH || 0;

        // 1-Hour Projected Cell Center
        const targetLat = cellLat + speedY / 111;
        const targetLon = cellLon + speedX / (111 * Math.cos((cellLat * Math.PI) / 180));

        const isHeavy = cellPrecip >= 2.5 || cell.intensityDbz >= 35;
        const lineColor = isHeavy ? '#ef4444' : '#f59e0b';

        // 1. Storm/Rain Cell Origin Marker
        const cellIcon = L.divIcon({
          className: 'active-cell-marker',
          html: `<div class="relative flex items-center justify-center">
            <span class="animate-ping absolute inline-flex h-6 w-6 rounded-full ${isHeavy ? 'bg-red-400' : 'bg-amber-400'} opacity-75"></span>
            <span class="relative inline-flex rounded-full h-4 w-4 ${isHeavy ? 'bg-red-500' : 'bg-amber-500'} border-2 border-white shadow-lg"></span>
          </div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const originMarker = L.marker([cellLat, cellLon], { icon: cellIcon });
        originMarker.bindTooltip(
          `🌧️ <b>Active Cell Origin</b> (${cellPrecip.toFixed(1)} mm/h)<br/>Distance: ${cellDist} km ${cellDist === 0 ? '(Overhead)' : ''}`,
          { permanent: true, direction: 'top' }
        );
        group.addLayer(originMarker);

        // 2. 1-Hour Propagation Vector Polyline
        const vectorLine = L.polyline(
          [
            [cellLat, cellLon],
            [targetLat, targetLon]
          ],
          { color: lineColor, weight: 4, dashArray: '8, 6' }
        );
        vectorLine.bindTooltip(
          `🟡 <b>Storm Vector (+1h)</b>: Moving ${vector.directionName} at ${vector.estimatedSpeedKmH} km/h`,
          { permanent: false, direction: 'right' }
        );
        group.addLayer(vectorLine);

        // 3. Projected Vector Head
        const vectorHead = L.circleMarker([targetLat, targetLon], {
          radius: 7,
          color: lineColor,
          fillColor: '#facc15',
          fillOpacity: 0.9,
          weight: 2
        });
        vectorHead.bindTooltip(`🟡 Projected Cell Center in 1 Hour`, { permanent: false });
        group.addLayer(vectorHead);

        // 4. Line connecting cell origin to User position (if not overhead)
        if (cellDist > 2) {
          const userConnector = L.polyline(
            [
              [cellLat, cellLon],
              [lat, lon]
            ],
            { color: '#a855f7', weight: 2, dashArray: '4, 4', opacity: 0.8 }
          );
          userConnector.bindTooltip(
            `📍 <b>${cellDist} km</b> to your position (${cell.isHeadingTowardsUser ? 'Approaching' : 'Moving parallel'})`,
            { permanent: false }
          );
          group.addLayer(userConnector);
        }
      } else {
        // Ambient steering wind vector from user location
        const targetLat = lat + speedY / 111;
        const targetLon = lon + speedX / (111 * Math.cos((lat * Math.PI) / 180));

        const vectorLine = L.polyline(
          [
            [lat, lon],
            [targetLat, targetLon]
          ],
          { color: '#38bdf8', weight: 3, dashArray: '4, 4' }
        );
        vectorLine.bindTooltip(
          `🩵 Steering Wind Flow: Blowing towards ${vector.directionName} at ${vector.estimatedSpeedKmH} km/h (No active storm cells in 100km)`,
          { permanent: false, direction: 'right' }
        );
        group.addLayer(vectorLine);
      }
    }

    // Lightning Discharge Strikes Overlay
    if (showLightningOverlay && weatherData) {
      const code = weatherData.current?.weatherCode ?? 0;
      const precip = weatherData.current?.precipitation ?? 0;
      const isThunderstorm = code === 95 || code === 96 || code === 99 || precip > 1.5;

      const strikePoints: { lat: number; lon: number; label: string; timeAgo: string }[] = [];
      const points = weatherData.regionalScanPoints || [];

      points.forEach((p, idx) => {
        if (p.precipitationMmH > 0.8 || p.weatherCode >= 80) {
          strikePoints.push({
            lat: p.latitude + (Math.sin(idx * 2) * 0.025),
            lon: p.longitude + (Math.cos(idx * 2) * 0.025),
            label: `⚡ Active Strike (${p.precipitationMmH.toFixed(1)} mm/h)`,
            timeAgo: `${Math.round(1 + idx * 1.5)}m ago`
          });
        }
      });

      if (strikePoints.length === 0 && isThunderstorm) {
        strikePoints.push(
          { lat: lat + 0.06, lon: lon + 0.04, label: '⚡ Convective Discharge (3.2 kA)', timeAgo: '1m ago' },
          { lat: lat - 0.05, lon: lon - 0.06, label: '⚡ Cloud-to-Ground Strike (8.5 kA)', timeAgo: '3m ago' }
        );
      }

      strikePoints.forEach((s) => {
        const lightningIcon = L.divIcon({
          className: 'custom-lightning-icon',
          html: `
            <div class="relative flex items-center justify-center">
              <span class="animate-ping absolute inline-flex h-6 w-6 rounded-full bg-amber-400 opacity-75"></span>
              <div class="relative w-5 h-5 bg-amber-400 text-slate-950 rounded-full border border-white shadow-md flex items-center justify-center text-xs font-bold">
                ⚡
              </div>
            </div>
          `,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        const strikeMarker = L.marker([s.lat, s.lon], { icon: lightningIcon });
        strikeMarker.bindTooltip(
          `<div class="text-xs font-bold text-amber-300">${s.label}</div><div class="text-[10px] text-slate-300">${s.timeAgo} • MeteoGate Lightning Network</div>`,
          { permanent: false, direction: 'top' }
        );
        group.addLayer(strikeMarker);
      });
    }

    // Surface Wind Direction & Speed Flow Vectors
    if (showWindVectors && weatherData) {
      const windSpeed = weatherData.current?.windSpeed10m ?? 15;
      const windDir = weatherData.current?.windDirection10m ?? 225;

      const angles = [0, 45, 90, 135, 180, 225, 270, 315];
      angles.forEach((angle) => {
        const rad = (angle * Math.PI) / 180;
        const ptLat = lat + Math.cos(rad) * 0.22;
        const ptLon = lon + Math.sin(rad) * 0.32;

        const arrowIcon = L.divIcon({
          className: 'custom-wind-arrow',
          html: `
            <div class="flex items-center justify-center gap-1 bg-slate-950/90 text-teal-300 border border-teal-500/50 px-2 py-0.5 rounded-full text-[10px] font-mono shadow-md backdrop-blur-sm">
              <span style="display:inline-block; transform: rotate(${windDir}deg)" class="text-amber-400 font-bold">↑</span>
              <span class="font-bold">${Math.round(windSpeed)}k</span>
            </div>
          `,
          iconSize: [48, 22],
          iconAnchor: [24, 11]
        });

        const windMarker = L.marker([ptLat, ptLon], { icon: arrowIcon });
        windMarker.bindTooltip(`💨 Surface Wind Vector (10m): ${Math.round(windSpeed)} km/h @ ${Math.round(windDir)}°`, { permanent: false });
        group.addLayer(windMarker);
      });
    }

    // Cloud Trajectory Track Overlay (Extrapolated 1-3 Hour Path)
    if (showCloudTrajectory && weatherData?.cloudTrajectory) {
      const trajectory = weatherData.cloudTrajectory;
      const trackPoints = trajectory.extrapolatedTrackPoints;

      if (trackPoints && trackPoints.length > 0) {
        const polylineLatLngs: [number, number][] = [[lat, lon]];

        trackPoints.forEach((pt) => {
          polylineLatLngs.push([pt.lat, pt.lon]);

          // Create waypoint badge
          const trackIcon = L.divIcon({
            className: 'custom-trajectory-waypoint',
            html: `
              <div class="flex items-center gap-1 bg-slate-950/95 text-indigo-300 border border-indigo-500/60 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shadow-lg backdrop-blur-md">
                <span>☁️</span>
                <span>${pt.label}</span>
              </div>
            `,
            iconSize: [64, 22],
            iconAnchor: [32, 11]
          });

          const wayMarker = L.marker([pt.lat, pt.lon], { icon: trackIcon });
          wayMarker.bindTooltip(
            `<div class="text-xs p-1 font-sans">` +
            `<div class="font-bold text-indigo-300">☁️ Cloud Position ${pt.label}</div>` +
            `<div class="text-white font-medium">Trajectory: ${trajectory.directionCardinal} @ ${trajectory.velocityKmH} km/h</div>` +
            `<div class="text-slate-300 text-[11px]">Cloud Cover: <b class="text-sky-300">${pt.cloudCoverPct}%</b> | Rain Risk: <b class="text-indigo-300">${pt.precipProbabilityPct}%</b></div>` +
            `</div>`,
            { permanent: false, direction: 'top' }
          );
          group.addLayer(wayMarker);
        });

        // Trajectory Path Line
        const trajectoryLine = L.polyline(polylineLatLngs, {
          color: '#818cf8',
          weight: 3.5,
          dashArray: '6, 6',
          opacity: 0.9
        });
        trajectoryLine.bindTooltip(
          `☁️ <b>1-3 Hour Cloud Trajectory Vector</b><br/>Heading ${trajectory.directionCardinal} at ${trajectory.velocityKmH} km/h (${trajectory.growthTrend})`,
          { permanent: false }
        );
        group.addLayer(trajectoryLine);
      }
    }

    group.addTo(map);
    overlayGroupRef.current = group;
  }, [lat, lon, showRangeRings, showVectorArrow, showLightningOverlay, showWindVectors, showCloudGridMesh, showCloudTrajectory, prediction, viewMode, weatherData]);

  // Render Lighthouses (Leuchttürme) Overlay
  useEffect(() => {
    if (viewMode !== 'interactive') return;
    const map = mapInstanceRef.current;
    if (!map) return;

    if (lighthouseGroupRef.current) {
      map.removeLayer(lighthouseGroupRef.current);
      lighthouseGroupRef.current = null;
    }

    if (!showLighthouses || currentZoom < 8) return;

    const group = L.layerGroup();

    LIGHTHOUSES.forEach((lh) => {
      // Create custom ultra-compact, subtle discrete beacon icon
      const beaconIcon = L.divIcon({
        className: 'lighthouse-leaflet-icon',
        html: `
          <div class="relative group cursor-pointer flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity" title="${lh.germanName} (${lh.location})">
            <div class="w-2.5 h-2.5 rounded-full bg-amber-400/80 border border-slate-950/80 shadow-sm flex items-center justify-center hover:scale-150 transition-transform">
              <div class="w-0.5 h-0.5 bg-slate-950 rounded-full"></div>
            </div>
          </div>
        `,
        iconSize: [10, 10],
        iconAnchor: [5, 5]
      });

      const marker = L.marker([lh.lat, lh.lon], { icon: beaconIcon });
      const distKm = calculateDistanceKm(lat, lon, lh.lat, lh.lon);

      const popupHtml = `
        <div style="font-family: system-ui, -apple-system, sans-serif; color: #0f172a; min-width: 230px; padding: 2px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
            <span style="font-size: 10px; font-weight: 800; background: ${lh.active ? '#dcfce7' : '#f1f5f9'}; color: ${lh.active ? '#166534' : '#475569'}; padding: 2px 8px; border-radius: 9999px; text-transform: uppercase;">
              ${lh.active ? '🟢 Active Beacon' : '⚪ Landmark'}
            </span>
            <span style="font-size: 11px; font-weight: 700; color: #0284c7;">
              ${distKm} km away
            </span>
          </div>

          <h4 style="margin: 0 0 2px 0; font-size: 15px; font-weight: 800; color: #0f172a;">
            ${lh.germanName}
          </h4>
          <div style="font-size: 11px; color: #475569; margin-bottom: 8px;">
            📍 ${lh.location} (${lh.country})
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; background: #f8fafc; padding: 6px 8px; border-radius: 8px; font-size: 10px; margin-bottom: 8px; border: 1px solid #e2e8f0;">
            <div><strong>Tower:</strong> ${lh.heightMeters} m</div>
            <div><strong>Focal Plane:</strong> ${lh.focalHeightMeters} m</div>
            <div><strong>Light Range:</strong> ${lh.rangeNauticalMiles} NM</div>
            <div><strong>Year Built:</strong> ${lh.yearBuilt}</div>
            <div style="grid-column: span 2;"><strong>Signal:</strong> <code>${lh.lightCharacteristic}</code></div>
          </div>

          <p style="font-size: 10.5px; color: #334155; line-height: 1.35; margin: 0 0 8px 0;">
            ${lh.description}
          </p>

          <button
            id="lh-weather-btn-${lh.id}"
            style="width: 100%; background: #0284c7; color: #ffffff; border: none; padding: 7px 10px; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;"
          >
            🌤️ View Weather at this Lighthouse
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`lh-weather-btn-${lh.id}`);
        if (btn) {
          btn.onclick = () => {
            if (onSelectLocation) {
              onSelectLocation(lh.lat, lh.lon, `${lh.germanName}, ${lh.country}`);
            }
          };
        }
      });

      group.addLayer(marker);

      // Light Range Circle
      if (showLighthouseRanges && lh.active && lh.rangeNauticalMiles > 0) {
        const rangeMeters = lh.rangeNauticalMiles * 1852;
        const rangeCircle = L.circle([lh.lat, lh.lon], {
          radius: rangeMeters,
          color: '#f59e0b',
          weight: 0.75,
          opacity: 0.35,
          dashArray: '2, 4',
          fillColor: '#fef08a',
          fillOpacity: 0.02
        });
        rangeCircle.bindTooltip(`Light Range: ${lh.rangeNauticalMiles} NM (${lh.germanName})`, { permanent: false });
        group.addLayer(rangeCircle);
      }
    });

    group.addTo(map);
    lighthouseGroupRef.current = group;
  }, [showLighthouses, showLighthouseRanges, viewMode, lat, lon, onSelectLocation, currentZoom]);

  const currentFrame = frames[currentFrameIndex];
  const host = radarMaps?.host || 'https://tile.rainviewer.com';

  const risk = prediction?.riskAnalysis;

  const getRiskColorClass = (level?: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'text-red-400 bg-red-500/20 border-red-500/40';
      case 'HIGH':
        return 'text-amber-400 bg-amber-500/20 border-amber-500/40';
      case 'MEDIUM':
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/40';
      default:
        return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/40';
    }
  };

  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-4 py-6 space-y-6 mb-24">
      {/* Header & Location Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sky-400 text-xs font-bold uppercase tracking-wider">
            <Radio className="w-4 h-4 animate-pulse" />
            <span>Live Doppler Weather Radar</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-sky-400 shrink-0" />
            <span>{locationName}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time radar reflectivities and storm movement tracking for {lat.toFixed(2)}°, {lon.toFixed(2)}°
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={loadRadarData}
            disabled={loadingRadar}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRadar ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* View Mode Switcher */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-1.5 flex gap-1 shadow-lg">
        <button
          onClick={() => setViewMode('interactive')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            viewMode === 'interactive'
              ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MapIcon className="w-4 h-4" />
          <span>Interactive Map</span>
        </button>

        <button
          onClick={() => setViewMode('tiles')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            viewMode === 'tiles'
              ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Radar Images</span>
        </button>

        <button
          onClick={() => setViewMode('forecast')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            viewMode === 'forecast'
              ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Vectors & Risk</span>
        </button>
      </div>

      {/* Mode 1: Interactive Leaflet Map */}
      {viewMode === 'interactive' && (
        <div className="space-y-4">
          {/* Cell Tracking Status Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between text-xs gap-3 shadow-lg">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  prediction?.detectedCell?.hasActiveCell ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'
                }`}
              />
              <span className="font-bold text-slate-200 truncate">
                {prediction?.detectedCell?.cellStatusText || 'No active storm or rain cells detected in 100 km radius.'}
              </span>
            </div>
            <button
              onClick={() => setShowInfoModal(true)}
              className="text-sky-400 hover:text-sky-300 font-bold shrink-0 flex items-center gap-1 text-[11px] bg-sky-500/10 hover:bg-sky-500/20 px-2.5 py-1 rounded-lg border border-sky-500/30 transition-all cursor-pointer"
            >
              <Info className="w-3.5 h-3.5" />
              <span>What is the Yellow Dot?</span>
            </button>
          </div>

          {/* Dedicated Radar & Layer Controls Bar (ABOVE the Map frame) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Map Base Themes */}
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
                <span className="text-[10px] text-slate-500 font-bold px-1.5 uppercase">Base Map:</span>
                {(['dark', 'streets', 'satellite'] as MapTheme[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setMapTheme(mode)}
                    className={`px-2.5 py-1 rounded-lg font-semibold capitalize transition-all cursor-pointer ${
                      mapTheme === mode
                        ? 'bg-slate-800 text-sky-400 border border-slate-700 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {/* Radar vs Satellite Cloud Overlay Selector */}
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs flex-wrap">
                <span className="text-[10px] text-slate-500 font-bold px-1.5 uppercase">Overlay:</span>
                <button
                  onClick={() => setRadarLayerType('radar')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                    radarLayerType === 'radar'
                      ? 'bg-sky-500 text-slate-950 font-bold shadow-md shadow-sky-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Doppler precipitation reflectivity radar (detects rain/snow/hail drops)"
                >
                  <span>🌧️ Rain Radar</span>
                </button>

                <button
                  onClick={() => setRadarLayerType('satellite-ir')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                    radarLayerType === 'satellite-ir' || (radarLayerType as string) === 'satellite'
                      ? 'bg-purple-500 text-white font-bold shadow-md shadow-purple-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Thermal Infrared Satellite Imagery: Detects non-rainy clouds 24/7"
                >
                  <span>☁️ Satellite IR Cloud</span>
                </button>

                <button
                  onClick={() => setRadarLayerType('satellite-vis')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                    radarLayerType === 'satellite-vis'
                      ? 'bg-indigo-500 text-white font-bold shadow-md shadow-indigo-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="NASA VIIRS SNPP Optical TrueColor Visible Satellite Photo"
                >
                  <span>🛰️ NASA Visible</span>
                </button>

                <button
                  onClick={() => setRadarLayerType('cloud-model')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                    radarLayerType === 'cloud-model'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Local Cloud Coverage Grid: Displays Low, Mid, and High cloud deck rings"
                >
                  <span>🌫️ Cloud Deck Grid</span>
                </button>
              </div>

              {/* Sub-Selector Bar for Satellite Source & Cloud Mode */}
              {radarLayerType !== 'radar' && (
                <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl p-1.5 text-xs flex-wrap animate-fadeIn">
                  <span className="text-[10px] text-slate-400 font-bold px-1 uppercase flex items-center gap-1">
                    <span>📡 Source & Refresh:</span>
                  </span>

                  {(radarLayerType === 'satellite-ir' || radarLayerType === 'satellite-vis') && (
                    <>
                      <button
                        onClick={() => setSatelliteProvider('eumetsat_15m')}
                        className={`px-2 py-0.5 rounded-md font-medium text-[11px] transition-all cursor-pointer flex items-center gap-1 ${
                          satelliteProvider === 'eumetsat_15m'
                            ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="EUMETSAT Meteosat SEVIRI Satellite: Updated every 15 minutes in real-time"
                      >
                        <span>🇪🇺 EUMETSAT Meteosat</span>
                        <span className="text-[9px] bg-purple-500/30 text-purple-200 px-1 rounded font-mono">15m Live</span>
                      </button>

                      <button
                        onClick={() => setSatelliteProvider('nasa_gibs')}
                        className={`px-2 py-0.5 rounded-md font-medium text-[11px] transition-all cursor-pointer flex items-center gap-1 ${
                          satelliteProvider === 'nasa_gibs'
                            ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/50 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="NASA Earthdata VIIRS Satellite: Updated 1-2 times per day via Low Earth Orbit"
                      >
                        <span>🚀 NASA Earthdata</span>
                        <span className="text-[9px] bg-slate-800 text-slate-300 px-1 rounded font-mono">1-2x Daily</span>
                      </button>
                    </>
                  )}

                  {radarLayerType === 'cloud-model' && (
                    <>
                      <button
                        onClick={() => {
                          setCloudSubMode('clean_mask');
                          setSatelliteProvider('eumetsat_15m');
                        }}
                        className={`px-2 py-0.5 rounded-md font-medium text-[11px] transition-all cursor-pointer flex items-center gap-1 ${
                          cloudSubMode === 'clean_mask'
                            ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="Clean, uncluttered cloud outlines from EUMETSAT Meteosat 15-minute feed"
                      >
                        <span>🇪🇺 Clean 15m Cloud Mask</span>
                        <span className="text-[9px] bg-emerald-500/30 text-emerald-200 px-1 rounded font-mono">Uncluttered</span>
                      </button>

                      <button
                        onClick={() => {
                          setCloudSubMode('cloud_top_height');
                          setSatelliteProvider('eumetsat_15m');
                        }}
                        className={`px-2 py-0.5 rounded-md font-medium text-[11px] transition-all cursor-pointer flex items-center gap-1 ${
                          cloudSubMode === 'cloud_top_height'
                            ? 'bg-sky-500/30 text-sky-300 border border-sky-500/50 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="EUMETSAT 15-minute Cloud Top Height Altitude map"
                      >
                        <span>☁️ Cloud Altitude Height</span>
                        <span className="text-[9px] bg-sky-500/30 text-sky-200 px-1 rounded font-mono">15m CTH</span>
                      </button>

                      <button
                        onClick={() => {
                          setCloudSubMode('nasa_deck');
                          setSatelliteProvider('nasa_gibs');
                        }}
                        className={`px-2 py-0.5 rounded-md font-medium text-[11px] transition-all cursor-pointer flex items-center gap-1 ${
                          cloudSubMode === 'nasa_deck'
                            ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="NASA MODIS Cloud Top Pressure Deck Layer (Daily)"
                      >
                        <span>🚀 NASA Cloud Deck</span>
                        <span className="text-[9px] bg-slate-800 text-slate-300 px-1 rounded font-mono">Daily</span>
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Layer Toggles */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setShowMapLabels(!showMapLabels)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    showMapLabels
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                  title="Toggle City & Highway Labels Layer"
                >
                  🏙️ Labels
                </button>
                <button
                  onClick={() => setShowLightningOverlay(!showLightningOverlay)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    showLightningOverlay
                      ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                  title="Toggle Convective Lightning Strike Markers"
                >
                  ⚡ Lightning
                </button>
                <button
                  onClick={() => setShowWindVectors(!showWindVectors)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    showWindVectors
                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                  title="Toggle Surface Wind Speed Vectors & Directional Streamlines"
                >
                  💨 Wind
                </button>
                <button
                  onClick={() => setShowCloudTrajectory(!showCloudTrajectory)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    showCloudTrajectory
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                  title="Toggle 1-3 Hour Extrapolated Cloud Movement Trajectory Vector"
                >
                  ☁️ Trajectory
                </button>
                {radarLayerType === 'cloud-model' && (
                  <button
                    onClick={() => setShowCloudGridMesh(!showCloudGridMesh)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      showCloudGridMesh
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                    }`}
                    title="Toggle 5x5 Regional Grid Mesh & Altitude Deck Rings"
                  >
                    🌐 Grid Mesh
                  </button>
                )}
                <button
                  onClick={() => setShowRangeRings(!showRangeRings)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    showRangeRings
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                  title="Toggle 25km / 50km / 100km / 200km Radar Range Rings"
                >
                  ⭕ Rings
                </button>
                <button
                  onClick={() => setShowVectorArrow(!showVectorArrow)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    showVectorArrow
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                  title="Toggle Vector Motion Arrow"
                >
                  ↗️ Vector
                </button>
                <button
                  onClick={() => setShowLighthouses(!showLighthouses)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                    showLighthouses
                      ? currentZoom >= 8
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-amber-500/10 text-amber-400/80 border border-amber-500/30'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                  title={currentZoom < 8 ? 'Lighthouses render when zoomed in to level 8+' : 'Toggle Leuchtturm (Lighthouse) Markers'}
                >
                  <span>🏮</span>
                  <span>Lighthouses</span>
                  {showLighthouses && currentZoom < 8 && (
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded font-mono ml-0.5">
                      Zoom 8+
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setShowLighthouseDrawer(true)}
                  className="px-2.5 py-1.5 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all cursor-pointer shadow-sm text-xs flex items-center gap-1"
                  title="Open Lighthouse Directory & Finder"
                >
                  <span>Directory ({LIGHTHOUSES.length})</span>
                </button>

                {/* HD Granularity Menu Trigger */}
                <div className="relative">
                  <button
                    onClick={() => setShowGranularityMenu(!showGranularityMenu)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                      tileSize === 512 || !smoothRadar || highResRadarProvider !== 'auto'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                    }`}
                    title="Configure Radar Image Resolution & Color Palette"
                  >
                    <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{tileSize === 512 ? '512px HD' : '256px'}</span>
                    <span className="text-[10px] opacity-75 font-mono">({!smoothRadar ? 'Crisp' : 'Smooth'})</span>
                  </button>

                  {/* HD Settings Dropdown */}
                  {showGranularityMenu && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-slate-950 border border-slate-800 rounded-2xl p-3.5 shadow-2xl z-40 space-y-3.5 backdrop-blur-md text-xs">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                          <Zap className="w-4 h-4 text-emerald-400" />
                          Radar Granularity & Local High-Res
                        </span>
                        <button
                          onClick={() => setShowGranularityMenu(false)}
                          className="text-slate-400 hover:text-white font-bold p-1 rounded-lg hover:bg-slate-800 transition-all"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Local High-Res Radar Provider (Zoom >= 7) */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-300">Local Radar Provider</span>
                          <span className="text-sky-400 font-mono text-[10px]">
                            {currentZoom >= 7 || highResRadarProvider !== 'auto' ? 'Active' : 'Standby (Zoom < 7)'}
                          </span>
                        </div>
                        <select
                          value={highResRadarProvider}
                          onChange={(e) => setHighResRadarProvider(e.target.value as any)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:border-sky-500"
                        >
                          <option value="auto">✨ Auto-Detect (ARPAE Italy / DWD / HD)</option>
                          <option value="arpae_dpc">🇮🇹 Italy ARPAE / DPC Doppler (Emilia-Romagna)</option>
                          <option value="dwd_1km">🇪🇺 Central Europe DWD 1km Composite</option>
                          <option value="nexrad">🇺🇸 US NEXRAD High-Res Radar</option>
                          <option value="rainviewer_hd">⚡ RainViewer 512px Crisp HD</option>
                        </select>
                      </div>

                      {/* Resolution Selector */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-300">Tile Resolution</span>
                          <span className="text-emerald-400 font-mono text-[10px]">
                            {tileSize === 512 ? '512×512 HD' : '256×256 Standard'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
                          <button
                            onClick={() => setTileSize(512)}
                            className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              tileSize === 512 ? 'bg-emerald-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            512px Ultra-HD
                          </button>
                          <button
                            onClick={() => setTileSize(256)}
                            className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              tileSize === 256 ? 'bg-slate-800 text-sky-400 border border-slate-700' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            256px Standard
                          </button>
                        </div>
                      </div>

                      {/* Bin Filtering / Granularity */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-300">Sensor Granularity</span>
                          <span className="text-amber-400 font-mono text-[10px]">
                            {!smoothRadar ? 'Crisp Raw Bins' : 'Smoothed'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
                          <button
                            onClick={() => setSmoothRadar(false)}
                            className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              !smoothRadar ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Crisp Raw Bins
                          </button>
                          <button
                            onClick={() => setSmoothRadar(true)}
                            className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              smoothRadar ? 'bg-slate-800 text-sky-400 border border-slate-700' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Smoothed
                          </button>
                        </div>
                      </div>

                      {/* Palette Selector */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-300 block">Reflectivity Palette</span>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { id: 2, name: 'Universal Blue' },
                            { id: 4, name: 'NEXRAD Level III' },
                            { id: 8, name: 'Severe Weather' },
                            { id: 1, name: 'Original dBZ' }
                          ].map((pal) => (
                            <button
                              key={pal.id}
                              onClick={() => setColorScheme(pal.id)}
                              className={`py-1.5 px-2.5 rounded-xl text-[11px] font-bold border text-left transition-all cursor-pointer ${
                                colorScheme === pal.id
                                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                              }`}
                            >
                              {pal.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Clean, Unobstructed Radar Map Canvas Container */}
          <div className="relative bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            {/* Minimal Floating Timestamp Tag (Top Left) */}
            <div className="absolute top-3 left-3 z-20 pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-800 text-xs font-bold text-slate-200 shadow-md">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>
                {radarLayerType === 'satellite-vis'
                  ? 'NASA Optical Satellite'
                  : radarLayerType === 'satellite-ir' || (radarLayerType as string) === 'satellite'
                  ? satelliteProvider === 'eumetsat_15m' ? 'EUMETSAT Meteosat IR' : 'NASA VIIRS IR Satellite'
                  : radarLayerType === 'cloud-model'
                  ? cloudSubMode === 'clean_mask' ? 'EUMETSAT Clean Cloud Mask' : cloudSubMode === 'cloud_top_height' ? 'EUMETSAT Cloud Height' : 'NASA Cloud Deck'
                  : currentFrame
                  ? new Date(currentFrame.time * 1000).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : 'Live'}
              </span>
              <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded font-mono">
                {radarLayerType === 'satellite-vis'
                  ? 'NASA HD'
                  : radarLayerType === 'satellite-ir'
                  ? satelliteProvider === 'eumetsat_15m' ? '15m LIVE' : 'NASA DAILY'
                  : radarLayerType === 'cloud-model'
                  ? cloudSubMode === 'nasa_deck' ? 'DAILY' : '15m LIVE'
                  : currentFrameIndex === frames.length - 1
                  ? 'NOW'
                  : 'PAST'}
              </span>
            </div>

            {/* High-Res Radar & Zoom Status Badge (Top Right) */}
            <div className="absolute top-3 right-3 z-20 pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-800 text-xs font-bold text-slate-200 shadow-md">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Zoom {Math.round(currentZoom)}</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">
                  {highResRadarProvider === 'arpae_dpc' || (highResRadarProvider === 'auto' && lat >= 35 && lat <= 47 && lon >= 6 && lon <= 19)
                    ? '🇮🇹 ARPAE / DPC Doppler'
                    : highResRadarProvider === 'dwd_1km' || (highResRadarProvider === 'auto' && lat >= 47 && lat <= 56 && lon >= 5 && lon <= 16)
                    ? '🇪🇺 DWD 1km Composite'
                    : highResRadarProvider === 'nexrad' || (highResRadarProvider === 'auto' && lat >= 24 && lat <= 55 && lon >= -125 && lon <= -66)
                    ? '🇺🇸 NEXRAD Radar'
                    : '⚡ 512px HD Radar'}
                </span>
              </div>
            </div>

            {/* Map Canvas */}
            <div className="relative w-full h-[440px] sm:h-[520px]">
              <div ref={mapContainerRef} className="w-full h-full z-10" />

              {/* Dynamic Map Legend Bar (Bottom Left) */}
              <div className="absolute left-3 bottom-3 z-20 bg-slate-950/90 backdrop-blur-md border border-slate-800/80 rounded-2xl p-2.5 shadow-xl flex flex-col space-y-1.5 max-w-[210px] sm:max-w-xs">
                {radarLayerType === 'satellite-ir' || (radarLayerType as string) === 'satellite' ? (
                  <>
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-300">
                      <span>☁️ Infrared Thermal Satellite</span>
                      <span className="text-purple-400">
                        {satelliteProvider === 'eumetsat_15m' ? 'EUMETSAT 15m' : 'NASA VIIRS IR'}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gradient-to-r from-slate-700 via-slate-400 via-sky-300 via-purple-400 to-white border border-slate-700/50"></div>
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                      <span>Low Cloud</span>
                      <span>Mid Level</span>
                      <span>High Cirrus</span>
                    </div>
                  </>
                ) : radarLayerType === 'satellite-vis' ? (
                  <>
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-300">
                      <span>🛰️ Visible Optical Photo</span>
                      <span className="text-indigo-400">NASA VIIRS</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gradient-to-r from-slate-900 via-blue-900 via-slate-200 to-white border border-slate-700/50"></div>
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                      <span>Land/Ocean</span>
                      <span>Fog/Haze</span>
                      <span>Bright Cloud</span>
                    </div>
                  </>
                ) : radarLayerType === 'cloud-model' ? (
                  <>
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-300">
                      <span>
                        {cloudSubMode === 'clean_mask'
                          ? '🌫️ Clean Cloud Mask'
                          : cloudSubMode === 'cloud_top_height'
                          ? '☁️ Cloud Top Height'
                          : '🚀 NASA Cloud Deck'}
                      </span>
                      <span className="text-amber-400">
                        {cloudSubMode === 'nasa_deck' ? 'NASA MODIS' : 'EUMETSAT 15m'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[9px] font-bold text-center">
                      <span className="bg-emerald-500/20 text-emerald-300 rounded py-0.5 border border-emerald-500/30">Low Cloud</span>
                      <span className="bg-sky-500/20 text-sky-300 rounded py-0.5 border border-sky-500/30">Mid Deck</span>
                      <span className="bg-purple-500/20 text-purple-300 rounded py-0.5 border border-purple-500/30">High Deck</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-300">
                      <span>🌧️ Rain Radar dBZ</span>
                      <span className="text-sky-400">Doppler</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gradient-to-r from-cyan-500 via-green-400 via-yellow-400 via-orange-500 via-red-600 to-purple-600 border border-slate-700/50"></div>
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                      <span>15 Light</span>
                      <span>35 Mod</span>
                      <span>50 Heavy</span>
                      <span>65+ Hail</span>
                    </div>
                  </>
                )}
              </div>

              {/* Floating Zoom Controls (Bottom Right) */}
              <div className="absolute right-3 bottom-3 z-20 flex flex-col gap-1.5">
                <button
                  onClick={handleZoomIn}
                  className="p-2 bg-slate-950/90 hover:bg-slate-900 border border-slate-800 rounded-xl text-slate-200 shadow-lg cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={handleZoomOut}
                  className="p-2 bg-slate-950/90 hover:bg-slate-900 border border-slate-800 rounded-xl text-slate-200 shadow-lg cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Player Timeline Bar */}
          <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold transition-all shadow-md shadow-sky-500/20 cursor-pointer flex items-center gap-2"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span className="text-xs">{isPlaying ? 'Pause' : 'Play Loop'}</span>
              </button>

              <button
                onClick={() => setCurrentFrameIndex(0)}
                className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                title="Reset Timeline"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Playback Speed Selector */}
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
                {[0.5, 1, 2, 4].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setPlaybackSpeed(spd)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      playbackSpeed === spd
                        ? 'bg-sky-500 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              <div className="text-xs font-semibold text-slate-300 ml-1">
                Frame {currentFrameIndex + 1} of {frames.length || 1}
              </div>
            </div>

            {/* Scrubber & Opacity */}
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <div className="flex-1 sm:w-48 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, frames.length - 1)}
                  value={currentFrameIndex}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setCurrentFrameIndex(parseInt(e.target.value));
                  }}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0 border-l border-slate-800 pl-4">
                <span className="text-[11px] text-slate-400">Opacity</span>
                <input
                  type="range"
                  min="0.2"
                  max="1.0"
                  step="0.05"
                  value={radarOpacity}
                  onChange={(e) => setRadarOpacity(parseFloat(e.target.value))}
                  className="w-16 h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-sky-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: Direct Weather Radar Images Gallery */}
      {viewMode === 'tiles' && (
        <div className="space-y-6">
          {/* Main Direct Location Radar Images Grid */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-sky-400" />
                <h3 className="text-lg font-bold text-white">Location Radar Images ({locationName})</h3>
              </div>
              <span className="text-xs text-slate-400">
                Zoom Levels 6 – 9
              </span>
            </div>

            <p className="text-xs text-slate-400">
              Direct Doppler precipitation reflectivity tiles centered on your latitude and longitude ({lat.toFixed(2)}°, {lon.toFixed(2)}°).
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[6, 7, 8, 9].map((zoomLevel) => {
                const coords = latLonToTileCoords(lat, lon, zoomLevel);
                const tileUrl = currentFrame
                  ? `${host}${currentFrame.path}/256/${zoomLevel}/${coords.x}/${coords.y}/2/1_1.png`
                  : '';

                const mapBgUrl = `https://a.basemaps.cartocdn.com/dark_all/${zoomLevel}/${coords.x}/${coords.y}.png`;

                return (
                  <div
                    key={zoomLevel}
                    className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex flex-col items-center space-y-2 group hover:border-slate-700 transition-all"
                  >
                    <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                      {/* Base Map Background */}
                      <img
                        src={mapBgUrl}
                        alt="Map tile"
                        className="absolute inset-0 w-full h-full object-cover opacity-60"
                      />
                      {/* Weather Radar Overlay */}
                      {tileUrl && (
                        <img
                          src={tileUrl}
                          alt={`Radar tile zoom ${zoomLevel}`}
                          className="absolute inset-0 w-full h-full object-cover mix-blend-screen"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      )}
                      {/* Location Crosshair */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-3 h-3 border-2 border-sky-400 rounded-full bg-sky-500/40 animate-pulse"></div>
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="text-xs font-bold text-white">Zoom Level {zoomLevel}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Tile X:{coords.x} Y:{coords.y}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Historical Radar Snapshot Strip */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold text-white">Radar Loop Snapshots</h3>
              </div>
              <span className="text-xs text-slate-400">{frames.length} Timestamps</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {frames.map((frame, index) => {
                const coords = latLonToTileCoords(lat, lon, 7);
                const tileUrl = `${host}${frame.path}/256/7/${coords.x}/${coords.y}/2/1_1.png`;
                const mapBgUrl = `https://a.basemaps.cartocdn.com/dark_all/7/${coords.x}/${coords.y}.png`;
                const timeStr = new Date(frame.time * 1000).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                });

                const isSelected = index === currentFrameIndex;

                return (
                  <button
                    key={frame.time}
                    onClick={() => {
                      setCurrentFrameIndex(index);
                      setViewMode('interactive');
                    }}
                    className={`p-2 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-sky-500/10 border-sky-500 ring-2 ring-sky-500/30'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-900 border border-slate-800 mb-2">
                      <img src={mapBgUrl} alt="map" className="absolute inset-0 w-full h-full object-cover opacity-50" />
                      <img src={tileUrl} alt="radar" className="absolute inset-0 w-full h-full object-cover mix-blend-screen" />
                    </div>
                    <div className="text-[11px] font-bold text-white text-center">{timeStr}</div>
                    <div className="text-[10px] text-center text-slate-400">
                      {index === frames.length - 1 ? 'Latest' : `Frame ${index + 1}`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mode 3: Multi-Radius Risk Assessment & Forecast Vectors */}
      {viewMode === 'forecast' && (
        <div className="space-y-6">
          {/* Multi-Radius Risk Assessment Card */}
          {risk && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold text-white">Multi-Radius Risk Assessment</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Current Location Risk */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="text-xs text-slate-400 font-medium">Current Point (0 km)</div>
                    <div className="text-xl font-bold text-white mt-1">
                      {risk.current.isApproaching ? 'Direct Impact Threat' : 'Low Active Threat'}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Immediate precipitation cell overhead.
                    </p>
                  </div>
                  <div>
                    <span
                      className={`inline-block text-xs font-bold px-3 py-1 rounded-full border ${getRiskColorClass(
                        risk.current.riskLevel
                      )}`}
                    >
                      {risk.current.riskLevel} RISK
                    </span>
                  </div>
                </div>

                {/* 20km Radius Risk */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="text-xs text-slate-400 font-medium">20 km Perimeter</div>
                    <div className="text-xl font-bold text-white mt-1">
                      {risk.radius20km.isApproaching ? 'Cells Approaching' : 'Monitoring Nearby'}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Storm cells within 15-20 min travel time.
                    </p>
                  </div>
                  <div>
                    <span
                      className={`inline-block text-xs font-bold px-3 py-1 rounded-full border ${getRiskColorClass(
                        risk.radius20km.riskLevel
                      )}`}
                    >
                      {risk.radius20km.riskLevel} RISK
                    </span>
                  </div>
                </div>

                {/* 100km Radius Risk */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="text-xs text-slate-400 font-medium">100 km Regional Perimeter</div>
                    <div className="text-xl font-bold text-white mt-1">
                      {risk.radius100km.isApproaching ? 'Regional Storms Active' : 'Clear System'}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Macro tracking for frontal boundaries.
                    </p>
                  </div>
                  <div>
                    <span
                      className={`inline-block text-xs font-bold px-3 py-1 rounded-full border ${getRiskColorClass(
                        risk.radius100km.riskLevel
                      )}`}
                    >
                      {risk.radius100km.riskLevel} RISK
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Movement Forecast Vectors */}
          {prediction?.forecastData && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-sky-400" />
                <h3 className="text-lg font-bold text-white">Storm Propagation & Movement Vectors</h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800">
                  <div className="text-[11px] text-slate-400">Velocity X</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {prediction.forecastData.avgSpeedX.toFixed(2)} px/min
                  </div>
                </div>

                <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800">
                  <div className="text-[11px] text-slate-400">Velocity Y</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {prediction.forecastData.avgSpeedY.toFixed(2)} px/min
                  </div>
                </div>

                <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800">
                  <div className="text-[11px] text-slate-400">1-Hour Movement</div>
                  <div className="text-sm font-bold text-sky-400 mt-0.5">
                    +[{prediction.forecastData.forecast1h[0].toFixed(0)}, {prediction.forecastData.forecast1h[1].toFixed(0)}] px
                  </div>
                </div>

                <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800">
                  <div className="text-[11px] text-slate-400">5-Hour Forecast</div>
                  <div className="text-sm font-bold text-sky-400 mt-0.5">
                    +[{prediction.forecastData.forecast5h[0].toFixed(0)}, {prediction.forecastData.forecast5h[1].toFixed(0)}] px
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Radar Diagnostics */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-slate-400 space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-slate-300">
          <Info className="w-4 h-4 text-sky-400" />
          <span>Radar API Diagnostics</span>
        </div>
        <div>RainViewer Endpoint: {host}</div>
        <div>Active Timestamp: {currentFrame ? currentFrame.time : 'N/A'}</div>
        <div>
          Tile Path:{' '}
          {currentFrame
            ? `${host}${currentFrame.path}/256/7/${latLonToTileCoords(lat, lon, 7).x}/${latLonToTileCoords(lat, lon, 7).y}/2/1_1.png`
            : 'N/A'}
        </div>
      </div>

      {/* Info & Vector Explanation Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-sky-400" />
                <h3 className="text-lg font-black text-white">Understanding Radar Vectors & The Yellow Dot</h3>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="p-1 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer text-xs font-bold px-2.5"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-300">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-400 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
                  <span>1. What does the Yellow Point show?</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  The yellow dot marks the <strong>projected position of an active storm cell center in 1 hour</strong> (+1h displacement). It shows where the core of a rain/thunderstorm cell will be located based on current propagation velocity.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="font-bold text-sky-400 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block"></span>
                  <span>2. On what storm cell is this calculated?</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  The system scans a <strong>100 km radius</strong> surrounding your location for active convective cells (high reflectivity dBZ, CAPE energy, or rain rates &gt;0.3 mm/h).
                </p>
                <ul className="list-disc pl-4 space-y-1 text-slate-400 mt-2">
                  <li><strong className="text-emerald-400">If a nearby cell exists:</strong> The vector tracks that specific cell's distance, intensity, and direction towards or away from your location.</li>
                  <li><strong className="text-sky-400">If NO cell exists (Clear Skies):</strong> The yellow dot is automatically suppressed. The map shows ambient steering winds without generating false storm dots.</li>
                </ul>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="font-bold text-slate-200 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>3. How is the Movement Vector computed?</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  It combines 10-meter surface &amp; 850 hPa steering winds from Open-Meteo with multi-frame Doppler displacement vectors from RainViewer radar.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="font-bold text-purple-400 flex items-center gap-2">
                  <span>📡 4. Data Sources & European MeteoGate Gateway</span>
                </div>
                <div className="space-y-2 text-slate-400 text-[11px] leading-relaxed">
                  <div>
                    <strong className="text-sky-300">🌧️ European Weather Radar Networks (5–10 Min Refresh):</strong> Powered by EUMETNET OPERA composite radar &amp; national radar networks (ARPAE, DWD, Météo-France, Met Office, RainViewer).
                  </div>
                  <div>
                    <strong className="text-purple-300">🇪🇺 EUMETSAT / MeteoGate European Gateway (15 Min Refresh):</strong> Official EUMETNET MeteoGate platform (`meteogate.eu`) providing real-time 15-minute Meteosat SEVIRI infrared satellite data, clean cloud masks, and European surface observations (E-SOH).
                  </div>
                  <div>
                    <strong className="text-indigo-300">🚀 NASA Earthdata VIIRS/MODIS (1–2x Daily):</strong> NASA polar-orbiting satellites providing global high-definition 250m imagery.
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowInfoModal(false)}
              className="w-full py-3 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs shadow-lg transition-all cursor-pointer"
            >
              Got it, close explanation
            </button>
          </div>
        </div>
      )}

      {/* Lighthouse Directory Modal */}
      {showLighthouseDrawer && (() => {
        const categories = [
          { id: 'all', label: 'All Lighthouses' },
          { id: 'german_north_sea', label: 'German North Sea (Nordsee)' },
          { id: 'german_baltic', label: 'German Baltic (Ostsee)' },
          { id: 'german_inland', label: 'Lake Constance' },
          { id: 'italy', label: 'Italy (Italien)' },
          { id: 'europe', label: 'Other Europe' },
          { id: 'global', label: 'Global' }
        ];

        const filteredLighthouses = LIGHTHOUSES.filter((lh) => {
          const matchesCat = lighthouseCategory === 'all' || lh.category === lighthouseCategory;
          const q = lighthouseSearch.toLowerCase().trim();
          const matchesQuery =
            !q ||
            lh.name.toLowerCase().includes(q) ||
            lh.germanName.toLowerCase().includes(q) ||
            lh.location.toLowerCase().includes(q) ||
            lh.country.toLowerCase().includes(q);
          return matchesCat && matchesQuery;
        }).map((lh) => ({
          ...lh,
          distanceKm: calculateDistanceKm(lat, lon, lh.lat, lh.lon)
        })).sort((a, b) => a.distanceKm - b.distanceKm);

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 max-w-3xl w-full max-h-[88vh] flex flex-col space-y-4 shadow-2xl relative">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xl">
                    🏮
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                      <span>Leuchtturm (Lighthouse) Locations</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                        {LIGHTHOUSES.length} Total
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Explore maritime beacons, light characteristics, and local weather forecasts
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowLighthouseDrawer(false)}
                  className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer font-bold text-xs"
                >
                  ✕ Close
                </button>
              </div>

              {/* Controls Bar */}
              <div className="space-y-3 shrink-0">
                {/* Search Input & Range Ring Toggle */}
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="relative flex-1 w-full">
                    <input
                      type="text"
                      placeholder="Search lighthouse name, location, or country..."
                      value={lighthouseSearch}
                      onChange={(e) => setLighthouseSearch(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                    />
                    {lighthouseSearch && (
                      <button
                        onClick={() => setLighthouseSearch('')}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-white text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => setShowLighthouseRanges(!showLighthouseRanges)}
                    className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
                      showLighthouseRanges
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'bg-slate-950 border border-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    <span>{showLighthouseRanges ? '🟡 Light Ranges Visible' : '⭕ Show Light Coverage Circles'}</span>
                  </button>
                </div>

                {/* Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setLighthouseCategory(cat.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                        lighthouseCategory === cat.id
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lighthouses Scrollable Grid */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {filteredLighthouses.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs">
                    No lighthouses matching your search or category filter.
                  </div>
                ) : (
                  filteredLighthouses.map((lh) => (
                    <div
                      key={lh.id}
                      className="bg-slate-950/80 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-4 transition-all space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-base font-extrabold text-white">{lh.germanName}</h4>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                lh.active
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {lh.active ? 'ACTIVE BEACON' : 'LANDMARK'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            📍 {lh.location} ({lh.country})
                          </p>
                        </div>

                        <div className="text-left sm:text-right shrink-0">
                          <span className="text-xs font-bold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20">
                            {lh.distanceKm} km away
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">{lh.description}</p>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-900/80 p-2.5 rounded-xl border border-slate-850">
                        <div>
                          <span className="text-[10px] text-slate-500 block">Height / Focal</span>
                          <span className="font-semibold text-slate-200">{lh.heightMeters}m / {lh.focalHeightMeters}m</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Light Range</span>
                          <span className="font-semibold text-amber-300">{lh.rangeNauticalMiles} NM ({Math.round(lh.rangeNauticalMiles * 1.852)} km)</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Built</span>
                          <span className="font-semibold text-slate-200">{lh.yearBuilt}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Signal</span>
                          <code className="text-[11px] font-mono text-amber-400">{lh.lightCharacteristic}</code>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => {
                            setShowLighthouseDrawer(false);
                            if (mapInstanceRef.current) {
                              mapInstanceRef.current.setView([lh.lat, lh.lon], 11, { animate: true });
                            }
                          }}
                          className="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span>🗺️ Center Map Here</span>
                        </button>

                        <button
                          onClick={() => {
                            setShowLighthouseDrawer(false);
                            if (onSelectLocation) {
                              onSelectLocation(lh.lat, lh.lon, `${lh.germanName}, ${lh.country}`);
                            }
                          }}
                          className="flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span>🌤️ Load Weather at Lighthouse</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
