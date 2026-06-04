import { promises as fs } from 'fs';
import path from 'path';

const CONFIG_FILE = path.join(process.cwd(), 'data', 'screensaver-config.json');

interface ScreensaverConfig {
  timeoutMinutes: number;
  weatherLocationName: string;
  weatherLatitude: number;
  weatherLongitude: number;
  sportsSwitchMinutes: number;
  showQuickLinkEnabled: boolean;
  showQuickLinkUrl: string;
}

const DEFAULT_CONFIG: ScreensaverConfig = {
  timeoutMinutes: 5,
  weatherLocationName: 'Deutschland',
  weatherLatitude: 51.1657,
  weatherLongitude: 10.4515,
  sportsSwitchMinutes: 5,
  showQuickLinkEnabled: false,
  showQuickLinkUrl: '',
};

function normalizeQuickLinkUrl(value: unknown): string {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!input) {
    return '';
  }

  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }

    return parsed.toString();
  } catch {
    return '';
  }
}

async function getConfig(): Promise<ScreensaverConfig> {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(data) as Partial<ScreensaverConfig>;

    return {
      timeoutMinutes:
        Number.isFinite(parsed.timeoutMinutes) && parsed.timeoutMinutes! >= 1 && parsed.timeoutMinutes! <= 60
          ? Math.round(parsed.timeoutMinutes!)
          : DEFAULT_CONFIG.timeoutMinutes,
      weatherLocationName:
        typeof parsed.weatherLocationName === 'string' && parsed.weatherLocationName.trim().length > 0
          ? parsed.weatherLocationName.trim().slice(0, 80)
          : DEFAULT_CONFIG.weatherLocationName,
      weatherLatitude:
        Number.isFinite(parsed.weatherLatitude) && parsed.weatherLatitude! >= -90 && parsed.weatherLatitude! <= 90
          ? Number(parsed.weatherLatitude)
          : DEFAULT_CONFIG.weatherLatitude,
      weatherLongitude:
        Number.isFinite(parsed.weatherLongitude) && parsed.weatherLongitude! >= -180 && parsed.weatherLongitude! <= 180
          ? Number(parsed.weatherLongitude)
          : DEFAULT_CONFIG.weatherLongitude,
      sportsSwitchMinutes:
        Number.isFinite(parsed.sportsSwitchMinutes) && parsed.sportsSwitchMinutes! >= 1 && parsed.sportsSwitchMinutes! <= 60
          ? Math.round(parsed.sportsSwitchMinutes!)
          : DEFAULT_CONFIG.sportsSwitchMinutes,
      showQuickLinkEnabled:
        typeof parsed.showQuickLinkEnabled === 'boolean'
          ? parsed.showQuickLinkEnabled
          : DEFAULT_CONFIG.showQuickLinkEnabled,
      showQuickLinkUrl:
        normalizeQuickLinkUrl(parsed.showQuickLinkUrl) || DEFAULT_CONFIG.showQuickLinkUrl,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function saveConfig(config: ScreensaverConfig): Promise<void> {
  const dir = path.dirname(CONFIG_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function geocodeLocation(locationName: string): Promise<{ latitude: number; longitude: number } | null> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', locationName);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'de');
  url.searchParams.set('format', 'json');

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const firstResult = Array.isArray(data.results) ? data.results[0] : null;

  if (
    !firstResult ||
    !Number.isFinite(firstResult.latitude) ||
    !Number.isFinite(firstResult.longitude)
  ) {
    return null;
  }

  return {
    latitude: Number(firstResult.latitude),
    longitude: Number(firstResult.longitude),
  };
}

export async function GET() {
  try {
    const config = await getConfig();
    return Response.json(config);
  } catch (error) {
    console.error('Fehler beim Laden der Screensaver-Konfiguration:', error);
    return Response.json(DEFAULT_CONFIG);
  }
}

export async function POST(request: Request) {
  try {
    const currentConfig = await getConfig();
    const body = await request.json();
    const timeoutMinutes = Number(body.timeoutMinutes);
    const weatherLocationName =
      typeof body.weatherLocationName === 'string'
        ? body.weatherLocationName.trim().slice(0, 80)
        : currentConfig.weatherLocationName;
    const sportsSwitchMinutes = Number(body.sportsSwitchMinutes ?? currentConfig.sportsSwitchMinutes);
    const showQuickLinkEnabled = Boolean(body.showQuickLinkEnabled);
    const showQuickLinkUrlRaw =
      typeof body.showQuickLinkUrl === 'string'
        ? body.showQuickLinkUrl
        : currentConfig.showQuickLinkUrl;
    const showQuickLinkUrl = normalizeQuickLinkUrl(showQuickLinkUrlRaw);

    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 60) {
      return Response.json(
        { error: 'timeoutMinutes muss zwischen 1 und 60 liegen' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(sportsSwitchMinutes) || sportsSwitchMinutes < 1 || sportsSwitchMinutes > 60) {
      return Response.json(
        { error: 'sportsSwitchMinutes muss zwischen 1 und 60 liegen' },
        { status: 400 }
      );
    }

    if (showQuickLinkEnabled && !showQuickLinkUrl) {
      return Response.json(
        { error: 'showQuickLinkUrl muss eine gueltige http(s)-URL sein, wenn die Funktion aktiviert ist.' },
        { status: 400 }
      );
    }

    const resolvedLocationName =
      weatherLocationName.length > 0 ? weatherLocationName : currentConfig.weatherLocationName;

    const geocoded = await geocodeLocation(resolvedLocationName);
    if (!geocoded) {
      return Response.json(
        { error: 'Ort konnte nicht geocodiert werden. Bitte Ortsnamen prüfen.' },
        { status: 400 }
      );
    }

    const config: ScreensaverConfig = {
      timeoutMinutes: Math.round(timeoutMinutes),
      weatherLocationName: resolvedLocationName,
      weatherLatitude: geocoded.latitude,
      weatherLongitude: geocoded.longitude,
      sportsSwitchMinutes: Math.round(sportsSwitchMinutes),
      showQuickLinkEnabled,
      showQuickLinkUrl,
    };

    await saveConfig(config);
    return Response.json(config);
  } catch (error) {
    console.error('Fehler beim Speichern der Screensaver-Konfiguration:', error);
    return Response.json({ error: 'Fehler beim Speichern' }, { status: 500 });
  }
}
