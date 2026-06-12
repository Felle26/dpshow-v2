import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile, readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { PDFParse } from "pdf-parse";
import { pathToFileURL } from "url";
import {
  sanitizeBaseName,
  stripPdfExtension,
  extractNamingFromText,
  type ExtractedPdfNaming,
} from "@/lib/pdf-naming";

type BelehrungTheme = "Arbeitsschutz" | "Gefahrstoffe" | "Hygiene" | "Brandschutz";

const UPLOAD_DIR = join(process.cwd(), "storage/belehrung-uploads");
const META_DIR = join(UPLOAD_DIR, ".meta");
const DATA_DIR = join(process.cwd(), "data");
const CONFIG_FILE = join(DATA_DIR, "config.json");

const workerPath = pathToFileURL(
  join(
    process.cwd(),
    "node_modules/pdf-parse/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
  )
).href;
PDFParse.setWorker(workerPath);

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

async function getUniquePdfFilename(baseName: string): Promise<string> {
  let candidate = `${baseName}.pdf`;
  let index = 1;

  while (existsSync(join(UPLOAD_DIR, candidate))) {
    candidate = `${baseName}-${index}.pdf`;
    index += 1;
  }

  return candidate;
}

function normalizeForTheme(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUmlauts(value: string): string {
  return value
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss");
}

function titleCaseWords(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function cleanDisplayName(value: string): string {
  const cleaned = value
    .replace(/\b(herr|frau|mr|mrs|ms)\b/gi, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? titleCaseWords(cleaned) : "Dokument";
}

function extractPersonNameFromText(text: string): string | null {
  const normalized = text.replace(/\u00A0/g, " ");
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const invalidNamePrefix = /^(hat\s+an|hat\s+am|der\s+kurs|dieses\s+zertifikat|freital\b|zertifikat\b)/i;
  const invalidNameContent = /(teilgenommen|kurs|zertifikat|erstellt|abschnitten|folgendem)/i;

  // Prioritaet 1: erste sinnvolle Zeile (vom Nutzer gewuenscht)
  const firstLine = lines[0] ?? "";
  const cleanedFirstLine = cleanDisplayName(firstLine);
  if (
    firstLine &&
    /^[A-Za-zÄÖÜäöüß\s.-]+$/u.test(firstLine) &&
    !invalidNamePrefix.test(firstLine) &&
    !invalidNameContent.test(firstLine) &&
    cleanedFirstLine !== "Dokument" &&
    cleanedFirstLine.split(" ").length >= 2
  ) {
    return cleanedFirstLine;
  }

  // Prioritaet 2: zweite Zeile, falls erste Zeile z.B. "ZERTIFIKAT" ist
  const secondLine = lines[1] ?? "";
  const cleanedSecondLine = cleanDisplayName(secondLine);
  if (
    secondLine &&
    /^[A-Za-zÄÖÜäöüß\s.-]+$/u.test(secondLine) &&
    !invalidNamePrefix.test(secondLine) &&
    !invalidNameContent.test(secondLine) &&
    cleanedSecondLine !== "Dokument" &&
    cleanedSecondLine.split(" ").length >= 2
  ) {
    return cleanedSecondLine;
  }

  const honorificMatch = normalized.match(
    /\b(?:herr|frau)\s+([A-ZÄÖÜ][\p{L}-]+(?:\s+[A-ZÄÖÜ][\p{L}-]+){1,3})/iu
  );
  if (honorificMatch?.[1]) {
    return cleanDisplayName(honorificMatch[1]);
  }

  const nameLike = lines.find((line) =>
    /^[A-ZÄÖÜ][\p{L}-]+\s+[A-ZÄÖÜ][\p{L}-]+/u.test(line) &&
    !invalidNamePrefix.test(line) &&
    !invalidNameContent.test(line)
  );

  return nameLike ? cleanDisplayName(nameLike) : null;
}

function displayNameFromFilename(filename: string): string {
  const baseName = stripPdfExtension(filename);
  const token = baseName.split("-")[0] ?? baseName;
  if (/^[a-z0-9]+$/i.test(token)) {
    return token.charAt(0).toUpperCase() + token.slice(1);
  }
  return cleanDisplayName(token.replace(/[._-]+/g, " "));
}

function extractCourseTitle(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const triggerIndex = lines.findIndex((line) =>
    /teilgenommen|kurs erfolgreich|hat an folgendem kurs/i.test(line)
  );

  if (triggerIndex >= 0) {
    const nextLine = lines.slice(triggerIndex + 1).find((line) => line.length > 0);
    if (nextLine) {
      return nextLine;
    }
  }

  const directTitleLine = lines.find((line) =>
    /arbeitsschutzunterweisung|gefahrstoff(?:e)?unterweisung|hygieneunterweisung|brandschutzunterweisung/i.test(line)
  );

  return directTitleLine ?? "";
}

function detectThemeFromSignals(text: string, filename: string): BelehrungTheme {
  const normalizedText = normalizeForTheme(text);
  const normalizedFilename = normalizeForTheme(stripPdfExtension(filename));
  const normalizedTitle = normalizeForTheme(extractCourseTitle(text));
  const titleCompact = normalizedTitle.replace(/\s+/g, "");
  const signal = `${normalizedText} ${normalizedFilename}`.trim();
  const compactSignal = signal.replace(/\s+/g, "");

  // Haupttitel hat oberste Prioritaet.
  if (/(^|\s)gefahr\s*stoffe?(\s|$)/i.test(normalizedTitle) || /gefahrstoffe?/i.test(titleCompact)) {
    return "Gefahrstoffe";
  }
  if (/(^|\s)hygiene(\s|$)/i.test(normalizedTitle)) {
    return "Hygiene";
  }
  if (/(^|\s)brand\s*schutz(\s|$)/i.test(normalizedTitle) || /brandschutz/i.test(titleCompact)) {
    return "Brandschutz";
  }
  if (/(^|\s)arbeit\s*schutz(\s|$)/i.test(normalizedTitle) || /arbeitsschutz/i.test(titleCompact)) {
    return "Arbeitsschutz";
  }

  // Harte Prioritaet: explizite Titel sollen immer korrekt klassifiziert werden.
  if (/(^|\s)gefahr\s*stoffe?(\s|$)/i.test(signal) || /gefahrstoffe?/i.test(compactSignal)) {
    return "Gefahrstoffe";
  }
  if (/(^|\s)hygiene(\s|$)/i.test(signal)) {
    return "Hygiene";
  }
  if (/(^|\s)brand\s*schutz(\s|$)/i.test(signal) || /brandschutz/i.test(compactSignal)) {
    return "Brandschutz";
  }
  if (/(^|\s)arbeit\s*schutz(\s|$)/i.test(signal) || /arbeitsschutz/i.test(compactSignal)) {
    return "Arbeitsschutz";
  }

  const themes: Array<{ theme: BelehrungTheme; keywords: string[] }> = [
    {
      theme: "Gefahrstoffe",
      keywords: [
        "gefahrstoff",
        "sicherheitsdatenblatt",
        "chemikal",
        "hazmat",
        "schutzstufe",
        "betriebsanweisung",
      ],
    },
    {
      theme: "Hygiene",
      keywords: [
        "hygiene",
        "haendewaschen",
        "desinfektion",
        "kontamination",
        "sauberkeit",
        "infektionsschutz",
        "lebensmittelhygiene",
      ],
    },
    {
      theme: "Brandschutz",
      keywords: [
        "brandschutz",
        "brandfall",
        "feuerloescher",
        "rauchmelder",
        "evakuierung",
        "fluchtweg",
        "brandklasse",
      ],
    },
    {
      theme: "Arbeitsschutz",
      keywords: [
        "arbeitsschutz",
        "unterweisung",
        "psa",
        "unfallverhuetung",
        "schutzmassnahme",
        "sicherheit",
        "arbeitssicherheit",
      ],
    },
  ];

  let bestTheme: BelehrungTheme = "Arbeitsschutz";
  let bestScore = 0;

  for (const candidate of themes) {
    const score = candidate.keywords.reduce((sum, keyword) => {
      const normalizedKeyword = normalizeForTheme(keyword);
      const compactKeyword = normalizedKeyword.replace(/\s+/g, "");
      if (!compactKeyword) {
        return sum;
      }

      return signal.includes(normalizedKeyword) || compactSignal.includes(compactKeyword)
        ? sum + 1
        : sum;
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestTheme = candidate.theme;
    }
  }

  return bestTheme;
}

async function extractPdfMeta(
  bytes: ArrayBuffer,
  originalFilename: string
): Promise<{ naming: ExtractedPdfNaming; theme: BelehrungTheme; displayName: string }> {
  const parser = new PDFParse({ data: Buffer.from(bytes) });

  try {
    const parsedText = await parser.getText();
    const parsedName = extractPersonNameFromText(parsedText.text);
    const detectedFallback = extractNamingFromText(parsedText.text).detectedFallbackName;
    return {
      naming: extractNamingFromText(parsedText.text),
      theme: detectThemeFromSignals(parsedText.text, originalFilename),
      displayName: parsedName ?? cleanDisplayName(detectedFallback ?? stripPdfExtension(originalFilename)),
    };
  } catch {
    const fallbackBase = stripPdfExtension(originalFilename);
    return {
      naming: {
        detectedPlanKwName: null,
        detectedFallbackName: fallbackBase,
      },
      theme: detectThemeFromSignals("", originalFilename),
      displayName: displayNameFromFilename(originalFilename),
    };
  } finally {
    await parser.destroy();
  }
}

type StoredMeta = {
  displayName: string;
  topic: BelehrungTheme;
};

async function writeStoredMeta(filename: string, meta: StoredMeta) {
  await mkdir(META_DIR, { recursive: true });
  const metaPath = join(META_DIR, `${filename}.json`);
  await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
}

async function readStoredMeta(filename: string): Promise<StoredMeta | null> {
  try {
    const metaPath = join(META_DIR, `${filename}.json`);
    if (!existsSync(metaPath)) {
      return null;
    }

    const content = await readFile(metaPath, "utf-8");
    const parsed = JSON.parse(content) as Partial<StoredMeta>;
    if (!parsed.displayName || !parsed.topic) {
      return null;
    }

    return {
      displayName: parsed.displayName,
      topic: parsed.topic,
    };
  } catch {
    return null;
  }
}

async function inferDisplayNameFromPdf(filePath: string, filename: string): Promise<string> {
  try {
    const bytes = await readFile(filePath);
    const parser = new PDFParse({ data: bytes });
    try {
      const parsed = await parser.getText();
      return extractPersonNameFromText(parsed.text) ?? displayNameFromFilename(filename);
    } finally {
      await parser.destroy();
    }
  } catch {
    return displayNameFromFilename(filename);
  }
}

function looksLikeSlugName(value: string): boolean {
  const normalized = value.trim();
  return /^[a-z0-9_-]+$/i.test(normalized) && !/\s/.test(normalized);
}

function buildPersonToken(raw: string): string {
  const withoutTitles = raw
    .replace(/\b(herr|frau|mr|mrs|ms)\b/gi, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\d+/g, " ");

  const normalized = normalizeUmlauts(withoutTitles)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const joined = normalized.split(" ").filter(Boolean).join("");
  return joined || "dokument";
}

function toTitleToken(raw: string): string {
  const normalized = normalizeUmlauts(raw)
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "Arbeitsschutz";
  }

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

function buildBelehrungBaseName(personRaw: string, topic: BelehrungTheme, year: number): string {
  const person = buildPersonToken(personRaw);
  const topicToken = toTitleToken(topic);
  return `${person}-${topicToken}${year}`;
}

function normalizeDetectedTopic(topicRaw: string): BelehrungTheme {
  const normalized = normalizeForTheme(topicRaw).toLowerCase();
  const compact = normalized.replace(/\s+/g, "");

  // 1. Gefahrstoffe (muss VOR Arbeitsschutz stehen!)
  if (
    /(gefahr\s*stoff|gefahr\s*stoffe|gefahrstoff|gefahrstoffe)/i.test(
      normalized,
    ) ||
    /gefahrstoff|gefahrstoffe/i.test(compact)
  ) {
    return "Gefahrstoffe";
  }

  // 2. Hygiene
  if (/hygiene/i.test(normalized)) {
    return "Hygiene";
  }

  // 3. Brandschutz
  if (/brandschutz|brand/i.test(normalized)) {
    return "Brandschutz";
  }

  // 4. Arbeitsschutz (aber NICHT „Arbeitsschutzgesetz“)
  if (
    /arbeitsschutz(?!gesetz)/i.test(normalized) ||
    /unfall/i.test(normalized)
  ) {
    return "Arbeitsschutz";
  }

  // 5. Default
  return "Arbeitsschutz";
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

    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const uploadedFiles = [];

    for (const file of files) {
      if (!(file instanceof File)) {
        continue;
      }

      if (file.type !== "application/pdf") {
        return NextResponse.json(
          { error: `${file.name} ist keine PDF-Datei` },
          { status: 400 }
        );
      }

      const bytes = await file.arrayBuffer();
      const extractedMeta = await extractPdfMeta(bytes, file.name);
      const extractedNames = extractedMeta.naming;
      const fallbackName = sanitizeBaseName(stripPdfExtension(file.name));

      const baseName = buildBelehrungBaseName(
        extractedNames.detectedFallbackName ?? fallbackName,
        extractedMeta.theme,
        new Date().getFullYear()
      );

      const filename = await getUniquePdfFilename(baseName);
      const filepath = join(UPLOAD_DIR, filename);

      await writeFile(filepath, Buffer.from(bytes));
      await writeStoredMeta(filename, {
        displayName: extractedMeta.displayName,
        topic: extractedMeta.theme,
      });
      await writeLastUploadTimestamp();

      uploadedFiles.push({
        name: file.name,
        size: file.size,
        savedAs: filename,
        detectedName: extractedMeta.displayName,
        detectedTheme: extractedMeta.theme,
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

type BelehrungListItem = {
  name: string;
  size: number;
  uploadedAt: string;
  modifiedAt: string;
  url: string;
  extractedName: string;
  extractedTopic: BelehrungTheme;
};

function extractDisplayMeta(filename: string): { extractedName: string; extractedTopic: BelehrungTheme } {
  const baseName = stripPdfExtension(filename).trim();
  const normalized = baseName.replace(/\s+/g, " ");

  const normalizedPattern = normalized.match(/^([a-z0-9]+)-([A-Za-z0-9]+?)(20\d{2})(?:-\d+)?$/);
  if (normalizedPattern) {
    return {
      extractedName: normalizedPattern[1],
      extractedTopic: normalizeDetectedTopic(normalizedPattern[2]),
    };
  }

  const separators = [" - ", " | ", " _ "];
  for (const separator of separators) {
    const parts = normalized
      .split(separator)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return {
        extractedName: parts[0],
        extractedTopic: normalizeDetectedTopic(parts.slice(1).join(" ")),
      };
    }
  }

  return {
    extractedName: normalized,
    extractedTopic: "Arbeitsschutz",
  };
}

export async function GET() {
  try {
    if (!existsSync(UPLOAD_DIR)) {
      return NextResponse.json({ files: [] });
    }

    const filenames = await readdir(UPLOAD_DIR);

    const filesWithMeta: BelehrungListItem[] = await Promise.all(
      filenames
        .filter((filename) => filename.toLowerCase().endsWith(".pdf"))
        .map(async (filename) => {
          const filePath = join(UPLOAD_DIR, filename);
          const fileStats = await stat(filePath);
          const displayMeta = extractDisplayMeta(filename);
          const storedMeta = await readStoredMeta(filename);
          const parsedDisplayName = await inferDisplayNameFromPdf(filePath, filename);

          const extractedName =
            !storedMeta?.displayName || looksLikeSlugName(storedMeta.displayName)
              ? parsedDisplayName
              : storedMeta.displayName;

          const extractedTopic = storedMeta?.topic ?? displayMeta.extractedTopic;

          if (
            !storedMeta ||
            storedMeta.displayName !== extractedName ||
            storedMeta.topic !== extractedTopic
          ) {
            await writeStoredMeta(filename, {
              displayName: extractedName,
              topic: extractedTopic,
            });
          }

          return {
            name: filename,
            size: fileStats.size,
            uploadedAt: fileStats.birthtime.toISOString(),
            modifiedAt: fileStats.mtime.toISOString(),
            url: `/api/belehrung-files/${encodeURIComponent(filename)}`,
            extractedName,
            extractedTopic,
          };
        })
    );

    filesWithMeta.sort(
      (a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
    );

    return NextResponse.json({ files: filesWithMeta });
  } catch (error) {
    console.error("Fehler beim Laden der Belehrungs-Dateien:", error);
    return NextResponse.json(
      { error: "Dateiliste konnte nicht geladen werden" },
      { status: 500 }
    );
  }
}
