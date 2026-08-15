import React from 'react';
import { CloudRain, Clock, Droplets, Info } from 'lucide-react';
import { MinutePrecipitationPoint } from '../types';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface MinutePrecipitationCardProps {
  minutePoints: MinutePrecipitationPoint[];
  currentPrecipMmH?: number;
}

export const MinutePrecipitationCard: React.FC<MinutePrecipitationCardProps> = ({
  minutePoints,
  currentPrecipMmH = 0
}) => {
  if (!minutePoints || minutePoints.length === 0) return null;

  // Find when rain starts or stops
  const firstRainIndex = minutePoints.findIndex((p) => p.intensityMmH >= 0.1);
  const maxRainPoint = [...minutePoints].sort((a, b) => b.intensityMmH - a.intensityMmH)[0];
  const isCurrentlyRaining = currentPrecipMmH >= 0.1;

  let summaryText = 'No precipitation expected in the next 60 minutes.';
  if (isCurrentlyRaining) {
    const stopIndex = minutePoints.findIndex((p) => p.intensityMmH < 0.1);
    if (stopIndex > 0) {
      summaryText = `Rain easing in ~${stopIndex} minutes. Current rate: ${currentPrecipMmH.toFixed(1)} mm/h.`;
    } else {
      summaryText = `Continuous rainfall for the next hour, peaking at ${maxRainPoint.intensityMmH.toFixed(1)} mm/h at ${maxRainPoint.timeStr}.`;
    }
  } else if (firstRainIndex >= 0) {
    summaryText = `Rain starting in ~${firstRainIndex + 1} minutes (${minutePoints[firstRainIndex].timeStr}), peaking at ${maxRainPoint.intensityMmH.toFixed(1)} mm/h.`;
  }

  const chartData = minutePoints.map((p) => ({
    minute: p.minute,
    timeStr: p.timeStr,
    intensity: p.intensityMmH,
    prob: p.probability
  }));

  return (
    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
            <CloudRain className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Next 60-Minute Rain Nowcast
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
                1-MIN RESOLUTION
              </span>
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">{summaryText}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-slate-400 self-start sm:self-auto">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-400" />
            <span>Precip (mm/h)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400/40" />
            <span>Prob (%)</span>
          </div>
        </div>
      </div>

      {/* Chart Area */}
      <div className="h-36 sm:h-44 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="precipGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#0284c7" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="probGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="minute"
              stroke="#64748b"
              fontSize={10}
              tickFormatter={(m) => `+${m}m`}
              interval={11}
              tickLine={false}
            />
            <YAxis
              stroke="#64748b"
              fontSize={10}
              domain={[0, (dataMax: number) => Math.max(3, Math.ceil(dataMax * 1.3))]}
              tickFormatter={(v) => `${v}`}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const data = payload[0].payload as { minute: number; timeStr: string; intensity: number; prob: number };
                return (
                  <div className="bg-slate-950/95 border border-slate-700/80 rounded-xl p-2.5 shadow-2xl text-xs font-sans space-y-1">
                    <div className="font-bold text-slate-200">
                      +{data.minute} min ({data.timeStr})
                    </div>
                    <div className="text-sky-400 font-semibold flex items-center justify-between gap-3">
                      <span>Rate:</span>
                      <span>{data.intensity.toFixed(2)} mm/h</span>
                    </div>
                    <div className="text-indigo-400 flex items-center justify-between gap-3 text-[11px]">
                      <span>Probability:</span>
                      <span>{data.prob}%</span>
                    </div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="intensity"
              stroke="#38bdf8"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#precipGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Intensity Legend */}
      <div className="grid grid-cols-4 gap-1.5 pt-1 text-center font-mono text-[10px] text-slate-400 border-t border-slate-800/80">
        <div className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-800">
          <span className="text-slate-500 block">Light</span>
          <span className="text-slate-300 font-semibold">&lt; 1.5 mm/h</span>
        </div>
        <div className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-800">
          <span className="text-sky-400 block">Moderate</span>
          <span className="text-slate-300 font-semibold">1.5 - 5 mm/h</span>
        </div>
        <div className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-800">
          <span className="text-amber-400 block">Heavy</span>
          <span className="text-slate-300 font-semibold">5 - 15 mm/h</span>
        </div>
        <div className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-800">
          <span className="text-red-400 block">Torrential</span>
          <span className="text-slate-300 font-semibold">&gt; 15 mm/h</span>
        </div>
      </div>
    </div>
  );
};
