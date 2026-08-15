import { WeatherCondition, CityLocation } from '../types';
import { SupportedLanguage, getDeviceLanguage } from './i18n';

const conditionMap: Record<number, { category: WeatherCondition['category']; isStormy: boolean; labels: Record<SupportedLanguage, string> }> = {
  0: { category: 'clear', isStormy: false, labels: { en: 'Clear sky', de: 'Klarer Himmel', it: 'Cielo sereno', es: 'Cielo despejado', fr: 'Ciel dégagé' } },
  1: { category: 'clear', isStormy: false, labels: { en: 'Mainly clear', de: 'Überwiegend klar', it: 'Prevalentemente sereno', es: 'Mayormente despejado', fr: 'Ensoleillé' } },
  2: { category: 'cloudy', isStormy: false, labels: { en: 'Partly cloudy', de: 'Teils bewölkt', it: 'Parzialmente nuvoloso', es: 'Parcialmente nublado', fr: 'Partiellement nuageux' } },
  3: { category: 'cloudy', isStormy: false, labels: { en: 'Overcast', de: 'Bedeckt', it: 'Coperto', es: 'Nublado', fr: 'Couvert' } },
  45: { category: 'fog', isStormy: false, labels: { en: 'Foggy', de: 'Nebel', it: 'Nebbia', es: 'Niebla', fr: 'Brouillard' } },
  48: { category: 'fog', isStormy: false, labels: { en: 'Depositing rime fog', de: 'Rauhreifnebel', it: 'Nebbia con brina', es: 'Niebla helada', fr: 'Brouillard givrant' } },
  51: { category: 'drizzle', isStormy: false, labels: { en: 'Light drizzle', de: 'Leichter Sprühregen', it: 'Pioviggina leggera', es: 'Llovizna ligera', fr: 'Bruine légère' } },
  53: { category: 'drizzle', isStormy: false, labels: { en: 'Moderate drizzle', de: 'Mäßiger Sprühregen', it: 'Pioviggina moderata', es: 'Llovizna moderada', fr: 'Bruine modérée' } },
  55: { category: 'drizzle', isStormy: false, labels: { en: 'Dense drizzle', de: 'Starker Sprühregen', it: 'Pioviggina fitta', es: 'Llovizna intensa', fr: 'Bruine dense' } },
  56: { category: 'drizzle', isStormy: false, labels: { en: 'Freezing drizzle', de: 'Gefrierender Sprühregen', it: 'Pioviggina gelata', es: 'Llovizna helada', fr: 'Bruine verglaçante' } },
  57: { category: 'drizzle', isStormy: false, labels: { en: 'Dense freezing drizzle', de: 'Starker gefrierender Sprühregen', it: 'Pioviggina gelata fitta', es: 'Llovizna helada intensa', fr: 'Bruine verglaçante dense' } },
  61: { category: 'rain', isStormy: false, labels: { en: 'Slight rain', de: 'Leichter Regen', it: 'Pioggia leggera', es: 'Lluvia ligera', fr: 'Pluie faible' } },
  63: { category: 'rain', isStormy: false, labels: { en: 'Moderate rain', de: 'Mäßiger Regen', it: 'Pioggia moderata', es: 'Lluvia moderada', fr: 'Pluie modérée' } },
  65: { category: 'rain', isStormy: false, labels: { en: 'Heavy rain', de: 'Starker Regen', it: 'Pioggia forte', es: 'Lluvia fuerte', fr: 'Pluie forte' } },
  66: { category: 'rain', isStormy: false, labels: { en: 'Freezing rain', de: 'Gefrierender Regen', it: 'Pioggia gelata', es: 'Lluvia helada', fr: 'Pluie verglaçante' } },
  67: { category: 'rain', isStormy: false, labels: { en: 'Heavy freezing rain', de: 'Starker gefrierender Regen', it: 'Pioggia gelata forte', es: 'Lluvia helada fuerte', fr: 'Pluie verglaçante forte' } },
  71: { category: 'snow', isStormy: false, labels: { en: 'Slight snow', de: 'Leichter Schneefall', it: 'Neve leggera', es: 'Nieve ligera', fr: 'Neige faible' } },
  73: { category: 'snow', isStormy: false, labels: { en: 'Moderate snow', de: 'Mäßiger Schneefall', it: 'Neve moderata', es: 'Nieve moderada', fr: 'Neige modérée' } },
  75: { category: 'snow', isStormy: false, labels: { en: 'Heavy snow', de: 'Starker Schneefall', it: 'Neve forte', es: 'Nieve fuerte', fr: 'Neige forte' } },
  77: { category: 'snow', isStormy: false, labels: { en: 'Snow grains', de: 'Schneegriesel', it: 'Neve a granelli', es: 'Cencellada', fr: 'Neige en grains' } },
  80: { category: 'rain', isStormy: false, labels: { en: 'Slight rain showers', de: 'Leichte Regenschauer', it: 'Rovesci di pioggia leggeri', es: 'Chubascos ligeros', fr: 'Averses faibles' } },
  81: { category: 'rain', isStormy: false, labels: { en: 'Moderate rain showers', de: 'Mäßige Regenschauer', it: 'Rovesci di pioggia moderati', es: 'Chubascos moderados', fr: 'Averses modérées' } },
  82: { category: 'rain', isStormy: false, labels: { en: 'Violent rain showers', de: 'Starke Regenschauer', it: 'Rovesci di pioggia violenti', es: 'Chubascos violentos', fr: 'Averses violentes' } },
  85: { category: 'snow', isStormy: false, labels: { en: 'Slight snow showers', de: 'Leichte Schneeschauer', it: 'Rovesci di neve leggeri', es: 'Chubascos de nieve ligeros', fr: 'Averses de neige faibles' } },
  86: { category: 'snow', isStormy: false, labels: { en: 'Heavy snow showers', de: 'Starke Schneeschauer', it: 'Rovesci di neve forti', es: 'Chubascos de nieve fuertes', fr: 'Averses de neige fortes' } },
  95: { category: 'thunderstorm', isStormy: true, labels: { en: 'Thunderstorm', de: 'Gewitter', it: 'Temporale', es: 'Tormenta', fr: 'Orage' } },
  96: { category: 'thunderstorm', isStormy: true, labels: { en: 'Thunderstorm with hail', de: 'Gewitter mit Hagel', it: 'Temporale con grandine', es: 'Tormenta con granizo', fr: 'Orage avec grêle' } },
  99: { category: 'thunderstorm', isStormy: true, labels: { en: 'Heavy thunderstorm with hail', de: 'Schweres Gewitter mit Hagel', it: 'Forte temporale con grandine', es: 'Tormenta fuerte con granizo', fr: 'Fort orage avec grêle' } }
};

