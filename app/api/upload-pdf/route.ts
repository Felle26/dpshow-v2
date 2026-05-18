import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, readFile, readdir, stat, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { PDFParse } from "pdf-parse";
import {
  sanitizeBaseName,
  stripPdfExtension,
  extractNamingFromText,
  type ExtractedPdfNaming,
} from "@/lib/pdf-naming";

const UPLOAD_DIR = join(process.cwd(), "storage/uploads");
const DATA_DIR = join(process.cwd(), "data");
const CONFIG_FILE = join(DATA_DIR, "config.json");

async function writeLastUploadTimestamp() {
  try {
    let config: Record<string, string> = {};
    try {
      const content = await readFile(CONFIG_FILE, "utf-8");
      config = JSON.parse(content);
    } catch {
      // Config existiert noch nicht
    }
    config.lastChangedAt = new Date().toISOString();
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.error("Fehler beim Schreiben des Upload-Timestamps:", err);
  }
}

import { pathToFileURL } from "url";

const workerPath = pathToFileURL(
  join(
    process.cwd(),
    "node_modules/pdf-parse/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
  )
).href;
PDFParse.setWorker(workerPath);

async function getUniquePdfFilename(baseName: string): Promise<string> {
  let candidate = `${baseName}.pdf`;
  let index = 1;

  while (existsSync(join(UPLOAD_DIR, candidate))) {
    candidate = `${baseName} (${index}).pdf`;
    index += 1;
  }

  return candidate;
}

async function extractPdfNaming(bytes: ArrayBuffer): Promise<ExtractedPdfNaming> {
  console.log("[pdf-naming] workerPath:", workerPath);
  console.log("[pdf-naming] workerPath exists:", existsSync(workerPath));

  const parser = new PDFParse({ data: Buffer.from(bytes) });

  try {
    console.log("[pdf-naming] calling getText()...");
    const parsedText = await parser.getText();
    console.log("[pdf-naming] raw text length:", parsedText.text.length);
    console.log("[pdf-naming] raw text (first 500 chars):", JSON.stringify(parsedText.text.slice(0, 500)));
    console.log("[pdf-naming] pages:", parsedText.pages?.length ?? "N/A");
    const result = extractNamingFromText(parsedText.text);
    console.log("[pdf-naming] result:", JSON.stringify(result));
    return result;
  } catch (err) {
    console.error("[pdf-naming] getText() threw:", err);
    return {
      detectedPlanKwName: null,
      detectedFallbackName: null,
    };
  } finally {
    await parser.destroy();
  }
}

export async function GET() {
  try {
    if (!existsSync(UPLOAD_DIR)) {
      return NextResponse.json({ files: [] });
    }

    const filenames = await readdir(UPLOAD_DIR);
    const filesWithMeta = await Promise.all(
      filenames.map(async (filename) => {
        const filePath = join(UPLOAD_DIR, filename);
        const fileStats = await stat(filePath);

        return {
          name: filename,
          size: fileStats.size,
          uploadedAt: fileStats.birthtime.toISOString(),
          modifiedAt: fileStats.mtime.toISOString(),
          url: `/api/files/${encodeURIComponent(filename)}`,
        };
      })
    );

    filesWithMeta.sort(
      (a, b) =>
        new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
    );

    return NextResponse.json({ files: filesWithMeta });
  } catch (error) {
    console.error("Fehler beim Laden der Dateien:", error);
    return NextResponse.json(
      { error: "Dateiliste konnte nicht geladen werden" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files");

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "Keine Dateien hochgeladen" },
        { status: 400 }
      );
    }

    // Verzeichnis erstellen, falls nicht vorhanden
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const uploadedFiles = [];

    for (const file of files) {
      if (!(file instanceof File)) {
        continue;
      }

      // Nur PDFs erlauben
      if (file.type !== "application/pdf") {
        return NextResponse.json(
          { error: `${file.name} ist keine PDF-Datei` },
          { status: 400 }
        );
      }

      const bytes = await file.arrayBuffer();
      const extractedNames = await extractPdfNaming(bytes);
      const fallbackName = sanitizeBaseName(stripPdfExtension(file.name));

      // Wenn ein Plan-KW-Muster erkannt wurde, MUSS dieser Name verwendet werden.
      const baseName =
        extractedNames.detectedPlanKwName ??
        extractedNames.detectedFallbackName ??
        fallbackName;

      const filename = await getUniquePdfFilename(baseName);
      const filepath = join(UPLOAD_DIR, filename);

      const fileBuffer = Buffer.from(bytes);
      await writeFile(filepath, fileBuffer);

      await writeLastUploadTimestamp();

      uploadedFiles.push({
        name: file.name,
        size: file.size,
        savedAs: filename,
        detectedName: extractedNames.detectedPlanKwName ?? extractedNames.detectedFallbackName,
        planKwMatched: Boolean(extractedNames.detectedPlanKwName),
      });
    }

    return NextResponse.json({
      success: true,
      message: `${uploadedFiles.length} Datei(en) erfolgreich gespeichert`,
      files: uploadedFiles,
    });
  } catch (error) {
    console.error("Upload-Fehler:", error);
    return NextResponse.json(
      { error: "Fehler beim Speichern der Dateien" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const filename = request.nextUrl.searchParams.get("filename");

    if (!filename) {
      return NextResponse.json(
        { error: "Dateiname fehlt" },
        { status: 400 }
      );
    }

    const safeName = filename.replace(/[\\/]/g, "");
    const filePath = join(UPLOAD_DIR, safeName);

    if (!filePath.startsWith(UPLOAD_DIR)) {
      return NextResponse.json(
        { error: "Ungültiger Pfad" },
        { status: 400 }
      );
    }

    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: "Datei wurde nicht gefunden" },
        { status: 404 }
      );
    }

    await unlink(filePath);

    await writeLastUploadTimestamp();

    return NextResponse.json({
      success: true,
      message: `${safeName} wurde gelöscht`,
    });
  } catch (error) {
    console.error("Lösch-Fehler:", error);
    return NextResponse.json(
      { error: "Datei konnte nicht gelöscht werden" },
      { status: 500 }
    );
  }
}
