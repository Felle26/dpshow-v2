'use client';

import React from 'react';

interface ScreensaverProps {
  onActivity: () => void;
}

interface ForecastDay {
  date: string;
  temperatureMaxC: number;
  temperatureMinC: number;
  weatherCode: number;
  weatherText: string;
}

interface WeatherData {
  source: string;
  location: string;
  temperatureC: number;
  windKmh: number;
  weatherCode: number;
  weatherText: string;
  updatedAt: string;
  forecast: ForecastDay[];
}

interface NewsItem {
  title: string;
  link: string;
  publishedAt: string;
  imageUrl: string;
}

interface NewsData {
  source: string;
  updatedAt: string;
  items: NewsItem[];
}

interface SportsResult {
  homeTeam: string;
  awayTeam: string;
  homeLogoUrl: string;
  awayLogoUrl: string;
  score: string;
}

interface SportsTableRow {
  position: number;
  team: string;
  teamLogoUrl: string;
  points: number;
  goalDiff: number;
}

interface SportsTopMatch {
  homeTeam: string;
  awayTeam: string;
  homeLogoUrl: string;
  awayLogoUrl: string;
  matchTime: string;
}

interface SportsLeague {
  key: string;
  name: string;
  results: SportsResult[];
  table: SportsTableRow[];
  topMatch: SportsTopMatch | null;
}

interface SportsData {
  source: string;
  season: number;
  switchMinutes: number;
  updatedAt: string;
  leagues: SportsLeague[];
}

function getDayPartLabel(hour: number): string {
  if (hour >= 5 && hour <= 10) {
    return 'Morgens';
  }

  if (hour >= 11 && hour <= 13) {
    return 'Mittags';
  }

  if (hour >= 14 && hour <= 17) {
    return 'Nachmittags';
  }

  if (hour >= 18 && hour <= 22) {
    return 'Abends';
  }

  return 'Nachts';
}

function getWeatherIcon(weatherCode: number): string {
  if (weatherCode === 0 || weatherCode === 1) {
    return '☀️';
  }

  if (weatherCode === 2 || weatherCode === 3) {
    return '⛅';
  }

  if (weatherCode === 45 || weatherCode === 48) {
    return '🌫️';
  }

  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) {
    return '🌧️';
  }

  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
    return '🌨️';
  }

  if ([95, 96, 99].includes(weatherCode)) {
    return '⛈️';
  }

  return '🌤️';
}

