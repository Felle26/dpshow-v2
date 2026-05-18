import { NextRequest, NextResponse } from 'next/server';
import { unlink, readdir, rm, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const DATA_DIR = join(process.cwd(), 'data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

async function writeLastChangedTimestamp() {
  try {
    let config: Record<string, string> = {};
    try {
      const content = await readFile(CONFIG_FILE, 'utf-8');
      config = JSON.parse(content);
    } catch {
      // Config existiert noch nicht
    }
    config.lastChangedAt = new Date().toISOString();
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Fehler beim Schreiben des Timestamps:', err);
  }
}

const UPLOAD_DIR = join(process.cwd(), 'storage/uploads');
const DRAWINGS_DIR = join(process.cwd(), 'storage/drawings');

function sanitizePath(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function deleteDirectoryContents(dirPath: string): Promise<void> {
  try {
    if (!existsSync(dirPath)) return;
    await rm(dirPath, { recursive: true, force: true });
  } catch (err) {
    console.error(`Fehler beim Löschen des Verzeichnisses ${dirPath}:`, err);
  }
}

function stripPdfExtension(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

async function deleteFlatDrawingsForPdf(fileName: string): Promise<void> {
  if (!existsSync(DRAWINGS_DIR)) {
    return;
  }

  const requestedPdfKey = sanitizePath(stripPdfExtension(fileName));
  const entries = await readdir(DRAWINGS_DIR);
  const jsonFiles = entries.filter((entry) => entry.endsWith('.json'));

  for (const jsonFile of jsonFiles) {
    try {
      const jsonPath = join(DRAWINGS_DIR, jsonFile);
      const raw = await readFile(jsonPath, 'utf-8');
      const meta = JSON.parse(raw);
      const metaPdfName = String(meta.pdfName || '');
      const metaPdfKey = sanitizePath(stripPdfExtension(metaPdfName));

      if (metaPdfName !== fileName && metaPdfKey !== requestedPdfKey) {
        continue;
      }

      const imageName = String(meta.fileName || '');
      if (imageName) {
        const imagePath = join(DRAWINGS_DIR, imageName);
        if (imagePath.startsWith(DRAWINGS_DIR) && existsSync(imagePath)) {
          await unlink(imagePath);
        }
      }

      if (jsonPath.startsWith(DRAWINGS_DIR) && existsSync(jsonPath)) {
        await unlink(jsonPath);
      }
    } catch (err) {
      console.error(`Fehler beim Löschen der Drawing-Metadaten ${jsonFile}:`, err);
    }
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { fileName } = await request.json();

    if (!fileName) {
      return NextResponse.json(
        { error: 'Dateiname erforderlich' },
        { status: 400 }
      );
    }

    // Sicherheitscheck
    const filePath = join(UPLOAD_DIR, fileName);
    if (!filePath.startsWith(UPLOAD_DIR)) {
      return NextResponse.json(
        { error: 'Ungültiger Pfad' },
        { status: 400 }
      );
    }

    // Loesche die PDF.
    if (existsSync(filePath)) {
      await unlink(filePath);
    }

    // Lösche zugehörige Zeichnungen aus flacher Struktur
    await deleteFlatDrawingsForPdf(fileName);

    // Lösche zugehörige Zeichnungen aus alter Unterordner-Struktur
    const drawingsDirForPdf = join(DRAWINGS_DIR, sanitizePath(fileName));
    await deleteDirectoryContents(drawingsDirForPdf);

    await writeLastChangedTimestamp();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Fehler beim Löschen der PDF:', error);
    return NextResponse.json(
      { error: 'Fehler beim Löschen der PDF' },
      { status: 500 }
    );
  }
}
