import React from 'react';
import { ShieldAlert, AlertTriangle, Wind, Droplets, Clock, X, CheckCircle2, Gauge, Zap } from 'lucide-react';
import { StormRisk } from '../types';

interface StormAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  stormRisk: StormRisk | null;
}

export const StormAlertModal: React.FC<StormAlertModalProps> = ({
  isOpen,
  onClose,
  stormRisk
}) => {
  if (!isOpen) return null;

  const score = stormRisk?.overallRiskScore ?? (stormRisk ? Math.round(stormRisk.stormProbability * 100) : 0);
  const isSevere = score >= 65 || (stormRisk ? stormRisk.stormProbability > 0.7 : false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div
        className={`w-full max-w-lg rounded-3xl p-6 sm:p-8 border shadow-2xl space-y-5 relative max-h-[90vh] overflow-y-auto scrollbar-thin ${
          isSevere
            ? 'bg-gradient-to-b from-red-950 via-slate-900 to-slate-950 border-red-500/60 text-red-100'
            : 'bg-gradient-to-b from-amber-950 via-slate-900 to-slate-950 border-amber-500/60 text-amber-100'
        }`}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4">
          <div
            className={`p-4 rounded-2xl border shrink-0 ${
              isSevere
                ? 'bg-red-500/20 border-red-500/40 text-red-400 animate-pulse'
                : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
            }`}
          >
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
                Severe Weather Alert
              </span>
              {stormRisk?.severityCategory && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-white">
                  {stormRisk.severityCategory} Severity
                </span>
              )}
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight mt-0.5">
              {stormRisk?.isCurrentlyStormy
                ? 'Storm In Progress!'
                : stormRisk?.isStormApproaching
                ? 'Storm Approaching!'
                : 'Storm Risk Elevated'}
            </h2>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Open-Meteo satellite feed and RainViewer radar vectors indicate elevated atmospheric risk in your sector.
        </p>

        {stormRisk && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="text-[11px] text-slate-400 font-medium">Risk Score Index</div>
                <div className="text-xl font-extrabold text-amber-400 mt-1">
                  {score} <span className="text-xs font-normal text-slate-400">/ 100</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="text-[11px] text-slate-400 font-medium">Estimated Arrival</div>
                <div className="text-xl font-extrabold text-sky-400 mt-1 flex items-center gap-1">
                  <Clock className="w-4 h-4 inline" />
                  <span>
                    {stormRisk.estimatedTimeToStorm > 0 ? `${stormRisk.estimatedTimeToStorm} mins` : 'Immediate'}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="text-[11px] text-slate-400 font-medium">Wind & Gust Speed</div>
                <div className="text-sm font-bold text-white mt-1 flex items-center gap-1">
                  <Wind className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>{Math.round(stormRisk.maxWindSpeedNext6Hours)} km/h {stormRisk.maxGustSpeedNext6Hours ? `(Gusts: ${stormRisk.maxGustSpeedNext6Hours})` : ''}</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="text-[11px] text-slate-400 font-medium font-medium">Precip & Pressure</div>
                <div className="text-sm font-bold text-white mt-1 flex items-center gap-1">
                  <Droplets className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>{Math.round(stormRisk.precipitationProbability)}% {stormRisk.surfacePressure ? `• ${stormRisk.surfacePressure}hPa` : ''}</span>
                </div>
              </div>
            </div>

            {/* Actionable Safety Advice */}
            {stormRisk.safetyAdvice && stormRisk.safetyAdvice.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Actionable Safety Guidelines</span>
                </div>
                <div className="space-y-1">
                  {stormRisk.safetyAdvice.map((advice, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                      <span>{advice}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-sm tracking-wide transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
        >
          I UNDERSTAND & DISMISS
        </button>
      </div>
    </div>
  );
};
