import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');
const STATUS_FILE = join(DATA_DIR, 'dienstplan-status.json');

export interface DienstplanStatus {
  released: boolean;
  archived: boolean;
  releasedAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
}

export type DienstplanStatusMap = Record<string, DienstplanStatus>;

function createDefaultStatus(nowIso: string): DienstplanStatus {
  return {
    released: false,
    archived: false,
    releasedAt: null,
    archivedAt: null,
    updatedAt: nowIso,
  };
}

export function normalizeStatus(value: unknown): DienstplanStatus {
  const nowIso = new Date().toISOString();

  if (!value || typeof value !== 'object') {
    return createDefaultStatus(nowIso);
  }

  const candidate = value as Partial<DienstplanStatus>;
  return {
    released: candidate.released === true,
    archived: candidate.archived === true,
    releasedAt: typeof candidate.releasedAt === 'string' ? candidate.releasedAt : null,
    archivedAt: typeof candidate.archivedAt === 'string' ? candidate.archivedAt : null,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : nowIso,
  };
}

export async function readDienstplanStatusMap(): Promise<DienstplanStatusMap> {
  if (!existsSync(STATUS_FILE)) {
    return {};
  }

  try {
    const raw = await readFile(STATUS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const entries = Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
      key,
      normalizeStatus(value),
    ]);

    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export async function writeDienstplanStatusMap(statusMap: DienstplanStatusMap): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STATUS_FILE, JSON.stringify(statusMap, null, 2), 'utf-8');
}

export function getStatusForFile(statusMap: DienstplanStatusMap, fileName: string): DienstplanStatus {
  return normalizeStatus(statusMap[fileName]);
}

export function applyStatusAction(
  currentStatus: DienstplanStatus,
  action: 'release' | 'unrelease' | 'archive' | 'restore'
): DienstplanStatus {
  const nowIso = new Date().toISOString();

  if (action === 'release') {
    return {
      released: true,
      archived: false,
      releasedAt: currentStatus.releasedAt ?? nowIso,
      archivedAt: null,
      updatedAt: nowIso,
    };
  }

  if (action === 'unrelease') {
    return {
      ...currentStatus,
      released: false,
      releasedAt: null,
      updatedAt: nowIso,
    };
  }

  if (action === 'archive') {
    return {
      ...currentStatus,
      archived: true,
      archivedAt: currentStatus.archivedAt ?? nowIso,
      released: false,
      releasedAt: null,
      updatedAt: nowIso,
    };
  }

  return {
    ...currentStatus,
    archived: false,
    archivedAt: null,
    updatedAt: nowIso,
  };
}

export async function touchLastChangedTimestamp(): Promise<void> {
  try {
    let config: Record<string, string> = {};
    try {
      const content = await readFile(CONFIG_FILE, 'utf-8');
      config = JSON.parse(content);
    } catch {
      // Config existiert noch nicht.
    }

    config.lastChangedAt = new Date().toISOString();

    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Fehler beim Schreiben des Upload-Timestamps:', err);
  }
}