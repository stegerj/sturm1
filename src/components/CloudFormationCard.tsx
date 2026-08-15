import React, { useState } from 'react';
import { Cloud, CloudRain, CloudSun, Eye, Layers, ArrowUpRight, Mountain, Sparkles, Info, ShieldCheck } from 'lucide-react';
import { WeatherResponse } from '../types';
import { t, SupportedLanguage, getDeviceLanguage } from '../utils/i18n';

interface CloudFormationCardProps {
  weatherData?: WeatherResponse | null;
  lang?: SupportedLanguage;
  onOpenSatelliteMap?: () => void;
}

export const CloudFormationCard: React.FC<CloudFormationCardProps> = ({
  weatherData,
  lang,
  onOpenSatelliteMap
}) => {
  const [showExplanation, setShowExplanation] = useState(false);

  if (!weatherData) return null;

  const currentLang = lang || getDeviceLanguage();
  const current = weatherData.current;
  const hourly = weatherData.hourly;

  const totalCloudCover = current?.cloudCover ?? hourly?.cloudCover?.[0] ?? 0;
  const lowCloudCover = current?.cloudCoverLow ?? hourly?.cloudCoverLow?.[0] ?? Math.round(totalCloudCover * 0.4);
  const midCloudCover = current?.cloudCoverMid ?? hourly?.cloudCoverMid?.[0] ?? Math.round(totalCloudCover * 0.3);
  const highCloudCover = current?.cloudCoverHigh ?? hourly?.cloudCoverHigh?.[0] ?? Math.round(totalCloudCover * 0.3);

  // Compute Cloud Base Altitude (Ceiling) using Dewpoint Spread: ~125m per 1°C difference
  const temp = current?.temperature ?? hourly?.temperature?.[0] ?? 20;
  const dewPoint = hourly?.dewPoint?.[0] ?? (temp - 5);
  const dewPointSpread = Math.max(0, temp - dewPoint);
  const cloudCeilingMeters = Math.round(dewPointSpread * 125);
  const cloudCeilingFeet = Math.round(cloudCeilingMeters * 3.28084);

  // Determine cloud formation status
  let cloudFormationType = 'Clear / Scattered Clouds';
  let formationDetail = 'Minimal cloud layer detected. High visual clarity across all altitudes.';
  if (lowCloudCover > 70) {
    cloudFormationType = 'Low Stratus & Fog / Heavy Cumulus';
    formationDetail = 'Dense low-level cloud deck. May cause reduced mountain/hill visibility and localized drizzle.';
  } else if (midCloudCover > 60) {
    cloudFormationType = 'Mid-Altitude Altocumulus Deck';
    formationDetail = 'Stable mid-level cloud layer. Often signals an approaching weather front within 12-24 hours.';
  } else if (highCloudCover > 60) {
    cloudFormationType = 'High Cirrus Ice Veil';
    formationDetail = 'Wispy ice-crystal clouds in the upper troposphere, creating halos around the sun/moon.';
  } else if (totalCloudCover > 50) {
    cloudFormationType = 'Mixed Convective Cloud Layer';
    formationDetail = 'Developing cumulus clouds forming with daylight thermal updrafts.';
  }

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl relative overflow-hidden my-4">
      {/* Background Subtle Gradient Glow */}
      <div className="absolute -right-16 -top-16 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              Cloud Layers & Local Formations
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Satellite & Ceiling
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Low, mid, and high altitude cloud cover not visible on rain radar
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
          >
            <Info className="w-4 h-4 text-sky-400" />
            <span>Why Radar Misses Clouds?</span>
          </button>

          {onOpenSatelliteMap && (
            <button
              onClick={onOpenSatelliteMap}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-lg shadow-sky-600/20 transition-all border border-sky-400/30 shrink-0 cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              <span>Satellite Imagery</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-80" />
            </button>
          )}
        </div>
      </div>

      {/* Educational Collapsible Callout: Rain Radar vs Cloud Satellite */}
      {showExplanation && (
        <div className="mb-5 p-4 rounded-xl bg-sky-950/40 border border-sky-800/60 text-xs leading-relaxed text-slate-300 space-y-2 animate-fadeIn">
          <div className="flex items-center gap-2 font-bold text-sky-300 text-sm">
            <ShieldCheck className="w-4 h-4 text-sky-400" />
            Radar vs. Satellite Imagery Explained
          </div>
          <p>
            <strong className="text-white">Why Rain Radar doesn't show non-rainy clouds:</strong> Doppler rain radar sends out microwave pulses (S/C/X band) that only bounce back off <em>large precipitation droplets</em> (rain, hail, or snow &gt; 0.5mm).
          </p>
          <p>
            Non-precipitating clouds (such as fair-weather cumulus, low stratus, hill fog, or high cirrus) consist of microscopic water droplets or ice crystals too small to reflect rain radar.
          </p>
          <p className="text-slate-400 border-t border-sky-800/40 pt-2">
            💡 <strong>Solution:</strong> Use <strong>Infrared Satellite Imagery</strong> (measures cloud-top thermal radiation day & night) or <strong>Visible Optical Satellite Imagery</strong> (NASA VIIRS TrueColor) in the Radar tab to view total cloud cover!
          </p>
        </div>
      )}

      {/* Current Cloud Formation Overview Badge */}
      <div className="mb-5 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <CloudSun className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Primary Cloud Formation</div>
            <div className="text-sm font-extrabold text-white">{cloudFormationType}</div>
          </div>
        </div>
        <p className="text-xs text-slate-300 max-w-md italic sm:text-right">
          "{formationDetail}"
        </p>
      </div>

      {/* Grid of Cloud Levels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        {/* Low Clouds */}
        <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Cloud className="w-4 h-4 text-sky-400" />
              Low Clouds (&lt;2,000m)
            </span>
            <span className="text-sm font-extrabold text-sky-400 font-mono">{lowCloudCover}%</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2">
            <div
              className="bg-gradient-to-r from-sky-500 to-cyan-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, lowCloudCover))}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            Stratus, Cumulus, Fog & Hill Mist
          </p>
        </div>

        {/* Mid Clouds */}
        <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <CloudSun className="w-4 h-4 text-amber-400" />
              Mid Clouds (2,000-6,000m)
            </span>
            <span className="text-sm font-extrabold text-amber-400 font-mono">{midCloudCover}%</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2">
            <div
              className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, midCloudCover))}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            Altocumulus & Altostratus Deck
          </p>
        </div>

        {/* High Clouds */}
        <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-400" />
              High Clouds (&gt;6,000m)
            </span>
            <span className="text-sm font-extrabold text-purple-400 font-mono">{highCloudCover}%</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2">
            <div
              className="bg-gradient-to-r from-purple-500 to-indigo-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, highCloudCover))}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            Cirrus & Cirrostratus Ice Veils
          </p>
        </div>
      </div>

      {/* Cloud Base Ceiling & Diagnostic Footnote */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-800/80 text-xs">
        <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mountain className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-300 font-medium">Estimated Cloud Base Ceiling:</span>
          </div>
          <span className="text-sm font-bold font-mono text-emerald-300">
            ~{cloudCeilingMeters} m ({cloudCeilingFeet} ft)
          </span>
        </div>

        <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CloudRain className="w-4 h-4 text-sky-400" />
            <span className="text-slate-300 font-medium">Total Sky Coverage:</span>
          </div>
          <span className="text-sm font-bold font-mono text-sky-300">
            {totalCloudCover}%
          </span>
        </div>
      </div>
    </div>
  );
};

