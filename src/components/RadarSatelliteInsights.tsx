import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Cloud, CloudRain, Compass, Eye, Info, Satellite, ShieldCheck, Timer, TrendingUp } from 'lucide-react';
import type { MtgSatelliteDiagnostics } from '../types';
import type { DpcRainCell, DpcStormApproach } from '../services/dpcAlerts';

interface RadarSatelliteSnapshot {
  layerLabel?: string;
  imageKind?: 'radar' | 'satellite';
  timestamp?: number;
  ageText?: string;
  locationName?: string;
  dpcPoint?: { value: number | null; unit: string; reason: string } | null;
  dpcApproach?: DpcStormApproach | null;
  dpcCells?: DpcRainCell[];
  dpcPlaybackActive?: boolean;
  dpcProxyConfigured?: boolean;
  satelliteData?: MtgSatelliteDiagnostics;
  currentPrecipitation?: number;
}

interface RadarSatelliteInsightsProps {
  layerLabel: string;
  imageKind: 'radar' | 'satellite';
  timestamp: Date;
  ageText: string;
  locationName: string;
  dpcPoint: { value: number | null; unit: string; reason: string } | null;
  dpcApproach: DpcStormApproach | null;
  dpcCells: DpcRainCell[];
  dpcPlaybackActive: boolean;
  dpcProxyConfigured: boolean;
  satelliteData?: MtgSatelliteDiagnostics;
  currentPrecipitation?: number;
}

const getAgeText = (timestamp: Date, ageText: string) => {
  if (ageText && ageText !== 'Live slot') return ageText;
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp.getTime()) / 60000));
  return minutes === 0 ? 'just now' : `${minutes} min ago`;
};

