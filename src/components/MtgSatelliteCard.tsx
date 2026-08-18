import React, { useState } from 'react';
import {
  Satellite,
  Zap,
  Activity,
  Layers,
  Thermometer,
  Eye,
  Info,
  CheckCircle2,
  AlertTriangle,
  Flame,
  CloudRain,
  Radio,
  ArrowUpRight,
  ShieldCheck,
  Compass
} from 'lucide-react';
import { MtgSatelliteDiagnostics } from '../types';

interface MtgSatelliteCardProps {
  mtgData?: MtgSatelliteDiagnostics;
  onOpenRadar?: () => void;
}

export const MtgSatelliteCard: React.FC<MtgSatelliteCardProps> = ({ mtgData, onOpenRadar }) => {
  const [activeTab, setActiveTab] = useState<'fci' | 'li' | 'overview'>('overview');
  const [showChannelDetails, setShowChannelDetails] = useState<boolean>(false);

  if (!mtgData) return null;

  const { fci, li, nowcastingAssessment, dataDisseminationTime } = mtgData;

  const formattedTime = new Date(dataDisseminationTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
      {/* Header with EUMETSAT MTG Branding & Status */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
            <Satellite className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Satellite Diagnostic
              </h3>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Model estimate
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Model-derived atmospheric estimate (Open-Meteo NWP) — not live EUMETSAT instrument telemetry
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
            Disseminated: {formattedTime}
          </span>
          {onOpenRadar && (
            <button
              onClick={onOpenRadar}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-md shadow-indigo-600/20"
            >
              <span>Sat Radar</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 max-w-md">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center ${
            activeTab === 'overview'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Diagnostic Summary
        </button>
        <button
          onClick={() => setActiveTab('fci')}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center ${
            activeTab === 'fci'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          FCI Multispectral
        </button>
        <button
          onClick={() => setActiveTab('li')}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center ${
            activeTab === 'li'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          LI Lightning Imager
        </button>
      </div>

      {/* Tab 1: Overview & Nowcasting Assessment */}
      {activeTab === 'overview' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Key Metric Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Cloud Top Temperature */}
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Cloud Top Temp</span>
                <Thermometer className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-white">
                {fci.cloudTopTempC.toFixed(1)}°<span className="text-sm font-normal text-slate-400">C</span>
              </div>
              <div className="text-[10px] text-sky-300 font-medium mt-1">
                {fci.cloudTopTempC <= -40 ? 'Severe cold summit' : fci.cloudTopTempC <= 0 ? 'Sub-zero layer' : 'Warm boundary layer'}
              </div>
            </div>

            {/* Cloud Top Height (CTTH) */}
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Cloud Summit Alt</span>
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-white">
                {fci.cloudTopHeightMeters > 0 ? (
                  <>
                    {(fci.cloudTopHeightMeters / 1000).toFixed(1)} <span className="text-sm font-normal text-slate-400">km</span>
                  </>
                ) : (
                  <span className="text-slate-400 text-lg">Clear Sky</span>
                )}
              </div>
              <div className="text-[10px] text-indigo-300 font-medium mt-1">
                {fci.cloudTopHeightMeters > 0 ? `${fci.cloudTopPressureHpa} hPa (FL${Math.round(fci.cloudTopHeightMeters * 0.0328)})` : 'Surface 1013 hPa'}
              </div>
            </div>

            {/* Microphysical Cloud Phase */}
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Cloud Phase</span>
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-sm sm:text-base font-bold text-white truncate">
                {fci.cloudPhase}
              </div>
              <div className="text-[10px] text-slate-400 font-medium mt-1">
                COT: <strong className="text-slate-200">{fci.opticalThickness}</strong>
              </div>
            </div>

            {/* MTG Lightning Imager (LI) Total Rate */}
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>LI Total Flash Rate</span>
                <Zap className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-amber-400">
                {li.totalLightningFlashRatePerMin} <span className="text-xs font-normal text-slate-400">/min</span>
              </div>
              <div className="text-[10px] font-semibold mt-1">
                {li.lightningJumpDetected ? (
                  <span className="text-red-400 animate-pulse flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    ⚡ Lightning Jump!
                  </span>
                ) : li.totalLightningFlashRatePerMin > 0 ? (
                  <span className="text-amber-300">Continuous optical LI</span>
                ) : (
                  <span className="text-emerald-400">0 discharge (Quiet)</span>
                )}
              </div>
            </div>
          </div>

          {/* Real-Time Nowcasting Assessment Box */}
          <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-100 leading-relaxed flex items-start gap-3">
            <Radio className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white mb-1 flex items-center gap-2">
                <span>MTG Geostationary Nowcasting Synthesis</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-500/30 text-indigo-200">
                  {fci.scanMode}
                </span>
              </div>
              <p className="text-slate-300">{nowcastingAssessment}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: FCI Multispectral Channels (16 Spectral Bands) */}
      {activeTab === 'fci' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* FCI VIS 0.6 µm */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-200">Channel 0.6 µm (VIS)</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-sky-400 font-mono">Visible</span>
              </div>
              <div className="text-2xl font-black text-white">
                {fci.channelVis06ReflectancePct.toFixed(1)}% <span className="text-xs font-normal text-slate-400">Reflectance</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-sky-400 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, fci.channelVis06ReflectancePct)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Measures solar reflectivity of cloud summits and terrain albedo (1 km resolution).
              </p>
            </div>

            {/* FCI IR 10.5 µm Clean Window */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-200">Channel 10.5 µm (IR)</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-amber-400 font-mono">Thermal IR</span>
              </div>
              <div className="text-2xl font-black text-white">
                {fci.channelIr105TempC.toFixed(1)}°<span className="text-xs font-normal text-slate-400">C</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Clean infrared window measuring radiant temperature of cloud tops without water-vapor absorption.
              </p>
            </div>

            {/* FCI WV 6.3 µm Water Vapor */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-200">Channel 6.3 µm (WV)</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-indigo-400 font-mono">Water Vapor</span>
              </div>
              <div className="text-2xl font-black text-white">
                {fci.channelWv63TempC.toFixed(1)}°<span className="text-xs font-normal text-slate-400">C</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Measures middle and upper tropospheric moisture (300 - 500 hPa jet stream dynamics).
              </p>
            </div>
          </div>

          {/* Cloud Type Classification Card */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-400 font-medium">MTG FCI Cloud Type Classification</div>
              <div className="text-base font-bold text-white mt-0.5 flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-sky-400" />
                <span>{fci.cloudTypeClassification}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {fci.overshootingTopDetected ? (
                <span className="text-xs font-extrabold px-3 py-1 rounded-xl bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse">
                  ⚠️ Overshooting Convective Top
                </span>
              ) : (
                <span className="text-xs font-medium px-3 py-1 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
                  Stable Convective Envelope
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: MTG Lightning Imager (LI) Level-2 Instrument */}
      {activeTab === 'li' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Flash Rate & Jump Status */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="text-xs text-slate-400 font-medium">Optical Flash Rate</div>
              <div className="text-2xl font-black text-amber-400">
                {li.totalLightningFlashRatePerMin} <span className="text-xs font-normal text-slate-400">flashes / min</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Continuous optical pulses captured across the 777.4 nm oxygen triplet band.
              </div>
            </div>

            {/* Flash Density */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="text-xs text-slate-400 font-medium">Accumulated Flash Density</div>
              <div className="text-2xl font-black text-white">
                {li.accumulatedFlashDensity} <span className="text-xs font-normal text-slate-400">fl/100km²/15m</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Active storm cells clustered in {li.activeFlashClustersCount} convective core(s).
              </div>
            </div>

            {/* Intra-Cloud vs Cloud-To-Ground */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="text-xs text-slate-400 font-medium">Discharge Breakdown</div>
              <div className="flex items-center justify-between text-xs font-bold mt-1">
                <span className="text-sky-300">Intra-Cloud: {li.intraCloudFractionPct}%</span>
                <span className="text-amber-400">CG: {li.cloudToGroundFractionPct}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                <div className="bg-sky-400 h-full" style={{ width: `${li.intraCloudFractionPct}%` }} />
                <div className="bg-amber-400 h-full" style={{ width: `${li.cloudToGroundFractionPct}%` }} />
              </div>
              <div className="text-[10px] text-slate-400">
                MTG LI detects intra-cloud lightning 10–20 minutes before first cloud-to-ground strikes.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Provenance footer */}
      <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>EUMETSAT Geostationary European Rapid Scan Service (0.0° Longitude)</span>
        </div>
        <button
          onClick={() => setShowChannelDetails(!showChannelDetails)}
          className="text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
        >
          {showChannelDetails ? 'Hide MTG Specs' : 'Show MTG Instrument Specs'}
        </button>
      </div>

      {showChannelDetails && (
        <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 space-y-2 animate-fadeIn">
          <p>
            <strong>Meteosat Third Generation (MTG-I1 / Meteosat-12):</strong> Launched by EUMETSAT/ESA. Operates the 16-channel Flexible Combined Imager (FCI) with 0.5–2.0 km spatial resolution and the innovative Lightning Imager (LI) capturing continuous total lightning (both intra-cloud and cloud-to-ground) over Europe and the Mediterranean.
          </p>
        </div>
      )}
    </div>
  );
};
