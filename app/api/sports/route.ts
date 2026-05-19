import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const CONFIG_FILE = path.join(process.cwd(), 'data', 'screensaver-config.json');

interface ConfigShape {
  sportsSwitchMinutes?: number;
}

interface LeagueDefinition {
  key: string;
  name: string;
}

interface LeagueResult {
  homeTeam: string;
  awayTeam: string;
  homeLogoUrl: string;
  awayLogoUrl: string;
  score: string;
}

interface LeagueTableRow {
  position: number;
  team: string;
  teamLogoUrl: string;
  points: number;
  goalDiff: number;
}

interface LeagueTopMatch {
  homeTeam: string;
  awayTeam: string;
  homeLogoUrl: string;
  awayLogoUrl: string;
  matchTime: string;
}

interface LeaguePayload {
  key: string;
  name: string;
  results: LeagueResult[];
  table: LeagueTableRow[];
  topMatch: LeagueTopMatch | null;
}

const LEAGUES: LeagueDefinition[] = [
  { key: 'bl1', name: '1. Bundesliga' },
  { key: 'bl2', name: '2. Bundesliga' },
  { key: 'del', name: 'Eishockey (DEL)' },
  { key: 'del2', name: 'Eishockey (DEL2)' },
];

function getSeasonForLeague(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  return month < 7 ? year - 1 : year;
}

async function getSportsSwitchMinutes(): Promise<number> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as ConfigShape;
    if (
      Number.isFinite(parsed.sportsSwitchMinutes) &&
      (parsed.sportsSwitchMinutes as number) >= 1 &&
      (parsed.sportsSwitchMinutes as number) <= 60
    ) {
      return Math.round(parsed.sportsSwitchMinutes as number);
    }
  } catch {
    // ignore and use fallback
  }

  return 5;
}

function normalizeTeamName(teamObj: unknown): string {
  const obj = (teamObj ?? {}) as Record<string, unknown>;
  return String(obj.teamName ?? obj.TeamName ?? obj.shortName ?? obj.ShortName ?? 'Team');
}

function normalizeTeamLogo(teamObj: unknown): string {
  const obj = (teamObj ?? {}) as Record<string, unknown>;
  const raw = obj.teamIconUrl ?? obj.TeamIconUrl;
  return typeof raw === 'string' ? raw : '';
}

function extractFinalScore(match: Record<string, unknown>): string {
  const results = Array.isArray(match.matchResults)
    ? match.matchResults
    : Array.isArray(match.MatchResults)
      ? match.MatchResults
      : [];
  if (results.length === 0) {
    return '-:-';
  }

  const finalResult = results[results.length - 1] as Record<string, unknown>;
  const home = Number(finalResult.pointsTeam1 ?? finalResult.PointsTeam1 ?? 0);
  const away = Number(finalResult.pointsTeam2 ?? finalResult.PointsTeam2 ?? 0);

  return `${home}:${away}`;
}

