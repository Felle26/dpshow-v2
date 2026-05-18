import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';

const DATA_DIR = join(process.cwd(), 'data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

async function readConfig(): Promise<Record<string, string>> {
  try {
    const content = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function writeConfig(config: Record<string, string>) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

// GET ?password=xxx  → { passwordSet: boolean, unlocked: boolean }
// GET (kein password) → { passwordSet: boolean }
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const password = searchParams.get('password');
  const config = await readConfig();
  const storedHash = config.editPasswordHash;

  if (!storedHash) {
    return NextResponse.json({ passwordSet: false, unlocked: true });
  }

  if (password === null) {
    return NextResponse.json({ passwordSet: true });
  }

  const inputHash = hashPassword(password);
  return NextResponse.json({ passwordSet: true, unlocked: inputHash === storedHash });
}

// POST { password: string }  → Passwort setzen (leer = entfernen)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const config = await readConfig();
  const password = String(body.password ?? '').trim();

  if (!password) {
    delete config.editPasswordHash;
  } else {
    if (!/^\d+$/.test(password)) {
      return NextResponse.json(
        {
          success: false,
          code: 'EDIT_PASSWORD_NUMERIC_ONLY',
          message: 'Passwort darf nur Zahlen enthalten.',
        },
        { status: 400 }
      );
    }

    config.editPasswordHash = hashPassword(password);
  }

  await writeConfig(config);
  return NextResponse.json({ success: true });
}
