import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';

const UPLOAD_DIR = join(process.cwd(), 'storage/uploads');

export async function GET() {
  try {
    // Stelle sicher, dass das Verzeichnis existiert
    let files: string[] = [];
    try {
      files = await readdir(UPLOAD_DIR);
    } catch (err) {
      // Verzeichnis existiert nicht
      return NextResponse.json({ files: [] });
    }

    // Filtere nur PDF-Dateien
    const pdfFiles = files.filter((f) => f.toLowerCase().endsWith('.pdf'));

    // Hole Metadaten für jede Datei
    const filesWithMeta = await Promise.all(
      pdfFiles.map(async (name) => {
        try {
          const filePath = join(UPLOAD_DIR, name);
          const stats = await stat(filePath);

          return {
            name,
            uploadDate: stats.birthtimeMs
              ? new Date(stats.birthtimeMs).toISOString()
              : new Date(stats.mtimeMs).toISOString(),
            size: stats.size,
          };
        } catch (err) {
          return {
            name,
            uploadDate: new Date().toISOString(),
            size: 0,
          };
        }
      })
    );

    // Sortiere nach Upload-Datum (neueste zuerst)
    filesWithMeta.sort(
      (a, b) =>
        new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
    );

    return NextResponse.json({ files: filesWithMeta });
  } catch (error) {
    console.error('Fehler beim Laden der Dateien:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden der Dateien' },
      { status: 500 }
    );
  }
}