export function getWeatherCondition(code: number, lang?: SupportedLanguage): WeatherCondition {
  const language = lang || getDeviceLanguage();
  const cond = conditionMap[code];
  if (cond) {
    return {
      code,
      description: cond.labels[language] || cond.labels.en,
      isStormy: cond.isStormy,
      category: cond.category
    };
  }
  return { code, description: language === 'de' ? 'Unbekannt' : 'Unknown', isStormy: false, category: 'cloudy' };
}

/**
 * Convert Latitude/Longitude to OpenStreetMap / RainViewer Tile Coordinates (x, y)
 */
export function latLonToTileCoords(latitude: number, longitude: number, zoom: number = 7): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((longitude + 180) / 360) * n);
  const latRad = (latitude * Math.PI) / 180;
  const asinhTanLat = Math.log(Math.tan(latRad) + Math.sqrt(Math.tan(latRad) * Math.tan(latRad) + 1));
  const y = Math.floor(((1 - asinhTanLat / Math.PI) / 2) * n);
  return { x, y };
}

/**
 * Convert Tile Coordinates back to Latitude/Longitude
 */
export function tileCoordsToLatLon(x: number, y: number, zoom: number = 7): { lat: number; lon: number } {
  const n = Math.pow(2, zoom);
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lon };
}

