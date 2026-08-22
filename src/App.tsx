import React, { useState, useEffect, useCallback } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { Navigation } from './components/Navigation';
import { WeatherView } from './components/WeatherView';
import { RadarView } from './components/RadarView';
import { RadarSatelliteInsights } from './components/RadarSatelliteInsights';
import { SettingsView } from './components/SettingsView';
import { StormAlertModal } from './components/StormAlertModal';
import { WeatherResponse, StormRisk, StormPredictionResponse, AppSettings } from './types';
import type { DpcStormApproach } from './services/dpcAlerts';
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

  // Settings State
  const [settings, setSettings] = useState<AppSettings>({
    enableAlerts: true,
    alertThreshold: 50,
    checkInterval: 15,
    serviceRunning: true,
    selectedCity: 'Oslo, Norway',
    language: 'auto'
  });

  const [isAlertModalOpen, setIsAlertModalOpen] = useState<boolean>(false);
  const [dpcStormRisk, setDpcStormRisk] = useState<StormRisk | null>(null);
  const [radarFocus, setRadarFocus] = useState<{ lat: number; lon: number; label?: string } | null>(null);

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

      // Auto pop alert modal if storm probability exceeds threshold and alerts are enabled
      if (settings.enableAlerts && risk.stormProbability * 100 >= settings.alertThreshold) {
        setIsAlertModalOpen(true);
      }
    } catch (err: any) {
      console.error('Failed to load weather:', err);
      setError(err?.message || 'Could not connect to Open-Meteo weather service.');
    } finally {
      setLoading(false);
    }
  }, [settings.enableAlerts, settings.alertThreshold]);

  // Initial load - automatically request location or load weather
  useEffect(() => {
    handleUseGeolocation();
  }, []);

  // Geolocation Handler
  const handleUseGeolocation = async () => {
    setLoading(true);
    try {
      // First check/request native permissions via Capacitor
      const permStatus = await Geolocation.checkPermissions();
      if (permStatus.location !== 'granted' && permStatus.coarseLocation !== 'granted') {
        const reqRes = await Geolocation.requestPermissions();
        if (reqRes.location !== 'granted' && reqRes.coarseLocation !== 'granted') {
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
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  // Proximity storm alarm — fired by RadarView when a DPC radar cell is on a
  // collision course with the user's location. Opens the same siren modal with
  // a DPC-radar-derived risk assessment.
  const handleDpcStormApproaching = useCallback((info: DpcStormApproach) => {
    if (!settings.enableAlerts) return;
    const score = Math.min(
      98,
      Math.round(58 + Math.max(0, 45 - info.etaMinutes) * 0.8 + Math.min(12, info.intensity * 0.6))
    );
    setDpcStormRisk({
      isCurrentlyStormy: false,
      isStormApproaching: true,
      stormProbability: 0.85,
      estimatedTimeToStorm: Math.max(1, Math.round(info.etaMinutes)),
      currentCondition: `DPC radar: ${info.intensity} mm/h rain cell ${info.distanceKm} km away`,
      windSpeed: 0,
      precipitationProbability: 95,
      currentPrecipitation: info.intensity,
      maxWindSpeedNext6Hours: 0,
      overallRiskScore: score,
      severityCategory: score >= 80 ? 'Severe' : score >= 65 ? 'High' : 'Moderate',
      safetyAdvice: [
        `Heavy rain (${info.intensity} mm/h) is tracking toward you — estimated arrival in ~${info.etaMinutes} minutes. Avoid low-lying areas and check the Protezione Civile allerte bulletin.`,
        'If thunderstorm activity develops, move indoors away from windows and unplug sensitive electronics.',
        'Monitor the DPC radar tab — the approaching cell is marked on the map with a red track line.'
      ]
    });
    setIsAlertModalOpen(true);
  }, [settings.enableAlerts]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navigation
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        stormRisk={stormRisk}
        onOpenAlertModal={() => setIsAlertModalOpen(true)}
        settings={settings}
      />

      <main className="flex-1 w-full p-2 sm:p-4">
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
          <>
            <RadarView
            weatherData={weatherData}
            prediction={prediction}
            stormRisk={stormRisk}
            focusCoordinates={radarFocus}
            onDpcStormApproaching={handleDpcStormApproaching}
            onSelectLocation={(newLat, newLon, newName) => {
              setLat(newLat);
              setLon(newLon);
              setCityName(newName);
              loadWeather(newLat, newLon, newName);
              setCurrentTab('weather');
            }}
            settings={settings}
          />
          </>
        )}

        {currentTab === 'settings' && (
          <SettingsView
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
          />
        )}
      </main>

      <StormAlertModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        stormRisk={dpcStormRisk ?? stormRisk}
      />
    </div>
  );
};
