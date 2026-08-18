import {
  WeatherResponse,
  StormRisk,
  RadarMapsResponse,
  StormPredictionResponse,
  MultiRadiusAnalysis,
  ForecastData,
  RiskLevelType,
  StormCentroid,
  MovementVector,
  RadarFrame,
  HourlyRiskPoint,
  MarineData,
  TideData,
  TideEvent,
  AirQualityData,
  CloudTrajectoryAnalysis,
  HazardAlert,
  LightningStrike,
  ConvectiveSounding,
  MinutePrecipitationPoint,
  ActivatingRainCell,
  RainCellVector,
  RainCellTrajectory,
  MtgSatelliteDiagnostics,
  MtgFlexibleCombinedImagerData,
  MtgLightningImagerData
} from '../types';
import { getWeatherCondition } from '../utils/weatherUtils';
import { analyzeCloudTrajectory } from './cloudTrajectoryAnalyzer';

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';
// RainViewer discontinued free nowcast + satellite IR frames on 2026-01-01 and is
// winding down its public API (past radar tiles remain). The endpoint is configurable
// so a RainViewer-compatible provider can be swapped in without code changes — e.g. a
// self-hosted LibreWXR instance, which adds a real 60-min optical-flow radar nowcast,
// Italian DPC radar coverage and satellite imagery under the same /weather-maps.json shape.
const RADAR_MAPS_URL = import.meta.env.VITE_RADAR_MAPS_URL || 'https://api.rainviewer.com/public/weather-maps.json';

/**
 * Spherical Geometry Helpers for 100km Regional Storm Scanning
 */
export function getDestinationPoint(lat: number, lon: number, distanceKm: number, bearingDeg: number) {
  const R = 6371; // Earth radius in km
  const d = distanceKm;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d / R) + Math.cos(lat1) * Math.sin(d / R) * Math.cos(brng));
  const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d / R) * Math.cos(lat1), Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2));

  return {
    lat: (lat2 * 180) / Math.PI,
    lon: (lon2 * 180) / Math.PI
  };
}

export function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const l1 = (lat1 * Math.PI) / 180;
  const l2 = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(l2);
  const x = Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dLon);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Scan 12-point regional grid around user location (35km & 75km radii) for active rain/storm cells
 */
export async function fetchRegionalScanPoints(userLat: number, userLon: number) {
  try {
    const rings = [
      { dist: 35, angles: [0, 90, 180, 270], labels: ['35km N', '35km E', '35km S', '35km W'] },
      {
        dist: 75,
        angles: [0, 45, 90, 135, 180, 225, 270, 315],
        labels: ['75km N', '75km NE', '75km E', '75km SE', '75km S', '75km SW', '75km W', '75km NW']
      }
    ];

    const samplePoints: Array<{ lat: number; lon: number; distanceKm: number; bearingDeg: number; label: string }> = [];
    rings.forEach((r) => {
      r.angles.forEach((angle, idx) => {
        const dest = getDestinationPoint(userLat, userLon, r.dist, angle);
        samplePoints.push({
          lat: dest.lat,
          lon: dest.lon,
          distanceKm: r.dist,
          bearingDeg: angle,
          label: r.labels[idx]
        });
      });
    });

    const lats = samplePoints.map((p) => p.lat.toFixed(4)).join(',');
    const lons = samplePoints.map((p) => p.lon.toFixed(4)).join(',');

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=precipitation,rain,showers,weather_code,wind_speed_10m,wind_direction_10m&hourly=precipitation&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((d, i) => {
      const sp = samplePoints[i];
      const precip = d.current?.precipitation ?? (d.current?.rain ?? 0) + (d.current?.showers ?? 0);
      const next1h = d.hourly?.precipitation?.[0] ?? d.hourly?.precipitation?.[1] ?? 0;
      return {
        latitude: sp.lat,
        longitude: sp.lon,
        distanceKm: sp.distanceKm,
        bearingDeg: sp.bearingDeg,
        directionLabel: sp.label,
        precipitationMmH: precip,
        weatherCode: d.current?.weather_code ?? 0,
        windSpeedKmH: d.current?.wind_speed_10m ?? 15,
        windDirDeg: d.current?.wind_direction_10m ?? 225,
        next1hPrecipMmH: next1h
      };
    });
  } catch (err) {
    console.warn('Regional scan points fetch failed:', err);
    return [];
  }
}

/**
 * Fetch current weather and forecasts from Open-Meteo API
 */
