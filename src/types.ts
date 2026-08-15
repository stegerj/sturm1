export interface CurrentWeatherData {
  temperature: number;
  relativeHumidity: number;
  apparentTemperature: number;
  isDay: number;
  precipitation: number;
  rain: number;
  showers: number;
  snowfall: number;
  weatherCode: number;
  cloudCover: number;
  cloudCoverLow?: number;
  cloudCoverMid?: number;
  cloudCoverHigh?: number;
  pressureMsl: number;
  surfacePressure: number;
  windSpeed10m: number;
  windDirection10m: number;
  time: string;
}

export interface CurrentWeather {
  temperature: number;
  windSpeed: number;
  windDirection: number;
  weatherCode: number;
  time: string;
}

export interface HourlyData {
  time: string[];
  temperature?: number[];
  relativeHumidity?: number[];
  dewPoint?: number[];
  apparentTemperature?: number[];
  precipitationProbability?: number[];
  precipitation?: number[];
  rain?: number[];
  showers?: number[];
  snowfall?: number[];
  snowDepth?: number[];
  weatherCode?: number[];
  cloudCover?: number[];
  cloudCoverLow?: number[];
  cloudCoverMid?: number[];
  cloudCoverHigh?: number[];
  visibility?: number[];
  evapotranspiration?: number[];
  windSpeed10m?: number[];
  windSpeed80m?: number[];
  windDirection10m?: number[];
  windDirection80m?: number[];
  windGusts10m?: number[];
  uvIndex?: number[];
  cape?: number[];
  liftedIndex?: number[];
}

export interface DailyData {
  time: string[];
  weatherCode: number[];
  temperatureMax: number[];
  temperatureMin: number[];
  apparentTemperatureMax?: number[];
  apparentTemperatureMin?: number[];
  sunrise?: string[];
  sunset?: string[];
  moonrise?: string[];
  moonset?: string[];
  moonPhase?: number[];
  daylightDuration?: number[];
  sunshineDuration?: number[];
  uvIndexMax?: number[];
  uvIndexClearSkyMax?: number[];
  precipitationSum?: number[];
  rainSum?: number[];
  showersSum?: number[];
  snowfallSum?: number[];
  precipitationHours?: number[];
  precipitationProbabilityMax?: number[];
  windSpeedMax?: number[];
  windGustsMax?: number[];
  windDirectionDominant?: number[];
}

export interface TideEvent {
  type: 'high' | 'low';
  label: string;
  time: string;
  timestamp: string;
  heightMeters: number;
}

export interface TideData {
  currentStatus: 'rising' | 'falling'; // Auflaufend vs Ablaufend
  currentWaterLevelMeters: number;
  nextTide: TideEvent;
  upcomingTides: TideEvent[];
  tidalRangeMeters: number;
  coeff?: number;
}

export interface MarineData {
  waveHeight?: number; // meters e.g. 1.2
  waveDirection?: number; // degrees
  wavePeriod?: number; // seconds
  swellWaveHeight?: number; // meters
  swellWavePeriod?: number; // seconds
  swellWaveDirection?: number; // degrees
  oceanCurrentVelocity?: number; // m/s
  seaSurfaceTemperature?: number; // °C
  seaStateCategory?: string; // Douglas scale text e.g. "Mosso (Slight Sea)"
  seaStateCode?: number; // 0 - 9
  windKnots?: number;
  beaufortScale?: number;
  beaufortDescription?: string;
  isCoastalOrMarine?: boolean;
  tides?: TideData;
}

export interface RegionalScanPoint {
  latitude: number;
  longitude: number;
  distanceKm: number;
  bearingDeg: number;
  directionLabel: string;
  precipitationMmH: number;
  weatherCode: number;
  windSpeedKmH: number;
  windDirDeg: number;
  next1hPrecipMmH: number;
}

export interface AirQualityData {
  europeanAqi: number;
  aqiLevel: 'Good' | 'Fair' | 'Moderate' | 'Poor' | 'Very Poor' | 'Extremely Poor';
  pm10: number;
  pm25: number;
  no2: number;
  so2: number;
  o3: number;
  dust: number;
  healthAdvice: string;
}

export interface CloudTrajectoryStep {
  timeOffsetMin: number; // e.g. 15, 30, 45, 60, 90, 120, 180 (+15m to +3h)
  timestamp: number;
  projectedDistanceKm: number;
  lat: number;
  lon: number;
  cloudCoveragePct: number;
  rainProbabilityPct: number;
  estimatedPrecipMmH: number;
  intensity: 'Clear' | 'Light' | 'Moderate' | 'Heavy' | 'Severe';
  description: string;
}