function TeamLogo({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = React.useState(false);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        className="h-5 w-5 rounded-sm object-contain bg-white/90 shrink-0"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-white/20 text-xs">🏷️</span>;
}

export function Screensaver({ onActivity }: ScreensaverProps) {
  const [now, setNow] = React.useState(() => new Date());
  const [weatherData, setWeatherData] = React.useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = React.useState(true);
  const [newsData, setNewsData] = React.useState<NewsData | null>(null);
  const [newsLoading, setNewsLoading] = React.useState(true);
  const [sportsData, setSportsData] = React.useState<SportsData | null>(null);
  const [sportsLoading, setSportsLoading] = React.useState(true);
  const [activeSportsTab, setActiveSportsTab] = React.useState(0);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  React.useEffect(() => {
    let ignore = false;

    const loadSports = async () => {
      try {
        if (!ignore) {
          setSportsLoading(true);
        }

        const response = await fetch('/api/sports', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Fehler beim Laden der Sportdaten');
        }

        const data = (await response.json()) as SportsData;
        if (!ignore) {
          setSportsData(data);
          setActiveSportsTab((prev) => (data.leagues.length > 0 ? prev % data.leagues.length : 0));
        }
      } catch {
        if (!ignore) {
          setSportsData(null);
        }
      } finally {
        if (!ignore) {
          setSportsLoading(false);
        }
      }
    };

    loadSports();
    const intervalId = window.setInterval(loadSports, 60 * 60 * 1000);

    return () => {
      ignore = true;
      window.clearInterval(intervalId);
    };
  }, []);

  React.useEffect(() => {
    if (!sportsData || sportsData.leagues.length === 0) {
      return;
    }

    const switchMs = Math.max(1, sportsData.switchMinutes) * 60 * 1000;
    const switchIntervalId = window.setInterval(() => {
      setActiveSportsTab((prev) => (prev + 1) % sportsData.leagues.length);
    }, switchMs);

    return () => {
      window.clearInterval(switchIntervalId);
    };
  }, [sportsData]);

  React.useEffect(() => {
    const handleActivity = () => {
      onActivity();
    };

    window.addEventListener('click', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
    };
  }, [onActivity]);

  React.useEffect(() => {
    let ignore = false;

    const loadWeather = async () => {
      try {
        if (!ignore) {
          setWeatherLoading(true);
        }

        const response = await fetch('/api/weather', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Fehler beim Laden der Wetterdaten');
        }

        const data = (await response.json()) as WeatherData;
        if (!ignore) {
          setWeatherData(data);
        }
      } catch {
        if (!ignore) {
          setWeatherData(null);
        }
      } finally {
        if (!ignore) {
          setWeatherLoading(false);
        }
      }
    };

    loadWeather();
    const intervalId = window.setInterval(loadWeather, 60 * 60 * 1000);

    return () => {
      ignore = true;
      window.clearInterval(intervalId);
    };
  }, []);

  React.useEffect(() => {
    let ignore = false;

    const loadNews = async () => {
      try {
        if (!ignore) {
          setNewsLoading(true);
        }

        const response = await fetch('/api/news', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Fehler beim Laden der News');
        }

        const data = (await response.json()) as NewsData;
        if (!ignore) {
          setNewsData(data);
        }
      } catch {
        if (!ignore) {
          setNewsData(null);
        }
      } finally {
        if (!ignore) {
          setNewsLoading(false);
        }
      }
    };

    loadNews();
    const intervalId = window.setInterval(loadNews, 60 * 60 * 1000);

    return () => {
      ignore = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const timeText = now.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const dateText = now.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const dayPartLabel = getDayPartLabel(now.getHours());
  const forecastDays = weatherData?.forecast ?? [];
  const sportsLeagues = sportsData?.leagues ?? [];
  const activeLeague = sportsLeagues[activeSportsTab] ?? null;

  return (
    <div className="fixed inset-0 bg-black overflow-hidden z-50">
      {/* Animated gradient background */}
      <div className="absolute inset-0 opacity-80 animated-bg" />

      {/* Animated circles */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000" />
        <div className="absolute -bottom-1/2 left-1/3 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000" />
      </div>

      {/* Quartered layout */}
      <div className="relative z-10 grid h-full w-full grid-cols-2 grid-rows-2">
        {/* 1. Feld: Uhrzeit, Datum und Tageszeit */}
        <section className="border border-white/10 p-8 flex flex-col items-center justify-center text-center">
          <p className="text-sm tracking-[0.2em] uppercase text-cyan-200/80 mb-4">Aktuelle Zeit</p>
          <p className="text-6xl md:text-7xl font-bold text-white leading-none mb-4">{timeText}</p>
          <p className="text-lg md:text-xl text-slate-200 mb-2 capitalize">{dateText}</p>
          <span className="inline-flex w-fit rounded-full border border-cyan-300/40 bg-cyan-400/10 px-4 py-1 text-cyan-100 text-base font-semibold">
            {dayPartLabel}
          </span>
        </section>

        {/* 2. Feld */}
        <section className="border border-white/10 p-8 flex flex-col items-center justify-center text-center">
          <p className="text-sm tracking-[0.2em] uppercase text-orange-200/80 mb-4">Wetterbericht</p>
          {weatherLoading ? (
            <p className="text-slate-300/80 text-lg">Wetter wird geladen...</p>
          ) : weatherData ? (
            <>
              <p className="text-5xl mb-1">{getWeatherIcon(weatherData.weatherCode)}</p>
              <p className="text-5xl md:text-6xl font-bold text-white leading-none mb-2">
                {Math.round(weatherData.temperatureC)}°C
              </p>
              <p className="text-lg md:text-xl text-slate-200 mb-2">{weatherData.weatherText}</p>
              <p className="text-base text-slate-300 mb-1">Wind: {Math.round(weatherData.windKmh)} km/h</p>
              <p className="text-sm text-slate-400 mb-4">Ort: {weatherData.location}</p>

              {forecastDays.length > 0 && (
                <div className="w-full max-w-md grid grid-cols-3 gap-2 mb-4">
                  {forecastDays.map((day) => (
                    <div
                      key={day.date}
                      className="rounded-lg border border-white/15 bg-black/20 px-2 py-2"
                    >
                      <p className="text-lg leading-none mb-1">{getWeatherIcon(day.weatherCode)}</p>
                      <p className="text-xs text-slate-300 font-semibold">
                        {new Date(day.date).toLocaleDateString('de-DE', { weekday: 'short' })}
                      </p>
                      <p className="text-xs text-slate-400 leading-tight mb-1">{day.weatherText}</p>
                      <p className="text-sm text-white font-semibold">
                        {Math.round(day.temperatureMaxC)}° / {Math.round(day.temperatureMinC)}°
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-slate-500">Quelle: {weatherData.source}</p>
            </>
          ) : (
            <p className="text-slate-300/80 text-lg">Wetterdaten aktuell nicht verfügbar</p>
          )}
        </section>

        {/* 3. Feld */}
        <section className="border border-white/10 p-8 flex flex-col">
          <p className="text-sm tracking-[0.2em] uppercase text-violet-200/80 mb-4 text-center">Newsfeed</p>
          {newsLoading ? (
            <p className="text-slate-300/80 text-lg text-center my-auto">Nachrichten werden geladen...</p>
          ) : newsData && newsData.items.length > 0 ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-hidden rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="h-full space-y-3 overflow-y-auto pr-1">
                  {newsData.items.slice(0, 4).map((item) => (
                    <article
                      key={item.link || item.title}
                      className="rounded-lg border border-white/15 bg-black/30 p-3 flex gap-3 items-start"
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt="Newsbild"
                          className="h-20 w-28 shrink-0 rounded-md object-cover border border-white/20"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-20 w-28 shrink-0 rounded-md border border-white/20 bg-white/5 flex items-center justify-center text-2xl">
                          📰
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="text-base md:text-lg text-slate-100 leading-snug font-semibold line-clamp-3">
                          {item.title}
                        </p>
                        {item.publishedAt && (
                          <p className="text-xs text-slate-400 mt-1">
                            {new Date(item.publishedAt).toLocaleString('de-DE')}
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3 text-center">Quelle: {newsData.source}</p>
            </div>
          ) : (
            <p className="text-slate-300/80 text-lg text-center my-auto">Newsfeed aktuell nicht verfügbar</p>
          )}
        </section>

        {/* 4. Feld */}
        <section className="border border-white/10 p-8 flex flex-col min-h-0">
          <p className="text-sm tracking-[0.2em] uppercase text-emerald-200/80 mb-3 text-center">Sport</p>

          {sportsLoading ? (
            <p className="text-slate-300/80 text-lg text-center my-auto">Sportdaten werden geladen...</p>
          ) : activeLeague ? (
            <>
              <div className="flex gap-2 justify-center mb-3 flex-wrap">
                {sportsLeagues.map((league, idx) => (
                  <button
                    key={league.key}
                    onClick={() => setActiveSportsTab(idx)}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                      idx === activeSportsTab
                        ? 'bg-emerald-500/30 border-emerald-300 text-emerald-100'
                        : 'bg-black/20 border-white/20 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {league.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 flex-1 min-h-0">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 min-h-0 overflow-hidden">
                  {activeLeague.topMatch && (
                    <div className="mb-3 rounded-lg border border-emerald-300/25 bg-emerald-500/10 px-2 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-emerald-200 mb-1">Nächstes Top-Spiel</p>
                      <div className="flex items-center justify-between gap-1 text-xs text-slate-100">
                        <div className="flex items-center gap-1 min-w-0">
                          <TeamLogo src={activeLeague.topMatch.homeLogoUrl} alt={activeLeague.topMatch.homeTeam} />
                          <span className="truncate">{activeLeague.topMatch.homeTeam}</span>
                        </div>
                        <span className="text-slate-400">vs</span>
                        <div className="flex items-center gap-1 min-w-0">
                          <TeamLogo src={activeLeague.topMatch.awayLogoUrl} alt={activeLeague.topMatch.awayTeam} />
                          <span className="truncate">{activeLeague.topMatch.awayTeam}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-300 mt-1">
                        {new Date(activeLeague.topMatch.matchTime).toLocaleString('de-DE')}
                      </p>
                    </div>
                  )}

                  <p className="text-xs uppercase tracking-wide text-slate-300 mb-2">Ergebnisse</p>
                  <ul className="space-y-1 text-xs text-slate-100 max-h-60 overflow-hidden pr-1">
                    {activeLeague.results.slice(0, 5).map((match, idx) => (
                      <li key={`${match.homeTeam}-${match.awayTeam}-${idx}`} className="flex justify-between gap-2 items-center">
                        <span className="truncate flex items-center gap-1">
                          <TeamLogo src={match.homeLogoUrl} alt={match.homeTeam} />
                          <span className="truncate">{match.homeTeam}</span>
                          <span className="text-slate-400">-</span>
                          <TeamLogo src={match.awayLogoUrl} alt={match.awayTeam} />
                          <span className="truncate">{match.awayTeam}</span>
                        </span>
                        <span className="shrink-0 font-semibold">{match.score}</span>
                      </li>
                    ))}
                    {activeLeague.results.length === 0 && (
                      <li className="text-slate-400">Keine Ergebnisse verfügbar</li>
                    )}
                  </ul>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/20 p-3 min-h-0 overflow-hidden flex-1">
                  <p className="text-xs uppercase tracking-wide text-slate-300 mb-2">Tabelle</p>
                  <ul className="space-y-0.5 text-[10px] text-slate-100 max-h-full overflow-y-auto pr-1">
                    {activeLeague.table.map((row) => (
                      <li key={`${row.position}-${row.team}`} className="grid grid-cols-[1.2rem_1fr_1.8rem] gap-0.5">
                        <span className="text-slate-400 text-right">{row.position}.</span>
                        <span className="truncate flex items-center gap-0.5">
                          <TeamLogo src={row.teamLogoUrl} alt={row.team} />
                          <span className="truncate">{row.team}</span>
                        </span>
                        <span className="text-right font-semibold">{row.points}</span>
                      </li>
                    ))}
                    {activeLeague.table.length === 0 && (
                      <li className="text-slate-400">Keine Tabelle verfügbar</li>
                    )}
                  </ul>
                </div>
              </div>

              <p className="text-xs text-slate-500 mt-3 text-center">
                Quelle: {sportsData?.source} | Wechsel: alle {sportsData?.switchMinutes} min
              </p>
            </>
          ) : (
            <p className="text-slate-300/80 text-lg text-center my-auto">Sportdaten aktuell nicht verfügbar</p>
          )}
        </section>

        {/* Animated dots */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex justify-center gap-3 mt-8">
          <div className="w-3 h-3 bg-white rounded-full animate-bounce" />
          <div className="w-3 h-3 bg-white rounded-full animate-bounce animation-delay-200" />
          <div className="w-3 h-3 bg-white rounded-full animate-bounce animation-delay-400" />
        </div>
      </div>

      <style jsx>{`
        @keyframes blob {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }

        .animate-blob {
          animation: blob 7s infinite;
        }

        .animated-bg {
          background: linear-gradient(135deg, #0f172a, #6d28d9, #0f172a, #312e81, #000000);
          background-size: 300% 300%;
          animation: backgroundShift 150s ease-in-out infinite;
        }

        @keyframes backgroundShift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        .animation-delay-2000 {
          animation-delay: 2s;
        }

        .animation-delay-4000 {
          animation-delay: 4s;
        }

        .animation-delay-200 {
          animation-delay: 0.2s;
        }

        .animation-delay-400 {
          animation-delay: 0.4s;
        }
      `}</style>
    </div>
  );
}
