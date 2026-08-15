import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Wind,
  Droplets,
  Zap,
  Gauge,
  Eye,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Activity,
  Flame,
  Info
} from 'lucide-react';
import { StormRisk, RiskLevelType } from '../types';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface EnhancedRiskCardProps {
  stormRisk: StormRisk;
  onCheckAlertModal?: () => void;
  compact?: boolean;
}

export const EnhancedRiskCard: React.FC<EnhancedRiskCardProps> = ({
  stormRisk,
  onCheckAlertModal,
  compact = false
}) => {
  const [showFactors, setShowFactors] = useState(!compact);
  const [showAdvice, setShowAdvice] = useState(true);

  const score = stormRisk.overallRiskScore ?? Math.round(stormRisk.stormProbability * 100);
  const category = stormRisk.severityCategory || (score >= 70 ? 'Severe' : score >= 40 ? 'High' : 'Low');

  const getScoreColor = (scoreVal: number) => {
    if (scoreVal >= 80) return { text: 'text-red-400', bg: 'bg-red-500', border: 'border-red-500/50', gradient: 'from-red-950/80 to-slate-900' };
    if (scoreVal >= 65) return { text: 'text-amber-400', bg: 'bg-amber-500', border: 'border-amber-500/50', gradient: 'from-amber-950/70 to-slate-900' };
    if (scoreVal >= 45) return { text: 'text-yellow-400', bg: 'bg-yellow-500', border: 'border-yellow-500/50', gradient: 'from-yellow-950/50 to-slate-900' };
    if (scoreVal >= 25) return { text: 'text-sky-400', bg: 'bg-sky-500', border: 'border-sky-500/50', gradient: 'from-sky-950/40 to-slate-900' };
    return { text: 'text-emerald-400', bg: 'bg-emerald-500', border: 'border-emerald-500/50', gradient: 'from-slate-900 to-slate-950' };
  };

  const getLevelBadgeClass = (level: RiskLevelType) => {
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

  const colors = getScoreColor(score);
  const factors = stormRisk.riskFactors;

  return (
    <div
      className={`rounded-3xl p-6 border shadow-2xl transition-all space-y-6 bg-gradient-to-br ${colors.gradient} ${colors.border}`}
    >
      {/* Risk Gauge Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Animated Dial / Score Counter */}
          <div className="relative flex items-center justify-center shrink-0 w-20 h-20 rounded-2xl bg-slate-950/80 border border-slate-800 shadow-inner">
            <div className="text-center">
              <span className={`text-2xl font-black ${colors.text}`}>{score}</span>
              <span className="text-[10px] text-slate-500 block font-mono">/ 100</span>
            </div>
            {/* SVG Ring Progress */}
            <svg className="absolute inset-0 w-full h-full p-1 -rotate-90 pointer-events-none">
              <circle
                cx="36"
                cy="36"
                r="30"
                className="stroke-slate-800"
                strokeWidth="4"
                fill="transparent"
              />
              <circle
                cx="36"
                cy="36"
                r="30"
                className={`transition-all duration-1000 stroke-current ${colors.text}`}
                strokeWidth="4"
                strokeDasharray="188.4"
                strokeDashoffset={188.4 - (188.4 * score) / 100}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-black uppercase px-2.5 py-0.5 rounded-full border ${getLevelBadgeClass(
                  score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW'
                )}`}
              >
                {category} Risk Level
              </span>
              <span className="text-xs text-slate-400">Storm Risk Index</span>
            </div>

            <h3 className="text-xl font-bold text-white mt-1">
              {stormRisk.isCurrentlyStormy
                ? 'Active Storm Overhead!'
                : stormRisk.isStormApproaching
                ? 'Storm System Approaching'
                : 'Stable Local Atmosphere'}
            </h3>

            <p className="text-xs text-slate-300 mt-0.5">
              {stormRisk.currentCondition} • {Math.round(stormRisk.windSpeed)} km/h Wind
            </p>
          </div>
        </div>

        {/* ETA & Alert Modal Trigger */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-right">
            <div className="text-[11px] text-slate-400">Estimated Impact</div>
            <div className={`text-sm font-bold ${stormRisk.estimatedTimeToStorm > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {stormRisk.estimatedTimeToStorm > 0 ? `${stormRisk.estimatedTimeToStorm} min` : 'Immediate'}
            </div>
          </div>

          {onCheckAlertModal && (
            <button
              onClick={onCheckAlertModal}
              className="px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs transition-all shadow-md cursor-pointer flex items-center gap-2 shrink-0"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Full Alert</span>
            </button>
          )}
        </div>
      </div>

      {/* Toggle View Factor Cards Button */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
        <button
          onClick={() => setShowFactors(!showFactors)}
          className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer transition-colors"
        >
          <Activity className="w-4 h-4" />
          <span>{showFactors ? 'Hide Risk Factor Breakdown' : 'View Risk Factor Breakdown (5 Factors)'}</span>
          {showFactors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        <div className="text-[11px] text-slate-400 font-mono">
          Updated live from satellite feed
        </div>
      </div>

      {/* 5-Factor Risk Breakdown Grid */}
      {showFactors && factors && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 animate-fadeIn">
          {/* Wind Risk Card */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Wind className="w-4 h-4 text-sky-400" />
                <span>{factors.wind.label}</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getLevelBadgeClass(factors.wind.level)}`}>
                {factors.wind.score}/100
              </span>
            </div>
            <div className="text-sm font-extrabold text-white">{factors.wind.value}</div>
            {/* Progress Bar */}
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-sky-400 rounded-full" style={{ width: `${factors.wind.score}%` }} />
            </div>
            <p className="text-[11px] text-slate-400">{factors.wind.description}</p>
          </div>

          {/* Precip Risk Card */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Droplets className="w-4 h-4 text-sky-400" />
                <span>{factors.precipitation.label}</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getLevelBadgeClass(factors.precipitation.level)}`}>
                {factors.precipitation.score}/100
              </span>
            </div>
            <div className="text-sm font-extrabold text-white">{factors.precipitation.value}</div>
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${factors.precipitation.score}%` }} />
            </div>
            <p className="text-[11px] text-slate-400">{factors.precipitation.description}</p>
          </div>

          {/* Lightning Risk Card */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>{factors.lightning.label}</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getLevelBadgeClass(factors.lightning.level)}`}>
                {factors.lightning.score}/100
              </span>
            </div>
            <div className="text-sm font-extrabold text-white">{factors.lightning.value}</div>
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${factors.lightning.score}%` }} />
            </div>
            <p className="text-[11px] text-slate-400">{factors.lightning.description}</p>
          </div>

          {/* Pressure Front Card */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Gauge className="w-4 h-4 text-purple-400" />
                <span>{factors.barometricPressure.label}</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getLevelBadgeClass(factors.barometricPressure.level)}`}>
                {factors.barometricPressure.score}/100
              </span>
            </div>
            <div className="text-sm font-extrabold text-white">{factors.barometricPressure.value}</div>
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-purple-400 rounded-full" style={{ width: `${factors.barometricPressure.score}%` }} />
            </div>
            <p className="text-[11px] text-slate-400">{factors.barometricPressure.description}</p>
          </div>

          {/* Visibility Card */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Eye className="w-4 h-4 text-emerald-400" />
                <span>{factors.visibility.label}</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getLevelBadgeClass(factors.visibility.level)}`}>
                {factors.visibility.score}/100
              </span>
            </div>
            <div className="text-sm font-extrabold text-white">{factors.visibility.value}</div>
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${factors.visibility.score}%` }} />
            </div>
            <p className="text-[11px] text-slate-400">{factors.visibility.description}</p>
          </div>

          {/* CAPE Convective Instability Card */}
          {factors.capeInstability && (
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <Flame className="w-4 h-4 text-rose-400" />
                  <span>{factors.capeInstability.label}</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getLevelBadgeClass(factors.capeInstability.level)}`}>
                  {factors.capeInstability.score}/100
                </span>
              </div>
              <div className="text-sm font-extrabold text-white">{factors.capeInstability.value}</div>
              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-rose-500 rounded-full" style={{ width: `${factors.capeInstability.score}%` }} />
              </div>
              <p className="text-[11px] text-slate-400">{factors.capeInstability.description}</p>
            </div>
          )}
        </div>
      )}

      {/* 12-Hour Hourly Risk Timeline */}
      {stormRisk.hourlyRiskTimeline && stormRisk.hourlyRiskTimeline.length > 0 && (
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              <span>12-Hour Storm Risk Curve</span>
            </div>
            <span className="text-[10px] text-slate-400">Peak Risk Index</span>
          </div>

          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stormRisk.hourlyRiskTimeline}>
                <defs>
                  <linearGradient id="riskScoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="timeStr" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                  labelStyle={{ color: '#94a3b8', fontSize: '11px' }}
                />
                <Area
                  type="monotone"
                  dataKey="riskScore"
                  name="Risk Index"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#riskScoreGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Actionable Safety Advice */}
      {stormRisk.safetyAdvice && stormRisk.safetyAdvice.length > 0 && (
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div
            onClick={() => setShowAdvice(!showAdvice)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
              <ShieldAlert className="w-4 h-4" />
              <span>Recommended Safety Precautions</span>
            </div>
            {showAdvice ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>

          {showAdvice && (
            <div className="space-y-1.5 pt-1">
              {stormRisk.safetyAdvice.map((tip, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