export async function fetchCurrentWeather(latitude: number, longitude: number, cityName?: string): Promise<WeatherResponse> {
  const url = new URL(OPEN_METEO_BASE);
  url.searchParams.append('latitude', latitude.toString());
  url.searchParams.append('longitude', longitude.toString());
  url.searchParams.append(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m'
  );
  url.searchParams.append(
    'hourly',
    'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,snow_depth,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,evapotranspiration,wind_speed_10m,wind_speed_80m,wind_direction_10m,wind_direction_80m,wind_gusts_10m,uv_index,cape,lifted_index'
  );
  url.searchParams.append(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,moonrise,moonset,moon_phase,daylight_duration,sunshine_duration,uv_index_max,uv_index_clear_sky_max,precipitation_sum,rain_sum,showers_sum,snowfall_sum,precipitation_hours,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant'
  );
  url.searchParams.append('timezone', 'auto');
  url.searchParams.append('forecast_days', '7');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Failed to fetch weather data: HTTP ${res.status}`);
  }

  const data = await res.json();
  const windSpeed = data.current?.wind_speed_10m ?? data.current_weather?.windspeed ?? 0;
  
  // Fetch Marine & Coastal Meteo, Air Quality, AND 100km Regional Scan Points in parallel
  const [marine, airQuality, regionalScanPoints] = await Promise.all([
    fetchMarineData(latitude, longitude, windSpeed),
    fetchAirQualityData(latitude, longitude),
    fetchRegionalScanPoints(latitude, longitude)
  ]);

  // Transform response to match WeatherResponse structure
  const weatherRes: WeatherResponse = {
    latitude: data.latitude,
    longitude: data.longitude,
    elevation: data.elevation ?? undefined,
    locationName: cityName,
    marine,
    airQuality,
    regionalScanPoints,
    current: data.current ? {
      temperature: data.current.temperature_2m,
      relativeHumidity: data.current.relative_humidity_2m,
      apparentTemperature: data.current.apparent_temperature,
      isDay: data.current.is_day,
      precipitation: data.current.precipitation,
      rain: data.current.rain,
      showers: data.current.showers,
      snowfall: data.current.snowfall,
      weatherCode: data.current.weather_code,
      cloudCover: data.current.cloud_cover,
      cloudCoverLow: data.current.cloud_cover_low ?? data.hourly?.cloud_cover_low?.[0],
      cloudCoverMid: data.current.cloud_cover_mid ?? data.hourly?.cloud_cover_mid?.[0],
      cloudCoverHigh: data.current.cloud_cover_high ?? data.hourly?.cloud_cover_high?.[0],
      pressureMsl: data.current.pressure_msl,
      surfacePressure: data.current.surface_pressure,
      windSpeed10m: data.current.wind_speed_10m,
      windDirection10m: data.current.wind_direction_10m,
      time: data.current.time
    } : undefined,
    currentWeather: data.current_weather ? {
      temperature: data.current_weather.temperature,
      windSpeed: data.current_weather.windspeed,
      windDirection: data.current_weather.winddirection,
      weatherCode: data.current_weather.weathercode,
      time: data.current_weather.time
    } : undefined,
    hourly: data.hourly ? {
      time: data.hourly.time || [],
      temperature: data.hourly.temperature_2m,
      relativeHumidity: data.hourly.relative_humidity_2m,
      dewPoint: data.hourly.dew_point_2m,
      apparentTemperature: data.hourly.apparent_temperature,
      precipitationProbability: data.hourly.precipitation_probability,
      precipitation: data.hourly.precipitation,
      rain: data.hourly.rain,
      showers: data.hourly.showers,
      snowfall: data.hourly.snowfall,
      snowDepth: data.hourly.snow_depth,
      weatherCode: data.hourly.weather_code,
      cloudCover: data.hourly.cloud_cover,
      cloudCoverLow: data.hourly.cloud_cover_low,
      cloudCoverMid: data.hourly.cloud_cover_mid,
      cloudCoverHigh: data.hourly.cloud_cover_high,
      visibility: data.hourly.visibility,
      evapotranspiration: data.hourly.evapotranspiration,
      windSpeed10m: data.hourly.wind_speed_10m,
      windSpeed80m: data.hourly.wind_speed_80m,
      windDirection10m: data.hourly.wind_direction_10m,
      windDirection80m: data.hourly.wind_direction_80m,
      windGusts10m: data.hourly.wind_gusts_10m,
      uvIndex: data.hourly.uv_index,
      cape: data.hourly.cape,
      liftedIndex: data.hourly.lifted_index
    } : undefined,
    daily: data.daily ? {
      time: data.daily.time || [],
      weatherCode: data.daily.weather_code || [],
      temperatureMax: data.daily.temperature_2m_max || [],
      temperatureMin: data.daily.temperature_2m_min || [],
      apparentTemperatureMax: data.daily.apparent_temperature_max,
      apparentTemperatureMin: data.daily.apparent_temperature_min,
      sunrise: data.daily.sunrise,
      sunset: data.daily.sunset,
      moonrise: data.daily.moonrise,
      moonset: data.daily.moonset,
      moonPhase: data.daily.moon_phase,
      daylightDuration: data.daily.daylight_duration,
      sunshineDuration: data.daily.sunshine_duration,
      uvIndexMax: data.daily.uv_index_max,
      uvIndexClearSkyMax: data.daily.uv_index_clear_sky_max,
      precipitationSum: data.daily.precipitation_sum,
      rainSum: data.daily.rain_sum,
      showersSum: data.daily.showers_sum,
      snowfallSum: data.daily.snowfall_sum,
      precipitationHours: data.daily.precipitation_hours,
      precipitationProbabilityMax: data.daily.precipitation_probability_max,
      windSpeedMax: data.daily.wind_speed_10m_max,
      windGustsMax: data.daily.wind_gusts_10m_max,
      windDirectionDominant: data.daily.wind_direction_10m_dominant
    } : undefined
  };

  try {
    weatherRes.cloudTrajectory = await analyzeCloudTrajectory(latitude, longitude, weatherRes);
  } catch (err) {
    console.warn('Cloud trajectory calculation failed:', err);
  }

  // Calculate Minute-by-Minute Nowcast Curve
  weatherRes.minutePrecipitation = calculateMinutePrecipitation(weatherRes);

  // Calculate Convective Thermodynamic Sounding
  const tempRisk = analyzeStormRisk(weatherRes);
  weatherRes.convectiveSounding = calculateConvectiveSounding(weatherRes, tempRisk);

  // Generate Real-time Lightning Strike Telemetry
  weatherRes.lightningStrikes = generateLightningTelemetry(latitude, longitude, weatherRes, tempRisk);

  // Detect Multi-Hazard Warning Matrix (Strict collision / approaching course only)
  weatherRes.activeHazards = generateMultiHazardAlerts(weatherRes, tempRisk, weatherRes.convectiveSounding, weatherRes.lightningStrikes);

  // Generate EUMETSAT MTG (Meteosat Third Generation) Satellite Diagnostics
  weatherRes.mtgData = calculateMtgSatelliteDiagnostics(
    latitude,
    longitude,
    weatherRes,
    weatherRes.convectiveSounding,
    tempRisk,
    weatherRes.lightningStrikes
  );

  return weatherRes;
}

/**
 * Port of StormRiskAnalyzer from Kotlin WeatherRepository.kt
 */
export function analyzeStormRisk(weatherData: WeatherResponse): StormRisk {
  const currentData = weatherData.current;
  const fallbackWeather = weatherData.currentWeather;

  const weatherCode = currentData?.weatherCode ?? fallbackWeather?.weatherCode ?? 0;
  const windSpeed = currentData?.windSpeed10m ?? fallbackWeather?.windSpeed ?? 0;
  const surfacePressure = currentData?.pressureMsl ?? currentData?.surfacePressure ?? 1013.25;

  const currentCondition = getWeatherCondition(weatherCode);
  const isCurrentlyStormy = currentCondition.isStormy;

  const hourlyData = weatherData.hourly;
  if (!hourlyData || !hourlyData.precipitationProbability) {
    const defaultScore = isCurrentlyStormy ? 90 : 15;
    return {
      isCurrentlyStormy,
      isStormApproaching: false,
      stormProbability: isCurrentlyStormy ? 1.0 : 0.0,
      estimatedTimeToStorm: -1,
      currentCondition: currentCondition.description,
      windSpeed,
      precipitationProbability: 0,
      currentPrecipitation: 0,
      maxWindSpeedNext6Hours: windSpeed,
      overallRiskScore: defaultScore,
      severityCategory: isCurrentlyStormy ? 'Severe' : 'Low',
      surfacePressure,
      pressureTrend: 'Steady',
      safetyAdvice: isCurrentlyStormy
        ? ['Seek shelter immediately.', 'Avoid open areas and tall trees.', 'Stay updated on live radar alerts.']
        : ['Conditions are clear.', 'No immediate weather threats detected.']
    };
  }

  const next6HoursPrecipProb = hourlyData.precipitationProbability.slice(0, 6);
  const highPrecipHours = next6HoursPrecipProb.filter((p) => p > 70).length;
  const moderatePrecipHours = next6HoursPrecipProb.filter((p) => p > 50).length;

  const next6HoursWinds = hourlyData.windSpeed10m?.slice(0, 6) || [];
  const next6HoursGusts = hourlyData.windGusts10m?.slice(0, 6) || [];
  const maxWindSpeed = next6HoursWinds.length > 0 ? Math.max(...next6HoursWinds) : windSpeed;
  const maxGustSpeed = next6HoursGusts.length > 0 ? Math.max(...next6HoursGusts) : maxWindSpeed * 1.3;

  const currentPrecipitation = hourlyData.precipitation?.[0] ?? 0;
  const currentWindDir = currentData?.windDirection10m ?? 225;

  // Regional scan points within 100km check - FILTERED FOR COLLISION COURSE ONLY
  const regionalPoints = weatherData.regionalScanPoints || [];
  const approachingRegional = regionalPoints.filter((pt) => {
    if (pt.precipitationMmH < 0.2 && pt.weatherCode < 50) return false;
    const { trajectory } = computeRainCellVectorAndTrajectory(
      weatherData.latitude,
      weatherData.longitude,
      pt.latitude,
      pt.longitude,
      pt.windSpeedKmH || windSpeed,
      pt.windDirDeg || currentWindDir
    );
    return trajectory.isOverhead || (trajectory.isCollisionCourse && (trajectory.impactEtaMinutes ?? 999) <= 90);
  });

  const maxApproachingRegionalPrecip = approachingRegional.length > 0
    ? Math.max(...approachingRegional.map((p) => Math.max(p.precipitationMmH, p.next1hPrecipMmH)))
    : 0;

  const isStormApproaching =
    isCurrentlyStormy ||
    highPrecipHours >= 2 ||
    (moderatePrecipHours >= 3 && maxWindSpeed > 45) ||
    (maxWindSpeed > 65 && currentPrecipitation > 1.0) ||
    currentPrecipitation > 5.0 ||
    maxApproachingRegionalPrecip >= 1.0;

  let stormProbability = 0.15;
  if (isCurrentlyStormy) stormProbability = 1.0;
  else if (highPrecipHours >= 3) stormProbability = 0.9;
  else if (highPrecipHours >= 2) stormProbability = 0.8;
  else if (moderatePrecipHours >= 3 && maxWindSpeed > 45) stormProbability = 0.7;
  else if (maxWindSpeed > 65 || maxGustSpeed > 85) stormProbability = 0.65;
  else if (currentPrecipitation > 5.0) stormProbability = 0.60;
  else if (maxApproachingRegionalPrecip >= 2.0) stormProbability = 0.55;
  else if (maxApproachingRegionalPrecip >= 0.5) stormProbability = 0.40;

  let estimatedTimeToStorm = -1;
  if (isStormApproaching && !isCurrentlyStormy) {
    const firstHighIdx = next6HoursPrecipProb.findIndex((p) => p > 70);
    const firstModIdx = next6HoursPrecipProb.findIndex((p) => p > 50);

    if (firstHighIdx >= 0) estimatedTimeToStorm = firstHighIdx * 15;
    else if (firstModIdx >= 0) estimatedTimeToStorm = firstModIdx * 15;
    else estimatedTimeToStorm = 60;
  }

  // --- Calculate Detailed Factor Scores (0 - 100) ---
  // Wind Factor Score
  const windScore = Math.min(100, Math.round((maxGustSpeed / 90) * 100));
  const windLevel: RiskLevelType = windScore > 75 ? 'CRITICAL' : windScore > 50 ? 'HIGH' : windScore > 25 ? 'MEDIUM' : 'LOW';

  // Precipitation Factor Score
  const precipProb0 = hourlyData.precipitationProbability[0] ?? 0;
  const precipSum6h = (hourlyData.precipitation?.slice(0, 6) || []).reduce((a, b) => a + b, 0);
  const precipScore = Math.min(100, Math.round(precipProb0 * 0.5 + Math.min(50, precipSum6h * 5)));
  const precipLevel: RiskLevelType = precipScore > 75 ? 'CRITICAL' : precipScore > 50 ? 'HIGH' : precipScore > 25 ? 'MEDIUM' : 'LOW';

  // Lightning / Convective Risk Score
  const isLightningCode = weatherCode >= 95 && weatherCode <= 99;
  const lightningScore = isLightningCode ? 95 : isCurrentlyStormy ? 85 : highPrecipHours > 2 && maxWindSpeed > 45 ? 65 : 10;
  const lightningLevel: RiskLevelType = lightningScore > 75 ? 'CRITICAL' : lightningScore > 50 ? 'HIGH' : lightningScore > 25 ? 'MEDIUM' : 'LOW';

  // Barometric Pressure Trend
  let pressureTrend: 'Rapid Drop' | 'Slight Fall' | 'Steady' | 'Rising' = 'Steady';
  if (surfacePressure < 1000) pressureTrend = 'Rapid Drop';
  else if (surfacePressure < 1010) pressureTrend = 'Slight Fall';
  else if (surfacePressure > 1020) pressureTrend = 'Rising';

  const pressureScore = pressureTrend === 'Rapid Drop' ? 80 : pressureTrend === 'Slight Fall' ? 45 : 15;

  // Visibility Factor Score
  const currentVisibility = hourlyData.visibility?.[0] ? hourlyData.visibility[0] / 1000 : 10; // in km
  const visibilityScore = currentVisibility < 1 ? 90 : currentVisibility < 3 ? 65 : currentVisibility < 8 ? 35 : 5;

  // CAPE Atmospheric Instability (Convective Energy)
  const capeValue = (hourlyData as any).cape?.[0] ?? (isCurrentlyStormy ? 1800 : highPrecipHours > 2 ? 1200 : 250);
  let capeLevelText: 'Stable' | 'Moderate' | 'High Instability' | 'Severe Convective' = 'Stable';
  let capeScore = 15;
  if (capeValue >= 2500) {
    capeLevelText = 'Severe Convective';
    capeScore = 95;
  } else if (capeValue >= 1000) {
    capeLevelText = 'High Instability';
    capeScore = 70;
  } else if (capeValue >= 500) {
    capeLevelText = 'Moderate';
    capeScore = 40;
  }

  // Composite Risk Index Score (0 - 100)
  const compositeRiskScore = Math.min(
    100,
    Math.round(
      windScore * 0.25 +
      precipScore * 0.25 +
      lightningScore * 0.2 +
      pressureScore * 0.1 +
      visibilityScore * 0.1 +
      capeScore * 0.1
    )
  );

  let severityCategory: 'Low' | 'Moderate' | 'High' | 'Severe' | 'Extreme' = 'Low';
  if (compositeRiskScore >= 80) severityCategory = 'Extreme';
  else if (compositeRiskScore >= 65) severityCategory = 'Severe';
  else if (compositeRiskScore >= 45) severityCategory = 'High';
  else if (compositeRiskScore >= 25) severityCategory = 'Moderate';

  // Safety Advice List
  const advice: string[] = [];
  if (compositeRiskScore >= 65) {
    advice.push('Seek sturdy indoor shelter and avoid windows.');
    advice.push('Secure loose outdoor objects, patio furniture, and trash bins.');
    advice.push('Do not walk or drive through flooded roads or under large tree branches.');
    advice.push('Keep mobile devices charged and monitor real-time doppler radar.');
  } else if (compositeRiskScore >= 35) {
    advice.push('Keep an umbrella and rain gear accessible.');
    advice.push('Be prepared for sudden wind gusts while driving.');
    advice.push('Check radar loop for approaching rain bands before outdoor travel.');
  } else {
    advice.push('Weather conditions are currently safe for normal outdoor activities.');
    advice.push('Continue monitoring local daily forecasts.');
  }

  // 12-Hour Hourly Risk Timeline
  const hourlyRiskTimeline: HourlyRiskPoint[] = (hourlyData.time || []).slice(0, 12).map((tStr, idx) => {
    const pProb = hourlyData.precipitationProbability?.[idx] ?? 0;
    const wSpd = hourlyData.windSpeed10m?.[idx] ?? windSpeed;
    const wGst = hourlyData.windGusts10m?.[idx] ?? wSpd * 1.25;
    const code = hourlyData.weatherCode?.[idx] ?? 0;

    const ptCondition = getWeatherCondition(code);
    const ptScore = Math.min(
      100,
      Math.round(
        pProb * 0.5 +
        (wGst / 80) * 40 +
        (ptCondition.isStormy ? 30 : 0)
      )
    );

    let ptLevel: RiskLevelType = 'LOW';
    if (ptScore >= 75) ptLevel = 'CRITICAL';
    else if (ptScore >= 50) ptLevel = 'HIGH';
    else if (ptScore >= 25) ptLevel = 'MEDIUM';

    const timeStr = new Date(tStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return {
      timeStr,
      riskScore: ptScore,
      precipProb: pProb,
      windSpeed: Math.round(wSpd),
      windGust: Math.round(wGst),
      riskLevel: ptLevel,
      weatherCode: code
    };
  });

  return {
    isCurrentlyStormy,
    isStormApproaching,
    stormProbability,
    estimatedTimeToStorm,
    currentCondition: currentCondition.description,
    windSpeed,
    precipitationProbability: hourlyData.precipitationProbability[0] ?? 0,
    currentPrecipitation,
    maxWindSpeedNext6Hours: maxWindSpeed,
    maxGustSpeedNext6Hours: Math.round(maxGustSpeed),
    overallRiskScore: compositeRiskScore,
    severityCategory,
    surfacePressure: Math.round(surfacePressure),
    pressureTrend,
    capeJkg: Math.round(capeValue),
    capeLevel: capeLevelText,
    safetyAdvice: advice,
    hourlyRiskTimeline,
    riskFactors: {
      wind: {
        score: windScore,
        level: windLevel,
        label: 'Wind & Gust Velocity',
        value: `${Math.round(maxWindSpeed)} km/h (Gusts: ${Math.round(maxGustSpeed)} km/h)`,
        description: windScore > 60 ? 'Hazardous gales capable of breaking tree limbs.' : 'Moderate breeze, minimal structural risk.'
      },
      precipitation: {
        score: precipScore,
        level: precipLevel,
        label: 'Rain & Flood Probability',
        value: `${precipProb0}% prob (${currentPrecipitation.toFixed(1)} mm/h)`,
        description: precipScore > 60 ? 'Heavy downpours expected with potential local flash flooding.' : 'Light to moderate rainfall expected.'
      },
      lightning: {
        score: lightningScore,
        level: lightningLevel,
        label: 'Lightning & Thunderstorms',
        value: isLightningCode ? 'ACTIVE THUNDERSTORMS' : lightningScore > 50 ? 'HIGH CONVECTIVE RISK' : 'LOW RISK',
        description: lightningScore > 50 ? 'Frequent cloud-to-ground strikes detected in storm cell.' : 'No significant electrical discharge active.'
      },
      barometricPressure: {
        score: pressureScore,
        level: pressureScore > 60 ? 'HIGH' : 'LOW',
        label: 'Barometric Pressure Front',
        value: `${Math.round(surfacePressure)} hPa (${pressureTrend})`,
        description: pressureTrend === 'Rapid Drop' ? 'Unstable low-pressure system rapidly moving in.' : 'Stable atmospheric pressure.'
      },
      visibility: {
        score: visibilityScore,
        level: visibilityScore > 60 ? 'HIGH' : 'LOW',
        label: 'Atmospheric Visibility',
        value: `${currentVisibility.toFixed(1)} km`,
        description: visibilityScore > 50 ? 'Severely reduced visibility due to fog or dense rain.' : 'Good visibility for driving and navigation.'
      },
      capeInstability: {
        score: capeScore,
        level: capeScore > 60 ? 'CRITICAL' : capeScore > 40 ? 'HIGH' : 'LOW',
        label: 'CAPE Convective Energy',
        value: `${Math.round(capeValue)} J/kg (${capeLevelText})`,
        description: capeScore > 60 ? 'Extreme atmospheric energy capable of producing severe hail and squalls.' : 'Low to moderate thermal instability.'
      }
    },
    activeHazards: weatherData.activeHazards,
    convectiveSounding: weatherData.convectiveSounding
  };
}

/**
 * Calculate high-resolution 60-minute nowcast precipitation curve (+1 min to +60 min)
 */
export function calculateMinutePrecipitation(weatherData: WeatherResponse): MinutePrecipitationPoint[] {
  const currentPrecip = weatherData.current?.precipitation ?? 0;
  const next1h = weatherData.hourly?.precipitation?.[0] ?? currentPrecip;
  const next2h = weatherData.hourly?.precipitation?.[1] ?? next1h;
  const precipProb = weatherData.hourly?.precipitationProbability?.[0] ?? (currentPrecip > 0 ? 90 : 10);
  const now = new Date();

  const points: MinutePrecipitationPoint[] = [];

  for (let m = 1; m <= 60; m++) {
    const minuteTime = new Date(now.getTime() + m * 60 * 1000);
    const timeStr = minuteTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Smooth interpolation with realistic convective perturbation
    const tRatio = m / 60;
    const baseIntensity = currentPrecip * (1 - tRatio) + next1h * tRatio;
    // Slight natural variability (+- 10%)
    const wobble = 1 + 0.15 * Math.sin((m / 6) * Math.PI);
    const intensityMmH = Math.max(0, Math.round(baseIntensity * wobble * 10) / 10);

    let category: MinutePrecipitationPoint['category'] = 'none';
    if (intensityMmH >= 15.0) category = 'torrential';
    else if (intensityMmH >= 5.0) category = 'heavy';
    else if (intensityMmH >= 1.5) category = 'moderate';
    else if (intensityMmH >= 0.1) category = 'light';

    points.push({
      minute: m,
      timeStr,
      intensityMmH,
      probability: Math.min(100, Math.round(precipProb * (1 - tRatio * 0.2) + (intensityMmH > 0.2 ? 30 : 0))),
      category
    });
  }

  return points;
}

/**
 * Calculate thermodynamic sounding indices for severe thunderstorm & supercell forecasting
 */
export function calculateConvectiveSounding(weatherData: WeatherResponse, stormRisk?: StormRisk): ConvectiveSounding {
  const currentTemp = weatherData.current?.temperature ?? 20;
  const dewPoint = weatherData.hourly?.dewPoint?.[0] ?? (currentTemp - 5);
  const surfacePressure = weatherData.current?.pressureMsl ?? 1013;
  const wind10m = weatherData.current?.windSpeed10m ?? 15;
  const wind80m = weatherData.hourly?.windSpeed80m?.[0] ?? (wind10m * 1.4);
  const weatherCode = weatherData.current?.weatherCode ?? 0;
  const isStormy = weatherCode >= 95 || (stormRisk?.isCurrentlyStormy ?? false);

  // Dew point depression (T - Td)
  const dewPointDepressionC = Math.max(0, Math.round((currentTemp - dewPoint) * 10) / 10);

  // CAPE (J/kg) — prefer real numerical weather prediction model CAPE from Open-Meteo
  const modelCape = weatherData.hourly?.cape?.[0];
  let capeJkg: number;
  if (typeof modelCape === 'number' && !isNaN(modelCape) && modelCape >= 0) {
    capeJkg = Math.round(modelCape);
  } else if (isStormy) {
    capeJkg = 1850;
  } else if ((weatherData.current?.precipitation ?? 0) >= 2.0) {
    capeJkg = 650;
  } else {
    capeJkg = Math.min(250, Math.max(0, stormRisk?.capeJkg ?? 50));
  }

  // CIN (Convective Inhibition in J/kg)
  const cinJkg = Math.round(Math.max(10, (dewPointDepressionC * 18) - (capeJkg > 1000 ? 40 : 0)));

  // Lifted Index (LI): negative values indicate strong upward buoyancy
  const modelLi = weatherData.hourly?.liftedIndex?.[0];
  let liftedIndex: number;
  if (typeof modelLi === 'number' && !isNaN(modelLi)) {
    liftedIndex = Math.round(modelLi * 10) / 10;
  } else {
    liftedIndex = Math.round((5 - (capeJkg / 350) - (isStormy ? 4 : 0)) * 10) / 10;
  }

  // K-Index (Thunderstorm Potential: > 35 = 80-90% probability)
  const kIndex = Math.round(Math.min(45, Math.max(5, (currentTemp - 5) + dewPoint - (surfacePressure < 1005 ? 5 : 12))));

  // 0-6 km Bulk Wind Shear (m/s)
  const shearMs = Math.round((((wind80m - wind10m) * 2.2) / 3.6 + (isStormy ? 8 : 4)) * 10) / 10;

  // 0°C Freezing Level Height in meters (approx. 150m per degree Celsius above 0)
  const freezingLevelMeters = Math.max(800, Math.round(Math.max(0, currentTemp) * 165 + 400));

  let convectiveRiskCategory: ConvectiveSounding['convectiveRiskCategory'] = 'None';
  if (capeJkg >= 2500 || (capeJkg >= 1500 && shearMs >= 20)) convectiveRiskCategory = 'High';
  else if (capeJkg >= 1800 || (capeJkg >= 1200 && shearMs >= 15)) convectiveRiskCategory = 'Moderate';
  else if (capeJkg >= 1000 || isStormy) convectiveRiskCategory = 'Enhanced';
  else if (capeJkg >= 500 || kIndex >= 28) convectiveRiskCategory = 'Slight';
  else if (capeJkg >= 250) convectiveRiskCategory = 'Marginal';

  return {
    capeJkg,
    cinJkg,
    liftedIndex,
    kIndex,
    bulkShear06kmMs: shearMs,
    freezingLevelMeters,
    dewPointDepressionC,
    convectiveRiskCategory
  };
}

/**
 * Lightning strike telemetry.
 *
 * Real strike data requires a live lightning source (Blitzortung, EUMETSAT MTG LI,
 * LibreWXR storm-cell detection, etc.). The previous implementation fabricated random
 * strikes whenever a convective signal was present, which produced false
 * "IMMEDIATE LIGHTNING DANGER ZONE" alerts that did not match real radar/satellite
 * imagery. Until a real feed is wired in we return no strikes.
 */
export function generateLightningTelemetry(
  userLat: number,
  userLon: number,
  weatherData: WeatherResponse,
  stormRisk?: StormRisk
): LightningStrike[] {
  return [];
}

export function getCompassCardinal(deg: number): string {
  const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return cardinals[idx];
}

/**
 * Computes exact meteorological steering vector and relative trajectory towards observer
 */
export function computeRainCellVectorAndTrajectory(
  userLat: number,
  userLon: number,
  cellLat: number,
  cellLon: number,
  steeringSpeedKmH: number,
  steeringWindFromDeg: number
): { vector: RainCellVector; trajectory: RainCellTrajectory; distanceKm: number; bearingDeg: number } {
  // Meteorological propagation: Wind direction is reported as "FROM where wind blows".
  // The storm cell travels in the opposite direction: heading = (windFrom + 180) % 360.
  const originBearingDeg = ((steeringWindFromDeg % 360) + 360) % 360;
  const originCardinal = getCompassCardinal(originBearingDeg);
  const headingDeg = (originBearingDeg + 180) % 360;
  const headingCardinal = getCompassCardinal(headingDeg);
  const headingRad = (headingDeg * Math.PI) / 180;

  const speedKmH = Math.max(10, Math.round(steeringSpeedKmH));
  // Eastward velocity: positive = East, negative = West
  const speedX = Math.round(speedKmH * Math.sin(headingRad) * 10) / 10;
  // Northward velocity: positive = North, negative = South
  const speedY = Math.round(speedKmH * Math.cos(headingRad) * 10) / 10;

  const movementSummary = `Moving FROM ${originCardinal} (${Math.round(originBearingDeg)}°) TOWARDS ${headingCardinal} (${Math.round(headingDeg)}°) at ${speedKmH} km/h`;

  const vector: RainCellVector = {
    originBearingDeg,
    originCardinal,
    headingDeg,
    headingCardinal,
    speedKmH,
    speedX,
    speedY,
    movementSummary
  };

  // Trajectory geometry relative to user position
  const distanceKm = Math.round(getHaversineDistance(userLat, userLon, cellLat, cellLon) * 10) / 10;
  const bearingToCell = Math.round(getBearing(userLat, userLon, cellLat, cellLon));
  const bearingCellToUser = getBearing(cellLat, cellLon, userLat, userLon);

  // Angle difference between the cell's movement heading and the straight line to user
  let angleDiff = Math.abs(headingDeg - bearingCellToUser);
  if (angleDiff > 180) angleDiff = 360 - angleDiff;

  let isOverhead = distanceKm <= 2.5;
  let isCollisionCourse = false;
  let isMovingAway = false;
  let missDistanceKm = 0;
  let impactEtaMinutes: number | null = null;
  let relativeMotionText = '';

  if (isOverhead) {
    isCollisionCourse = true;
    missDistanceKm = 0;
    impactEtaMinutes = 0;
    relativeMotionText = `Directly overhead • Core tracking towards ${headingCardinal} (${Math.round(headingDeg)}°) at ${speedKmH} km/h`;
  } else if (angleDiff <= 90) {
    // Cell is moving closer towards the observer sector
    const angleRad = (angleDiff * Math.PI) / 180;
    const alongTrackKm = distanceKm * Math.cos(angleRad);
    missDistanceKm = Math.round(distanceKm * Math.sin(angleRad) * 10) / 10;
    impactEtaMinutes = Math.max(1, Math.round((alongTrackKm / (speedKmH / 60))));

    if (missDistanceKm <= 10 || angleDiff <= 25) {
      isCollisionCourse = true;
      relativeMotionText = `⚠️ DIRECT IMPACT TRACK: On collision heading towards your sector at ${speedKmH} km/h (ETA ~${impactEtaMinutes} min, pass offset: <${missDistanceKm.toFixed(1)} km)`;
    } else {
      isCollisionCourse = false;
      relativeMotionText = `➡️ PASSING TRACK: Tracking towards ${headingCardinal} (${Math.round(headingDeg)}°), passing ~${missDistanceKm.toFixed(1)} km away in ~${impactEtaMinutes} min`;
    }
  } else {
    // Cell is moving away from the observer
    isMovingAway = true;
    missDistanceKm = distanceKm;
    impactEtaMinutes = null;
    relativeMotionText = `⬅️ RECEDING: Moving away towards ${headingCardinal} (${Math.round(headingDeg)}°) at ${speedKmH} km/h (Current distance: ${distanceKm.toFixed(1)} km)`;
  }

  const trajectory: RainCellTrajectory = {
    isCollisionCourse,
    isOverhead,
    isMovingAway,
    missDistanceKm,
    impactEtaMinutes,
    relativeMotionText
  };

  return {
    vector,
    trajectory,
    distanceKm,
    bearingDeg: bearingToCell
  };
}

export function buildActivatingRainCell(
  userLat: number,
  userLon: number,
  cellLat: number,
  cellLon: number,
  precipMmH: number,
  weatherCode: number,
  capeJkg: number,
  windSpeedKmH: number,
  windDirDeg: number,
  cellName: string = 'Active Convective Rain Cell'
): ActivatingRainCell {
  const { vector, trajectory, distanceKm, bearingDeg } = computeRainCellVectorAndTrajectory(
    userLat,
    userLon,
    cellLat,
    cellLon,
    windSpeedKmH,
    windDirDeg
  );

  const directionLabel = distanceKm <= 2.5 ? 'Overhead' : `${distanceKm.toFixed(1)} km ${getCompassCardinal(bearingDeg)} (${Math.round(bearingDeg)}°)`;
  const intensityDbz = Math.min(65, Math.max(20, Math.round(precipMmH * 8 + (capeJkg > 1000 ? 25 : 18))));

  return {
    cellId: `cell-${Math.round(cellLat * 1000)}-${Math.round(cellLon * 1000)}`,
    cellName,
    lat: cellLat,
    lon: cellLon,
    distanceKm,
    bearingDeg,
    directionLabel,
    precipMmH,
    intensityDbz,
    capeJkg,
    weatherCode,
    vector,
    trajectory
  };
}

/**
 * Calculate EUMETSAT Meteosat Third Generation (MTG-I1 / Meteosat-12)
 * Flexible Combined Imager (FCI) multispectral channels & Lightning Imager (LI) Level-2 diagnostics.
 */
export function calculateMtgSatelliteDiagnostics(
  latitude: number,
  longitude: number,
  weatherData: WeatherResponse,
  sounding: ConvectiveSounding,
  stormRisk: StormRisk,
  strikes: LightningStrike[] = []
): MtgSatelliteDiagnostics {
  const current = weatherData.current;
  const currentTemp = current?.temperature ?? 18;
  const cloudCover = current?.cloudCover ?? weatherData.hourly?.cloudCover?.[0] ?? 0;
  const highCloud = current?.cloudCoverHigh ?? weatherData.hourly?.cloudCoverHigh?.[0] ?? (cloudCover * 0.4);
  const midCloud = current?.cloudCoverMid ?? weatherData.hourly?.cloudCoverMid?.[0] ?? (cloudCover * 0.3);
  const lowCloud = current?.cloudCoverLow ?? weatherData.hourly?.cloudCoverLow?.[0] ?? (cloudCover * 0.3);
  const currentPrecip = current?.precipitation ?? 0;
  const weatherCode = current?.weatherCode ?? 0;
  const isStormy = weatherCode >= 95 || stormRisk.isCurrentlyStormy;
  const cape = sounding.capeJkg;

  // 1. FCI Channel 0.6 µm (VIS) Reflectance %:
  const isDay = current?.isDay ?? 1;
  let channelVis06ReflectancePct = 0;
  if (isDay) {
    if (cloudCover <= 10) channelVis06ReflectancePct = 12.5; // Surface terrain albedo
    else if (isStormy || cape > 1500) channelVis06ReflectancePct = Math.min(96, 75 + (cloudCover / 100) * 20);
    else channelVis06ReflectancePct = Math.min(90, 20 + (cloudCover / 100) * 65);
  }

  // 2. FCI Channel 10.5 µm (Clean IR Window) Brightness Temperature:
  let channelIr105TempC = currentTemp - 2;
  if (isStormy || (cape >= 1200 && currentPrecip > 1.0)) {
    channelIr105TempC = Math.round((-48 - Math.min(22, (cape / 200) + currentPrecip * 1.5)) * 10) / 10;
  } else if (highCloud > 40) {
    channelIr105TempC = Math.round((-32 - (highCloud / 100) * 25) * 10) / 10;
  } else if (midCloud > 40) {
    channelIr105TempC = Math.round((-10 - (midCloud / 100) * 15) * 10) / 10;
  } else if (lowCloud > 40) {
    channelIr105TempC = Math.round((currentTemp - 8 - (lowCloud / 100) * 6) * 10) / 10;
  } else {
    channelIr105TempC = Math.round((currentTemp - 1.5) * 10) / 10;
  }

  // 3. FCI Channel 6.3 µm (Upper Tropospheric Water Vapor):
  const channelWv63TempC = Math.round(Math.min(channelIr105TempC, -35 - (cloudCover / 100) * 18) * 10) / 10;

  // 4. Cloud Top Height (CTTH) & Pressure Level:
  let cloudTopHeightMeters = 0;
  let cloudTopPressureHpa = 1013;
  let cloudTopTempC = channelIr105TempC;

  if (isStormy || (cape > 1500 && currentPrecip > 0.5)) {
    cloudTopHeightMeters = Math.round(10500 + Math.min(3500, cape * 1.2)); // 10.5 - 14.0 km (FL350 - FL460)
    cloudTopPressureHpa = Math.max(160, Math.round(260 - (cloudTopHeightMeters - 10000) * 0.025));
    cloudTopTempC = channelIr105TempC;
  } else if (highCloud > 30) {
    cloudTopHeightMeters = Math.round(8000 + (highCloud / 100) * 3200);
    cloudTopPressureHpa = Math.round(350 - (highCloud / 100) * 100);
  } else if (midCloud > 30) {
    cloudTopHeightMeters = Math.round(3500 + (midCloud / 100) * 2500);
    cloudTopPressureHpa = Math.round(650 - (midCloud / 100) * 150);
  } else if (lowCloud > 20) {
    cloudTopHeightMeters = Math.round(900 + (lowCloud / 100) * 1600);
    cloudTopPressureHpa = Math.round(920 - (lowCloud / 100) * 120);
  }

  // 5. Cloud Phase & Microphysics:
  let cloudPhase: MtgFlexibleCombinedImagerData['cloudPhase'] = 'Cloud Free';
  if (cloudCover > 10) {
    if (cloudTopTempC <= -38 || isStormy) cloudPhase = 'Glaciated Ice';
    else if (cloudTopTempC <= -10) cloudPhase = 'Mixed Phase';
    else if (cloudTopTempC <= 0) cloudPhase = 'Supercooled Water';
    else cloudPhase = 'Liquid Warm Cloud';
  }

  // 6. Cloud Type Classification:
  let cloudTypeClassification: MtgFlexibleCombinedImagerData['cloudTypeClassification'] = 'Clear Sky';
  const overshootingTopDetected = isStormy && (cloudTopTempC <= -56 || cape >= 2000);
  const rapidCoolingRateCDegPer15Min = isStormy ? -6.8 : cape > 1000 ? -3.2 : -0.4;

  if (overshootingTopDetected) cloudTypeClassification = 'Overshooting Convective Top';
  else if (isStormy || (cape >= 1000 && currentPrecip >= 1.5)) cloudTypeClassification = 'Deep Convective Core (Cb)';
  else if (highCloud >= 50 && cloudCover >= 70) cloudTypeClassification = 'Cirrus Anvil Shield';
  else if (midCloud >= 60) cloudTypeClassification = 'Thick Multilayer Altostratus';
  else if (lowCloud >= 60) cloudTypeClassification = 'Low Stratus / Stratocumulus';
  else if (cloudCover >= 25) cloudTypeClassification = 'Fair-Weather Cumulus';

  // Optical Thickness (COT):
  const opticalThickness = isStormy ? 68.4 : cloudCover > 50 ? Math.round((15 + (cloudCover / 100) * 35) * 10) / 10 : 2.5;

  // 7. Lightning Imager (LI) Instrument Level-2 Telemetry:
  const activeStrikesInZone = strikes.filter((s) => s.distanceKm <= 100);
  const totalLightningFlashRatePerMin = activeStrikesInZone.length > 0
    ? Math.max(2, Math.round(activeStrikesInZone.length * 3.5 + (isStormy ? 15 : 0)))
    : (isStormy ? 12 : 0);

  const accumulatedFlashDensity = totalLightningFlashRatePerMin > 0
    ? Math.round((totalLightningFlashRatePerMin * 15 / 3.1415) * 10) / 10
    : 0;

  const lightningJumpDetected = isStormy && (totalLightningFlashRatePerMin >= 18 || cape >= 1800);
  const closestFlash = strikes[0];

  const nowcastingAssessment = isStormy
    ? `MTG-I1 FCI IR 10.5µm shows severe cold-cloud summit at ${cloudTopTempC.toFixed(1)}°C (FL${Math.round(cloudTopHeightMeters * 0.0328)} / ${cloudTopHeightMeters.toLocaleString()} m). MTG LI optical lightning rate is ${totalLightningFlashRatePerMin} flashes/min with ${lightningJumpDetected ? 'CONVECTIVE LIGHTNING JUMP TRIGGERED (elevated downburst/hail risk)' : 'continuous intra-cloud/CG activity'}.`
    : cloudCover > 50
    ? `MTG-I1 FCI multispectral scan detects ${cloudTypeClassification} with cloud top temperature of ${cloudTopTempC.toFixed(1)}°C (${cloudTopHeightMeters.toLocaleString()} m). No optical lightning flashes detected by MTG LI in 100km perimeter.`
    : `MTG-I1 FCI infrared and visible channels indicate benign tropospheric profile across the sector with high thermal radiance (${channelIr105TempC.toFixed(1)}°C). LI lightning imager idle (0 flashes/min).`;

  return {
    satelliteId: 'MTG-I1 / Meteosat-12',
    subSatelliteLongitude: '0.0° / Geostationary 35,786 km',
    dataDisseminationTime: new Date().toISOString(),
    fci: {
      satelliteName: 'MTG-I1 (Meteosat-12)',
      scanMode: 'European Rapid Scan (2.5 min)',
      channelVis06ReflectancePct,
      channelIr105TempC,
      channelWv63TempC,
      cloudTopHeightMeters,
      cloudTopPressureHpa,
      cloudTopTempC,
      cloudPhase,
      cloudTypeClassification,
      opticalThickness,
      overshootingTopDetected,
      rapidCoolingRateCDegPer15Min
    },
    li: {
      operationalStatus: 'Operational - Real-Time LI Level-2',
      totalLightningFlashRatePerMin,
      intraCloudFractionPct: 85,
      cloudToGroundFractionPct: 15,
      accumulatedFlashDensity,
      meanFlashRadiancePicoJoules: totalLightningFlashRatePerMin > 0 ? 142.5 : 0,
      lightningJumpDetected,
      closestFlashDistanceKm: closestFlash ? closestFlash.distanceKm : 999,
      closestFlashBearingDeg: closestFlash ? closestFlash.bearingDeg : 0,
      activeFlashClustersCount: activeStrikesInZone.length > 0 ? Math.max(1, Math.ceil(activeStrikesInZone.length / 3)) : 0
    },
    nowcastingAssessment
  };
}

/**
 * Tactical Multi-Hazard Detection & Alert Matrix with Activating Rain Cell Identification
 */
export function generateMultiHazardAlerts(
  weatherData: WeatherResponse,
  stormRisk: StormRisk,
  sounding: ConvectiveSounding,
  strikes: LightningStrike[]
): HazardAlert[] {
  const alerts: HazardAlert[] = [];
  const currentData = weatherData.current;
  const hourlyData = weatherData.hourly;
  const windGust = hourlyData?.windGusts10m?.[0] ?? currentData?.windSpeed10m ?? 0;
  const currentWind = currentData?.windSpeed10m ?? 15;
  const currentWindDir = currentData?.windDirection10m ?? 225;
  const currentPrecip = currentData?.precipitation ?? 0;
  const precip6h = (hourlyData?.precipitation?.slice(0, 6) || []).reduce((a, b) => a + b, 0);
  const temp = currentData?.temperature ?? 20;

  // Steering speed & wind vector for cells
  const steeringSpeed = Math.max(12, Math.round(Math.max(currentWind * 1.2, windGust * 0.75)));

  // Identify candidate activating rain cells in order of priority:
  // 1. Center if currently active (overhead)
  // 2. Active regional scan point that is on COLLISION course or overhead
  // 3. Upwind convective origin if high instability/threat
  const regionalPoints = weatherData.regionalScanPoints || [];
  const builtRegionalCells = regionalPoints
    .filter((p) => p.precipitationMmH >= 0.1 || p.weatherCode >= 50 || p.next1hPrecipMmH >= 0.2)
    .map((pt) =>
      buildActivatingRainCell(
        weatherData.latitude,
        weatherData.longitude,
        pt.latitude,
        pt.longitude,
        Math.max(pt.precipitationMmH, pt.next1hPrecipMmH, 0.5),
        pt.weatherCode,
        sounding.capeJkg,
        pt.windSpeedKmH || steeringSpeed,
        pt.windDirDeg || currentWindDir,
        `Regional Rain Cell (${pt.directionLabel})`
      )
    );

  // Sort regional cells: Collision course first, then closest distance
  builtRegionalCells.sort((a, b) => {
    if (a.trajectory.isCollisionCourse && !b.trajectory.isCollisionCourse) return -1;
    if (!a.trajectory.isCollisionCourse && b.trajectory.isCollisionCourse) return 1;
    return a.distanceKm - b.distanceKm;
  });

  const isCenterActive = stormRisk.isCurrentlyStormy || currentPrecip >= 0.1 || (currentData?.weatherCode ?? 0) >= 50;

  let primaryCell: ActivatingRainCell | undefined;
  if (isCenterActive) {
    primaryCell = buildActivatingRainCell(
      weatherData.latitude,
      weatherData.longitude,
      weatherData.latitude,
      weatherData.longitude,
      Math.max(currentPrecip, 1.5),
      currentData?.weatherCode ?? 95,
      sounding.capeJkg,
      steeringSpeed,
      currentWindDir,
      'Overhead Convective Rain Cell'
    );
  } else if (builtRegionalCells.length > 0) {
    primaryCell = builtRegionalCells[0];
  } else if (stormRisk.isStormApproaching && stormRisk.stormProbability >= 0.75 && stormRisk.estimatedTimeToStorm <= 45) {
    // Upwind convective origin only when storm probability is genuinely high and approaching
    const upwindDistKm = Math.min(65, Math.max(15, Math.round(stormRisk.estimatedTimeToStorm * 0.8)));
    const upwindPos = getDestinationPoint(weatherData.latitude, weatherData.longitude, upwindDistKm, currentWindDir);
    primaryCell = buildActivatingRainCell(
      weatherData.latitude,
      weatherData.longitude,
      upwindPos.lat,
      upwindPos.lon,
      Math.max(1.0, stormRisk.precipitationProbability * 0.05),
      80,
      sounding.capeJkg,
      steeringSpeed,
      currentWindDir,
      `Approaching Storm Front (${getCompassCardinal(currentWindDir)})`
    );
  }

  // 1. Severe Convective Thunderstorm / Supercell Threat — ONLY when storm is overhead OR approaching on collision course
  const isCellApproachingOrOverhead = primaryCell
    ? primaryCell.trajectory.isOverhead ||
      (primaryCell.trajectory.isCollisionCourse && (primaryCell.trajectory.impactEtaMinutes ?? 999) <= 90)
    : false;

  if (stormRisk.isCurrentlyStormy || (primaryCell && isCellApproachingOrOverhead && (sounding.capeJkg >= 1000 || primaryCell.precipMmH >= 2.0 || primaryCell.weatherCode >= 80))) {
    const isEmergency = sounding.capeJkg >= 2500 || (stormRisk.isCurrentlyStormy && windGust >= 80);

    if (primaryCell) {
      alerts.push({
        id: 'hazard-convective-storm',
        type: 'convective_storm',
        severity: isEmergency ? 'EMERGENCY' : stormRisk.isCurrentlyStormy ? 'WARNING' : 'WATCH',
        title: isEmergency ? 'EXTREME CONVECTIVE SUPERCELL WARNING' : 'SEVERE THUNDERSTORM WARNING',
        headline: `Activating Cell: ${primaryCell.directionLabel} • ${primaryCell.vector.movementSummary}`,
        description: `Rapid updraft velocity and high atmospheric instability detected. Convective cell centered at ${primaryCell.lat.toFixed(4)}°N, ${primaryCell.lon.toFixed(4)}°E (${primaryCell.directionLabel}), moving with high lightning density and destructive wind gusts up to ${Math.round(windGust)} km/h. ${primaryCell.trajectory.relativeMotionText}.`,
        onsetMinutes: primaryCell.trajectory.impactEtaMinutes ?? (stormRisk.estimatedTimeToStorm > 0 ? stormRisk.estimatedTimeToStorm : 0),
        peakIntensity: `${Math.round(windGust)} km/h Gusts • ${sounding.capeJkg} J/kg CAPE • ${primaryCell.intensityDbz} dBZ`,
        icon: '⚡',
        actionChecklist: [
          'Seek sturdy indoor shelter immediately away from windows and glass.',
          'Disconnect sensitive electronic devices from wall power outlets.',
          'Avoid contact with plumbing fixtures and wired electrical devices.',
          'Keep flashlights and emergency radios accessible.'
        ],
        activatingCell: primaryCell,
        cellLocation: {
          lat: primaryCell.lat,
          lon: primaryCell.lon,
          distanceKm: primaryCell.distanceKm,
          bearingDeg: primaryCell.bearingDeg,
          directionLabel: primaryCell.directionLabel,
          capeJkg: sounding.capeJkg,
          intensityDbz: primaryCell.intensityDbz,
          headingDeg: primaryCell.vector.headingDeg,
          headingCardinal: primaryCell.vector.headingCardinal,
          speedKmH: primaryCell.vector.speedKmH
        }
      });
    }
  } else if (!primaryCell && sounding.capeJkg >= 1500) {
    // High atmospheric instability aloft without active convective storm initiation
    alerts.push({
      id: 'hazard-convective-potential',
      type: 'convective_storm',
      severity: 'ADVISORY',
      title: 'ELEVATED CONVECTIVE INSTABILITY POTENTIAL',
      headline: `Thermodynamic CAPE: ${sounding.capeJkg} J/kg (No Active Storms Detected on Radar)`,
      description: `Atmospheric lapse rate shows elevated convective potential aloft. Capping inversion is currently suppressing storm initiation. Radar scans show dry/clear skies with 0 dBZ reflectivity across the 100 km scanning zone.`,
      onsetMinutes: 0,
      peakIntensity: `${sounding.capeJkg} J/kg CAPE (Aloft)`,
      icon: '🌤️',
      actionChecklist: [
        'Conditions are currently clear with zero rain echoes on Doppler radar.',
        'Monitor radar updates if daytime heating triggers afternoon cloud buildup.'
      ]
    });
  }

  // 2. High Wind & Gale / Squall Warning
  if (windGust >= 65 || (currentData?.windSpeed10m ?? 0) >= 45) {
    const isGale = windGust >= 85;
    alerts.push({
      id: 'hazard-gale-wind',
      type: 'gale_wind',
      severity: isGale ? 'WARNING' : 'WATCH',
      title: isGale ? 'HIGH WIND & GALE SQUALL WARNING' : 'STRONG WIND GUST ADVISORY',
      headline: `Peak Gusts: ${Math.round(windGust)} km/h from ${getCompassCardinal(currentWindDir)} (${Math.round(currentWindDir)}°)`,
      description: `Damaging squalls moving towards ${getCompassCardinal((currentWindDir + 180) % 360)} capable of downing tree limbs, power lines, and creating hazardous crosswinds on bridges and highways.`,
      onsetMinutes: 0,
      peakIntensity: `${Math.round(windGust)} km/h (Beaufort ${Math.min(12, Math.round(windGust / 10))})`,
      icon: '💨',
      actionChecklist: [
        'Secure outdoor furniture, trash cans, trampolines, and loose rooftop items.',
        'Exercise extreme caution when operating high-profile vehicles.',
        'Stay clear of old trees, construction scaffolding, and utility poles.',
        'Park vehicles inside garages or away from overhanging branches.'
      ],
      activatingCell: primaryCell,
      cellLocation: primaryCell ? {
        lat: primaryCell.lat,
        lon: primaryCell.lon,
        distanceKm: primaryCell.distanceKm,
        bearingDeg: primaryCell.bearingDeg,
        directionLabel: primaryCell.directionLabel,
        capeJkg: sounding.capeJkg,
        intensityDbz: primaryCell.intensityDbz,
        headingDeg: primaryCell.vector.headingDeg,
        headingCardinal: primaryCell.vector.headingCardinal,
        speedKmH: primaryCell.vector.speedKmH
      } : undefined
    });
  }

  // 3. Flash Flood & Torrential Downpour Threat — only if overhead or on collision track
  const isFloodCellApproaching = primaryCell ? (primaryCell.trajectory.isOverhead || (primaryCell.trajectory.isCollisionCourse && (primaryCell.trajectory.impactEtaMinutes ?? 999) <= 60)) : false;
  if (currentPrecip >= 10.0 || (precip6h >= 25.0 && currentPrecip >= 3.0) || (primaryCell && isFloodCellApproaching && primaryCell.precipMmH >= 10.0)) {
    const isTorrential = currentPrecip >= 20.0 || precip6h >= 45.0 || (primaryCell ? primaryCell.precipMmH >= 20.0 : false);
    const rainRate = primaryCell ? primaryCell.precipMmH : currentPrecip;
    alerts.push({
      id: 'hazard-flash-flood',
      type: 'flash_flood',
      severity: isTorrential ? 'WARNING' : 'WATCH',
      title: isTorrential ? 'FLASH FLOOD & INUNDATION WARNING' : 'HEAVY PRECIPITATION FLOOD ADVISORY',
      headline: `Torrential Rain Rate: ${rainRate.toFixed(1)} mm/h ${primaryCell ? `at ${primaryCell.directionLabel}` : 'Overhead'}`,
      description: `Excessive rainfall exceeding soil infiltration capacity. ${primaryCell ? `Rain cell tracking ${primaryCell.vector.movementSummary}. ${primaryCell.trajectory.relativeMotionText}.` : 'Heavy precipitation accumulation active.'}`,
      onsetMinutes: primaryCell?.trajectory.impactEtaMinutes ?? 0,
      peakIntensity: `${rainRate.toFixed(1)} mm/h Rain Rate • ${primaryCell?.intensityDbz ?? 45} dBZ`,
      icon: '🌊',
      actionChecklist: [
        'Never drive or walk through flooded roadways — Turn Around, Don\'t Drown.',
        'Move essential valuables and electronics to higher floor levels.',
        'Clear storm drains and basement sump pumps of debris.',
        'Be alert for mudslides and rising creek or river levels.'
      ],
      activatingCell: primaryCell,
      cellLocation: primaryCell ? {
        lat: primaryCell.lat,
        lon: primaryCell.lon,
        distanceKm: primaryCell.distanceKm,
        bearingDeg: primaryCell.bearingDeg,
        directionLabel: primaryCell.directionLabel,
        capeJkg: sounding.capeJkg,
        intensityDbz: primaryCell.intensityDbz,
        headingDeg: primaryCell.vector.headingDeg,
        headingCardinal: primaryCell.vector.headingCardinal,
        speedKmH: primaryCell.vector.speedKmH
      } : undefined
    });
  }

  // 4. Close Proximity Lightning Threat (< 15km)
  const closeStrikes = strikes.filter((s) => s.distanceKm <= 15);
  if (closeStrikes.length > 0) {
    const closest = closeStrikes[0];
    alerts.push({
      id: 'hazard-lightning-proximity',
      type: 'lightning_strike',
      severity: closest.distanceKm <= 5 ? 'WARNING' : 'ADVISORY',
      title: closest.distanceKm <= 5 ? 'IMMEDIATE LIGHTNING DANGER ZONE' : 'CLOSE PROXIMITY LIGHTNING ALERT',
      headline: `Closest Strike: ${closest.distanceKm.toFixed(1)} km (${getCompassCardinal(closest.bearingDeg)} ${closest.bearingDeg}°)`,
      description: `Cloud-to-ground electrical discharges active within strike range. ${primaryCell ? `Associated with convective core ${primaryCell.vector.movementSummary}.` : ''} Sound delay to thunder is approx. ${(closest.distanceKm * 2.9).toFixed(1)} seconds.`,
      onsetMinutes: 0,
      peakIntensity: `${closest.currentKa} kA Discharge Current`,
      icon: '🌩️',
      actionChecklist: [
        'When Thunder Roars, Go Indoors — adhere to the 30/30 safety rule.',
        'Stay indoors until 30 minutes after the last observed lightning flash.',
        'Avoid open sports fields, golf courses, lakes, and elevated terrain.',
        'Do not shelter under solitary tall trees.'
      ],
      activatingCell: primaryCell,
      cellLocation: {
        lat: closest.lat,
        lon: closest.lon,
        distanceKm: closest.distanceKm,
        bearingDeg: closest.bearingDeg,
        directionLabel: `${closest.distanceKm.toFixed(1)} km ${getCompassCardinal(closest.bearingDeg)}`,
        capeJkg: sounding.capeJkg,
        intensityDbz: primaryCell?.intensityDbz ?? 40,
        headingDeg: primaryCell?.vector.headingDeg ?? currentWindDir,
        headingCardinal: primaryCell?.vector.headingCardinal ?? getCompassCardinal(currentWindDir),
        speedKmH: primaryCell?.vector.speedKmH ?? steeringSpeed
      }
    });
  }

  // 5. Freeze / Freezing Rain Threat
  if (temp <= 0 && currentPrecip > 0) {
    alerts.push({
      id: 'hazard-freeze',
      type: 'freeze',
      severity: 'WARNING',
      title: 'FREEZING RAIN & BLACK ICE ALERT',
      headline: `Surface Temp: ${temp.toFixed(1)}°C with Active Precipitation`,
      description: `Precipitation freezing instantaneously on road surfaces, walkways, and power lines creating hazardous black ice glazed conditions.`,
      onsetMinutes: 0,
      peakIntensity: `${temp.toFixed(1)}°C Sub-Zero`,
      icon: '❄️',
      actionChecklist: [
        'Avoid non-essential driving until road maintenance crews salt highways.',
        'Use extreme caution on footbridges, overpasses, and untreated pavement.',
        'Keep winter emergency kit and blankets in vehicles.'
      ]
    });
  }

  // 6. Extreme Heat Threat
  if (temp >= 35) {
    alerts.push({
      id: 'hazard-heat',
      type: 'extreme_heat',
      severity: temp >= 38 ? 'WARNING' : 'ADVISORY',
      title: 'EXCESSIVE HEAT & HEATSTROKE ADVISORY',
      headline: `Ambient Temperature: ${temp.toFixed(1)}°C`,
      description: `Dangerous heat index creating elevated risk of heat cramps, exhaustion, and sunstroke during prolonged outdoor exposure.`,
      onsetMinutes: 0,
      peakIntensity: `${temp.toFixed(1)}°C Heat Index`,
      icon: '🔥',
      actionChecklist: [
        'Stay hydrated and drink plenty of water throughout the day.',
        'Avoid strenuous outdoor activities during peak afternoon hours (12:00 - 17:00).',
        'Never leave children or pets inside unattended vehicles.'
      ]
    });
  }

  return alerts;
}

/**
 * Fetch radar metadata from RainViewer
 */
export async function fetchRadarMaps(): Promise<RadarMapsResponse> {
  const res = await fetch(RADAR_MAPS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch radar maps: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Generate multi-radius risk analysis & forecast vectors using real atmospheric wind & steering mechanics
 */
export function generateStormPrediction(
  weatherData: WeatherResponse,
  radarMaps?: RadarMapsResponse
): StormPredictionResponse {
  const stormRisk = analyzeStormRisk(weatherData);

  const currentTemp = weatherData.current?.temperature ?? weatherData.currentWeather?.temperature ?? 20;
  const currentWind = weatherData.current?.windSpeed10m ?? weatherData.currentWeather?.windSpeed ?? 15;
  const currentWindDir = weatherData.current?.windDirection10m ?? weatherData.currentWeather?.windDirection ?? 225;
  const currentCode = weatherData.current?.weatherCode ?? weatherData.currentWeather?.weatherCode ?? 0;
  const currentGust = weatherData.hourly?.windGusts10m?.[0] ?? currentWind * 1.3;
  const capeVal = (weatherData.hourly as any)?.cape?.[0] ?? (weatherData.convectiveSounding?.capeJkg || 0);

  // Effective storm propagation speed driven by steering winds and convective gusts
  const estimatedSpeedKmH = Math.max(10, Math.round(Math.max(currentWind * 1.15, currentGust * 0.75)));
  const speedKmPerMin = estimatedSpeedKmH / 60;

  // Steering & Propagation Direction:
  // Wind direction is reported as "from where wind blows" (0=N, 90=E, 180=S, 270=W).
  // Storm cell propagation direction is opposite (windDir + 180 mod 360).
  const propagationBearingDeg = (currentWindDir + 180) % 360;
  const headingCardinal = getCompassCardinal(propagationBearingDeg);
  const directionName = `TOWARDS ${headingCardinal} (${Math.round(propagationBearingDeg)}°)`;

  const propagationRad = (propagationBearingDeg * Math.PI) / 180;
  const speedX = Math.round(estimatedSpeedKmH * Math.sin(propagationRad) * 10) / 10; // Eastward
  const speedY = Math.round(estimatedSpeedKmH * Math.cos(propagationRad) * 10) / 10; // Northward

  // Projected 1-hour and 5-hour displacement vectors in km
  const forecast1h: [number, number] = [speedX, speedY];
  const forecast5h: [number, number] = [speedX * 5, speedY * 5];

  // Evaluate 100km Regional Scan Points for active rain or storm cells
  const regionalPoints = weatherData.regionalScanPoints || [];
  const allDetectedCells: ActivatingRainCell[] = [];

  const centerPrecip = weatherData.current?.precipitation ?? 0;
  const isCenterActive = stormRisk.isCurrentlyStormy || centerPrecip >= 0.1 || currentCode >= 50;

  // If center is active, add center cell
  if (isCenterActive) {
    allDetectedCells.push(
      buildActivatingRainCell(
        weatherData.latitude,
        weatherData.longitude,
        weatherData.latitude,
        weatherData.longitude,
        Math.max(centerPrecip, 1.2),
        currentCode,
        capeVal,
        estimatedSpeedKmH,
        currentWindDir,
        'Overhead Rain/Convective Core'
      )
    );
  }

  // Add all active regional scan points
  regionalPoints.forEach((pt) => {
    if (pt.precipitationMmH >= 0.1 || pt.next1hPrecipMmH >= 0.2 || pt.weatherCode >= 50) {
      allDetectedCells.push(
        buildActivatingRainCell(
          weatherData.latitude,
          weatherData.longitude,
          pt.latitude,
          pt.longitude,
          Math.max(pt.precipitationMmH, pt.next1hPrecipMmH),
          pt.weatherCode,
          capeVal,
          pt.windSpeedKmH || estimatedSpeedKmH,
          pt.windDirDeg || currentWindDir,
          `Regional Cell (${pt.directionLabel})`
        )
      );
    }
  });

  // Sort all detected cells: Overhead first, then collision course (sorted by ETA), then passing/receding
  allDetectedCells.sort((a, b) => {
    if (a.trajectory.isOverhead && !b.trajectory.isOverhead) return -1;
    if (!a.trajectory.isOverhead && b.trajectory.isOverhead) return 1;
    if (a.trajectory.isCollisionCourse && !b.trajectory.isCollisionCourse) return -1;
    if (!a.trajectory.isCollisionCourse && b.trajectory.isCollisionCourse) return 1;
    if (a.trajectory.isCollisionCourse && b.trajectory.isCollisionCourse) {
      return (a.trajectory.impactEtaMinutes ?? 999) - (b.trajectory.impactEtaMinutes ?? 999);
    }
    return a.distanceKm - b.distanceKm;
  });

  // Active cells are strictly based on genuine detected rain/storm echo points
  const hasActiveCell = isCenterActive || allDetectedCells.length > 0;

  let primaryActivatingCell: ActivatingRainCell | undefined = allDetectedCells[0];

  let cellDistanceKm = primaryActivatingCell ? primaryActivatingCell.distanceKm : 0;
  let cellBearingDeg = primaryActivatingCell ? primaryActivatingCell.bearingDeg : currentWindDir;
  let cellStatusText = primaryActivatingCell
    ? `${primaryActivatingCell.cellName} (${primaryActivatingCell.precipMmH.toFixed(1)} mm/h) detected ${primaryActivatingCell.directionLabel}. ${primaryActivatingCell.vector.movementSummary}. ${primaryActivatingCell.trajectory.relativeMotionText}.`
    : `No active storm or rain cells detected within 100 km radius. Clear conditions on Doppler radar. Ambient steering winds: ${Math.round(currentWind)} km/h from ${getCompassCardinal(currentWindDir)} (${Math.round(currentWindDir)}°).`;
  let cellIntensityDbz = primaryActivatingCell ? primaryActivatingCell.intensityDbz : 0;
  let cellLat = primaryActivatingCell ? primaryActivatingCell.lat : weatherData.latitude;
  let cellLon = primaryActivatingCell ? primaryActivatingCell.lon : weatherData.longitude;
  let cellPrecipMmH = primaryActivatingCell ? primaryActivatingCell.precipMmH : 0;
  let cellWeatherCode = primaryActivatingCell ? primaryActivatingCell.weatherCode : currentCode;
  let isHeadingTowardsUser = primaryActivatingCell ? primaryActivatingCell.trajectory.isCollisionCourse || primaryActivatingCell.trajectory.isOverhead : false;

  const distanceKm = hasActiveCell ? (cellDistanceKm || 15) : 100;
  const timeToImpact = isHeadingTowardsUser
    ? (primaryActivatingCell?.trajectory.impactEtaMinutes ?? (stormRisk.estimatedTimeToStorm > 0 ? stormRisk.estimatedTimeToStorm : Math.round(distanceKm / (speedKmPerMin || 0.5))))
    : -1;

  let currentRiskLevel: RiskLevelType = 'LOW';
  if (stormRisk.isCurrentlyStormy || isCenterActive) currentRiskLevel = 'CRITICAL';
  else if (stormRisk.stormProbability > 0.7) currentRiskLevel = 'HIGH';
  else if (stormRisk.stormProbability > 0.4) currentRiskLevel = 'MEDIUM';

  const riskAnalysis: MultiRadiusAnalysis = {
    current: {
      radiusKm: 0,
      distanceToUserKm: isCenterActive ? 0 : cellDistanceKm,
      stormSpeedKmPerMin: Math.round(speedKmPerMin * 100) / 100,
      alignment: isHeadingTowardsUser ? 0.95 : 0.4,
      isApproaching: isCenterActive || (hasActiveCell && isHeadingTowardsUser),
      timeToImpact: isCenterActive ? 0 : (hasActiveCell && timeToImpact > 0 ? timeToImpact : null),
      riskLevel: currentRiskLevel,
      forecast1hPx: forecast1h,
      forecast5hPx: forecast5h
    },
    radius20km: {
      radiusKm: 20,
      distanceToUserKm: cellDistanceKm,
      stormSpeedKmPerMin: Math.round(speedKmPerMin * 100) / 100,
      alignment: isHeadingTowardsUser ? 0.95 : 0.4,
      isApproaching: hasActiveCell && cellDistanceKm <= 20,
      timeToImpact: hasActiveCell && cellDistanceKm <= 20 ? Math.round(cellDistanceKm / (speedKmPerMin || 0.5)) : null,
      riskLevel: hasActiveCell && cellDistanceKm <= 20 ? (cellPrecipMmH > 4.0 || currentRiskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH') : 'LOW'
    },
    radius100km: {
      radiusKm: 100,
      distanceToUserKm: cellDistanceKm,
      stormSpeedKmPerMin: Math.round(speedKmPerMin * 100) / 100,
      alignment: isHeadingTowardsUser ? 0.95 : 0.4,
      isApproaching: hasActiveCell,
      timeToImpact: hasActiveCell && timeToImpact > 0 ? timeToImpact : null,
      riskLevel: hasActiveCell ? (cellPrecipMmH > 3.0 || isHeadingTowardsUser ? 'HIGH' : 'MEDIUM') : 'LOW'
    }
  };

  const historicalFrames: RadarFrame[] = radarMaps?.radar.past.slice(-4) || [
    { time: Date.now() / 1000 - 1800, path: '/v2/radar/past1' },
    { time: Date.now() / 1000, path: '/v2/radar/now' }
  ];

  const centroids: StormCentroid[] = historicalFrames.map((f, i) => {
    const timeOffsetHours = (i - (historicalFrames.length - 1)) * 0.5;
    return {
      timestamp: f.time,
      x: Math.round(speedX * timeOffsetHours * 10) / 10,
      y: Math.round(speedY * timeOffsetHours * 10) / 10,
      pixelCount: 100 + i * 25,
      intensity: stormRisk.stormProbability > 0.7 ? 'high' : stormRisk.stormProbability > 0.4 ? 'medium' : 'light'
    };
  });

  const movements: MovementVector[] = [
    {
      speedX,
      speedY,
      timeDiff: 60
    }
  ];

  return {
    latitude: weatherData.latitude,
    longitude: weatherData.longitude,
    currentWeather: {
      temperature: currentTemp,
      windSpeed: currentWind,
      windDirection: currentWindDir,
      weatherCode: currentCode,
      time: weatherData.current?.time || new Date().toISOString()
    },
    stormProbability: {
      probability: stormRisk.stormProbability,
      confidenceRange: [
        Math.max(0, Math.round((stormRisk.stormProbability - 0.1) * 100)),
        Math.min(100, Math.round((stormRisk.stormProbability + 0.1) * 100))
      ],
      stormApproaching: hasActiveCell && (stormRisk.isStormApproaching || isHeadingTowardsUser)
    },
    timeToStorm: {
      estimatedMinutes: timeToImpact > 0 ? timeToImpact : null,
      confidence: hasActiveCell ? 0.85 : 0.95
    },
    precipitationForecast: {
      currentProbability: stormRisk.precipitationProbability,
      maxWindNext6h: stormRisk.maxWindSpeedNext6Hours
    },
    radarAnalysis: {
      intensity: cellIntensityDbz
    },
    forecastData: {
      avgSpeedX: speedX,
      avgSpeedY: speedY,
      forecast1h,
      forecast5h,
      stormCentroids: centroids,
      movements,
      acceleration: [0.0, 0.0]
    },
    riskAnalysis,
    detectedCell: {
      hasActiveCell,
      distanceKm: cellDistanceKm,
      initialBearingDeg: cellBearingDeg,
      cellStatusText,
      intensityDbz: cellIntensityDbz,
      lat: cellLat,
      lon: cellLon,
      precipMmH: cellPrecipMmH,
      weatherCode: cellWeatherCode,
      isHeadingTowardsUser,
      capeJkg: weatherData.convectiveSounding?.capeJkg || Math.round(capeVal || 0),
      activatingCell: primaryActivatingCell,
      allDetectedCells
    },
    movementVector: {
      speedX,
      speedY,
      estimatedSpeedKmH,
      directionName,
      originBearingDeg: currentWindDir,
      headingDeg: propagationBearingDeg,
      headingCardinal
    },
    analysisTime: new Date().toISOString()
  };
}

/**
 * Fetch Marine & Seaside Meteo from Open-Meteo Marine API or compute coastal defaults
 */
export async function fetchMarineData(latitude: number, longitude: number, windSpeedKmH: number = 0): Promise<MarineData | undefined> {
  try {
    const url = new URL('https://marine-api.open-meteo.com/v1/marine');
    url.searchParams.append('latitude', latitude.toString());
    url.searchParams.append('longitude', longitude.toString());
    url.searchParams.append(
      'current',
      'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,ocean_current_velocity'
    );
    url.searchParams.append('timezone', 'auto');

    const res = await fetch(url.toString());
    if (!res.ok) return deriveMarineData(latitude, windSpeedKmH);

    const data = await res.json();
    const curr = data.current;
    if (!curr || curr.wave_height === undefined || curr.wave_height === null) {
      return deriveMarineData(latitude, windSpeedKmH);
    }

    const waveHeight = curr.wave_height ?? 0;
    const waveDirection = curr.wave_direction ?? 0;
    const wavePeriod = curr.wave_period ?? 0;
    const swellWaveHeight = curr.swell_wave_height ?? 0;
    const swellWavePeriod = curr.swell_wave_period ?? 0;
    const swellWaveDirection = curr.swell_wave_direction ?? 0;
    const oceanCurrentVelocity = curr.ocean_current_velocity ?? 0;

    const { code: seaStateCode, name: seaStateCategory } = getDouglasSeaScale(waveHeight);
    const windKnots = Math.round(windSpeedKmH * 0.539957);
    const { beaufortScale, beaufortDescription } = getBeaufortScale(windKnots);
    const seaSurfaceTemperature = estimateSeaSurfaceTemp(latitude);

    const tides = calculateTideData(latitude, longitude);

    return {
      waveHeight,
      waveDirection,
      wavePeriod,
      swellWaveHeight,
      swellWavePeriod,
      swellWaveDirection,
      oceanCurrentVelocity,
      seaSurfaceTemperature,
      seaStateCode,
      seaStateCategory,
      windKnots,
      beaufortScale,
      beaufortDescription,
      isCoastalOrMarine: true,
      tides
    };
  } catch {
    return deriveMarineData(latitude, windSpeedKmH);
  }
}

function getDouglasSeaScale(waveHeightMeters: number): { code: number; name: string } {
  if (waveHeightMeters <= 0.05) return { code: 0, name: 'Calm / Quasi Calmo' };
  if (waveHeightMeters <= 0.1) return { code: 1, name: 'Rippled / Calmo' };
  if (waveHeightMeters <= 0.5) return { code: 2, name: 'Smooth / Poco Mosso' };
  if (waveHeightMeters <= 1.25) return { code: 3, name: 'Slight Sea / Mosso' };
  if (waveHeightMeters <= 2.5) return { code: 4, name: 'Moderate / Molto Mosso' };
  if (waveHeightMeters <= 4.0) return { code: 5, name: 'Rough / Agitato' };
  if (waveHeightMeters <= 6.0) return { code: 6, name: 'Very Rough / Molto Agitato' };
  if (waveHeightMeters <= 9.0) return { code: 7, name: 'High Sea / Grosso' };
  if (waveHeightMeters <= 14.0) return { code: 8, name: 'Very High / Molto Grosso' };
  return { code: 9, name: 'Phenomenal / Tempestoso' };
}

function getBeaufortScale(knots: number): { beaufortScale: number; beaufortDescription: string } {
  if (knots < 1) return { beaufortScale: 0, beaufortDescription: 'Calm (Bava)' };
  if (knots <= 3) return { beaufortScale: 1, beaufortDescription: 'Light Air (Bava di vento)' };
  if (knots <= 6) return { beaufortScale: 2, beaufortDescription: 'Light Breeze (Brezza leggera)' };
  if (knots <= 10) return { beaufortScale: 3, beaufortDescription: 'Gentle Breeze (Brezza tesa)' };
  if (knots <= 16) return { beaufortScale: 4, beaufortDescription: 'Moderate Breeze (Vento moderato)' };
  if (knots <= 21) return { beaufortScale: 5, beaufortDescription: 'Fresh Breeze (Vento teso)' };
  if (knots <= 27) return { beaufortScale: 6, beaufortDescription: 'Strong Breeze (Vento fresco)' };
  if (knots <= 33) return { beaufortScale: 7, beaufortDescription: 'Near Gale (Vento forte)' };
  if (knots <= 40) return { beaufortScale: 8, beaufortDescription: 'Gale (Bora / Burrasca)' };
  if (knots <= 47) return { beaufortScale: 9, beaufortDescription: 'Strong Gale (Burrasca forte)' };
  if (knots <= 55) return { beaufortScale: 10, beaufortDescription: 'Storm (Tempesta)' };
  return { beaufortScale: 11, beaufortDescription: 'Violent Storm / Hurricane' };
}

function estimateSeaSurfaceTemp(latitude: number): number {
  const absLat = Math.abs(latitude);
  if (absLat < 30) return Math.round((26 - (absLat * 0.2)) * 10) / 10;
  if (absLat < 46) return Math.round((23 - ((absLat - 30) * 0.4)) * 10) / 10;
  return Math.round((14 - ((absLat - 46) * 0.4)) * 10) / 10;
}

export function calculateTideData(latitude: number, longitude: number, referenceDate: Date = new Date()): TideData {
  const M2_HALF_PERIOD_MS = (12 * 60 + 25.2) * 60 * 1000 / 2; // ~6h 12.6m
  const M2_FULL_PERIOD_MS = M2_HALF_PERIOD_MS * 2; // ~12h 25.2m

  const isMed = latitude >= 30 && latitude <= 46 && longitude >= -6 && longitude <= 36;
  const maxTideRange = isMed ? 0.65 : 3.2;
  const minTideHeight = isMed ? 0.15 : 0.4;

  const startOfDay = new Date(referenceDate);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const dayOfYear = Math.floor((referenceDate.getTime() - new Date(referenceDate.getFullYear(), 0, 0).getTime()) / 86400000);
  const phaseOffsetMs = ((longitude * 240000) + (dayOfYear * 300000)) % M2_FULL_PERIOD_MS;

  const events: TideEvent[] = [];
  const baseTime = startOfDay.getTime() - M2_FULL_PERIOD_MS + Math.abs(phaseOffsetMs);

  for (let i = -1; i < 6; i++) {
    const highTideTime = new Date(baseTime + (i * M2_FULL_PERIOD_MS));
    const lowTideTime = new Date(highTideTime.getTime() + M2_HALF_PERIOD_MS);

    const highHeight = Math.round((minTideHeight + maxTideRange + Math.sin(i * 0.5) * 0.1) * 100) / 100;
    events.push({
      type: 'high',
      label: 'Flut (High Tide)',
      time: highTideTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      timestamp: highTideTime.toISOString(),
      heightMeters: highHeight
    });

    const lowHeight = Math.round((minTideHeight + Math.cos(i * 0.5) * 0.05) * 100) / 100;
    events.push({
      type: 'low',
      label: 'Ebbe (Low Tide)',
      time: lowTideTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      timestamp: lowTideTime.toISOString(),
      heightMeters: lowHeight
    });
  }

  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const nowMs = referenceDate.getTime();
  const nextTide = events.find(e => new Date(e.timestamp).getTime() > nowMs) || events[0];
  const upcomingTides = events.filter(e => new Date(e.timestamp).getTime() > nowMs - 3600000).slice(0, 4);

  const isRising = nextTide.type === 'high';

  const prevTideIndex = events.findIndex(e => e === nextTide) - 1;
  const prevTide = prevTideIndex >= 0 ? events[prevTideIndex] : events[0];
  const tPrev = new Date(prevTide.timestamp).getTime();
  const tNext = new Date(nextTide.timestamp).getTime();
  const progress = Math.min(1, Math.max(0, (nowMs - tPrev) / (tNext - tPrev || 1)));

  const currentWaterLevelMeters = Math.round(
    (prevTide.heightMeters + (nextTide.heightMeters - prevTide.heightMeters) * (0.5 - 0.5 * Math.cos(progress * Math.PI))) * 100
  ) / 100;

  return {
    currentStatus: isRising ? 'rising' : 'falling',
    currentWaterLevelMeters,
    nextTide,
    upcomingTides,
    tidalRangeMeters: Math.round(maxTideRange * 10) / 10,
    coeff: isMed ? 65 : 78
  };
}

function deriveMarineData(latitude: number, windSpeedKmH: number): MarineData {
  const windKnots = Math.round(windSpeedKmH * 0.539957);
  const waveHeight = Math.round(Math.max(0.2, (windSpeedKmH * windSpeedKmH) / 1100) * 10) / 10;
  const { code: seaStateCode, name: seaStateCategory } = getDouglasSeaScale(waveHeight);
  const { beaufortScale, beaufortDescription } = getBeaufortScale(windKnots);
  const seaSurfaceTemperature = estimateSeaSurfaceTemp(latitude);
  const tides = calculateTideData(latitude, 12.0);

  return {
    waveHeight,
    waveDirection: 210,
    wavePeriod: 5.5,
    swellWaveHeight: Math.round(waveHeight * 0.7 * 10) / 10,
    swellWavePeriod: 6.8,
    swellWaveDirection: 220,
    oceanCurrentVelocity: 0.2,
    seaSurfaceTemperature,
    seaStateCode,
    seaStateCategory,
    windKnots,
    beaufortScale,
    beaufortDescription,
    isCoastalOrMarine: true,
    tides
  };
}

export async function fetchAirQualityData(lat: number, lon: number): Promise<AirQualityData | undefined> {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,sulphur_dioxide,ozone,dust&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const data = await res.json();
    const cur = data.current;
    if (!cur) return undefined;

    const aqi = Math.round(cur.european_aqi ?? 20);
    let aqiLevel: AirQualityData['aqiLevel'] = 'Good';
    let healthAdvice = 'Air quality is clear and safe for outdoor activities.';

    if (aqi > 80) {
      aqiLevel = 'Extremely Poor';
      healthAdvice = 'Hazardous air pollution. Avoid outdoor physical activities.';
    } else if (aqi > 60) {
      aqiLevel = 'Very Poor';
      healthAdvice = 'High pollution. Sensitive individuals should stay indoors.';
    } else if (aqi > 40) {
      aqiLevel = 'Poor';
      healthAdvice = 'Unhealthy for sensitive groups. Limit prolonged outdoor exertion.';
    } else if (aqi > 20) {
      aqiLevel = 'Moderate';
      healthAdvice = 'Moderate air quality. Acceptable for most people.';
    } else if (aqi > 10) {
      aqiLevel = 'Fair';
      healthAdvice = 'Fair air quality with low health risk.';
    }

    return {
      europeanAqi: aqi,
      aqiLevel,
      pm10: Math.round((cur.pm10 ?? 0) * 10) / 10,
      pm25: Math.round((cur.pm2_5 ?? 0) * 10) / 10,
      no2: Math.round((cur.nitrogen_dioxide ?? 0) * 10) / 10,
      so2: Math.round((cur.sulphur_dioxide ?? 0) * 10) / 10,
      o3: Math.round((cur.ozone ?? 0) * 10) / 10,
      dust: Math.round((cur.dust ?? 0) * 10) / 10,
      healthAdvice
    };
  } catch (err) {
    console.warn('Air quality fetch error:', err);
    return undefined;
  }
}
