import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const DRAWINGS_DIR = join(process.cwd(), 'storage/drawings');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const pdfName = formData.get('pdfName') as string;
    const page = formData.get('page') as string;

    if (!file || !pdfName) {
      return NextResponse.json(
        { error: 'Datei oder PDF-Name fehlt' },
        { status: 400 }
      );
    }

    const pdfKey = sanitizePath(stripPdfExtension(pdfName));
    const drawingId = `${pdfKey}__${Date.now()}`;
    await mkdir(DRAWINGS_DIR, { recursive: true });

    // Speichere Zeichnung
    const fileName = `${drawingId}.png`;
    const filePath = join(DRAWINGS_DIR, fileName);
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    // Speichere Metadaten
    const metaFileName = `${drawingId}.json`;
    const metaPath = join(DRAWINGS_DIR, metaFileName);
    await writeFile(
      metaPath,
      JSON.stringify({
        id: drawingId,
        fileName,
        pdfName,
        pdfKey,
        page: parseInt(page),
        createdAt: new Date().toISOString(),
      })
    );

    return NextResponse.json({
      success: true,
      fileName,
      message: 'Zeichnung gespeichert',
    });
  } catch (error) {
    console.error('Fehler beim Speichern der Zeichnung:', error);
    return NextResponse.json(
      { error: 'Fehler beim Speichern der Zeichnung' },
      { status: 500 }
    );
  }
}

function stripPdfExtension(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

function sanitizePath(name: string): string {
  // Entferne unsichere Zeichen
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
