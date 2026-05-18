import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

const CONFIG_FILE = join(process.cwd(), 'data', 'config.json');

export async function GET() {
  try {
    const content = await readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(content);
    return NextResponse.json({ lastChangedAt: config.lastChangedAt ?? null });
  } catch {
    return NextResponse.json({ lastChangedAt: null });
  }
}