export const RadarSatelliteInsights: React.FC<RadarSatelliteInsightsProps> = ({
  layerLabel,
  imageKind,
  timestamp,
  ageText,
  locationName,
  dpcPoint,
  dpcApproach,
  dpcCells,
  dpcPlaybackActive,
  dpcProxyConfigured,
  satelliteData,
  currentPrecipitation = 0
}) => {
  const [liveSnapshot, setLiveSnapshot] = useState<RadarSatelliteSnapshot | null>(null);

  useEffect(() => {
    const onInsightsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<RadarSatelliteSnapshot>).detail;
      if (detail) setLiveSnapshot(detail);
    };
    window.addEventListener('storm-alert:radar-insights', onInsightsUpdated);
    return () => window.removeEventListener('storm-alert:radar-insights', onInsightsUpdated);
  }, []);

  const activeLayerLabel = liveSnapshot?.layerLabel ?? layerLabel;
  const activeImageKind = liveSnapshot?.imageKind ?? imageKind;
  const activeTimestamp = liveSnapshot?.timestamp ? new Date(liveSnapshot.timestamp) : timestamp;
  const activeAgeText = liveSnapshot?.ageText ?? ageText;
  const activeLocationName = liveSnapshot?.locationName ?? locationName;
  const activeDpcPoint = liveSnapshot?.dpcPoint ?? dpcPoint;
  const activeDpcApproach = liveSnapshot?.dpcApproach ?? dpcApproach;
  const activeDpcCells = liveSnapshot?.dpcCells ?? dpcCells;
  const activeDpcPlayback = liveSnapshot?.dpcPlaybackActive ?? dpcPlaybackActive;
  const activeProxyConfigured = liveSnapshot?.dpcProxyConfigured ?? dpcProxyConfigured;
  const activeSatelliteData = liveSnapshot?.satelliteData ?? satelliteData;
  const activeCurrentPrecipitation = liveSnapshot?.currentPrecipitation ?? currentPrecipitation;

  const measuredValue = activeDpcPoint?.value;
  const isAccumulation = activeDpcPoint?.unit === 'mm';
  const radarStatus = measuredValue == null
    ? activeCurrentPrecipitation > 0.1 ? 'Rain reported near the location' : 'No measurable rain at the location'
    : isAccumulation
      ? measuredValue >= 10 ? 'Significant recent accumulation' : measuredValue >= 1 ? 'Measurable recent accumulation' : 'Little or no accumulation'
      : measuredValue >= 15 ? 'Heavy rain rate at the location' : measuredValue >= 5 ? 'Moderate rain rate at the location' : measuredValue >= 0.2 ? 'Light rain rate at the location' : 'No measurable rain at the location';
  const radarTone = measuredValue != null && ((isAccumulation && measuredValue >= 10) || (!isAccumulation && measuredValue >= 15))
    ? 'text-rose-300 bg-rose-500/10 border-rose-500/25'
    : measuredValue != null && measuredValue >= (isAccumulation ? 1 : 5)
      ? 'text-amber-300 bg-amber-500/10 border-amber-500/25'
      : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25';

  const satellite = activeSatelliteData?.fci;
  const satelliteHeadline = satellite
    ? satellite.cloudTypeClassification === 'Clear Sky' ? 'No significant cloud structure detected' : satellite.cloudTypeClassification
    : 'Satellite context is not available yet';
  const satelliteDetail = satellite
    ? `${Math.round(satellite.cloudTopHeightMeters / 100) / 10} km cloud tops · ${satellite.cloudTopTempC.toFixed(1)}°C · ${satellite.rapidCoolingRateCDegPer15Min.toFixed(1)}°C / 15 min`
    : 'Refresh weather data to add cloud-top context.';
  const satelliteRisk = satellite?.overshootingTopDetected || activeSatelliteData?.li.lightningJumpDetected;

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-4" aria-labelledby="radar-satellite-insights-title">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-300"><Activity className="w-5 h-5" /></div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 id="radar-satellite-insights-title" className="text-sm sm:text-base font-bold text-white">Radar + satellite insights</h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/25">Image-first</span>
            </div>              <p className="text-xs text-slate-400 mt-0.5">A quick read of the latest image and location context around {activeLocationName}.</p>

          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono"><Timer className="w-3.5 h-3.5 text-sky-400" />{activeTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} local · {getAgeText(activeTimestamp, activeAgeText)}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className={`rounded-2xl border p-3.5 space-y-2 ${radarTone}`}>
          <div className="flex items-center justify-between gap-2"><span className="text-[10px] uppercase tracking-wider font-bold opacity-80 flex items-center gap-1.5"><CloudRain className="w-3.5 h-3.5" />{activeImageKind === 'radar' ? 'Radar at location' : 'Radar cross-check'}</span><span className="text-[10px] font-semibold opacity-75">{activeLayerLabel}</span></div>
          <div className="text-sm font-bold">{radarStatus}</div>
          <div className="text-xs opacity-80">{measuredValue != null ? `${measuredValue.toFixed(1)} ${activeDpcPoint?.unit} at the selected frame` : activeCurrentPrecipitation > 0.1 ? `${activeCurrentPrecipitation.toFixed(1)} mm precipitation in the current weather observation` : 'No DPC point sample is available for the selected image yet.'}</div>
          <div className="text-[10px] opacity-70 flex items-center gap-1">{activeDpcPlayback ? <><Eye className="w-3 h-3" />Observed DPC/ARPA raster</> : <><Info className="w-3 h-3" />{activeProxyConfigured ? 'Latest image; DPC point sample appears during playback' : 'Live image; point sampling needs the DPC proxy'}</>}</div>
        </div>

        <div className={`rounded-2xl border p-3.5 space-y-2 ${activeDpcApproach ? 'text-rose-300 bg-rose-500/10 border-rose-500/25' : 'text-slate-300 bg-slate-950/70 border-slate-800'}`}>
          <div className="flex items-center justify-between gap-2"><span className="text-[10px] uppercase tracking-wider font-bold opacity-80 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" />Motion / nowcast</span><Compass className="w-3.5 h-3.5 opacity-70" /></div>
          {activeDpcApproach ? <><div className="text-sm font-bold">Cell on an approach track</div><div className="text-xs opacity-85">{activeDpcApproach.distanceKm} km away · ETA ~{activeDpcApproach.etaMinutes} min · {activeDpcApproach.intensity.toFixed(1)} mm/h</div><div className="text-[10px] opacity-70">Track {activeDpcApproach.speedKmH} km/h toward {Math.round(activeDpcApproach.headingDeg)}° · radar-derived</div></> : activeDpcCells.length > 0 ? <><div className="text-sm font-bold">{activeDpcCells.length} rain cell{activeDpcCells.length === 1 ? '' : 's'} in the scan</div><div className="text-xs opacity-80">No verified collision track at the moment.</div><div className="text-[10px] opacity-70">Movement needs consecutive DPC frames.</div></> : <><div className="text-sm font-bold">No tracked approach</div><div className="text-xs opacity-80">No DPC cell is currently projected toward this location.</div><div className="text-[10px] opacity-70">This is not a guarantee of clear weather.</div></>}
        </div>

        <div className={`rounded-2xl border p-3.5 space-y-2 ${satelliteRisk ? 'text-amber-300 bg-amber-500/10 border-amber-500/25' : 'text-indigo-200 bg-indigo-500/10 border-indigo-500/20'}`}>
          <div className="flex items-center justify-between gap-2"><span className="text-[10px] uppercase tracking-wider font-bold opacity-80 flex items-center gap-1.5"><Satellite className="w-3.5 h-3.5" />Satellite context</span>{satelliteRisk ? <AlertTriangle className="w-3.5 h-3.5" /> : <Cloud className="w-3.5 h-3.5 opacity-70" />}</div>
          <div className="text-sm font-bold">{satelliteHeadline}</div>
          <div className="text-xs opacity-80">{satelliteDetail}</div>
          <div className="text-[10px] opacity-70">{satellite ? `${activeSatelliteData?.li.totalLightningFlashRatePerMin ?? 0} flashes/min context · model-assisted` : 'Image interpretation pending'}</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-[10px] text-slate-500"><span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />Observations and derived tracks are labelled separately from official warnings.</span><span className="flex items-center gap-1.5"><Info className="w-3.5 h-3.5" />Use the image and DPC bulletin together for decisions.</span></div>
    </section>
  );
};
