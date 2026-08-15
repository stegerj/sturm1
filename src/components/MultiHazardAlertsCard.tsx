import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, Volume2, VolumeX, CheckCircle2, ChevronDown, ChevronUp, BellRing, MapPin, Compass, Navigation as NavIcon, ArrowUpRight, Gauge, CloudRain, Zap, Radio } from 'lucide-react';
import { HazardAlert } from '../types';
import { soundAlertService } from '../services/soundAlertService';

interface MultiHazardAlertsCardProps {
  alerts?: HazardAlert[];
  onOpenAlertModal?: () => void;
  onOpenRadar?: (focusLat?: number, focusLon?: number) => void;
  enableAudioSiren?: boolean;
}

export const MultiHazardAlertsCard: React.FC<MultiHazardAlertsCardProps> = ({
  alerts = [],
  onOpenAlertModal,
  onOpenRadar,
  enableAudioSiren = true
}) => {
  const [isPlayingSiren, setIsPlayingSiren] = useState(false);
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(alerts[0]?.id || null);

  if (!alerts || alerts.length === 0) return null;

  const handleToggleSiren = (alert: HazardAlert) => {
    if (isPlayingSiren) {
      soundAlertService.stopSound();
      setIsPlayingSiren(false);
    } else {
      setIsPlayingSiren(true);
      const tone = alert.type === 'gale_wind' ? 'marine_horn' : alert.severity === 'EMERGENCY' ? 'eas_emergency' : 'pulsing_siren';
      soundAlertService.playTone(tone, 0.8, 4000).then(() => setIsPlayingSiren(false));
    }
  };

  const getSeverityStyle = (severity: HazardAlert['severity']) => {
    switch (severity) {
      case 'EMERGENCY':
        return {
          border: 'border-red-500/80',
          bg: 'bg-red-950/60',
          badge: 'bg-red-500 text-white animate-pulse',
          title: 'text-red-300'
        };
      case 'WARNING':
        return {
          border: 'border-red-500/50',
          bg: 'bg-red-950/40',
          badge: 'bg-red-500/20 text-red-400 border border-red-500/40',
          title: 'text-red-400'
        };
      case 'WATCH':
        return {
          border: 'border-amber-500/50',
          bg: 'bg-amber-950/40',
          badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/40',
          title: 'text-amber-400'
        };
      default:
        return {
          border: 'border-sky-500/50',
          bg: 'bg-sky-950/40',
          badge: 'bg-sky-500/20 text-sky-400 border border-sky-500/40',
          title: 'text-sky-400'
        };
    }
  };

  return (
    <div className="space-y-3">
      {alerts.map((alert) => {
        const style = getSeverityStyle(alert.severity);
        const isExpanded = expandedAlertId === alert.id;
        const cell = alert.activatingCell;
        const loc = alert.cellLocation;
        const targetLat = cell?.lat ?? loc?.lat;
        const targetLon = cell?.lon ?? loc?.lon;

        return (
          <div
            key={alert.id}
            className={`rounded-3xl p-5 border shadow-2xl transition-all ${style.bg} ${style.border}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0 p-2 rounded-2xl bg-slate-950/80 border border-slate-800 shadow-inner">
                  {alert.icon}
                </span>

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${style.badge}`}>
                      {alert.severity}
                    </span>
                    <span className="text-xs font-bold text-slate-300">{alert.headline}</span>
                    {loc && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-900/90 border border-slate-700 text-amber-300 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-amber-400" />
                        {loc.distanceKm === 0 ? 'Overhead' : `${loc.directionLabel || `${loc.distanceKm.toFixed(1)} km`} (${loc.lat.toFixed(2)}°, ${loc.lon.toFixed(2)}°)`}
                      </span>
                    )}
                  </div>

                  <h3 className={`text-base sm:text-lg font-black tracking-tight mt-1 ${style.title}`}>
                    {alert.title}
                  </h3>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
                {onOpenRadar && targetLat !== undefined && targetLon !== undefined && (
                  <button
                    onClick={() => onOpenRadar(targetLat, targetLon)}
                    className="px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs flex items-center gap-1.5 transition-all shadow-md shadow-sky-500/20 cursor-pointer"
                    title="Center and Track this Activating Cell on Interactive Radar Map"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Track on Map</span>
                  </button>
                )}

                <button
                  onClick={() => handleToggleSiren(alert)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    isPlayingSiren
                      ? 'bg-red-500 text-white animate-bounce shadow-lg shadow-red-500/40'
                      : 'bg-slate-950/80 hover:bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                  title={isPlayingSiren ? 'Stop Siren' : 'Test Tactical Warning Siren'}
                >
                  {isPlayingSiren ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-amber-400" />}
                  <span>{isPlayingSiren ? 'Stop Tone' : 'Siren'}</span>
                </button>

                <button
                  onClick={() => setExpandedAlertId(isExpanded ? null : alert.id)}
                  className="px-3 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>Details & Actions</span>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Activating Rain Cell Identification & Vector Panel */}
            {cell && (
              <div className="mt-3.5 p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800/90 text-xs space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/70 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400 font-bold">⚡ Activating Cell:</span>
                    <span className="font-bold text-slate-100">{cell.cellName}</span>
                    <span className="font-mono text-[11px] text-amber-300">({cell.directionLabel})</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-sky-400" />
                    <span>{cell.lat.toFixed(4)}°N, {cell.lon.toFixed(4)}°E</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Movement Vector */}
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Compass className="w-3 h-3 text-sky-400" />
                      <span>Movement Vector</span>
                    </div>
                    <div className="font-black text-xs text-sky-300 mt-1">
                      {cell.vector.originCardinal} ({Math.round(cell.vector.originBearingDeg)}°) ➔ {cell.vector.headingCardinal} ({Math.round(cell.vector.headingDeg)}°)
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Velocity: <span className="text-white font-bold">{cell.vector.speedKmH} km/h</span>
                    </div>
                  </div>

                  {/* Trajectory & Impact ETA */}
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <NavIcon className="w-3 h-3 text-amber-400" />
                      <span>Impact Trajectory</span>
                    </div>
                    <div className={`font-black text-xs mt-1 ${cell.trajectory.isCollisionCourse ? 'text-red-400' : cell.trajectory.isOverhead ? 'text-purple-300' : 'text-emerald-300'}`}>
                      {cell.trajectory.isOverhead
                        ? '🔴 Directly Overhead'
                        : cell.trajectory.isCollisionCourse
                        ? `⚠️ Direct Collision (ETA ~${cell.trajectory.impactEtaMinutes ?? alert.onsetMinutes} min)`
                        : `➡️ Passing Track (~${cell.trajectory.missDistanceKm.toFixed(1)} km offset)`}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {cell.trajectory.isOverhead ? 'Active downpour' : `Miss offset: ${cell.trajectory.missDistanceKm.toFixed(1)} km`}
                    </div>
                  </div>

                  {/* Atmospheric Intensity */}
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Gauge className="w-3 h-3 text-red-400" />
                      <span>Cell Intensity</span>
                    </div>
                    <div className="font-black text-xs text-amber-300 mt-1">
                      {cell.precipMmH.toFixed(1)} mm/h • {cell.intensityDbz} dBZ
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Instability: <span className="text-red-400 font-bold">{cell.capeJkg} J/kg CAPE</span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-300 leading-relaxed font-mono bg-slate-900/50 p-2 rounded-lg border border-slate-800/60">
                  {cell.trajectory.relativeMotionText}
                </div>
              </div>
            )}

            <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">{alert.description}</p>

            {/* Action Checklist */}
            {isExpanded && (
              <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2 animate-fadeIn">
                <div className="text-[11px] font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span>Emergency Safety Action Checklist:</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {alert.actionChecklist.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-2 text-xs text-slate-300"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
