import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const DRAWINGS_DIR = join(process.cwd(), 'storage/drawings');

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileName: string }> }
) {
  try {
    const { fileName } = await params;

    // Sicherheitscheck: Verhindere Directory Traversal
    const filePath = join(DRAWINGS_DIR, fileName);
    if (!filePath.startsWith(DRAWINGS_DIR)) {
      return new NextResponse(null, { status: 400 });
    }

    if (!existsSync(filePath)) {
      return new NextResponse(null, { status: 404 });
    }

    const imageBuffer = await readFile(filePath);

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Fehler beim Lesen der Zeichnung:', error);
    return new NextResponse(null, { status: 500 });
  }
}
