import React, { useState, useRef, useEffect } from 'react';
import {
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Wind,
  Droplets,
  Gauge,
  Thermometer,
  Compass,
  MapPin,
  RefreshCw,
  AlertTriangle,
  Search,
  ChevronRight,
  TrendingUp,
  Radio,
  Sunrise,
  Sunset,
  Moon,
  Sparkles,
  Clock,
  Mountain
} from 'lucide-react';
import { WeatherResponse, StormRisk, AppSettings } from '../types';
import { getWeatherCondition, POPULAR_CITIES, formatTime, formatDate, getMoonPhaseDetails, formatDurationSeconds } from '../utils/weatherUtils';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { EnhancedRiskCard } from './EnhancedRiskCard';
import { WeatherSymbol } from './WeatherSymbol';
import { MarineMeteoCard } from './MarineMeteoCard';
import { CloudFormationCard } from './CloudFormationCard';
import { CloudTrajectoryCard } from './CloudTrajectoryCard';
import { CopernicusAirQualityCard } from './CopernicusAirQualityCard';
import { MinutePrecipitationCard } from './MinutePrecipitationCard';
import { ConvectiveSoundingCard } from './ConvectiveSoundingCard';
import { MultiHazardAlertsCard } from './MultiHazardAlertsCard';
import { t, getCurrentLanguage } from '../utils/i18n';

interface WeatherViewProps {
  weatherData: WeatherResponse | null;
  stormRisk: StormRisk | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelectCity: (lat: number, lon: number, cityName: string) => void;
  onUseGeolocation: () => void;
  onCheckStormAlerts: () => void;
  onOpenRadar?: (targetLat?: number, targetLon?: number) => void;
  settings?: AppSettings;
}

