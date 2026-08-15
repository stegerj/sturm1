import React from 'react';
import { Waves, Wind, Thermometer, Compass, Anchor, ShieldAlert, Navigation, Eye, ArrowUpRight, ArrowDownRight, Clock, Droplets } from 'lucide-react';
import { MarineData } from '../types';
import { t, getDeviceLanguage, SupportedLanguage } from '../utils/i18n';

interface MarineMeteoCardProps {
  marineData?: MarineData;
  locationName?: string;
  lang?: SupportedLanguage;
}

export const MarineMeteoCard: React.FC<MarineMeteoCardProps> = ({ marineData, locationName, lang }) => {
  if (!marineData) return null;

  const currentLang = lang || getDeviceLanguage();

  const waveHeight = marineData.waveHeight ?? 0.5;
  const wavePeriod = marineData.wavePeriod ?? 5.0;
  const waveDirection = marineData.waveDirection ?? 180;
  const swellHeight = marineData.swellWaveHeight ?? 0.4;
  const swellPeriod = marineData.swellWavePeriod ?? 6.0;
  const seaTemp = marineData.seaSurfaceTemperature ?? 22.0;
  const windKnots = marineData.windKnots ?? 10;
  const beaufortScale = marineData.beaufortScale ?? 3;
  const beaufortDesc = marineData.beaufortDescription ?? 'Gentle Breeze';
  const seaStateCategory = marineData.seaStateCategory ?? 'Poco Mosso';
  const tides = marineData.tides;

  // Determine Marine Safety Badge
  let safetyColor = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
  let safetyLabel = t('safetyIdeal', currentLang);

  if (waveHeight > 2.5 || windKnots > 25) {
    safetyColor = 'bg-rose-500/10 border-rose-500/30 text-rose-400';
    safetyLabel = t('safetyWarning', currentLang);
  } else if (waveHeight > 1.2 || windKnots > 15) {
    safetyColor = 'bg-amber-500/10 border-amber-500/30 text-amber-400';
    safetyLabel = t('safetyModerate', currentLang);
  }

  // Convert direction degree to cardinal direction string
  const getCardinalDirection = (deg: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(deg / 45) % 8];
  };

  return (
    <div className="p-5 md:p-6 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl backdrop-blur-md space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Anchor className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              {t('marineTitle', currentLang)}
            </h3>
            <p className="text-xs text-slate-400">
              {t('marineSub', currentLang)} ({locationName || 'Location'})
            </p>
          </div>
        </div>

        {/* Safety Badge */}
        <div className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${safetyColor}`}>
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{safetyLabel}</span>
        </div>
      </div>

      {/* Ebbe / Flut (Tides) Featured Section */}
      {tides && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-slate-950 via-cyan-950/30 to-slate-950 border border-cyan-500/30 relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            {/* Left: Tide Status */}
            <div className="flex items-center gap-3.5">
              <div className={`p-3 rounded-2xl border ${
                tides.currentStatus === 'rising'
                  ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
                  : 'bg-amber-500/20 border-amber-400/40 text-amber-300'
              }`}>
                {tides.currentStatus === 'rising' ? (
                  <ArrowUpRight className="w-7 h-7 animate-pulse" />
                ) : (
                  <ArrowDownRight className="w-7 h-7 animate-pulse" />
                )}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                  <span>{t('tideStatus', currentLang)}</span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] text-slate-300 border border-slate-700">
                    {t('coefficient', currentLang)} {tides.coeff}
                  </span>
                </div>
                <div className="text-lg md:text-xl font-extrabold text-slate-100 flex items-center gap-2 mt-0.5">
                  {tides.currentStatus === 'rising' ? (
                    <span className="text-cyan-300">{t('risingWater', currentLang)}</span>
                  ) : (
                    <span className="text-amber-300">{t('fallingWater', currentLang)}</span>
                  )}
                </div>
                <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                  <span>{t('waterLevel', currentLang)}: <strong className="text-slate-200">{tides.currentWaterLevelMeters.toFixed(2)}m</strong></span>
                  <span>•</span>
                  <span>{t('tidalRange', currentLang)}: <strong className="text-slate-200">{tides.tidalRangeMeters}m</strong></span>
                </div>
              </div>
            </div>

            {/* Right: Next Tide Highlight */}
            {tides.nextTide && (
              <div className="p-3 px-4 rounded-xl bg-slate-900/80 border border-slate-700/80 shrink-0 w-full md:w-auto">
                <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 mb-1">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  {t('nextTide', currentLang)}
                </div>
                <div className="text-sm font-bold text-slate-100 flex items-center justify-between gap-3">
                  <span className={tides.nextTide.type === 'high' ? 'text-cyan-300' : 'text-amber-300'}>
                    {tides.nextTide.type === 'high' ? `🌊 ${t('highTide', currentLang)}` : `🏖️ ${t('lowTide', currentLang)}`}
                  </span>
                  <span className="text-base text-white bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-700 font-mono">
                    {tides.nextTide.time}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  +{tides.nextTide.heightMeters.toFixed(2)}m
                </div>
              </div>
            )}
          </div>

          {/* Tide Schedule Bar */}
          {tides.upcomingTides && tides.upcomingTides.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-800/80">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                {t('tideSchedule', currentLang)}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {tides.upcomingTides.map((tide, i) => (
                  <div key={i} className={`p-2.5 rounded-lg border text-center transition-colors ${
                    tide.type === 'high'
                      ? 'bg-cyan-950/20 border-cyan-500/30 text-cyan-200 hover:bg-cyan-950/40'
                      : 'bg-amber-950/20 border-amber-500/30 text-amber-200 hover:bg-amber-950/40'
                  }`}>
                    <div className="text-[10px] uppercase font-bold tracking-wider opacity-80">
                      {tide.type === 'high' ? `🌊 ${t('highTide', currentLang)}` : `🏖️ ${t('lowTide', currentLang)}`}
                    </div>
                    <div className="text-sm font-extrabold font-mono text-slate-100 my-0.5">
                      {tide.time}
                    </div>
                    <div className="text-[11px] font-semibold opacity-90">
                      +{tide.heightMeters.toFixed(2)}m
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Grid of Marine Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {/* Wave Height */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between mb-1.5 text-slate-400 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <Waves className="w-4 h-4 text-cyan-400" />
              Wave Height
            </span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-slate-100">
            {waveHeight.toFixed(1)} <span className="text-xs font-normal text-slate-400">m</span>
          </div>
          <div className="text-[11px] font-semibold text-cyan-400 mt-1 truncate">
            {seaStateCategory}
          </div>
        </div>

        {/* Wave Direction & Period */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between mb-1.5 text-slate-400 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-indigo-400" />
              Wave Direction
            </span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-slate-100 flex items-center gap-1.5">
            <Navigation
              className="w-4 h-4 text-indigo-400 shrink-0"
              style={{ transform: `rotate(${waveDirection}deg)` }}
            />
            {getCardinalDirection(waveDirection)} ({Math.round(waveDirection)}°)
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Period: <span className="text-slate-200 font-semibold">{wavePeriod.toFixed(1)}s</span>
          </div>
        </div>

        {/* Swell Conditions */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between mb-1.5 text-slate-400 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <Waves className="w-4 h-4 text-teal-400" />
              Swell Wave
            </span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-slate-100">
            {swellHeight.toFixed(1)} <span className="text-xs font-normal text-slate-400">m</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Interval: <span className="text-slate-200 font-semibold">{swellPeriod.toFixed(1)}s</span>
          </div>
        </div>

        {/* Sea Surface Temperature */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between mb-1.5 text-slate-400 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <Thermometer className="w-4 h-4 text-emerald-400" />
              Sea Surface Temp
            </span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-slate-100">
            {seaTemp.toFixed(1)} <span className="text-xs font-normal text-slate-400">°C</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Coastal Water Temp
          </div>
        </div>

        {/* Wind in Knots */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between mb-1.5 text-slate-400 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <Wind className="w-4 h-4 text-sky-400" />
              Nautical Wind
            </span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-slate-100">
            {windKnots} <span className="text-xs font-normal text-slate-400">kts</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Beaufort {beaufortScale} ({beaufortDesc})
          </div>
        </div>

        {/* Sea State Index */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between mb-1.5 text-slate-400 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-amber-400" />
              Douglas Scale
            </span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-slate-100">
            Code {marineData.seaStateCode ?? 2}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            {seaStateCategory}
          </div>
        </div>
      </div>
    </div>
  );
};
