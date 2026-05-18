import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const DRAWINGS_DIR = join(process.cwd(), 'public/dienstplan-drawings');

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ pdfName: string; fileName: string }> }
) {
  try {
    const { pdfName, fileName } = await context.params;
    const safePdfName = sanitizePath(pdfName);
    const safeFileName = fileName.replace(/[\\/]/g, '');
    const filePath = join(DRAWINGS_DIR, safePdfName, safeFileName);

    if (!safeFileName.toLowerCase().endsWith('.png') || !existsSync(filePath)) {
      return NextResponse.json({ error: 'Datei wurde nicht gefunden' }, { status: 404 });
    }

    const buffer = await readFile(filePath);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Fehler beim Laden der Zeichnung:', error);
    return NextResponse.json(
      { error: 'Zeichnung konnte nicht geladen werden' },
      { status: 500 }
    );
  }
}

function sanitizePath(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}