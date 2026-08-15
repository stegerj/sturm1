import React, { useState } from 'react';
import { Zap, Activity, Wind, Gauge, Layers, Info, ChevronDown, ChevronUp, ShieldAlert, MapPin } from 'lucide-react';
import { ConvectiveSounding } from '../types';

interface ConvectiveSoundingCardProps {
  sounding?: ConvectiveSounding;
  onOpenRadar?: () => void;
}

export const ConvectiveSoundingCard: React.FC<ConvectiveSoundingCardProps> = ({ sounding, onOpenRadar }) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!sounding) return null;

  const getRiskBadge = (cat: ConvectiveSounding['convectiveRiskCategory']) => {
    switch (cat) {
      case 'High':
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      case 'Moderate':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'Enhanced':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
      case 'Slight':
        return 'bg-sky-500/20 text-sky-400 border-sky-500/40';
      case 'Marginal':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
              Atmospheric Sounding & Convective Indices
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRiskBadge(sounding.convectiveRiskCategory)}`}>
                {sounding.convectiveRiskCategory.toUpperCase()} RISK
              </span>
            </h3>
            <p className="text-xs text-slate-400">Thermodynamic instability, CAPE, and supercell shear profile</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {onOpenRadar && (sounding.capeJkg >= 800 || sounding.convectiveRiskCategory !== 'None') && (
            <button
              onClick={onOpenRadar}
              className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Track Convective Cells on Radar"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Show on Map</span>
            </button>
          )}

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer text-xs flex items-center gap-1"
          >
            <span>{showDetails ? 'Less' : 'Details'}</span>
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Grid of Key Indices */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* CAPE Card */}
        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>CAPE Energy</span>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-lg font-black text-white">
            {sounding.capeJkg} <span className="text-xs font-normal text-slate-400">J/kg</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {sounding.capeJkg > 2000 ? 'Extreme Convective Updraft' : sounding.capeJkg > 1000 ? 'Moderate Instability' : 'Stable Air Mass'}
          </div>
        </div>

        {/* 0-6km Deep Bulk Shear */}
        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>0-6km Bulk Shear</span>
            <Wind className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-lg font-black text-white">
            {sounding.bulkShear06kmMs} <span className="text-xs font-normal text-slate-400">m/s</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {sounding.bulkShear06kmMs >= 20 ? 'Supercell Rotation Potential' : sounding.bulkShear06kmMs >= 12 ? 'Multicell Cluster Shear' : 'Single-cell Pulse Storms'}
          </div>
        </div>

        {/* Lifted Index */}
        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Lifted Index (LI)</span>
            <Activity className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-lg font-black text-white">
            {sounding.liftedIndex > 0 ? `+${sounding.liftedIndex}` : sounding.liftedIndex} <span className="text-xs font-normal text-slate-400">°C</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {sounding.liftedIndex < -4 ? 'Severe Instability' : sounding.liftedIndex < 0 ? 'Marginally Unstable' : 'Stable'}
          </div>
        </div>

        {/* K-Index */}
        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>K-Index (Thunder)</span>
            <Gauge className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-lg font-black text-white">{sounding.kIndex}</div>
          <div className="text-[10px] text-slate-400 font-mono">
            {sounding.kIndex >= 35 ? '80-90% Storm Potential' : sounding.kIndex >= 25 ? '40-60% Potential' : '&lt; 20% Storm Potential'}
          </div>
        </div>

        {/* Freezing Level 0°C */}
        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>0°C Freezing Level</span>
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-lg font-black text-white">
            {sounding.freezingLevelMeters} <span className="text-xs font-normal text-slate-400">m ASL</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">Hail Growth Zone Height</div>
        </div>

        {/* Dew Point Depression */}
        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Dew Point Spread</span>
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-lg font-black text-white">
            {sounding.dewPointDepressionC} <span className="text-xs font-normal text-slate-400">°C (T - Td)</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {sounding.dewPointDepressionC <= 2 ? 'Near Surface Saturation' : 'Dry Lower Boundary Layer'}
          </div>
        </div>
      </div>

      {/* Expanded Educational Deep-Dive */}
      {showDetails && (
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 text-xs text-slate-300 space-y-2 animate-fadeIn">
          <div className="font-bold text-white flex items-center gap-1.5">
            <Info className="w-4 h-4 text-sky-400" />
            <span>Meteorological Interpretation:</span>
          </div>
          <p className="leading-relaxed">
            <strong className="text-amber-400">CAPE (Convective Available Potential Energy):</strong> Measures the total buoyant energy available to an air parcel as it ascends through the troposphere. Values exceeding 1500 J/kg indicate explosive convective updrafts capable of generating severe thunderstorms and large hail.
          </p>
          <p className="leading-relaxed">
            <strong className="text-sky-400">Deep Layer Shear (0–6 km):</strong> When deep shear exceeds 15–20 m/s alongside high CAPE, storm updrafts tilt and rotate, producing organized supercells and long-lived squall lines.
          </p>
        </div>
      )}
    </div>
  );
};