export const WeatherView: React.FC<WeatherViewProps> = ({
  weatherData,
  stormRisk,
  loading,
  error,
  onRefresh,
  onSelectCity,
  onUseGeolocation,
  onCheckStormAlerts,
  onOpenRadar,
  settings
}) => {
  const currentLang = getCurrentLanguage(settings?.language);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCitySelector, setShowCitySelector] = useState(false);
  const [activeChartTab, setActiveChartTab] = useState<'temp' | 'precip'>('temp');
  const [searchResults, setSearchResults] = useState<{ name: string; country: string; admin1?: string; latitude: number; longitude: number }[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const hourlyScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const currentCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (currentCardRef.current && hourlyScrollContainerRef.current) {
      const card = currentCardRef.current;
      const container = hourlyScrollContainerRef.current;
      const offset = card.offsetLeft - container.offsetLeft - (container.clientWidth / 2) + (card.clientWidth / 2);
      container.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
    }
  }, [weatherData]);

  // Live Geocoding Search Debounce
  React.useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery)}&count=6&language=en&format=json`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch (e) {
        console.warn('Geocoding search error:', e);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (loading && !weatherData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <RefreshCw className="w-10 h-10 text-sky-400 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Fetching Local Weather Data...</h2>
        <p className="text-slate-400 text-sm max-w-sm">
          Analyzing Open-Meteo satellite feed and radar risk metrics...
        </p>
      </div>
    );
  }

  if (error && !weatherData) {
    return (
      <div className="max-w-xl mx-auto my-8 p-6 bg-slate-900 border border-slate-800 rounded-3xl text-center shadow-xl">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Weather Service Notice</h2>
        <p className="text-slate-300 text-sm mb-6">{error}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onRefresh}
            className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-semibold text-sm transition-all shadow-lg shadow-sky-500/20 cursor-pointer"
          >
            Try Refreshing
          </button>
          <button
            onClick={() => onSelectCity(59.9139, 10.7522, 'Oslo')}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-all border border-slate-700 cursor-pointer"
          >
            Load Default (Oslo)
          </button>
        </div>
      </div>
    );
  }

  if (!weatherData) return null;

  const currentData = weatherData.current;
  const fallbackWeather = weatherData.currentWeather;
  const temperature = currentData?.temperature ?? fallbackWeather?.temperature ?? 0;
  const weatherCode = currentData?.weatherCode ?? fallbackWeather?.weatherCode ?? 0;
  const windSpeed = currentData?.windSpeed10m ?? fallbackWeather?.windSpeed ?? 0;
  const condition = getWeatherCondition(weatherCode, currentLang);

  const filteredCities = POPULAR_CITIES.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.country.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getWeatherIcon = (cat: string, isStormy: boolean) => {
    if (isStormy) return <CloudLightning className="w-16 h-16 text-amber-400 animate-pulse" />;
    switch (cat) {
      case 'clear':
        return <Sun className="w-16 h-16 text-amber-300 animate-spin-slow" />;
      case 'cloudy':
        return <Cloud className="w-16 h-16 text-slate-300" />;
      case 'fog':
        return <CloudFog className="w-16 h-16 text-slate-400" />;
      case 'drizzle':
      case 'rain':
        return <CloudRain className="w-16 h-16 text-sky-400" />;
      case 'snow':
        return <CloudSnow className="w-16 h-16 text-blue-200" />;
      case 'thunderstorm':
        return <CloudLightning className="w-16 h-16 text-amber-400" />;
      default:
        return <Sun className="w-16 h-16 text-amber-300" />;
    }
  };

  // Hourly Chart Data
  const nowHour = weatherData ? (weatherData.current?.time ? new Date(weatherData.current.time).getHours() : new Date().getHours()) : 0;
  const currentHourIndex = (weatherData.hourly?.time || []).slice(0, 24).findIndex((timeStr) => {
    const d = new Date(timeStr);
    return d.getHours() === nowHour;
  });
  const activeCurrentIndex = currentHourIndex >= 0 ? currentHourIndex : nowHour;

  const hourlyChartData = (weatherData.hourly?.time || []).slice(0, 24).map((timeStr, idx) => ({
    time: formatTime(timeStr),
    temp: weatherData.hourly?.temperature?.[idx] ?? 0,
    precip: weatherData.hourly?.precipitationProbability?.[idx] ?? 0,
    weatherCode: weatherData.hourly?.weatherCode?.[idx] ?? 0,
    isCurrent: idx === activeCurrentIndex
  }));

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 mb-24">
      {/* Location Selector Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <MapPin className="w-5 h-5 text-sky-400 shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">
                {weatherData.locationName || `Lat: ${weatherData.latitude.toFixed(2)}, Lon: ${weatherData.longitude.toFixed(2)}`}
              </h2>
              <button
                onClick={() => setShowCitySelector(!showCitySelector)}
                className="text-xs px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-sky-400 hover:bg-slate-700 transition-all cursor-pointer"
              >
                Change Location
              </button>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap">
              <span>Coordinates: {weatherData.latitude.toFixed(4)}°N, {weatherData.longitude.toFixed(4)}°E</span>
              {weatherData.elevation !== undefined && (
                <>
                  <span>•</span>
                  <span className="text-sky-300 font-medium flex items-center gap-1">
                    <Mountain className="w-3.5 h-3.5 text-sky-400" />
                    {t('altitude', currentLang)}: <strong className="text-white font-mono">{Math.round(weatherData.elevation)} m</strong>
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={onUseGeolocation}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
            title="Get Current Geolocation"
          >
            <Compass className="w-4 h-4 text-sky-400" />
            <span>My Location</span>
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white transition-all shadow-md shadow-sky-500/20 cursor-pointer disabled:opacity-50"
            title="Refresh Weather Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expandable City Selector Drawer */}
      {showCitySelector && (
        <div className="bg-slate-900 border border-sky-500/30 rounded-2xl p-4 space-y-3 animate-fadeIn">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search any city or location (e.g. Rome, Milan, Venice)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
            {isSearching && (
              <RefreshCw className="w-4 h-4 text-sky-400 animate-spin absolute right-3 top-3" />
            )}
          </div>

          {searchResults.length > 0 ? (
            <div>
              <div className="text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-wider">Search Results</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {searchResults.map((res, idx) => (
                  <button
                    key={`${res.name}-${res.latitude}-${idx}`}
                    onClick={() => {
                      const label = `${res.name}${res.admin1 ? `, ${res.admin1}` : ''}, ${res.country}`;
                      onSelectCity(res.latitude, res.longitude, label);
                      setShowCitySelector(false);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/50 text-left transition-all cursor-pointer group flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-sky-400 transition-colors">
                        {res.name}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {res.admin1 ? `${res.admin1}, ` : ''}{res.country}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-sky-400" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-wider">Popular & Italian Cities</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-60 overflow-y-auto pr-1">
                {filteredCities.map((city) => (
                  <button
                    key={city.name}
                    onClick={() => {
                      onSelectCity(city.lat, city.lon, `${city.name}, ${city.country}`);
                      setShowCitySelector(false);
                    }}
                    className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/50 text-left transition-all cursor-pointer group"
                  >
                    <div className="text-xs font-bold text-white group-hover:text-sky-400 transition-colors">
                      {city.name}
                    </div>
                    <div className="text-[10px] text-slate-400">{city.country}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tactical Multi-Hazard Alerts (EAS / Severe Storm Watches & Warnings) */}
      {weatherData.activeHazards && weatherData.activeHazards.length > 0 && (
        <MultiHazardAlertsCard
          alerts={weatherData.activeHazards}
          onOpenAlertModal={onCheckStormAlerts}
          onOpenRadar={onOpenRadar}
        />
      )}

      {/* Hero Current Weather Card */}
      <div
        className={`relative overflow-hidden rounded-3xl p-6 sm:p-8 border shadow-2xl transition-all ${
          condition.isStormy
            ? 'bg-gradient-to-br from-amber-950/80 via-slate-900 to-red-950/90 border-amber-500/40'
            : 'bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950/60 border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 text-xs font-semibold text-slate-300">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span>Current Weather</span>
            </div>

            <div className="flex items-baseline justify-center sm:justify-start gap-1">
              <span className="text-5xl sm:text-6xl font-extrabold tracking-tight text-white">
                {Math.round(temperature)}°
              </span>
              <span className="text-2xl font-medium text-slate-400">C</span>
            </div>

            <h3 className="text-xl font-bold text-slate-100">{condition.description}</h3>

            {currentData && (
              <p className="text-xs text-slate-400">
                Feels like {Math.round(currentData.apparentTemperature)}°C • {currentData.isDay ? 'Daytime' : 'Nighttime'}
              </p>
            )}
          </div>

          <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-950/40 border border-slate-800/80 backdrop-blur-sm">
            <WeatherSymbol code={weatherCode} isDay={currentData?.isDay ?? 1} size="xl" />
            <span className="text-xs font-semibold text-slate-300 mt-2">{condition.description}</span>
          </div>
        </div>

        {/* Extended Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6 pt-6 border-t border-slate-800/80 relative z-10">
          <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800 flex items-center gap-3">
            <Wind className="w-5 h-5 text-sky-400 shrink-0" />
            <div>
              <div className="text-[11px] text-slate-400">{t('windSpeed', currentLang)}</div>
              <div className="text-sm font-bold text-white">{Math.round(windSpeed)} km/h</div>
            </div>
          </div>

          <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800 flex items-center gap-3">
            <Droplets className="w-5 h-5 text-sky-400 shrink-0" />
            <div>
              <div className="text-[11px] text-slate-400">{t('humidity', currentLang)}</div>
              <div className="text-sm font-bold text-white">
                {currentData ? `${Math.round(currentData.relativeHumidity)}%` : 'N/A'}
              </div>
            </div>
          </div>

          <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800 flex items-center gap-3">
            <Gauge className="w-5 h-5 text-sky-400 shrink-0" />
            <div>
              <div className="text-[11px] text-slate-400">{t('pressure', currentLang)}</div>
              <div className="text-sm font-bold text-white">
                {currentData ? `${Math.round(currentData.pressureMsl)} hPa` : 'N/A'}
              </div>
            </div>
          </div>

          <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800 flex items-center gap-3">
            <Thermometer className="w-5 h-5 text-sky-400 shrink-0" />
            <div>
              <div className="text-[11px] text-slate-400">{t('precipitation', currentLang)}</div>
              <div className="text-sm font-bold text-white">
                {currentData ? `${currentData.precipitation.toFixed(1)} mm` : '0 mm'}
              </div>
            </div>
          </div>

          <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800 flex items-center gap-3">
            <Mountain className="w-5 h-5 text-sky-400 shrink-0" />
            <div>
              <div className="text-[11px] text-slate-400">{t('altitude', currentLang)}</div>
              <div className="text-sm font-bold text-white">
                {weatherData.elevation !== undefined ? `${Math.round(weatherData.elevation)} m` : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 60-Minute High-Resolution Nowcast Precipitation Curve */}
      {weatherData.minutePrecipitation && (
        <MinutePrecipitationCard
          minutePoints={weatherData.minutePrecipitation}
          currentPrecipMmH={currentData?.precipitation}
        />
      )}

      {/* Seaside & Marine Meteo (Waves, Sea State, Swell) */}
      <MarineMeteoCard marineData={weatherData.marine} locationName={weatherData.locationName} lang={currentLang} />

      {/* Copernicus Atmosphere Monitoring Service Air Quality */}
      <CopernicusAirQualityCard airQuality={weatherData.airQuality} />

      {/* Cloud Movement Analyzer & 1-3 Hour Trajectory Forecast */}
      <CloudTrajectoryCard trajectory={weatherData.cloudTrajectory} onOpenRadarTrajectory={onOpenRadar} />

      {/* Local Cloud Formation & Satellite Layers */}
      <CloudFormationCard weatherData={weatherData} lang={currentLang} onOpenSatelliteMap={onOpenRadar} />

      {/* Atmospheric Sounding & Convective Indices Card */}
      {weatherData.convectiveSounding && (
        <ConvectiveSoundingCard sounding={weatherData.convectiveSounding} onOpenRadar={onOpenRadar} />
      )}

      {/* Storm Risk Analysis Card */}
      {stormRisk && (
        <EnhancedRiskCard stormRisk={stormRisk} onCheckAlertModal={onCheckStormAlerts} />
      )}

      {/* 24-Hour Forecast & Interactive Graph */}
      {weatherData.hourly && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-sky-400" />
              <h3 className="text-lg font-bold text-white">24-Hour Forecast</h3>
            </div>

            <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
              <button
                onClick={() => setActiveChartTab('temp')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  activeChartTab === 'temp' ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20' : 'text-slate-400'
                }`}
              >
                Temp (°C)
              </button>
              <button
                onClick={() => setActiveChartTab('precip')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  activeChartTab === 'precip' ? 'bg-sky-500 text-white font-bold shadow-md shadow-sky-500/20' : 'text-slate-400'
                }`}
              >
                Precip (%)
              </button>
            </div>
          </div>

          {/* Recharts Area Graph */}
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyChartData}>
                <defs>
                  <linearGradient id="tempStroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#fcd34d" />
                  </linearGradient>
                  <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#fcd34d" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="precipGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                  labelStyle={{ color: '#94a3b8', fontSize: '12px' }}
                />
                {activeChartTab === 'temp' ? (
                  <Area
                    type="monotone"
                    dataKey="temp"
                    name="Temperature (°C)"
                    stroke="url(#tempStroke)"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#tempGradient)"
                  />
                ) : (
                  <Area
                    type="monotone"
                    dataKey="precip"
                    name="Precipitation Prob (%)"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#precipGradient)"
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Horizontal Hourly Cards Scroll */}
          <div
            ref={hourlyScrollContainerRef}
            className="flex gap-3 overflow-x-auto pb-2 pt-2 scrollbar-thin scroll-smooth"
          >
            {hourlyChartData.map((h, i) => (
              <div
                key={i}
                ref={h.isCurrent ? currentCardRef : null}
                className={`flex flex-col items-center justify-between min-w-[76px] p-3 rounded-2xl border shrink-0 text-center transition-all ${
                  h.isCurrent
                    ? 'bg-amber-500/15 border-amber-400 shadow-lg shadow-amber-500/10 ring-1 ring-amber-400/40 scale-105'
                    : 'bg-slate-950/60 border-slate-800/80 opacity-90'
                }`}
              >
                {h.isCurrent ? (
                  <span className="text-[9px] font-black text-amber-950 uppercase tracking-wider bg-amber-400 px-1.5 py-0.5 rounded-full mb-0.5 shadow-sm">
                    NOW
                  </span>
                ) : (
                  <span className="text-xs text-slate-400 font-medium">{h.time}</span>
                )}
                <WeatherSymbol code={h.weatherCode} size="sm" className="my-1" />
                <span className={`text-base font-bold my-0.5 ${h.isCurrent ? 'text-amber-300' : 'text-amber-400'}`}>
                  {Math.round(h.temp)}°
                </span>
                <span className="text-[10px] text-sky-400 font-semibold">{h.precip}% precip</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sun & Moon Celestial Astronomy Card */}
      {weatherData.daily && (() => {
        const todaySunriseISO = weatherData.daily.sunrise?.[0] || '';
        const todaySunsetISO = weatherData.daily.sunset?.[0] || '';
        const todayMoonriseISO = weatherData.daily.moonrise?.[0] || '';
        const todayMoonsetISO = weatherData.daily.moonset?.[0] || '';
        const todayMoonPhase = weatherData.daily.moonPhase?.[0] ?? 0;
        const daylightSec = weatherData.daily.daylightDuration?.[0] ?? 0;

        const sunriseFormatted = todaySunriseISO ? formatTime(todaySunriseISO) : 'N/A';
        const sunsetFormatted = todaySunsetISO ? formatTime(todaySunsetISO) : 'N/A';
        const moonriseFormatted = todayMoonriseISO ? formatTime(todayMoonriseISO) : 'N/A';
        const moonsetFormatted = todayMoonsetISO ? formatTime(todayMoonsetISO) : 'N/A';

        const moonInfo = getMoonPhaseDetails(todayMoonPhase);
        const daylightFormatted = formatDurationSeconds(daylightSec);

        let sunProgress = 0;
        let isSunUp = false;
        let sunStatusText = '';

        if (todaySunriseISO && todaySunsetISO) {
          const sunriseMs = new Date(todaySunriseISO).getTime();
          const sunsetMs = new Date(todaySunsetISO).getTime();
          const nowMs = currentData?.time ? new Date(currentData.time).getTime() : Date.now();

          if (nowMs >= sunriseMs && nowMs <= sunsetMs) {
            isSunUp = true;
            sunProgress = Math.min(100, Math.max(0, ((nowMs - sunriseMs) / (sunsetMs - sunriseMs)) * 100));
            const remMs = sunsetMs - nowMs;
            const remHours = Math.floor(remMs / (1000 * 60 * 60));
            const remMins = Math.round((remMs % (1000 * 60 * 60)) / (1000 * 60));
            sunStatusText = `${remHours}h ${remMins}m of daylight remaining`;
          } else if (nowMs < sunriseMs) {
            isSunUp = false;
            sunProgress = 0;
            const untilMs = sunriseMs - nowMs;
            const h = Math.floor(untilMs / (1000 * 60 * 60));
            const m = Math.round((untilMs % (1000 * 60 * 60)) / (1000 * 60));
            sunStatusText = `Sunrise in ${h}h ${m}m`;
          } else {
            isSunUp = false;
            sunProgress = 100;
            sunStatusText = 'Nighttime • Sun has set';
          }
        }

        return (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Sun className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Sun & Moon Ephemeris</h3>
                  <p className="text-xs text-slate-400">
                    Local astronomical times & lunar phases for {weatherData.locationName || 'selected location'}
                  </p>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950 border border-slate-800 text-xs text-amber-300 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Solar & Lunar Data</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Sun Cycle Card */}
              <div className="bg-slate-950/70 border border-amber-500/20 rounded-2xl p-5 space-y-4 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Sunrise className="w-4 h-4" />
                    Sun Cycle
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                    Daylight: <strong className="text-amber-300">{daylightFormatted}</strong>
                  </span>
                </div>

                {/* Sunrise / Sunset Times */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
                      <Sunrise className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-slate-400">Sunrise</div>
                      <div className="text-lg font-extrabold text-white">{sunriseFormatted}</div>
                    </div>
                  </div>

                  <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-600/10 border border-amber-600/20 text-amber-500 shrink-0">
                      <Sunset className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-slate-400">Sunset</div>
                      <div className="text-lg font-extrabold text-white">{sunsetFormatted}</div>
                    </div>
                  </div>
                </div>

                {/* Sun Progress Bar */}
                <div className="space-y-2 pt-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      {sunStatusText}
                    </span>
                    <span className="text-amber-400 font-mono font-bold">{Math.round(sunProgress)}%</span>
                  </div>

                  <div className="relative h-3 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                    <div
                      className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 rounded-full transition-all duration-500 shadow-sm"
                      style={{ width: `${sunProgress}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Moon Cycle Card */}
              <div className="bg-slate-950/70 border border-purple-500/20 rounded-2xl p-5 space-y-4 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                    <Moon className="w-4 h-4" />
                    Moon Phase & Cycle
                  </span>
                  <span className="text-xl">{moonInfo.icon}</span>
                </div>

                {/* Moon Phase Name & Illumination */}
                <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium text-slate-400">Current Phase</div>
                    <div className="text-base font-extrabold text-purple-200">{moonInfo.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-purple-300">{moonInfo.illumination}%</div>
                    <div className="text-[10px] text-slate-400">Illuminated</div>
                  </div>
                </div>

                {/* Moonrise / Moonset Times */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 shrink-0">
                      <Moon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] font-medium text-slate-400">Moonrise</div>
                      <div className="text-base font-bold text-white">{moonriseFormatted}</div>
                    </div>
                  </div>

                  <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-purple-600/10 border border-purple-600/20 text-purple-400 shrink-0">
                      <Moon className="w-4 h-4 opacity-75" />
                    </div>
                    <div>
                      <div className="text-[10px] font-medium text-slate-400">Moonset</div>
                      <div className="text-base font-bold text-white">{moonsetFormatted}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 7-Day Forecast */}
      {weatherData.daily && (() => {
        const overallMin = Math.min(...(weatherData.daily.temperatureMin || [0]));
        const overallMax = Math.max(...(weatherData.daily.temperatureMax || [30]));
        const tempRange = Math.max(1, overallMax - overallMin);

        return (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">7-Day Forecast</h3>
              <div className="text-xs text-slate-400 font-medium">
                Range: <span className="text-amber-300 font-bold">{Math.round(overallMin)}°</span> - <span className="text-amber-500 font-bold">{Math.round(overallMax)}°C</span>
              </div>
            </div>

            <div className="divide-y divide-slate-800/80">
              {weatherData.daily.time.map((dateStr, idx) => {
                const code = weatherData.daily?.weatherCode[idx] ?? 0;
                const cond = getWeatherCondition(code);
                const maxT = weatherData.daily?.temperatureMax[idx] ?? 0;
                const minT = weatherData.daily?.temperatureMin[idx] ?? 0;
                const precip = weatherData.daily?.precipitationProbabilityMax?.[idx] ?? 0;
                const daySunrise = weatherData.daily?.sunrise?.[idx] ? formatTime(weatherData.daily.sunrise[idx]) : '';
                const daySunset = weatherData.daily?.sunset?.[idx] ? formatTime(weatherData.daily.sunset[idx]) : '';
                const dayMoonPhaseVal = weatherData.daily?.moonPhase?.[idx] ?? 0;
                const dayMoon = getMoonPhaseDetails(dayMoonPhaseVal);

                const leftPct = Math.max(0, Math.min(90, ((minT - overallMin) / tempRange) * 100));
                const widthPct = Math.max(10, Math.min(100 - leftPct, ((maxT - minT) / tempRange) * 100));

                return (
                  <div key={dateStr} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-2">
                    <div className="w-36 shrink-0 flex items-center gap-2.5">
                      <WeatherSymbol code={code} size="sm" />
                      <div>
                        <div className="font-semibold text-white text-xs sm:text-sm">{formatDate(dateStr)}</div>
                        <div className="text-[11px] text-slate-400 truncate">{cond.description}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 flex-1 max-w-xs justify-center">
                      <span className="text-amber-300 text-xs font-semibold w-8 text-right">{Math.round(minT)}°</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-950 border border-slate-800/80 relative overflow-hidden">
                        <div
                          className="absolute top-0 bottom-0 rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 shadow-sm"
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        />
                      </div>
                      <span className="font-bold text-amber-500 text-xs w-8 text-left">{Math.round(maxT)}°</span>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 text-xs">
                      {daySunrise && daySunset && (
                        <div className="flex items-center gap-1.5 text-slate-400 text-[11px]" title={`Sunrise: ${daySunrise}, Sunset: ${daySunset}`}>
                          <span className="flex items-center text-amber-400"><Sunrise className="w-3 h-3 mr-0.5" />{daySunrise}</span>
                          <span>•</span>
                          <span className="flex items-center text-amber-500"><Sunset className="w-3 h-3 mr-0.5" />{daySunset}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1 text-[11px] text-purple-300 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800" title={`Moon Phase: ${dayMoon.name} (${dayMoon.illumination}% illuminated)`}>
                        <span>{dayMoon.icon}</span>
                        <span className="hidden md:inline text-[10px] text-slate-400">{dayMoon.name}</span>
                      </div>

                      <div className="text-right w-16 shrink-0">
                        <span className="text-xs font-semibold text-sky-400">{precip}% precip</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Advanced Radar Info Banner */}
      <div className="bg-gradient-to-r from-sky-950/40 via-slate-900 to-slate-900 border border-sky-500/20 rounded-3xl p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h4 className="font-bold text-white text-sm">Advanced Weather Radar</h4>
            <p className="text-xs text-slate-400">
              Interactive RainViewer satellite tiles, movement vectors & multi-radius analysis available in the Radar tab.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
