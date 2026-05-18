import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const DRAWINGS_DIR = join(process.cwd(), 'storage/drawings');

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const pdfName = searchParams.get('pdfName');

    if (!pdfName) {
      return NextResponse.json(
        { error: 'PDF-Name erforderlich' },
        { status: 400 }
      );
    }

    const requestedPdfKey = sanitizePath(stripPdfExtension(pdfName));

    // Flache Struktur: Metadaten im Root-Ordner filtern.
    if (existsSync(DRAWINGS_DIR)) {
      const entries = await readdir(DRAWINGS_DIR);
      const jsonFiles = entries.filter((entry) => entry.endsWith('.json'));
      let newest: { createdAt: string; fileName: string } | null = null;

      for (const jsonFile of jsonFiles) {
        try {
          const jsonPath = join(DRAWINGS_DIR, jsonFile);
          const jsonContent = await readFile(jsonPath, 'utf-8');
          const meta = JSON.parse(jsonContent);
          const metaPdfName = String(meta.pdfName || '');
          const metaPdfKey = sanitizePath(stripPdfExtension(metaPdfName));

          if (metaPdfName !== pdfName && metaPdfKey !== requestedPdfKey) {
            continue;
          }

          const candidate = {
            createdAt: String(meta.createdAt || ''),
            fileName: String(meta.fileName || ''),
          };

          if (!candidate.fileName) {
            continue;
          }

          if (
            !newest ||
            new Date(candidate.createdAt).getTime() > new Date(newest.createdAt).getTime()
          ) {
            newest = candidate;
          }
        } catch {
          // Ignoriere defekte Metadaten und pruefe weitere Dateien.
        }
      }

      if (newest) {
        const thumbnailPath = join(DRAWINGS_DIR, newest.fileName);
        const imageBuffer = await readFile(thumbnailPath);

        return new NextResponse(imageBuffer, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    }

    // Rueckwaertskompatibilitaet fuer alte Unterordner.
    const legacyPdfDrawingsDir = join(DRAWINGS_DIR, sanitizePath(pdfName));
    if (!existsSync(legacyPdfDrawingsDir)) {
      return new NextResponse(null, { status: 404 });
    }

    const files = await readdir(legacyPdfDrawingsDir);
    const pngFiles = files.filter((f) => f.endsWith('.png')).sort().reverse();
    if (pngFiles.length === 0) {
      return new NextResponse(null, { status: 404 });
    }

    const imageBuffer = await readFile(join(legacyPdfDrawingsDir, pngFiles[0]));

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Fehler beim Laden des Thumbnails:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden des Thumbnails' },
      { status: 500 }
    );
  }
}

function stripPdfExtension(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

function sanitizePath(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
