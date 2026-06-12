import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { getStatusForFile, readDienstplanStatusMap } from '@/lib/dienstplan-status';

const UPLOAD_DIR = join(process.cwd(), 'storage/uploads');

export async function GET(request: NextRequest) {
  try {
    // Stelle sicher, dass das Verzeichnis existiert
    let files: string[] = [];
    try {
      files = await readdir(UPLOAD_DIR);
    } catch {
      // Verzeichnis existiert nicht
      return NextResponse.json({ files: [] });
    }

    // Filtere nur PDF-Dateien
    const pdfFiles = files.filter((f) => f.toLowerCase().endsWith('.pdf'));

    const scope = request.nextUrl.searchParams.get('scope');
    const includeStatus = request.nextUrl.searchParams.get('includeStatus') !== 'false';
    const statusMap = includeStatus || scope === 'show' ? await readDienstplanStatusMap() : {};

    // Hole Metadaten für jede Datei
    const filesWithMeta = await Promise.all(
      pdfFiles.map(async (name) => {
        try {
          const filePath = join(UPLOAD_DIR, name);
          const stats = await stat(filePath);
          const status = getStatusForFile(statusMap, name);

          return {
            name,
            uploadDate: stats.birthtimeMs
              ? new Date(stats.birthtimeMs).toISOString()
              : new Date(stats.mtimeMs).toISOString(),
            size: stats.size,
            released: status.released,
            archived: status.archived,
            releasedAt: status.releasedAt,
            archivedAt: status.archivedAt,
            statusUpdatedAt: status.updatedAt,
          };
        } catch {
          const status = getStatusForFile(statusMap, name);

          return {
            name,
            uploadDate: new Date().toISOString(),
            size: 0,
            released: status.released,
            archived: status.archived,
            releasedAt: status.releasedAt,
            archivedAt: status.archivedAt,
            statusUpdatedAt: status.updatedAt,
          };
        }
      })
    );

    const filteredFiles =
      scope === 'show'
        ? filesWithMeta.filter((file) => file.released && !file.archived)
        : filesWithMeta;

    // Sortiere nach Upload-Datum (neueste zuerst)
    filteredFiles.sort(
      (a, b) =>
        new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
    );

    return NextResponse.json({ files: filteredFiles });
  } catch (error) {
    console.error('Fehler beim Laden der Dateien:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden der Dateien' },
      { status: 500 }
    );
  }
}