export interface CloudTrajectoryAnalysis {
  sampledFramesCount: number;
  timeSpanMinutes: number; // e.g. 120 minutes of sampled historical radar frames
  velocityKmH: number;
  speedMinKmH: number;
  speedMaxKmH: number;
  bearingDeg: number; // 0 - 360
  directionCardinal: string; // e.g. "SW → NE (45°)"
  growthTrend: 'Expanding' | 'Stable' | 'Dissipating';
  growthRatePct: number; // e.g. +12% / hr
  confidenceScore: number; // 0 - 100%
  originDistanceKm: number;
  projectedTimeline: CloudTrajectoryStep[];
  extrapolatedTrackPoints: Array<{
    lat: number;
    lon: number;
    timeOffsetMin: number;
    label: string;
    cloudCoverPct: number;
    precipProbabilityPct: number;
  }>;
  summaryHeadline: string;
  detailedAnalysis: string;
}

export interface WeatherResponse {
  latitude: number;
  longitude: number;
  elevation?: number;
  current?: CurrentWeatherData;
  currentWeather?: CurrentWeather;
  hourly?: HourlyData;
  daily?: DailyData;
  marine?: MarineData;
  airQuality?: AirQualityData;
  cloudTrajectory?: CloudTrajectoryAnalysis;
  locationName?: string;
  regionalScanPoints?: RegionalScanPoint[];
  minutePrecipitation?: MinutePrecipitationPoint[];
  convectiveSounding?: ConvectiveSounding;
  lightningStrikes?: LightningStrike[];
  activeHazards?: HazardAlert[];
}

export interface WeatherCondition {
  code: number;
  description: string;
  isStormy: boolean;
  category: 'clear' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunderstorm';
}

export interface RiskFactor {
  score: number; // 0 - 100
  level: RiskLevelType;
  label: string;
  value: string;
  description: string;
}

export interface RiskFactorsBreakdown {
  wind: RiskFactor;
  precipitation: RiskFactor;
  lightning: RiskFactor;
  barometricPressure: RiskFactor;
  visibility: RiskFactor;
  capeInstability?: RiskFactor;
}

export interface HourlyRiskPoint {
  timeStr: string;
  riskScore: number;
  precipProb: number;
  windSpeed: number;
  windGust: number;
  riskLevel: RiskLevelType;
  weatherCode: number;
  cape?: number;
}

export interface StormRisk {
  isCurrentlyStormy: boolean;
  isStormApproaching: boolean;
  stormProbability: number;
  estimatedTimeToStorm: number; // minutes, -1 if none
  currentCondition: string;
  windSpeed: number;
  precipitationProbability: number;
  currentPrecipitation: number;
  maxWindSpeedNext6Hours: number;
  // Enhanced Risk Fields
  overallRiskScore: number; // 0 - 100
  severityCategory: 'Low' | 'Moderate' | 'High' | 'Severe' | 'Extreme';
  riskFactors?: RiskFactorsBreakdown;
  safetyAdvice?: string[];
  hourlyRiskTimeline?: HourlyRiskPoint[];
  maxGustSpeedNext6Hours?: number;
  surfacePressure?: number;
  pressureTrend?: 'Rapid Drop' | 'Slight Fall' | 'Steady' | 'Rising';
  capeJkg?: number;
  capeLevel?: 'Stable' | 'Moderate' | 'High Instability' | 'Severe Convective';
  convectiveSounding?: ConvectiveSounding;
  activeHazards?: HazardAlert[];
}

export interface StormProbability {
  probability: number;
  confidenceRange: number[];
  stormApproaching: boolean;
}

export interface TimeToStorm {
  estimatedMinutes: number | null;
  confidence: number;
}

export interface PrecipitationForecast {
  currentProbability: number;
  maxWindNext6h: number;
}

export interface RadarAnalysis {
  intensity: number;
}

export interface StormCentroid {
  timestamp: number;
  x: number;
  y: number;
  pixelCount: number;
  intensity?: 'high' | 'medium' | 'light' | 'unknown';
}

export interface MovementVector {
  speedX: number;
  speedY: number;
  timeDiff: number;
}

export interface ForecastData {
  avgSpeedX: number;
  avgSpeedY: number;
  forecast1h: [number, number];
  forecast5h: [number, number];
  stormCentroids: StormCentroid[];
  movements: MovementVector[];
  acceleration: [number, number];
}

export type RiskLevelType = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface RiskAnalysis {
  radiusKm: number;
  distanceToUserKm: number;
  stormSpeedKmPerMin: number;
  alignment: number;
  isApproaching: boolean;
  timeToImpact: number | null;
  riskLevel: RiskLevelType;
  forecast1hPx?: [number, number];
  forecast5hPx?: [number, number];
}

export interface MultiRadiusAnalysis {
  current: RiskAnalysis;
  radius20km: RiskAnalysis;
  radius100km: RiskAnalysis;
}

export interface RadarFrame {
  time: number;
  path: string;
}

export interface RadarMapsResponse {
  version: string;
  generated: number;
  host: string;
  radar: {
    past: RadarFrame[];
    now: RadarFrame | null;
    future: RadarFrame[];
  };
  satellite?: {
    infrared: RadarFrame[];
  };
}

