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
  CloudTrajectoryAnalysis
} from '../types';
import { getWeatherCondition } from '../utils/weatherUtils';
import { analyzeCloudTrajectory } from './cloudTrajectoryAnalyzer';

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';
const RAINVIEWER_BASE = 'https://api.rainviewer.com/public/weather-maps.json';
const STORM_API_BASE = 'https://storm-n3iw.onrender.com/api/v2/storm/predict';

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
    'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,snow_depth,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,evapotranspiration,wind_speed_10m,wind_speed_80m,wind_direction_10m,wind_direction_80m,wind_gusts_10m,uv_index'
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
      uvIndex: data.hourly.uv_index
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

  // Regional scan points within 100km check
  const regionalPoints = weatherData.regionalScanPoints || [];
  const activeRegional = regionalPoints.filter((pt) => pt.precipitationMmH >= 0.1 || pt.weatherCode >= 50);
  const maxRegionalPrecip = activeRegional.length > 0 ? Math.max(...activeRegional.map((p) => p.precipitationMmH)) : 0;

  const isStormApproaching =
    isCurrentlyStormy ||
    highPrecipHours >= 2 ||
    (moderatePrecipHours >= 3 && maxWindSpeed > 40) ||
    maxWindSpeed > 60 ||
    maxGustSpeed > 75 ||
    currentPrecipitation > 5.0 ||
    maxRegionalPrecip >= 0.2;

  let stormProbability = 0.2;
  if (isCurrentlyStormy) stormProbability = 1.0;
  else if (highPrecipHours >= 3) stormProbability = 0.9;
  else if (highPrecipHours >= 2) stormProbability = 0.8;
  else if (moderatePrecipHours >= 3 && maxWindSpeed > 40) stormProbability = 0.7;
  else if (maxWindSpeed > 60 || maxGustSpeed > 80) stormProbability = 0.65;
  else if (currentPrecipitation > 5.0) stormProbability = 0.55;
  else if (maxRegionalPrecip >= 1.0) stormProbability = 0.50;
  else if (maxRegionalPrecip >= 0.1) stormProbability = 0.38;

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
    }
  };
}

/**
 * Fetch radar metadata from RainViewer
 */
