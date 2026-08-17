import React from 'react';
import {
  Bell,
  Sliders,
  Clock,
  Info,
  Globe,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { AppSettings } from '../types';
import { t, getCurrentLanguage } from '../utils/i18n';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings
}) => {
  const lang = getCurrentLanguage(settings.language);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 mb-24 animate-fadeIn">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
          <Bell className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{t('settingsTitle', lang)}</h2>
          <p className="text-xs text-slate-400">{t('alertThresholdSub', lang)}</p>
        </div>
      </div>

      {/* Language Selection Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">{t('language', lang)}</h3>
              <p className="text-xs text-slate-400">{t('languageSub', lang)}</p>
            </div>
          </div>

          <select
            value={settings.language || 'auto'}
            onChange={(e) => onUpdateSettings({ language: e.target.value as any })}
            className="bg-slate-950 border border-slate-800 text-white text-sm rounded-xl px-4 py-2 focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            <option value="auto">{t('langAuto', lang)}</option>
            <option value="de">{t('langGerman', lang)}</option>
            <option value="en">{t('langEnglish', lang)}</option>
            <option value="it">{t('langItalian', lang)}</option>
            <option value="es">{t('langSpanish', lang)}</option>
            <option value="fr">{t('langFrench', lang)}</option>
          </select>
        </div>
      </div>

      {/* Storm Alert Configuration Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
        {/* Enable Alerts Toggle */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 className="font-bold text-white text-base">{t('backgroundAlerts', lang)}</h3>
            <p className="text-xs text-slate-400 max-w-sm">
              {t('backgroundAlertsSub', lang)}
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enableAlerts}
              onChange={(e) => onUpdateSettings({ enableAlerts: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500" />
          </label>
        </div>

        {/* Alert Threshold Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" />
              <label className="font-bold text-white text-sm">{t('alertThreshold', lang)}</label>
            </div>
            <span className="text-sm font-extrabold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-3 py-1 rounded-full">
              {settings.alertThreshold}%
            </span>
          </div>

          <input
            type="range"
            min="10"
            max="90"
            step="5"
            value={settings.alertThreshold}
            onChange={(e) => onUpdateSettings({ alertThreshold: parseInt(e.target.value) })}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
          />

          <div className="flex justify-between text-[11px] text-slate-500 font-medium pt-1">
            <span>Sensitive (10%)</span>
            <span>Balanced (50%)</span>
            <span>Severe Only (90%)</span>
          </div>
        </div>

        {/* Check Interval Dropdown */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-400" />
            <div>
              <div className="font-bold text-white text-sm">{t('checkInterval', lang)}</div>
              <div className="text-xs text-slate-400">Automatic radar scan & data refresh interval</div>
            </div>
          </div>

          <select
            value={settings.checkInterval}
            onChange={(e) => onUpdateSettings({ checkInterval: parseInt(e.target.value) })}
            className="bg-slate-950 border border-slate-800 text-white text-sm rounded-xl px-4 py-2 focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            <option value={5}>5 {t('minutes', lang)}</option>
            <option value={10}>10 {t('minutes', lang)}</option>
            <option value={15}>15 {t('minutes', lang)}</option>
            <option value={30}>30 {t('minutes', lang)}</option>
            <option value={60}>60 {t('minutes', lang)}</option>
          </select>
        </div>
      </div>

      {/* Operational Status */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3 shadow-xl">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h3 className="font-bold text-white text-base">Weather Monitoring Engine</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          The app continuously monitors local convective storm activity, rainfall reflectivity, and cloud propagation vectors around your current coordinates.
        </p>
      </div>

      {/* About & Data Sources */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl text-xs text-slate-400">
        <div className="flex items-center gap-2 text-white font-bold text-sm">
          <Info className="w-4 h-4 text-sky-400" />
          <span>About Storm Alert</span>
        </div>

        <p>
          Storm Alert calculates storm risks and tracks movement vectors by integrating Open-Meteo satellite weather API and RainViewer radar map servers.
        </p>

        <div className="pt-2 border-t border-slate-800 space-y-2">
          <div className="font-semibold text-slate-300">Data Providers:</div>
          <div className="flex flex-col gap-1">
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sky-400 hover:underline"
            >
              Open-Meteo Weather API <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://www.rainviewer.com/api.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sky-400 hover:underline"
            >
              RainViewer Radar Maps API <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