export interface RainCellVector {
  originBearingDeg: number; // e.g. 225° (FROM where it is blowing)
  originCardinal: string; // e.g. "SW"
  headingDeg: number; // e.g. 45° (TOWARDS where it is moving)
  headingCardinal: string; // e.g. "NE"
  speedKmH: number; // e.g. 35 km/h
  speedX: number; // Eastward velocity in km/h
  speedY: number; // Northward velocity in km/h
  movementSummary: string; // "Moving FROM SW (225°) TOWARDS NE (45°) at 35 km/h"
}

export interface RainCellTrajectory {
  isCollisionCourse: boolean;
  isOverhead: boolean;
  isMovingAway: boolean;
  missDistanceKm: number; // Minimum distance to user along current track
  impactEtaMinutes: number | null; // ETA in minutes if approaching
  relativeMotionText: string; // Human readable description of track vs user
}

export interface ActivatingRainCell {
  cellId: string;
  cellName: string;
  lat: number;
  lon: number;
  distanceKm: number;
  bearingDeg: number;
  directionLabel: string; // e.g. "28 km SW"
  precipMmH: number;
  intensityDbz: number;
  capeJkg: number;
  weatherCode: number;
  vector: RainCellVector;
  trajectory: RainCellTrajectory;
}

export interface StormCellDetails {
  hasActiveCell: boolean;
  distanceKm: number;
  initialBearingDeg: number;
  cellStatusText: string;
  intensityDbz: number; // e.g. 15-55 dBZ reflectivity
  cellOriginName?: string;
  lat?: number;
  lon?: number;
  precipMmH?: number;
  weatherCode?: number;
  isHeadingTowardsUser?: boolean;
  capeJkg?: number;
  activatingCell?: ActivatingRainCell;
  allDetectedCells?: ActivatingRainCell[];
}

export interface StormPredictionResponse {
  latitude: number;
  longitude: number;
  currentWeather: CurrentWeather;
  stormProbability: StormProbability;
  timeToStorm: TimeToStorm;
  precipitationForecast: PrecipitationForecast;
  radarAnalysis: RadarAnalysis;
  forecastData?: ForecastData;
  riskAnalysis?: MultiRadiusAnalysis;
  radarImage?: string;
  analysisTime: string;
  detectedCell?: StormCellDetails;
  movementVector?: {
    speedX: number;
    speedY: number;
    estimatedSpeedKmH: number;
    directionName: string;
    originBearingDeg?: number;
    headingDeg?: number;
    headingCardinal?: string;
  };
}

export type OverlayMode = 'map' | 'radar' | 'arrows' | 'all';

export interface HazardAlert {
  id: string;
  type: 'convective_storm' | 'tornado_rotation' | 'gale_wind' | 'flash_flood' | 'lightning_strike' | 'hail' | 'freeze' | 'extreme_heat';
  severity: 'ADVISORY' | 'WATCH' | 'WARNING' | 'EMERGENCY';
  title: string;
  headline: string;
  description: string;
  onsetMinutes: number;
  peakIntensity: string;
  icon: string;
  actionChecklist: string[];
  activatingCell?: ActivatingRainCell;
  cellLocation?: {
    lat: number;
    lon: number;
    distanceKm: number;
    bearingDeg: number;
    directionLabel?: string;
    capeJkg?: number;
    intensityDbz?: number;
    headingDeg?: number;
    headingCardinal?: string;
    speedKmH?: number;
  };
}

export interface LightningStrike {
  id: string;
  lat: number;
  lon: number;
  timestamp: number;
  ageMinutes: number;
  distanceKm: number;
  bearingDeg: number;
  polarity: '+' | '-';
  currentKa: number;
}

export interface ConvectiveSounding {
  capeJkg: number;
  cinJkg: number;
  liftedIndex: number;
  kIndex: number;
  bulkShear06kmMs: number;
  freezingLevelMeters: number;
  dewPointDepressionC: number;
  convectiveRiskCategory: 'None' | 'Marginal' | 'Slight' | 'Enhanced' | 'Moderate' | 'High';
}

export interface MinutePrecipitationPoint {
  minute: number;
  timeStr: string;
  intensityMmH: number;
  probability: number;
  category: 'none' | 'light' | 'moderate' | 'heavy' | 'torrential';
}

export interface SavedBookmarkLocation {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  isHome?: boolean;
  lastRiskScore?: number;
  lastRiskCategory?: string;
}

export interface AppSettings {
  enableAlerts: boolean;
  alertThreshold: number; // 0 - 100
  checkInterval: number; // minutes: 5, 10, 15, 30, 60
  serviceRunning: boolean;
  lastCheckedTime?: string;
  selectedCity?: string;
  language?: 'auto' | 'de' | 'en' | 'it' | 'es' | 'fr';
  enableAudioSiren?: boolean;
  sirenVolume?: number;
  sirenTone?: 'eas_emergency' | 'pulsing_siren' | 'marine_horn' | 'radar_chime';
  enableWebNotifications?: boolean;
  enableVibration?: boolean;
  savedLocations?: SavedBookmarkLocation[];
}

export interface CityLocation {
  name: string;
  country: string;
  lat: number;
  lon: number;
}
