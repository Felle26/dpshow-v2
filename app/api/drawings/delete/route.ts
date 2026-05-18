import { NextRequest, NextResponse } from 'next/server';
import { unlink, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const DRAWINGS_DIR = join(process.cwd(), 'storage/drawings');

export async function DELETE(request: NextRequest) {
  try {
    const { drawingId, pdfName } = await request.json();

    if (!drawingId || !pdfName) {
      return NextResponse.json(
        { error: 'drawingId oder pdfName fehlt' },
        { status: 400 }
      );
    }

    const pngPath = join(DRAWINGS_DIR, `${drawingId}.png`);
    const jsonPath = join(DRAWINGS_DIR, `${drawingId}.json`);

    // Sicherheitscheck: Verhindere Directory Traversal
    if (!pngPath.startsWith(DRAWINGS_DIR) || !jsonPath.startsWith(DRAWINGS_DIR)) {
      return NextResponse.json(
        { error: 'Ungültiger Pfad' },
        { status: 400 }
      );
    }

    // Loesche zuerst aus flacher Struktur.
    if (existsSync(pngPath)) {
      await unlink(pngPath);
    }
    if (existsSync(jsonPath)) {
      await unlink(jsonPath);
    }

    // Rueckwaertskompatibilitaet fuer alte Unterordner-Struktur.
    const legacyPdfDrawingsDir = join(DRAWINGS_DIR, sanitizePath(pdfName));
    const legacyPngPath = join(legacyPdfDrawingsDir, `${drawingId}.png`);
    const legacyJsonPath = join(legacyPdfDrawingsDir, `${drawingId}.json`);

    if (!legacyPngPath.startsWith(DRAWINGS_DIR) || !legacyJsonPath.startsWith(DRAWINGS_DIR)) {
      return NextResponse.json(
        { error: 'Ungültiger Pfad' },
        { status: 400 }
      );
    }

    if (existsSync(legacyPngPath)) {
      await unlink(legacyPngPath);
    }
    if (existsSync(legacyJsonPath)) {
      await unlink(legacyJsonPath);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Fehler beim Löschen der Zeichnung:', error);
    return NextResponse.json(
      { error: 'Fehler beim Löschen der Zeichnung' },
      { status: 500 }
    );
  }
}

function sanitizePath(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
