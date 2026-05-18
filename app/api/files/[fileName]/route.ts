import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const UPLOAD_DIR = join(process.cwd(), 'storage/uploads');

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileName: string }> }
) {
  try {
    const { fileName } = await params;
    const filePath = join(UPLOAD_DIR, fileName);

    if (!filePath.startsWith(UPLOAD_DIR)) {
      return new NextResponse(null, { status: 400 });
    }

    if (!existsSync(filePath)) {
      return new NextResponse(null, { status: 404 });
    }

    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Fehler beim Lesen der PDF-Datei:', error);
    return new NextResponse(null, { status: 500 });
  }
}