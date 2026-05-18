import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const DRAWINGS_DIR = join(process.cwd(), 'storage/drawings');

interface Drawing {
  id: string;
  fileName: string;
  pdfName: string;
  page: number;
  createdAt: string;
  url: string;
}

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

    const drawings: Drawing[] = [];
    const requestedPdfKey = sanitizePath(stripPdfExtension(pdfName));

    if (existsSync(DRAWINGS_DIR)) {
      const entries = await readdir(DRAWINGS_DIR);
      const jsonFiles = entries.filter((entry) => entry.endsWith('.json'));

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

          drawings.push({
            id: String(meta.id || jsonFile.replace('.json', '')),
            fileName: String(meta.fileName),
            pdfName: metaPdfName || pdfName,
            page: Number(meta.page || 1),
            createdAt: String(meta.createdAt || new Date().toISOString()),
            url: `/api/drawings/file/${meta.fileName}`,
          });
        } catch (err) {
          console.error(`Fehler beim Parsen von ${jsonFile}:`, err);
        }
      }
    }

    // Rueckwaertskompatibilitaet fuer bestehende Unterordner-Struktur.
    const legacyPdfDrawingsDir = join(DRAWINGS_DIR, sanitizePath(pdfName));
    if (existsSync(legacyPdfDrawingsDir)) {
      const files = await readdir(legacyPdfDrawingsDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      for (const jsonFile of jsonFiles) {
        try {
          const jsonPath = join(legacyPdfDrawingsDir, jsonFile);
          const jsonContent = await readFile(jsonPath, 'utf-8');
          const meta = JSON.parse(jsonContent);

          drawings.push({
            id: jsonFile.replace('.json', ''),
            fileName: String(meta.fileName),
            pdfName: String(meta.pdfName || pdfName),
            page: Number(meta.page || 1),
            createdAt: String(meta.createdAt || new Date().toISOString()),
            url: `/api/drawings/file/${meta.fileName}`,
          });
        } catch (err) {
          console.error(`Fehler beim Parsen von ${jsonFile}:`, err);
        }
      }
    }

    drawings.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ drawings });
  } catch (error) {
    console.error('Fehler beim Laden der Zeichnungen:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden der Zeichnungen' },
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
