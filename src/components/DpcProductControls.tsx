import React, { useEffect, useState } from 'react';
import { CloudRain, Eye, Radio, ChevronDown, Check, Sparkles } from 'lucide-react';

export type DpcRadarLayer =
  | 'dpc-vmi'
  | 'dpc-sri'
  | 'dpc-dbz'
  | 'dpc-srt1'
  | 'dpc-srt3'
  | 'dpc-srt6'
  | 'dpc-srt12'
  | 'dpc-srt24'
  | 'dpc-ir';

const LIVE_PRODUCTS: Array<{ id: DpcRadarLayer; label: string; detail: string; icon: React.ReactNode }> = [
  { id: 'dpc-vmi', label: 'VMI', detail: 'Rain rate · 5 min', icon: <CloudRain className="w-3.5 h-3.5" /> },
  { id: 'dpc-sri', label: 'SRI', detail: 'Surface rain · 5 min', icon: <CloudRain className="w-3.5 h-3.5" /> },
  { id: 'dpc-dbz', label: 'dBZ', detail: 'Reflectivity · live WMS', icon: <Radio className="w-3.5 h-3.5" /> }
];

const ACCUMULATIONS: Array<{ id: DpcRadarLayer; label: string; detail: string }> = [
  { id: 'dpc-srt1', label: 'Σ1h', detail: '1 hour' },
  { id: 'dpc-srt3', label: 'Σ3h', detail: '3 hours' },
  { id: 'dpc-srt6', label: 'Σ6h', detail: '6 hours' },
  { id: 'dpc-srt12', label: 'Σ12h', detail: '12 hours' },
  { id: 'dpc-srt24', label: 'Σ24h', detail: '24 hours' }
];

const SATELLITE = { id: 'dpc-ir' as const, label: 'IR', detail: 'Infrared · 15 min' };
const DPC_LAYER_IDS = new Set<DpcRadarLayer>([
  'dpc-vmi', 'dpc-sri', 'dpc-dbz', 'dpc-srt1', 'dpc-srt3', 'dpc-srt6', 'dpc-srt12', 'dpc-srt24', 'dpc-ir'
]);

const selectDpcLayer = (layer: DpcRadarLayer) => {
  window.dispatchEvent(new CustomEvent<DpcRadarLayer>('storm-alert:select-dpc-layer', { detail: layer }));
};

const selectNowcast = () => {
  window.dispatchEvent(new CustomEvent('storm-alert:select-radar-nowcast'));
};

interface DpcProductControlsProps {
  initialLayer?: DpcRadarLayer;
}

export const DpcProductControls: React.FC<DpcProductControlsProps> = ({ initialLayer = 'dpc-vmi' }) => {
  const [activeLayer, setActiveLayer] = useState<DpcRadarLayer>(initialLayer);
  const [showAccumulations, setShowAccumulations] = useState(true);
  const [nowcastSelected, setNowcastSelected] = useState(false);

  useEffect(() => {
    const onLayerChanged = (event: Event) => {
      const layer = (event as CustomEvent<string>).detail;
      if (DPC_LAYER_IDS.has(layer as DpcRadarLayer)) {
        setActiveLayer(layer as DpcRadarLayer);
        setNowcastSelected(false);
      } else if (layer === 'radar') {
        setNowcastSelected(true);
      }
    };
    window.addEventListener('storm-alert:radar-layer-changed', onLayerChanged);
    return () => window.removeEventListener('storm-alert:radar-layer-changed', onLayerChanged);
  }, []);

  const choose = (layer: DpcRadarLayer) => {
    setActiveLayer(layer);
    setNowcastSelected(false);
    selectDpcLayer(layer);
  };

  return (
    <section className="bg-slate-900 border border-teal-800/60 rounded-3xl p-4 sm:p-5 shadow-xl space-y-3" aria-label="Italy DPC radar products">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-300">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white">Italy · DPC / ARPA</h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/25">
                National composite
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Choose a product, then use the shared play button and scrubber below the map.</p>
          </div>
        </div>
        <div className="text-[10px] text-slate-500 font-medium">5-hour history · playback on every DPC product except dBZ</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-2xl bg-slate-950 border border-slate-800 p-1">
          <span className="px-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Live radar</span>
          {LIVE_PRODUCTS.map((product) => (
            <button
              key={product.id}
              onClick={() => choose(product.id)}
              title={`${product.label} — ${product.detail}`}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeLayer === product.id ? 'bg-teal-500 text-white shadow-md shadow-teal-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {product.icon}
              {product.label}
              {activeLayer === product.id && <Check className="w-3 h-3" />}
            </button>
          ))}
        </div>

        <div className="relative flex items-center gap-1 rounded-2xl bg-slate-950 border border-amber-500/25 p-1">
          <button
            onClick={() => setShowAccumulations((open) => !open)}
            className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wide text-amber-300 hover:bg-amber-500/10 transition-all cursor-pointer flex items-center gap-1"
            aria-expanded={showAccumulations}
          >
            <CloudRain className="w-3.5 h-3.5" />
            Accumulations
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAccumulations ? 'rotate-180' : ''}`} />
          </button>
          {showAccumulations && (
            <div className="flex items-center gap-1 border-l border-slate-800 pl-1">
              {ACCUMULATIONS.map((product) => (
                <button
                  key={product.id}
                  onClick={() => choose(product.id)}
                  title={`${product.label} — ${product.detail} · five-hour playback`}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeLayer === product.id ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {product.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => choose(SATELLITE.id)}
          title={`${SATELLITE.label} — ${SATELLITE.detail} · five-hour playback`}
          className={`px-3 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
            activeLayer === SATELLITE.id ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          {SATELLITE.label}
          {activeLayer === SATELLITE.id && <Check className="w-3 h-3" />}
        </button>

        <button
          onClick={() => {
            setNowcastSelected(true);
            selectNowcast();
          }}
          title="RainViewer European radar nowcast — extrapolated short-range forecast, separate from DPC observations"
          className={`px-3 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
            nowcastSelected
              ? 'bg-sky-500 text-white border-sky-400 shadow-md shadow-sky-500/20'
              : 'border-sky-500/25 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Nowcast
        </button>
      </div>
    </section>
  );
};
