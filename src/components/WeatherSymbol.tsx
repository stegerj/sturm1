import React from 'react';
import {
  Sun,
  Moon,
  Cloud,
  CloudSun,
  CloudMoon,
  CloudRain,
  CloudDrizzle,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Sparkles,
  Wind,
  Droplets
} from 'lucide-react';
import { getWeatherCondition } from '../utils/weatherUtils';

interface WeatherSymbolProps {
  code: number;
  isDay?: number | boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  showLabel?: boolean;
}

export const WeatherSymbol: React.FC<WeatherSymbolProps> = ({
  code,
  isDay = 1,
  size = 'md',
  className = '',
  showLabel = false
}) => {
  const condition = getWeatherCondition(code);
  const isDaytime = Boolean(isDay);

  // Map sizes to Tailwind icon sizes
  const sizeClasses = {
    xs: 'w-4 h-4',
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-20 h-20',
    '2xl': 'w-24 h-24'
  };

  const iconSizeClass = sizeClasses[size] || 'w-10 h-10';

  const renderIcon = () => {
    switch (code) {
      case 0: // Clear Sky
      case 1: // Mainly Clear
        return isDaytime ? (
          <div className="relative inline-flex items-center justify-center">
            <Sun className={`${iconSizeClass} text-amber-300 drop-shadow-[0_0_12px_rgba(252,211,77,0.5)] animate-spin-slow`} />
            <Sparkles className="w-3 h-3 text-amber-200 absolute -top-1 -right-1 animate-ping opacity-75" />
          </div>
        ) : (
          <div className="relative inline-flex items-center justify-center">
            <Moon className={`${iconSizeClass} text-indigo-300 drop-shadow-[0_0_10px_rgba(165,180,252,0.4)]`} />
            <Sparkles className="w-2.5 h-2.5 text-indigo-200 absolute top-0 right-0 animate-pulse" />
          </div>
        );

      case 2: // Partly Cloudy
        return isDaytime ? (
          <div className="relative inline-flex items-center justify-center">
            <CloudSun className={`${iconSizeClass} text-amber-200 drop-shadow-[0_0_10px_rgba(253,230,138,0.4)]`} />
          </div>
        ) : (
          <div className="relative inline-flex items-center justify-center">
            <CloudMoon className={`${iconSizeClass} text-indigo-200 drop-shadow-[0_0_10px_rgba(199,210,254,0.3)]`} />
          </div>
        );

      case 3: // Overcast
        return (
          <div className="relative inline-flex items-center justify-center">
            <Cloud className={`${iconSizeClass} text-slate-300 drop-shadow-[0_4px_10px_rgba(148,163,184,0.2)]`} />
          </div>
        );

      case 45: // Fog
      case 48: // Depositing Rime Fog
        return (
          <div className="relative inline-flex items-center justify-center">
            <CloudFog className={`${iconSizeClass} text-slate-400`} />
          </div>
        );

      case 51: // Drizzle
      case 53:
      case 55:
      case 56:
      case 57:
        return (
          <div className="relative inline-flex items-center justify-center">
            <CloudDrizzle className={`${iconSizeClass} text-sky-300 drop-shadow-[0_0_8px_rgba(125,211,252,0.4)]`} />
          </div>
        );

      case 61: // Rain
      case 63:
      case 65:
      case 66:
      case 67:
      case 80:
      case 81:
      case 82:
        return (
          <div className="relative inline-flex items-center justify-center">
            <CloudRain className={`${iconSizeClass} text-sky-400 drop-shadow-[0_0_10px_rgba(56,189,248,0.5)]`} />
          </div>
        );

      case 71: // Snow
      case 73:
      case 75:
      case 77:
      case 85:
      case 86:
        return (
          <div className="relative inline-flex items-center justify-center">
            <CloudSnow className={`${iconSizeClass} text-cyan-200 drop-shadow-[0_0_10px_rgba(165,243,252,0.5)]`} />
          </div>
        );

      case 95: // Thunderstorm
      case 96: // Thunderstorm with Hail
      case 99:
        return (
          <div className="relative inline-flex items-center justify-center">
            <CloudLightning className={`${iconSizeClass} text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.7)] animate-pulse`} />
          </div>
        );

      default:
        return <Sun className={`${iconSizeClass} text-amber-300`} />;
    }
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {renderIcon()}
      {showLabel && (
        <span className="text-xs font-semibold text-slate-200 capitalize">
          {condition.description}
        </span>
      )}
    </div>
  );
};