async function fetchLeagueData(league: LeagueDefinition, season: number): Promise<LeaguePayload> {
  const tableUrl = `https://api.openligadb.de/getbltable/${league.key}/${season}`;
  const matchUrl = `https://api.openligadb.de/getmatchdata/${league.key}/${season}`;

  const [tableResp, matchResp] = await Promise.all([
    fetch(tableUrl, { cache: 'no-store', next: { revalidate: 0 } }),
    fetch(matchUrl, { cache: 'no-store', next: { revalidate: 0 } }),
  ]);

  const tableJson = tableResp.ok ? await tableResp.json() : [];
  const matchJson = matchResp.ok ? await matchResp.json() : [];

  const tableRows: LeagueTableRow[] = (Array.isArray(tableJson) ? tableJson : [])
    .map((row: Record<string, unknown>, index: number) => ({
      position: Number(row.position ?? row.Position ?? index + 1),
      team: String(row.teamName ?? row.TeamName ?? row.shortName ?? row.ShortName ?? 'Team'),
      teamLogoUrl:
        typeof row.teamIconUrl === 'string'
          ? row.teamIconUrl
          : typeof row.TeamIconUrl === 'string'
            ? row.TeamIconUrl
            : '',
      points: Number(row.points ?? row.Points ?? 0),
      goalDiff: Number(row.goalDifference ?? row.GoalDifference ?? 0),
    }));

  const matches = Array.isArray(matchJson) ? matchJson : [];
  const finishedMatches = matches.filter(
    (match: Record<string, unknown>) => Boolean(match.matchIsFinished ?? match.MatchIsFinished)
  ) as Record<string, unknown>[];

  const latestGroupOrder = finishedMatches.reduce((max, match) => {
    const group = ((match.group ?? match.Group) ?? {}) as Record<string, unknown>;
    const order = Number(group.groupOrderID ?? group.GroupOrderID ?? 0);
    return order > max ? order : max;
  }, 0);

  const latestResults: LeagueResult[] = finishedMatches
    .filter((match) => {
      const group = ((match.group ?? match.Group) ?? {}) as Record<string, unknown>;
      return Number(group.groupOrderID ?? group.GroupOrderID ?? 0) === latestGroupOrder;
    })
    .map((match) => ({
      homeTeam: normalizeTeamName(match.team1 ?? match.Team1),
      awayTeam: normalizeTeamName(match.team2 ?? match.Team2),
      homeLogoUrl: normalizeTeamLogo(match.team1 ?? match.Team1),
      awayLogoUrl: normalizeTeamLogo(match.team2 ?? match.Team2),
      score: extractFinalScore(match),
    }));

  const now = new Date();
  const upcomingMatches = matches
    .filter((match: Record<string, unknown>) => !Boolean(match.matchIsFinished ?? match.MatchIsFinished))
    .map((match: Record<string, unknown>) => {
      const rawDate = String(
        match.matchDateTimeUTC ??
        match.MatchDateTimeUTC ??
        match.matchDateTime ??
        match.MatchDateTime ??
        ''
      );
      const date = new Date(rawDate);

      return {
        rawDate,
        date,
        match,
      };
    })
    .filter((entry) => Number.isFinite(entry.date.getTime()) && entry.date.getTime() > now.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const topMatch = upcomingMatches.length > 0
    ? {
        homeTeam: normalizeTeamName(upcomingMatches[0].match.team1 ?? upcomingMatches[0].match.Team1),
        awayTeam: normalizeTeamName(upcomingMatches[0].match.team2 ?? upcomingMatches[0].match.Team2),
        homeLogoUrl: normalizeTeamLogo(upcomingMatches[0].match.team1 ?? upcomingMatches[0].match.Team1),
        awayLogoUrl: normalizeTeamLogo(upcomingMatches[0].match.team2 ?? upcomingMatches[0].match.Team2),
        matchTime: upcomingMatches[0].rawDate,
      }
    : null;

  return {
    key: league.key,
    name: league.name,
    results: latestResults,
    table: tableRows,
    topMatch,
  };
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 60 Minuten

let cachedSports: { data: object; expiresAt: number } | null = null;

export async function GET() {
  try {
    if (cachedSports && Date.now() < cachedSports.expiresAt) {
      return NextResponse.json(cachedSports.data);
    }

    const season = getSeasonForLeague();
    const switchMinutes = await getSportsSwitchMinutes();

    const leagues = await Promise.all(
      LEAGUES.map(async (league) => {
        try {
          return await fetchLeagueData(league, season);
        } catch {
          return {
            key: league.key,
            name: league.name,
            results: [],
            table: [],
            topMatch: null,
          };
        }
      })
    );

    const payload = {
      source: 'OpenLigaDB',
      season,
      switchMinutes,
      updatedAt: new Date().toISOString(),
      leagues,
    };

    cachedSports = { data: payload, expiresAt: Date.now() + CACHE_TTL_MS };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Fehler beim Laden der Sportdaten:', error);
    return NextResponse.json(
      { error: 'Sportdaten konnten nicht geladen werden' },
      { status: 500 }
    );
  }
}
