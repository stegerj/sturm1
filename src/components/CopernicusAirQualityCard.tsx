import React from 'react';
import { Wind, ShieldCheck, AlertCircle, Sparkles, Activity } from 'lucide-react';
import { AirQualityData } from '../types';

interface CopernicusAirQualityCardProps {
  airQuality?: AirQualityData;
}

export const CopernicusAirQualityCard: React.FC<CopernicusAirQualityCardProps> = ({ airQuality }) => {
  if (!airQuality) return null;

  const getAqiColor = (aqi: number) => {
    if (aqi <= 10) return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', bar: 'bg-emerald-500' };
    if (aqi <= 20) return { bg: 'bg-teal-500/20', text: 'text-teal-400', border: 'border-teal-500/30', bar: 'bg-teal-500' };
    if (aqi <= 40) return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', bar: 'bg-yellow-500' };
    if (aqi <= 60) return { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', bar: 'bg-amber-500' };
    if (aqi <= 80) return { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/30', bar: 'bg-rose-500' };
    return { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', bar: 'bg-purple-500' };
  };

  const style = getAqiColor(airQuality.europeanAqi);

  return (
    <div className="bg-slate-900/80 backdrop-blur-md rounded-2xl p-4 border border-slate-800 space-y-3.5 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <Wind className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              <span>European Air Quality Index</span>
              <span className="text-[10px] bg-teal-500/20 text-teal-300 font-mono px-1.5 py-0.5 rounded border border-teal-500/30">
                Copernicus CAMS
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">Atmosphere Monitoring Service</p>
          </div>
        </div>

        <div className={`px-2.5 py-1 rounded-xl font-bold text-xs border flex items-center gap-1.5 ${style.bg} ${style.text} ${style.border}`}>
          <Activity className="w-3.5 h-3.5" />
          <span>{airQuality.aqiLevel} ({airQuality.europeanAqi} EAQI)</span>
        </div>
      </div>

      {/* AQI Progress Scale Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] font-mono text-slate-400">
          <span>0 (Clean)</span>
          <span>50 (Moderate)</span>
          <span>100+ (Hazardous)</span>
        </div>
        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
            style={{ width: `${Math.min(100, (airQuality.europeanAqi / 80) * 100)}%` }}
          ></div>
        </div>
      </div>

      {/* Health Advice */}
      <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs text-slate-300 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
        <span className="leading-relaxed">{airQuality.healthAdvice}</span>
      </div>

      {/* Sub-pollutants Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-0.5">
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2 text-center">
          <div className="text-[10px] text-slate-400 font-medium">PM 2.5</div>
          <div className="text-xs font-bold font-mono text-slate-200">{airQuality.pm25} <span className="text-[9px] text-slate-400 font-normal">µg/m³</span></div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2 text-center">
          <div className="text-[10px] text-slate-400 font-medium">PM 10</div>
          <div className="text-xs font-bold font-mono text-slate-200">{airQuality.pm10} <span className="text-[9px] text-slate-400 font-normal">µg/m³</span></div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2 text-center">
          <div className="text-[10px] text-slate-400 font-medium">NO₂</div>
          <div className="text-xs font-bold font-mono text-slate-200">{airQuality.no2} <span className="text-[9px] text-slate-400 font-normal">µg/m³</span></div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2 text-center">
          <div className="text-[10px] text-slate-400 font-medium">Ozone O₃</div>
          <div className="text-xs font-bold font-mono text-slate-200">{airQuality.o3} <span className="text-[9px] text-slate-400 font-normal">µg/m³</span></div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2 text-center">
          <div className="text-[10px] text-slate-400 font-medium">SO₂</div>
          <div className="text-xs font-bold font-mono text-slate-200">{airQuality.so2} <span className="text-[9px] text-slate-400 font-normal">µg/m³</span></div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2 text-center">
          <div className="text-[10px] text-slate-400 font-medium">Dust</div>
          <div className="text-xs font-bold font-mono text-slate-200">{airQuality.dust} <span className="text-[9px] text-slate-400 font-normal">µg/m³</span></div>
        </div>
      </div>
    </div>
  );
};