export async function fetchRadarMaps(): Promise<RadarMapsResponse> {
  const res = await fetch(RAINVIEWER_BASE);
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

  // Meteorological Propagation Bearing:
  // Wind direction is reported as "from where wind blows" (0=N, 90=E, 180=S, 270=W).
  // Storm cell propagation direction is opposite (windDir + 180 mod 360).
  const propagationBearingDeg = (currentWindDir + 180) % 360;
  const propagationRad = (propagationBearingDeg * Math.PI) / 180;

  // Effective storm propagation speed driven by steering winds and convective gusts
  const estimatedSpeedKmH = Math.max(10, Math.round(Math.max(currentWind * 1.15, currentGust * 0.75)));
  const speedKmPerMin = estimatedSpeedKmH / 60;

  // Velocity components (km/h)
  const speedX = Math.round(estimatedSpeedKmH * Math.sin(propagationRad) * 10) / 10; // Eastward
  const speedY = Math.round(estimatedSpeedKmH * Math.cos(propagationRad) * 10) / 10; // Northward

  // Cardinal direction name where storm is heading TOWARDS
  let directionName = 'North-East';
  if (propagationBearingDeg >= 337.5 || propagationBearingDeg < 22.5) directionName = 'North';
  else if (propagationBearingDeg >= 22.5 && propagationBearingDeg < 67.5) directionName = 'North-East';
  else if (propagationBearingDeg >= 67.5 && propagationBearingDeg < 112.5) directionName = 'East';
  else if (propagationBearingDeg >= 112.5 && propagationBearingDeg < 157.5) directionName = 'South-East';
  else if (propagationBearingDeg >= 157.5 && propagationBearingDeg < 202.5) directionName = 'South';
  else if (propagationBearingDeg >= 202.5 && propagationBearingDeg < 247.5) directionName = 'South-West';
  else if (propagationBearingDeg >= 247.5 && propagationBearingDeg < 292.5) directionName = 'West';
  else if (propagationBearingDeg >= 292.5 && propagationBearingDeg < 337.5) directionName = 'North-West';

  // Projected 1-hour and 5-hour displacement vectors in km
  const forecast1h: [number, number] = [speedX, speedY];
  const forecast5h: [number, number] = [speedX * 5, speedY * 5];

  // Calculate projected storm centroids based on historical and forecast trajectory
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

  const hourlyPrecip = weatherData.hourly?.precipitation?.slice(0, 4) || [];
  const maxNextPrecip = hourlyPrecip.length > 0 ? Math.max(...hourlyPrecip) : 0;
  const capeVal = (weatherData.hourly as any)?.cape?.[0] ?? 0;

  // Evaluate 100km Regional Scan Points for active rain or storm cells
  const regionalPoints = weatherData.regionalScanPoints || [];
  const activeRegional = regionalPoints.filter(
    (pt) => pt.precipitationMmH >= 0.1 || pt.next1hPrecipMmH >= 0.2 || pt.weatherCode >= 50
  );

  let detectedCellPt: (typeof regionalPoints)[0] | null = null;
  if (activeRegional.length > 0) {
    // Sort by heaviest precipitation rate, then closest distance
    activeRegional.sort((a, b) => b.precipitationMmH - a.precipitationMmH || a.distanceKm - b.distanceKm);
    detectedCellPt = activeRegional[0];
  }

  const centerPrecip = weatherData.current?.precipitation ?? 0;
  const isCenterActive = stormRisk.isCurrentlyStormy || centerPrecip >= 0.1 || currentCode >= 50;

  const hasActiveCell =
    isCenterActive ||
    detectedCellPt !== null ||
    stormRisk.isStormApproaching ||
    stormRisk.stormProbability >= 0.35 ||
    maxNextPrecip >= 0.3 ||
    (capeVal >= 400 && currentGust >= 35);

  let cellDistanceKm = 0;
  let cellBearingDeg = currentWindDir;
  let cellStatusText = '';
  let cellIntensityDbz = 0;
  let cellLat = weatherData.latitude;
  let cellLon = weatherData.longitude;
  let cellPrecipMmH = centerPrecip;
  let cellWeatherCode = currentCode;
  let isHeadingTowardsUser = false;

  if (hasActiveCell) {
    if (isCenterActive) {
      cellDistanceKm = 0;
      cellLat = weatherData.latitude;
      cellLon = weatherData.longitude;
      cellPrecipMmH = Math.max(centerPrecip, maxNextPrecip);
      cellWeatherCode = currentCode;
      cellStatusText = `Active rain/storm cell directly overhead. Winds at ${Math.round(currentWind)} km/h moving towards ${directionName}.`;
      cellIntensityDbz = Math.min(55, Math.max(30, Math.round(cellPrecipMmH * 10 + 30)));
      isHeadingTowardsUser = true;
    } else if (detectedCellPt) {
      cellDistanceKm = Math.round(detectedCellPt.distanceKm);
      cellLat = detectedCellPt.latitude;
      cellLon = detectedCellPt.longitude;
      cellBearingDeg = detectedCellPt.bearingDeg;
      cellPrecipMmH = detectedCellPt.precipitationMmH || detectedCellPt.next1hPrecipMmH;
      cellWeatherCode = detectedCellPt.weatherCode;

      // Steering wind at cell location
      const cellWindDir = detectedCellPt.windDirDeg || currentWindDir;
      const cellWindSpeed = detectedCellPt.windSpeedKmH || estimatedSpeedKmH;

      // Propagation heading of cell = cellWindDir + 180 mod 360
      const cellPropHeading = (cellWindDir + 180) % 360;
      // Bearing from cell TO user location = (cellBearingDeg + 180) % 360
      const bearingToUser = (cellBearingDeg + 180) % 360;
      let angleDiff = Math.abs(cellPropHeading - bearingToUser);
      if (angleDiff > 180) angleDiff = 360 - angleDiff;

      isHeadingTowardsUser = angleDiff <= 65;

      const cellDirLabel = detectedCellPt.directionLabel || `${cellDistanceKm}km`;
      cellStatusText = `Active rain cell (${cellPrecipMmH.toFixed(1)} mm/h) detected ~${cellDistanceKm} km away (${cellDirLabel}). ${
        isHeadingTowardsUser ? 'Heading TOWARDS your sector' : 'Moving parallel/away'
      } at ${Math.round(cellWindSpeed)} km/h.`;
      cellIntensityDbz = Math.min(55, Math.max(20, Math.round(cellPrecipMmH * 8 + 20)));
    } else {
      cellDistanceKm = Math.min(85, Math.max(20, Math.round(60 - stormRisk.stormProbability * 40)));
      const upwindBearing = (currentWindDir + 180) % 360;
      const upwindDest = getDestinationPoint(weatherData.latitude, weatherData.longitude, cellDistanceKm, upwindBearing);
      cellLat = upwindDest.lat;
      cellLon = upwindDest.lon;
      cellBearingDeg = upwindBearing;
      cellStatusText = `Convective cell detected ~${cellDistanceKm} km upwind, moving towards ${directionName} at ${estimatedSpeedKmH} km/h.`;
      cellIntensityDbz = Math.round(maxNextPrecip * 5 + 18);
      isHeadingTowardsUser = true;
    }
  } else {
    cellDistanceKm = 0;
    cellStatusText = `No active storm or rain cells detected within 100 km radius. Ambient steering winds: ${Math.round(currentWind)} km/h blowing towards ${directionName}.`;
    cellIntensityDbz = 0;
  }

  const distanceKm = hasActiveCell ? (cellDistanceKm || 15) : 100;
  const timeToImpact = hasActiveCell
    ? (stormRisk.estimatedTimeToStorm > 0 ? stormRisk.estimatedTimeToStorm : Math.round(distanceKm / (speedKmPerMin || 0.5)))
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
      isHeadingTowardsUser
    },
    movementVector: {
      speedX,
      speedY,
      estimatedSpeedKmH,
      directionName
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