export const POPULAR_CITIES: CityLocation[] = [
  { name: 'Rome', country: 'Italy', lat: 41.9028, lon: 12.4964 },
  { name: 'Milan', country: 'Italy', lat: 45.4642, lon: 9.1900 },
  { name: 'Naples', country: 'Italy', lat: 40.8518, lon: 14.2681 },
  { name: 'Turin', country: 'Italy', lat: 45.0703, lon: 7.6869 },
  { name: 'Palermo', country: 'Italy', lat: 38.1157, lon: 13.3615 },
  { name: 'Genoa', country: 'Italy', lat: 44.4056, lon: 8.9463 },
  { name: 'Bologna', country: 'Italy', lat: 44.4949, lon: 11.3426 },
  { name: 'Florence', country: 'Italy', lat: 43.7696, lon: 11.2558 },
  { name: 'Venice', country: 'Italy', lat: 45.4408, lon: 12.3155 },
  { name: 'Catania', country: 'Italy', lat: 37.5079, lon: 15.0830 },
  { name: 'Oslo', country: 'Norway', lat: 59.9139, lon: 10.7522 },
  { name: 'Bergen', country: 'Norway', lat: 60.3913, lon: 5.3221 },
  { name: 'London', country: 'UK', lat: 51.5074, lon: -0.1278 },
  { name: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522 },
  { name: 'Berlin', country: 'Germany', lat: 52.5200, lon: 13.4050 },
  { name: 'Madrid', country: 'Spain', lat: 40.4168, lon: -3.7038 },
  { name: 'New York', country: 'USA', lat: 40.7128, lon: -74.0060 },
  { name: 'Miami', country: 'USA', lat: 25.7617, lon: -80.1918 },
  { name: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503 },
  { name: 'Sydney', country: 'Australia', lat: -33.8688, lon: 151.2093 }
];

export function formatTime(isoString: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return isoString.slice(11, 16);
  }
}

export function formatDate(dateString: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

export interface MoonInfo {
  name: string;
  icon: string;
  illumination: number;
  phaseValue: number;
}

export function getMoonPhaseDetails(phase: number = 0): MoonInfo {
  const p = Math.max(0, Math.min(1, Number.isNaN(phase) ? 0 : phase));
  let name = 'New Moon';
  let icon = '🌑';
  let illumination = 0;

  if (p < 0.03 || p > 0.97) {
    name = 'New Moon';
    icon = '🌑';
    illumination = 0;
  } else if (p < 0.22) {
    name = 'Waxing Crescent';
    icon = '🌒';
    illumination = Math.round(p * 200);
  } else if (p <= 0.28) {
    name = 'First Quarter';
    icon = '🌓';
    illumination = 50;
  } else if (p < 0.47) {
    name = 'Waxing Gibbous';
    icon = '🌔';
    illumination = Math.round(50 + (p - 0.25) * 200);
  } else if (p <= 0.53) {
    name = 'Full Moon';
    icon = '🌕';
    illumination = 100;
  } else if (p < 0.72) {
    name = 'Waning Gibbous';
    icon = '🌖';
    illumination = Math.round(100 - (p - 0.5) * 200);
  } else if (p <= 0.78) {
    name = 'Third Quarter';
    icon = '🌗';
    illumination = 50;
  } else {
    name = 'Waning Crescent';
    icon = '🌘';
    illumination = Math.round((1 - p) * 200);
  }

  illumination = Math.max(0, Math.min(100, illumination));

  return { name, icon, illumination, phaseValue: p };
}

export function formatDurationSeconds(seconds: number = 0): string {
  if (!seconds || seconds <= 0) return 'N/A';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}
