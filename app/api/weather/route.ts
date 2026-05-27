import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DEFAULT_LATITUDE = 51.1657;
const DEFAULT_LONGITUDE = 10.4515;
const DEFAULT_LOCATION_NAME = 'Deutschland';
const CONFIG_FILE = path.join(process.cwd(), 'data', 'screensaver-config.json');

interface ScreensaverConfig {
  weatherLocationName: string;
  weatherLatitude: number;
  weatherLongitude: number;
}

interface ForecastDay {
  date: string;
  temperatureMaxC: number;
  temperatureMinC: number;
  weatherCode: number;
  weatherText: string;
}

const WEATHER_CODE_LABELS: Record<number, string> = {
  0: 'Klar',
  1: 'Überwiegend klar',
  2: 'Teilweise bewölkt',
  3: 'Bedeckt',
  45: 'Nebel',
  48: 'Raureifnebel',
  51: 'Leichter Nieselregen',
  53: 'Nieselregen',
  55: 'Starker Nieselregen',
  56: 'Leichter gefrierender Nieselregen',
  57: 'Gefrierender Nieselregen',
  61: 'Leichter Regen',
  63: 'Regen',
  65: 'Starker Regen',
  66: 'Leichter gefrierender Regen',
  67: 'Gefrierender Regen',
  71: 'Leichter Schneefall',
  73: 'Schneefall',
  75: 'Starker Schneefall',
  77: 'Schneegriesel',
  80: 'Leichte Regenschauer',
  81: 'Regenschauer',
  82: 'Starke Regenschauer',
  85: 'Leichte Schneeschauer',
  86: 'Starke Schneeschauer',
  95: 'Gewitter',
  96: 'Gewitter mit leichtem Hagel',
  99: 'Gewitter mit Hagel',
};

async function getWeatherConfig(): Promise<ScreensaverConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ScreensaverConfig>;

    return {
      weatherLocationName:
        typeof parsed.weatherLocationName === 'string' && parsed.weatherLocationName.trim().length > 0
          ? parsed.weatherLocationName.trim().slice(0, 80)
          : DEFAULT_LOCATION_NAME,
      weatherLatitude:
        Number.isFinite(parsed.weatherLatitude) && parsed.weatherLatitude! >= -90 && parsed.weatherLatitude! <= 90
          ? Number(parsed.weatherLatitude)
          : DEFAULT_LATITUDE,
      weatherLongitude:
        Number.isFinite(parsed.weatherLongitude) && parsed.weatherLongitude! >= -180 && parsed.weatherLongitude! <= 180
          ? Number(parsed.weatherLongitude)
          : DEFAULT_LONGITUDE,
    };
  } catch {
    return {
      weatherLocationName: DEFAULT_LOCATION_NAME,
      weatherLatitude: DEFAULT_LATITUDE,
      weatherLongitude: DEFAULT_LONGITUDE,
    };
  }
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 Minuten

let cachedWeather: { data: object; expiresAt: number } | null = null;

export async function GET() {
  try {
    if (cachedWeather && Date.now() < cachedWeather.expiresAt) {
      return NextResponse.json(cachedWeather.data);
    }

    const weatherConfig = await getWeatherConfig();

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(weatherConfig.weatherLatitude));
    url.searchParams.set('longitude', String(weatherConfig.weatherLongitude));
    url.searchParams.set('current', 'temperature_2m,weather_code,wind_speed_10m');
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
    url.searchParams.set('forecast_days', '3');
    url.searchParams.set('timezone', 'Europe/Berlin');
    url.searchParams.set('models', 'dwd_icon');

    const response = await fetch(url.toString(), {
      cache: 'no-store',
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      throw new Error(`Wetterdienst antwortete mit Status ${response.status}`);
    }

    const data = await response.json();
    const current = data.current ?? {};
    const daily = data.daily ?? {};
    const weatherCode = Number(current.weather_code ?? -1);

    const forecast: ForecastDay[] = Array.from({ length: 3 }, (_, idx) => {
      const dayWeatherCode = Number(daily.weather_code?.[idx] ?? -1);

      return {
        date: String(daily.time?.[idx] ?? ''),
        temperatureMaxC: Number(daily.temperature_2m_max?.[idx] ?? 0),
        temperatureMinC: Number(daily.temperature_2m_min?.[idx] ?? 0),
        weatherCode: dayWeatherCode,
        weatherText: WEATHER_CODE_LABELS[dayWeatherCode] ?? 'Unbekannt',
      };
    }).filter((day) => day.date.length > 0);

    const payload = {
      source: 'DWD ICON via Open-Meteo',
      location: weatherConfig.weatherLocationName,
      temperatureC: Number(current.temperature_2m ?? 0),
      windKmh: Number(current.wind_speed_10m ?? 0),
      weatherCode,
      weatherText: WEATHER_CODE_LABELS[weatherCode] ?? 'Unbekannt',
      updatedAt: current.time ?? new Date().toISOString(),
      forecast,
    };

    cachedWeather = { data: payload, expiresAt: Date.now() + CACHE_TTL_MS };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Fehler beim Laden der Wetterdaten:', error);

    return NextResponse.json(
      {
        error: 'Wetterdaten konnten nicht geladen werden',
      },
      { status: 500 }
    );
  }
}
