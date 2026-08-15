import React, { useState, useEffect, useCallback } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { Navigation } from './components/Navigation';
import { WeatherView } from './components/WeatherView';
import { RadarView } from './components/RadarView';
import { SettingsView } from './components/SettingsView';
import { StormAlertModal } from './components/StormAlertModal';
import { ExportProjectModal } from './components/ExportProjectModal';
import { WeatherResponse, StormRisk, StormPredictionResponse, AppSettings } from './types';
import { fetchCurrentWeather, analyzeStormRisk, generateStormPrediction } from './services/weatherApi';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<'weather' | 'radar' | 'settings'>('weather');

  // Location State
  const [lat, setLat] = useState<number>(59.9139);
  const [lon, setLon] = useState<number>(10.7522);
  const [cityName, setCityName] = useState<string>('Oslo, Norway');

  // Weather & Risk State
  const [weatherData, setWeatherData] = useState<WeatherResponse | null>(null);
  const [stormRisk, setStormRisk] = useState<StormRisk | null>(null);
  const [prediction, setPrediction] = useState<StormPredictionResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Settings & Background Service State
  const [settings, setSettings] = useState<AppSettings>({
    enableAlerts: true,
    alertThreshold: 50,
    checkInterval: 15,
    serviceRunning: true,
    selectedCity: 'Oslo, Norway'
  });

  const [logs, setLogs] = useState<string[]>([]);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [radarFocus, setRadarFocus] = useState<{ lat: number; lon: number; label?: string } | null>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]);
  };

  // Load weather for location
  const loadWeather = useCallback(async (targetLat: number, targetLon: number, targetName?: string) => {
    try {
      setLoading(true);
      setError(null);

      const data = await fetchCurrentWeather(targetLat, targetLon, targetName);
      setWeatherData(data);

      const risk = analyzeStormRisk(data);
      setStormRisk(risk);

      const pred = generateStormPrediction(data);
      setPrediction(pred);

      addLog(`Updated weather for ${targetName || 'Coordinates'}. Risk: ${Math.round(risk.stormProbability * 100)}%`);

      // Auto pop alert modal if storm probability exceeds threshold and alerts are enabled
      if (settings.enableAlerts && risk.stormProbability * 100 >= settings.alertThreshold) {
        setIsAlertModalOpen(true);
      }
    } catch (err: any) {
      console.error('Failed to load weather:', err);
      setError(err?.message || 'Could not connect to Open-Meteo weather service.');
      addLog(`Error fetching weather: ${err?.message}`);
    } finally {
      setLoading(false);
    }
  }, [settings.enableAlerts, settings.alertThreshold]);

  // Initial load - automatically request location or load weather
  useEffect(() => {
    handleUseGeolocation();
  }, []);

  // Background Check Simulator Trigger
  const handleSimulateBackgroundCheck = () => {
    addLog('Manual background weather scan initiated...');
    loadWeather(lat, lon, cityName);
  };

  // Geolocation Handler
  const handleUseGeolocation = async () => {
    setLoading(true);
    try {
      // First check/request native permissions via Capacitor
      const permStatus = await Geolocation.checkPermissions();
      if (permStatus.location !== 'granted' && permStatus.coarseLocation !== 'granted') {
        const reqRes = await Geolocation.requestPermissions();
        if (reqRes.location !== 'granted' && reqRes.coarseLocation !== 'granted') {
          alert('Location permission was denied. Loading default city (Oslo).');
          loadWeather(59.9139, 10.7522, 'Oslo, Norway');
          return;
        }
      }

      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      const userLat = position.coords.latitude;
      const userLon = position.coords.longitude;
      setLat(userLat);
      setLon(userLon);
      setCityName('My Location');
      loadWeather(userLat, userLon, 'My Location');
    } catch (err) {
      console.warn('Capacitor Geolocation error, falling back to Web API:', err);
      if (!navigator.geolocation) {
        alert('Geolocation is not supported by your device.');
        loadWeather(59.9139, 10.7522, 'Oslo, Norway');
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const userLat = pos.coords.latitude;
          const userLon = pos.coords.longitude;
          setLat(userLat);
          setLon(userLon);
          setCityName('My Location');
          loadWeather(userLat, userLon, 'My Location');
        },
        (geoErr) => {
          console.warn('Web Geolocation error:', geoErr);
          alert('Could not retrieve location. Loading default city (Oslo).');
          loadWeather(59.9139, 10.7522, 'Oslo, Norway');
        }
      );
    }
  };

  const handleSelectCity = (targetLat: number, targetLon: number, targetName: string) => {
    setLat(targetLat);
    setLon(targetLon);
    setCityName(targetName);
    loadWeather(targetLat, targetLon, targetName);
  };

  const handleUpdateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      addLog(`Settings updated: Threshold=${updated.alertThreshold}%, Interval=${updated.checkInterval}m, Service=${updated.serviceRunning ? 'Active' : 'Stopped'}`);
      return updated;
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navigation
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        stormRisk={stormRisk}
        onOpenAlertModal={() => setIsAlertModalOpen(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        settings={settings}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto p-2 sm:p-4">
        {currentTab === 'weather' && (
          <WeatherView
            weatherData={weatherData}
            stormRisk={stormRisk}
            loading={loading}
            error={error}
            onRefresh={() => loadWeather(lat, lon, cityName)}
            onSelectCity={handleSelectCity}
            onUseGeolocation={handleUseGeolocation}
            onCheckStormAlerts={() => setIsAlertModalOpen(true)}
            onOpenRadar={(targetLat, targetLon) => {
              if (targetLat !== undefined && targetLon !== undefined) {
                setRadarFocus({ lat: targetLat, lon: targetLon });
              } else if (prediction?.detectedCell?.lat !== undefined && prediction?.detectedCell?.lon !== undefined) {
                setRadarFocus({ lat: prediction.detectedCell.lat, lon: prediction.detectedCell.lon });
              } else {
                setRadarFocus(null);
              }
              setCurrentTab('radar');
            }}
            settings={settings}
          />
        )}

        {currentTab === 'radar' && (
          <RadarView
            weatherData={weatherData}
            prediction={prediction}
            stormRisk={stormRisk}
            focusCoordinates={radarFocus}
            onSelectLocation={(newLat, newLon, newName) => {
              setLat(newLat);
              setLon(newLon);
              setCityName(newName);
              loadWeather(newLat, newLon, newName);
              setCurrentTab('weather');
            }}
            settings={settings}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsView
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onSimulateBackgroundCheck={handleSimulateBackgroundCheck}
            onOpenExportModal={() => setIsExportModalOpen(true)}
            logs={logs}
          />
        )}
      </main>

      <StormAlertModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        stormRisk={stormRisk}
      />

      <ExportProjectModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />
    </div>
  );
};
