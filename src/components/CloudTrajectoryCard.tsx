import React, { useState } from 'react';
import { Navigation, Wind, Activity, TrendingUp, TrendingDown, Clock, Sparkles, MapPin, ChevronRight, ShieldCheck, Compass } from 'lucide-react';
import { CloudTrajectoryAnalysis, CloudTrajectoryStep } from '../types';

interface CloudTrajectoryCardProps {
  trajectory?: CloudTrajectoryAnalysis | null;
  onOpenRadarTrajectory?: () => void;
}

export const CloudTrajectoryCard: React.FC<CloudTrajectoryCardProps> = ({
  trajectory,
  onOpenRadarTrajectory
}) => {
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(3); // Default to +60m (+1h) step

  if (!trajectory) return null;

  const currentStep: CloudTrajectoryStep = trajectory.projectedTimeline[selectedStepIndex] || trajectory.projectedTimeline[0];

  const getTrendBadge = (trend: CloudTrajectoryAnalysis['growthTrend']) => {
    if (trend === 'Expanding') {
      return {
        bg: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        icon: <TrendingUp className="w-3.5 h-3.5 text-rose-400" />,
        text: `Expanding (+${trajectory.growthRatePct}%/h)`
      };
    }
    if (trend === 'Dissipating') {
      return {
        bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        icon: <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />,
        text: `Dissipating (${trajectory.growthRatePct}%/h)`
      };
    }
    return {
      bg: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
      icon: <Activity className="w-3.5 h-3.5 text-sky-400" />,
      text: 'Stable Trajectory'
    };
  };

  const trend = getTrendBadge(trajectory.growthTrend);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl relative overflow-hidden my-4">
      {/* Background Accent Glow */}
      <div className="absolute -left-16 -top-16 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
            <Navigation className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 flex-wrap">
              <span>Cloud Movement & Short-Term Trajectory</span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                1 - 3 Hour Nowcast
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Sampled {trajectory.sampledFramesCount} RainViewer radar frames ({trajectory.timeSpanMinutes}m history)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className={`px-2.5 py-1 rounded-xl text-xs font-semibold border flex items-center gap-1.5 ${trend.bg}`}>
            {trend.icon}
            <span>{trend.text}</span>
          </div>

          {onOpenRadarTrajectory && (
            <button
              onClick={onOpenRadarTrajectory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all border border-indigo-400/30 cursor-pointer"
            >
              <Compass className="w-4 h-4" />
              <span>Map Trajectory</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Velocity & Steering Compass Box */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        {/* Trajectory Direction & Compass */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-950/80 border border-indigo-500/30 flex items-center justify-center shrink-0 text-indigo-300 relative">
            <span
              style={{ transform: `rotate(${trajectory.bearingDeg}deg)` }}
              className="inline-block transition-transform duration-500 text-lg font-bold"
            >
              ↑
            </span>
            <span className="absolute -top-1 text-[8px] font-mono text-slate-400">N</span>
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Propagation Vector</div>
            <div className="text-sm font-bold text-indigo-300 font-mono">{trajectory.directionCardinal}</div>
            <div className="text-[10px] text-slate-400">Bearing: {trajectory.bearingDeg}°</div>
          </div>
        </div>

        {/* Speed & Displacement Velocity */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 shrink-0">
            <Wind className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Movement Velocity</div>
            <div className="text-sm font-bold text-teal-300 font-mono">
              {trajectory.velocityKmH} <span className="text-xs font-normal text-slate-400">km/h</span>
            </div>
            <div className="text-[10px] text-slate-400">
              Range: {trajectory.speedMinKmH} - {trajectory.speedMaxKmH} km/h
            </div>
          </div>
        </div>

        {/* Model Confidence Index */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Extrapolation Confidence</div>
            <div className="text-sm font-bold text-purple-300 font-mono">{trajectory.confidenceScore}%</div>
            <div className="text-[10px] text-slate-400">
              Upstream Cell: ~{trajectory.originDistanceKm} km
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Time Horizon Step Selector (+15m to +3h) */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-xs font-bold text-slate-300">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            Projected Cloud Position Timeline (1-3 Hours)
          </span>
          <span className="text-[11px] font-mono text-indigo-300">
            Selected: {currentStep.timeOffsetMin >= 60 ? `+${currentStep.timeOffsetMin / 60}h` : `+${currentStep.timeOffsetMin}m`}
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {trajectory.projectedTimeline.map((step, idx) => {
            const isSelected = selectedStepIndex === idx;
            const label = step.timeOffsetMin >= 60 ? `+${step.timeOffsetMin / 60}h` : `+${step.timeOffsetMin}m`;

            return (
              <button
                key={idx}
                onClick={() => setSelectedStepIndex(idx)}
                className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600/30 border-indigo-400 text-white shadow-md'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="text-[11px] font-bold font-mono">{label}</div>
                <div className="text-[9px] text-slate-400 font-mono mt-0.5">{step.projectedDistanceKm}km</div>
                <div className="mt-1 h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      step.cloudCoveragePct > 70 ? 'bg-indigo-400' : step.cloudCoveragePct > 40 ? 'bg-sky-400' : 'bg-slate-500'
                    }`}
                    style={{ width: `${step.cloudCoveragePct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Step Detail Panel */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="font-bold text-slate-200">
              Displacement at {currentStep.timeOffsetMin >= 60 ? `+${currentStep.timeOffsetMin / 60} Hour` : `+${currentStep.timeOffsetMin} Minutes`}
            </span>
          </div>
          <div className="text-indigo-300 font-mono font-bold">
            {currentStep.projectedDistanceKm} km {trajectory.directionCardinal.split(' ')[2]}
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed pt-1">
          {currentStep.description}
        </p>

        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2">
            <div className="text-[10px] text-slate-400">Cloud Coverage</div>
            <div className="text-xs font-bold font-mono text-sky-300">{currentStep.cloudCoveragePct}%</div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2">
            <div className="text-[10px] text-slate-400">Rain Probability</div>
            <div className="text-xs font-bold font-mono text-indigo-300">{currentStep.rainProbabilityPct}%</div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2">
            <div className="text-[10px] text-slate-400">Intensity</div>
            <div className="text-xs font-bold font-mono text-teal-300">{currentStep.intensity}</div>
          </div>
        </div>
      </div>

      {/* Detailed Analysis Explanation Footnote */}
      <div className="mt-3 text-[11px] text-slate-400 leading-relaxed flex items-start gap-2 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/50">
        <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <span>{trajectory.detailedAnalysis}</span>
      </div>
    </div>
  );
};
