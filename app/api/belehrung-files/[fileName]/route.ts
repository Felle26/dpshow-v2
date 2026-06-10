import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const UPLOAD_DIR = join(process.cwd(), "storage/belehrung-uploads");

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ fileName: string }> }
) {
  try {
    const { fileName } = await context.params;
    const safeFileName = fileName.replace(/[\\/]/g, "");
    const filePath = join(UPLOAD_DIR, safeFileName);

    if (!filePath.startsWith(UPLOAD_DIR)) {
      return NextResponse.json({ error: "Ungueltiger Dateipfad" }, { status: 400 });
    }

    if (!safeFileName.toLowerCase().endsWith(".pdf") || !existsSync(filePath)) {
      return NextResponse.json({ error: "Datei wurde nicht gefunden" }, { status: 404 });
    }

    const buffer = await readFile(filePath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(safeFileName)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Fehler beim Laden der Belehrungs-PDF:", error);
    return NextResponse.json(
      { error: "PDF-Datei konnte nicht geladen werden" },
      { status: 500 }
    );
  }
}
