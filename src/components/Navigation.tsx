import React from 'react';
import { CloudSun, Radar, Settings, ShieldAlert } from 'lucide-react';
import { StormRisk, AppSettings } from '../types';
import { t, getCurrentLanguage } from '../utils/i18n';

interface NavigationProps {
  currentTab: 'weather' | 'radar' | 'settings';
  onTabChange: (tab: 'weather' | 'radar' | 'settings') => void;
  stormRisk: StormRisk | null;
  onOpenAlertModal?: () => void;
  settings?: AppSettings;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onTabChange,
  stormRisk,
  onOpenAlertModal,
  settings
}) => {
  const lang = getCurrentLanguage(settings?.language);
  const isStormActive = stormRisk && (stormRisk.isCurrentlyStormy || stormRisk.isStormApproaching);

  return (
    <>
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <CloudSun className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                {t('appTitle', lang)}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  {t('version', lang)}
                </span>
              </h1>
            </div>
          </div>

          {/* Status Indicator */}
          <div className="flex items-center gap-2">
            {isStormActive ? (
              <button
                onClick={onOpenAlertModal}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-all text-xs font-semibold animate-pulse cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>{t('stormAlertActive', lang)}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-400 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>{t('monitoringActive', lang)}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-4 py-2 sm:py-3">
        <div className="max-w-md mx-auto flex items-center justify-around">
          <button
            onClick={() => onTabChange('weather')}
            className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-2xl transition-all cursor-pointer ${
              currentTab === 'weather'
                ? 'text-sky-400 bg-sky-500/10 border border-sky-500/20 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CloudSun className="w-5 h-5" />
            <span className="text-xs">{t('navWeather', lang)}</span>
          </button>

          <button
            onClick={() => onTabChange('radar')}
            className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-2xl transition-all relative cursor-pointer ${
              currentTab === 'radar'
                ? 'text-sky-400 bg-sky-500/10 border border-sky-500/20 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radar className="w-5 h-5" />
            <span className="text-xs">{t('navRadar', lang)}</span>
            {isStormActive && (
              <span className="absolute top-1 right-3 w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>

          <button
            onClick={() => onTabChange('settings')}
            className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-2xl transition-all cursor-pointer ${
              currentTab === 'settings'
                ? 'text-sky-400 bg-sky-500/10 border border-sky-500/20 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-xs">{t('navSettings', lang)}</span>
          </button>
        </div>
      </nav>
    </>
  );
};
