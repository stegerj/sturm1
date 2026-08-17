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
  Mountain,
  Eye,
  Layers,
  HelpCircle,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Grid,
  ListFilter,
  Navigation as NavIcon
} from 'lucide-react';
import { WeatherResponse, StormRisk, AppSettings } from '../types';
import {
  getWeatherCondition,
  POPULAR_CITIES,
  formatTime,
  formatDate,
  getMoonPhaseDetails,
  formatDurationSeconds,
  getWindDirection
} from '../utils/weatherUtils';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine
} from 'recharts';
import { WeatherSymbol } from './WeatherSymbol';
import { MarineMeteoCard } from './MarineMeteoCard';
import { CopernicusAirQualityCard } from './CopernicusAirQualityCard';
import { MinutePrecipitationCard } from './MinutePrecipitationCard';
import { MultiHazardAlertsCard } from './MultiHazardAlertsCard';
import { MtgSatelliteCard } from './MtgSatelliteCard';
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
  const [showCloudLevelsInfo, setShowCloudLevelsInfo] = useState(false);
  const [showTrajectoryInfo, setShowTrajectoryInfo] = useState(false);

  // Live Geocoding Search Debounce
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery)}&count=6&language=en&format=json`
        );
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
  const windDir = currentData?.windDirection10m ?? fallbackWeather?.windDirection ?? 0;
  const windGusts = weatherData.hourly?.windGusts10m?.[0] ?? windSpeed * 1.3;
  const condition = getWeatherCondition(weatherCode, currentLang);
  const todayMin = weatherData.daily?.temperatureMin?.[0] ?? (temperature - 3);
  const todayMax = weatherData.daily?.temperatureMax?.[0] ?? (temperature + 4);
  const dewPoint = weatherData.hourly?.dewPoint?.[0] ?? (temperature - 4);
  const uvIndex = weatherData.hourly?.uvIndex?.[0] ?? weatherData.daily?.uvIndexMax?.[0] ?? 0;
  const visibilityM = weatherData.hourly?.visibility?.[0] ?? 10000;
  const visibilityKm = Math.round(visibilityM / 1000);
  const precipProbToday = weatherData.daily?.precipitationProbabilityMax?.[0] ?? weatherData.hourly?.precipitationProbability?.[0] ?? 0;

  // Cloud Levels Breakdown (%)
  const totalCloudCover = currentData?.cloudCover ?? weatherData.hourly?.cloudCover?.[0] ?? 0;
  const lowClouds = currentData?.cloudCoverLow ?? weatherData.hourly?.cloudCoverLow?.[0] ?? 0;
  const midClouds = currentData?.cloudCoverMid ?? weatherData.hourly?.cloudCoverMid?.[0] ?? 0;
  const highClouds = currentData?.cloudCoverHigh ?? weatherData.hourly?.cloudCoverHigh?.[0] ?? 0;

  const filteredCities = POPULAR_CITIES.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.country.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Hourly Data
  const nowHour = currentData?.time ? new Date(currentData.time).getHours() : new Date().getHours();
  const hourlyTimes = weatherData.hourly?.time || [];
  const hourlyCount = Math.min(24, hourlyTimes.length);

  const hourlyItems = Array.from({ length: hourlyCount }).map((_, idx) => {
    const timeStr = hourlyTimes[idx];
    const d = new Date(timeStr);
    const isCurrent = d.getHours() === nowHour;
    const temp = weatherData.hourly?.temperature?.[idx] ?? 0;
    const apparentTemp = weatherData.hourly?.apparentTemperature?.[idx] ?? temp;
    const precip = weatherData.hourly?.precipitationProbability?.[idx] ?? 0;
    const rainAmount = weatherData.hourly?.precipitation?.[idx] ?? 0;
    const code = weatherData.hourly?.weatherCode?.[idx] ?? 0;
    const wSpeed = weatherData.hourly?.windSpeed10m?.[idx] ?? 0;
    const wGust = weatherData.hourly?.windGusts10m?.[idx] ?? Math.round(wSpeed * 1.35);
    const wDir = weatherData.hourly?.windDirection10m?.[idx] ?? 0;
    const humidity = weatherData.hourly?.relativeHumidity?.[idx] ?? 60;
    const dewPoint = weatherData.hourly?.dewPoint?.[idx] ?? 10;
    const cond = getWeatherCondition(code, currentLang);

    return {
      timeStr,
      timeFormatted: formatTime(timeStr),
      hourNumber: d.getHours(),
      isCurrent,
      temp,
      apparentTemp,
      precip,
      rainAmount,
      weatherCode: code,
      conditionText: cond.description,
      windSpeed: wSpeed,
      windGust: wGust,
      windDir: wDir,
      humidity,
      dewPoint
    };
  });

  const hourlyChartData = hourlyItems.map((h) => ({
    time: h.timeFormatted,
    fullTime: h.timeStr,
    temp: Math.round(h.temp * 10) / 10,
    apparentTemp: Math.round(h.apparentTemp * 10) / 10,
    diff: Math.round((h.apparentTemp - h.temp) * 10) / 10,
    precip: h.precip,
    rainAmount: Math.round(h.rainAmount * 10) / 10,
    windSpeed: Math.round(h.windSpeed),
    windGust: Math.round(h.windGust),
    humidity: Math.round(h.humidity),
    dewPoint: Math.round(h.dewPoint),
    weatherCode: h.weatherCode,
    conditionText: h.conditionText,
    isCurrent: h.isCurrent
  }));

  // Detected Rain Cells from 100km Regional Scanning
  const regionalCells = (weatherData.regionalScanPoints || []).filter(
    (p) => p.precipitationMmH >= 0.1 || p.next1hPrecipMmH >= 0.2 || p.weatherCode >= 50
  );

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-6 mb-24 animate-fadeIn">
      {/* 1. Location & Geolocation Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="p-2.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-white">
                {weatherData.locationName || `${weatherData.latitude.toFixed(2)}°, ${weatherData.longitude.toFixed(2)}`}
              </h2>
              <button
                onClick={() => setShowCitySelector(!showCitySelector)}
                className="text-xs px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700 text-sky-400 hover:bg-slate-700 hover:text-white transition-all cursor-pointer font-medium"
              >
                Change City
              </button>
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
              <span>{weatherData.latitude.toFixed(4)}°N, {weatherData.longitude.toFixed(4)}°E</span>
              {weatherData.elevation !== undefined && (
                <>
                  <span>•</span>
                  <span className="text-sky-300 font-medium flex items-center gap-1">
                    <Mountain className="w-3.5 h-3.5 text-sky-400" />
                    Altitude: <strong className="text-white font-mono">{Math.round(weatherData.elevation)} m</strong>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={onUseGeolocation}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title="Locate my position using GPS"
          >
            <Compass className="w-4 h-4 text-sky-400" />
            <span>My Location</span>
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white transition-all shadow-md shadow-sky-500/20 cursor-pointer disabled:opacity-50"
            title="Refresh All Weather & Radar Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expandable City Selector Drawer */}
      {showCitySelector && (
        <div className="bg-slate-900 border border-sky-500/30 rounded-3xl p-4 sm:p-5 space-y-4 shadow-2xl animate-fadeIn">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search any city globally (e.g. Rome, Berlin, London, New York, Tokyo)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
            {isSearching && (
              <RefreshCw className="w-4 h-4 text-sky-400 animate-spin absolute right-3.5 top-3.5" />
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
                    className="p-3 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/50 text-left transition-all cursor-pointer group flex items-center justify-between"
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
              <div className="text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-wider">Popular Global Cities</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-60 overflow-y-auto pr-1">
                {filteredCities.map((city) => (
                  <button
                    key={city.name}
                    onClick={() => {
                      onSelectCity(city.lat, city.lon, `${city.name}, ${city.country}`);
                      setShowCitySelector(false);
                    }}
                    className="p-2.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/50 text-left transition-all cursor-pointer group"
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

      {/* Multi-Hazard Active Severe Weather Warnings (if any) */}
      {weatherData.activeHazards && weatherData.activeHazards.length > 0 && (
        <MultiHazardAlertsCard
          alerts={weatherData.activeHazards}
          onOpenAlertModal={onCheckStormAlerts}
          onOpenRadar={onOpenRadar}
        />
      )}

      {/* 2. CLASSIC WEATHER HERO CARD (Clean, High-Readability, Standard Metrics First) */}
      <div
        className={`relative overflow-hidden rounded-3xl p-6 sm:p-8 border shadow-2xl transition-all ${
          condition.isStormy
            ? 'bg-gradient-to-br from-amber-950/80 via-slate-900 to-red-950/90 border-amber-500/40'
            : 'bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950/70 border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 text-xs font-semibold text-slate-300">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
              <span>Current Observations</span>
            </div>

            <div className="flex items-baseline justify-center sm:justify-start gap-1">
              <span className="text-6xl sm:text-7xl font-black tracking-tight text-white">
                {Math.round(temperature)}°
              </span>
              <span className="text-2xl font-medium text-slate-400">C</span>
            </div>

            <h3 className="text-2xl font-extrabold text-slate-100">{condition.description}</h3>

            <div className="flex items-center justify-center sm:justify-start gap-3 text-xs text-slate-300 flex-wrap">
              <span>
                Feels like <strong className="text-white font-semibold">{currentData ? Math.round(currentData.apparentTemperature) : Math.round(temperature)}°C</strong>
              </span>
              <span>•</span>
              <span>
                High: <strong className="text-amber-400 font-semibold">{Math.round(todayMax)}°</strong> / Low: <strong className="text-sky-300 font-semibold">{Math.round(todayMin)}°</strong>
              </span>
              <span>•</span>
              <span className="text-slate-400">{currentData?.isDay ? 'Daytime' : 'Nighttime'}</span>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center p-5 rounded-3xl bg-slate-950/50 border border-slate-800/80 backdrop-blur-md shrink-0 shadow-lg">
            <WeatherSymbol code={weatherCode} isDay={currentData?.isDay ?? 1} size="xl" />
            <span className="text-xs font-bold text-slate-200 mt-2">{condition.description}</span>
          </div>
        </div>

        {/* Extended Classic Meteorological Grid (8 Clean Cards, No Horizontal Scrolling) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800/80 relative z-10">
          {/* Wind & Gusts */}
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/90 flex flex-col justify-between space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium">Wind</span>
              <Wind className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-base font-bold text-white">
              {Math.round(windSpeed)} <span className="text-xs font-normal text-slate-400">km/h</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              {getWindDirection(windDir)} ({Math.round(windDir)}°) • Gusts {Math.round(windGusts)} km/h
            </div>
          </div>

          {/* Humidity & Dew Point */}
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/90 flex flex-col justify-between space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium">Humidity</span>
              <Droplets className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-base font-bold text-white">
              {currentData ? `${Math.round(currentData.relativeHumidity)}%` : 'N/A'}
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              Dew Point: <strong className="text-slate-300">{Math.round(dewPoint)}°C</strong>
            </div>
          </div>

          {/* Pressure & Trend */}
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/90 flex flex-col justify-between space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium">Pressure</span>
              <Gauge className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-base font-bold text-white">
              {currentData ? `${Math.round(currentData.pressureMsl)} hPa` : '1013 hPa'}
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              {stormRisk?.pressureTrend || 'Stable Sea-Level'}
            </div>
          </div>

          {/* Precipitation Amount & Prob */}
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/90 flex flex-col justify-between space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium">Precipitation</span>
              <CloudRain className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-base font-bold text-white">
              {currentData ? `${currentData.precipitation.toFixed(1)} mm` : '0.0 mm'}
            </div>
            <div className="text-[11px] text-sky-400 font-semibold">
              {precipProbToday}% probability today
            </div>
          </div>

          {/* Cloud Cover Breakdown (Low / Mid / High) */}
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/90 flex flex-col justify-between space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium flex items-center gap-1">
                Cloud Cover
                <button
                  onClick={() => setShowCloudLevelsInfo(!showCloudLevelsInfo)}
                  className="text-slate-500 hover:text-sky-400 cursor-pointer"
                  title="What do Cloud Levels mean?"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </span>
              <Cloud className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-base font-bold text-white">
              {Math.round(totalCloudCover)}% <span className="text-xs font-normal text-slate-400">Total</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              L: {Math.round(lowClouds)}% | M: {Math.round(midClouds)}% | H: {Math.round(highClouds)}%
            </div>
          </div>

          {/* UV Index */}
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/90 flex flex-col justify-between space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium">UV Index</span>
              <Sun className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-base font-bold text-white">
              {uvIndex.toFixed(1)} <span className="text-xs font-normal text-slate-400">/ 11+</span>
            </div>
            <div className="text-[11px] text-amber-400 font-medium">
              {uvIndex <= 2 ? 'Low Exposure' : uvIndex <= 5 ? 'Moderate' : uvIndex <= 7 ? 'High' : 'Very High'}
            </div>
          </div>

          {/* Visibility */}
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/90 flex flex-col justify-between space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium">Visibility</span>
              <Eye className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-base font-bold text-white">
              {visibilityKm} <span className="text-xs font-normal text-slate-400">km</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              {visibilityKm >= 10 ? 'Clear Horizon' : visibilityKm >= 4 ? 'Moderate Haze' : 'Fog / Low Vis'}
            </div>
          </div>

          {/* Altitude / Elevation */}
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/90 flex flex-col justify-between space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium">Elevation</span>
              <Mountain className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-base font-bold text-white">
              {weatherData.elevation !== undefined ? `${Math.round(weatherData.elevation)} m` : 'N/A'}
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              Terrain Height MSL
            </div>
          </div>
        </div>

        {/* Cloud Levels Explanation Box */}
        {showCloudLevelsInfo && (
          <div className="mt-4 p-4 rounded-2xl bg-slate-950/90 border border-sky-500/30 text-xs text-slate-300 space-y-2 animate-fadeIn">
            <div className="font-bold text-sky-300 flex items-center gap-1.5">
              <Layers className="w-4 h-4" />
              Understanding Cloud Height Levels (Open-Meteo & European NWP Data):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] pt-1">
              <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
                <strong className="text-white block">Low Clouds (0 – 2 km):</strong>
                Stratus, Stratocumulus, Cumulus. Causes ground overcast, fog and rain drizzles.
              </div>
              <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
                <strong className="text-white block">Mid-Level Clouds (2 – 6 km):</strong>
                Altocumulus, Altostratus. Precursor to approaching weather fronts.
              </div>
              <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
                <strong className="text-white block">High Clouds (&gt; 6 km):</strong>
                Cirrus, Cirrostratus ice crystals. High-altitude atmospheric moisture.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. 24-HOUR FORECAST (High-Fidelity Interactive Line Graph with Felt Temperature) */}
      {weatherData.hourly && (() => {
        const temps = hourlyItems.map((h) => h.temp);
        const apparentTemps = hourlyItems.map((h) => h.apparentTemp);
        const minActual = Math.min(...temps);
        const maxActual = Math.max(...temps);
        const minFelt = Math.min(...apparentTemps);
        const maxFelt = Math.max(...apparentTemps);
        const maxPrecip = Math.max(...hourlyItems.map((h) => h.precip));

        // Find largest felt temperature difference
        let maxDeltaItem = hourlyChartData[0];
        let maxAbsDelta = 0;
        hourlyChartData.forEach((item) => {
          const absDiff = Math.abs(item.diff);
          if (absDiff > maxAbsDelta) {
            maxAbsDelta = absDiff;
            maxDeltaItem = item;
          }
        });

        // Custom Tooltip Component
        const CustomHourlyTooltip = ({ active, payload }: any) => {
          if (active && payload && payload.length) {
            const data = payload[0].payload;
            const diff = data.apparentTemp - data.temp;
            return (
              <div className="bg-slate-950/95 backdrop-blur-md border border-slate-700 rounded-2xl p-3 shadow-2xl text-xs space-y-2 min-w-[210px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-1.5 font-bold text-white">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    <span>{data.time}</span>
                    {data.isCurrent && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 font-black">
                        NOW
                      </span>
                    )}
                  </div>
                  <span className="text-slate-300 font-medium text-[11px] truncate max-w-[100px]">{data.conditionText}</span>
                </div>

                <div className="space-y-1.5 pt-0.5">
                  {/* Actual Temperature */}
                  <div className="flex items-center justify-between">
                    <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50"></span> Actual Temp:
                    </span>
                    <span className="font-bold text-white text-sm">{data.temp}°C</span>
                  </div>

                  {/* Felt Temperature */}
                  <div className="flex items-center justify-between">
                    <span className="text-sky-300 font-semibold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-sky-400 shadow-sm shadow-sky-400/50"></span> Felt (Apparent):
                    </span>
                    <span className="font-bold text-sky-200 text-sm">{data.apparentTemp}°C</span>
                  </div>

                  {/* Felt Temp Delta Pill */}
                  {Math.abs(diff) >= 0.3 && (
                    <div className={`text-[10px] px-2 py-1 rounded-xl font-medium flex items-center justify-between ${
                      diff < 0
                        ? 'bg-sky-950/80 border border-sky-800/60 text-sky-300'
                        : 'bg-amber-950/80 border border-amber-800/60 text-amber-300'
                    }`}>
                      <span>{diff < 0 ? '❄️ Wind Chill Effect:' : '🔥 Humidity Heat Index:'}</span>
                      <span className="font-bold">{diff > 0 ? `+${diff.toFixed(1)}°C` : `${diff.toFixed(1)}°C`}</span>
                    </div>
                  )}

                  {/* Rain Probability & Volume */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[11px]">
                    <span className="text-slate-400">Precipitation:</span>
                    <span className="font-semibold text-sky-400">
                      {data.precip}% {data.rainAmount > 0 ? `(${data.rainAmount} mm)` : ''}
                    </span>
                  </div>

                  {/* Wind Speed & Gusts */}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Wind & Gusts:</span>
                    <span className="font-semibold text-slate-200">
                      {data.windSpeed} km/h <span className="text-slate-400 text-[10px]">({data.windGust} gust)</span>
                    </span>
                  </div>

                  {/* Humidity & Dew Point */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Humidity: {data.humidity}%</span>
                    <span>Dew Point: {data.dewPoint}°C</span>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        };

        return (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 space-y-4 shadow-xl">
            {/* Header & Metric Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>24-Hour Forecast Curve</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-normal">
                      Hourly Resolution
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Comparing Measured Temperature against Apparent (Felt) Temperature with Rain & Wind
                  </p>
                </div>
              </div>

              {/* Chart Metric Selector */}
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-2xl border border-slate-800 overflow-x-auto text-xs">
                <button
                  onClick={() => setActiveChartTab('temp')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    activeChartTab === 'temp'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span>Actual & Felt Temp</span>
                </button>
                <button
                  onClick={() => setActiveChartTab('precip')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    activeChartTab === 'precip'
                      ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                  <span>Rain Chance & mm</span>
                </button>
              </div>
            </div>

            {/* Interactive Multi-Series Line Graph */}
            <div className="w-full h-64 sm:h-72 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={hourlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="actualTempGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="precipAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid stroke="#334155" strokeDasharray="3 3" opacity={0.3} vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    interval={window.innerWidth < 640 ? 2 : 1}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    domain={activeChartTab === 'temp' ? ['dataMin - 2', 'dataMax + 2'] : [0, 100]}
                    unit={activeChartTab === 'temp' ? '°' : '%'}
                  />
                  <Tooltip content={<CustomHourlyTooltip />} />

                  {activeChartTab === 'temp' ? (
                    <>
                      {/* Actual Temperature Area Fill */}
                      <Area
                        type="monotone"
                        dataKey="temp"
                        fill="url(#actualTempGrad)"
                        stroke="none"
                      />

                      {/* Actual Temperature Solid Line */}
                      <Line
                        type="monotone"
                        dataKey="temp"
                        name="Actual Temperature"
                        stroke="#f59e0b"
                        strokeWidth={3}
                        dot={{ r: 2, fill: '#f59e0b' }}
                        activeDot={{ r: 5, fill: '#f59e0b', stroke: '#ffffff', strokeWidth: 2 }}
                      />

                      {/* Felt (Apparent) Temperature Dashed Line */}
                      <Line
                        type="monotone"
                        dataKey="apparentTemp"
                        name="Felt (Apparent) Temperature"
                        stroke="#38bdf8"
                        strokeWidth={2.5}
                        strokeDasharray="5 5"
                        dot={{ r: 2, fill: '#38bdf8' }}
                        activeDot={{ r: 5, fill: '#38bdf8', stroke: '#ffffff', strokeWidth: 2 }}
                      />
                    </>
                  ) : (
                    <>
                      {/* Precipitation Probability Fill */}
                      <Area
                        type="monotone"
                        dataKey="precip"
                        name="Precipitation Probability (%)"
                        fill="url(#precipAreaGrad)"
                        stroke="#38bdf8"
                        strokeWidth={2.5}
                        dot={{ r: 2, fill: '#38bdf8' }}
                        activeDot={{ r: 5, fill: '#38bdf8', stroke: '#ffffff', strokeWidth: 2 }}
                      />

                      {/* Rain Amount Bars */}
                      <Bar
                        dataKey="rainAmount"
                        name="Rain Volume (mm)"
                        fill="#818cf8"
                        radius={[4, 4, 0, 0]}
                        opacity={0.8}
                      />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Visual Legend & Thermal Difference Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-xs">
              {/* Actual Range */}
              <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
                <div className="text-slate-400 text-[10px] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span> Actual Temp Range
                </div>
                <div className="text-white font-bold text-sm mt-0.5">
                  {Math.round(minActual)}° – {Math.round(maxActual)}°C
                </div>
              </div>

              {/* Felt Range */}
              <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
                <div className="text-slate-400 text-[10px] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-sky-400"></span> Felt Temp Range
                </div>
                <div className="text-sky-300 font-bold text-sm mt-0.5">
                  {Math.round(minFelt)}° – {Math.round(maxFelt)}°C
                </div>
              </div>

              {/* Peak Thermal Delta */}
              <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
                <div className="text-slate-400 text-[10px]">Peak Felt Delta</div>
                <div className="text-slate-200 font-bold text-sm mt-0.5 flex items-center gap-1">
                  <span>{maxDeltaItem.diff > 0 ? `+${maxDeltaItem.diff.toFixed(1)}°` : `${maxDeltaItem.diff.toFixed(1)}°`}</span>
                  <span className="text-[10px] text-slate-400 font-normal">at {maxDeltaItem.time}</span>
                </div>
              </div>

              {/* Max Rain Chance */}
              <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
                <div className="text-slate-400 text-[10px]">Max Rain Probability</div>
                <div className={`font-bold text-sm mt-0.5 ${maxPrecip > 30 ? 'text-sky-400' : 'text-slate-200'}`}>
                  {maxPrecip}%
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 4. 7-DAY EXTENDED FORECAST (Clean Vertical Stack) */}
      {weatherData.daily && (() => {
        const overallMin = Math.min(...(weatherData.daily.temperatureMin || [0]));
        const overallMax = Math.max(...(weatherData.daily.temperatureMax || [30]));
        const tempRange = Math.max(1, overallMax - overallMin);

        return (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">7-Day Outlook</h3>
              <div className="text-xs text-slate-400 font-medium">
                Range: <span className="text-amber-300 font-bold">{Math.round(overallMin)}°</span> to <span className="text-amber-500 font-bold">{Math.round(overallMax)}°C</span>
              </div>
            </div>

            <div className="divide-y divide-slate-800/80">
              {weatherData.daily.time.map((dateStr, idx) => {
                const code = weatherData.daily?.weatherCode[idx] ?? 0;
                const cond = getWeatherCondition(code, currentLang);
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
                  <div key={dateStr} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-2.5">
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
                        <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                          <span className="flex items-center text-amber-400"><Sunrise className="w-3 h-3 mr-0.5" />{daySunrise}</span>
                          <span>•</span>
                          <span className="flex items-center text-amber-500"><Sunset className="w-3 h-3 mr-0.5" />{daySunset}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1 text-[11px] text-purple-300 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
                        <span>{dayMoon.icon}</span>
                        <span className="hidden md:inline text-[10px] text-slate-400">{dayMoon.name}</span>
                      </div>

                      <div className="text-right w-16 shrink-0">
                        <span className="text-xs font-semibold text-sky-400">{precip}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* 5. PRECISE APPROACHING RAIN & STORM CELLS / ALERTING ANALYSIS */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Approaching Rain Cells & Radar Alerting</h3>
              <p className="text-xs text-slate-400">
                Live cell detection within 100km radius using Doppler reflectivity & atmospheric steering
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowTrajectoryInfo(!showTrajectoryInfo)}
            className="text-xs text-slate-400 hover:text-sky-400 flex items-center gap-1 self-start sm:self-auto cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>How is this calculated?</span>
          </button>
        </div>

        {/* Calculation Info Banner */}
        {showTrajectoryInfo && (
          <div className="p-4 rounded-2xl bg-slate-950 border border-sky-500/30 text-xs text-slate-300 space-y-2 animate-fadeIn">
            <div className="font-bold text-sky-300">Exact Data Sources & Mathematical Models:</div>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300">
              <li>
                <strong>Doppler Radar Reflectivity (dBZ):</strong> Provided directly by RainViewer's global composite network (aggregating DWD, NEXRAD, and EUMETNET radars in calibrated dBZ).
              </li>
              <li>
                <strong>Cloud & Storm Trajectory Vector:</strong> Computed from 850 hPa (~1,500m) and 700 hPa (~3,000m) steering wind models (ECMWF IFS / ICON-D2) combined with 10-minute radar frame displacement.
              </li>
              <li>
                <strong>Cell Heading:</strong> Meteorological wind is reported from where it blows; rain cells travel in the opposite direction (Heading = Wind Direction + 180°).
              </li>
            </ul>
          </div>
        )}

        {/* Detected Rain Cells List */}
        {regionalCells.length > 0 || (currentData?.precipitation && currentData.precipitation > 0) ? (
          <div className="space-y-3">
            {currentData?.precipitation && currentData.precipitation > 0 && (
              <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                    <CloudRain className="w-5 h-5 animate-bounce" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-amber-300">
                      Overhead Active Rain Cell ({currentData.precipitation.toFixed(1)} mm/h)
                    </div>
                    <div className="text-xs text-slate-300">
                      Active precipitation at your coordinates • Steering winds {Math.round(windSpeed)} km/h towards {getWindDirection((windDir + 180) % 360)}
                    </div>
                  </div>
                </div>
                {onOpenRadar && (
                  <button
                    onClick={() => onOpenRadar(weatherData.latitude, weatherData.longitude)}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer shrink-0"
                  >
                    View on Radar
                  </button>
                )}
              </div>
            )}

            {regionalCells.map((cell, idx) => {
              const cellHeading = (cell.windDirDeg + 180) % 360;
              const headingCardinal = getWindDirection(cellHeading);
              return (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                      <NavIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <span>Rain Cell #{idx + 1}: {cell.directionLabel}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 font-normal">
                          {cell.precipitationMmH.toFixed(1)} mm/h
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        Distance: <strong className="text-slate-200">{cell.distanceKm} km</strong> • Moving <strong className="text-sky-300">towards {headingCardinal} ({Math.round(cellHeading)}°)</strong> at {Math.round(cell.windSpeedKmH)} km/h
                      </div>
                    </div>
                  </div>

                  {onOpenRadar && (
                    <button
                      onClick={() => onOpenRadar(cell.latitude, cell.longitude)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 transition-all cursor-pointer shrink-0"
                    >
                      Track on Radar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <strong className="text-slate-200 block">No Approaching Rain Cells Within 100 km</strong>
              Doppler radar reflectivity indicates clear conditions across your regional perimeter.
            </div>
          </div>
        )}
      </div>

      {/* 6. METEOSAT THIRD GENERATION (MTG-I1) SATELLITE & LIGHTNING IMAGER (EUMETSAT) */}
      <MtgSatelliteCard mtgData={weatherData.mtgData} onOpenRadar={onOpenRadar} />

      {/* 7. 60-MINUTE NOWCAST PRECIPITATION CURVE */}
      {weatherData.minutePrecipitation && (
        <MinutePrecipitationCard
          minutePoints={weatherData.minutePrecipitation}
          currentPrecipMmH={currentData?.precipitation}
        />
      )}

      {/* 7. SUN & MOON CELESTIAL ASTRONOMY CARD */}
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
        let sunStatusText = '';

        if (todaySunriseISO && todaySunsetISO) {
          const sunriseMs = new Date(todaySunriseISO).getTime();
          const sunsetMs = new Date(todaySunsetISO).getTime();
          const nowMs = currentData?.time ? new Date(currentData.time).getTime() : Date.now();

          if (nowMs >= sunriseMs && nowMs <= sunsetMs) {
            sunProgress = Math.min(100, Math.max(0, ((nowMs - sunriseMs) / (sunsetMs - sunriseMs)) * 100));
            const remMs = sunsetMs - nowMs;
            const remHours = Math.floor(remMs / (1000 * 60 * 60));
            const remMins = Math.round((remMs % (1000 * 60 * 60)) / (1000 * 60));
            sunStatusText = `${remHours}h ${remMins}m of daylight remaining`;
          } else if (nowMs < sunriseMs) {
            sunProgress = 0;
            const untilMs = sunriseMs - nowMs;
            const h = Math.floor(untilMs / (1000 * 60 * 60));
            const m = Math.round((untilMs % (1000 * 60 * 60)) / (1000 * 60));
            sunStatusText = `Sunrise in ${h}h ${m}m`;
          } else {
            sunProgress = 100;
            sunStatusText = 'Nighttime • Sun has set';
          }
        }

        return (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Sun className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Sun & Moon Ephemeris</h3>
                  <p className="text-xs text-slate-400">Astronomical sunrise, sunset & lunar phases</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Sun Cycle Card */}
              <div className="bg-slate-950/70 border border-amber-500/20 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Sunrise className="w-4 h-4" />
                    Sun Cycle
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                    Daylight: <strong className="text-amber-300">{daylightFormatted}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
                      <Sunrise className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-slate-400">Sunrise</div>
                      <div className="text-base font-extrabold text-white">{sunriseFormatted}</div>
                    </div>
                  </div>

                  <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-600/10 border border-amber-600/20 text-amber-500 shrink-0">
                      <Sunset className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-slate-400">Sunset</div>
                      <div className="text-base font-extrabold text-white">{sunsetFormatted}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium">{sunStatusText}</span>
                    <span className="text-amber-400 font-mono font-bold">{Math.round(sunProgress)}%</span>
                  </div>
                  <div className="relative h-2.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                    <div
                      className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-amber-500 to-amber-300 rounded-full"
                      style={{ width: `${sunProgress}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Moon Cycle Card */}
              <div className="bg-slate-950/70 border border-purple-500/20 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                    <Moon className="w-4 h-4" />
                    Moon Phase
                  </span>
                  <span className="text-xl">{moonInfo.icon}</span>
                </div>

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

      {/* 8. COPERNICUS AIR QUALITY INDEX & SEASIDE/MARINE (Bottom Details) */}
      <CopernicusAirQualityCard airQuality={weatherData.airQuality} />
      <MarineMeteoCard marineData={weatherData.marine} locationName={weatherData.locationName} lang={currentLang} />

      {/* Quick Radar Action Shortcut */}
      {onOpenRadar && (
        <div
          onClick={() => onOpenRadar()}
          className="bg-gradient-to-r from-sky-950/60 via-slate-900 to-slate-900 border border-sky-500/30 hover:border-sky-500/60 rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 cursor-pointer transition-all shadow-xl hover:shadow-sky-500/10 group"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 group-hover:scale-105 transition-transform">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h4 className="font-bold text-white text-base group-hover:text-sky-400 transition-colors">
                Open Live Doppler & Satellite Radar
              </h4>
              <p className="text-xs text-slate-400">
                Inspect real-time precipitation radar loops, storm vectors & infrared satellite clouds.
              </p>
            </div>
          </div>

          <button className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-md shadow-sky-500/20 transition-all flex items-center gap-1.5 shrink-0 pointer-events-none">
            <span>View Live Radar</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
