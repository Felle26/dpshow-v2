export function sanitizeBaseName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/g, "");

  return cleaned || "Dokument";
}

export function stripPdfExtension(filename: string): string {
  return filename.replace(/\.pdf$/i, "");
}

/**
 * Extracts text after an "enstelle <digits>" (or OCR "nstelle <digits>") prefix.
 * Example: "nstelle 020 Bäckerei Brot" -> "Bäckerei Brot".
 */
export function extractEnstelleTrailingText(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0);

  for (const line of lines) {
    // Accept OCR variants/separators like:
    // "nstelle 020 Bäckerei", "enstelle:020 Küche", "nstelle 020Bäckerei"
    const tokenMatch = line.match(/\w*stelle\b\s*[:;,.\-]?\s*(.+)/i);
    if (!tokenMatch || !tokenMatch[1]) {
      continue;
    }

    const rest = tokenMatch[1].trim();
    const numberMatch = rest.match(/^(\d+)(.*)$/);
    if (!numberMatch) {
      continue;
    }

    const trailingText = numberMatch[2].replace(/^\s*[:;,.\-]?\s*/, "").trim();
    if (trailingText.length > 0) {
      return sanitizeBaseName(trailingText.replace(/\//g, " "));
    }
  }

  return null;
}

function isValidWeek(n: number): boolean {
  return n >= 1 && n <= 53;
}

function isPlausibleYear(s: string): boolean {
  const n = parseInt(s, 10);
  if (s.length === 4) return n >= 2000 && n <= 2099;
  if (s.length === 2) return n >= 0 && n <= 99;
  return false;
}

/**
 * Tries to extract a "Plan KW <number>" style name from raw PDF text.
 *
 * The year is only captured when it follows KW with an explicit separator
 * like "/" or "-" (e.g. "KW 16/2026") so that adjacent date fragments
 * like "13.04.2026" are never mistaken for a year suffix.
 */
export function extractPlanKwName(text: string): string | null {
  const normalizedText = text
    .replace(/\u00A0/g, " ")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  // 1) "Plan KW 16" / "Dienstplan K.W. 14" with optional year after "/" or "-".
  //    The year must not be followed by "." to avoid grabbing the day of a date
  //    like "13.04.2026".
  const namedMatch = normalizedText.match(
    /\b(?:plan|dienstplan)\b[\s:;,.\-_/]*k[\s.\-_]*w[\s:;,.\-_]*(\d{1,2})(?:\s*[/\-]\s*(\d{2,4})(?!\.))?(?:\s|$|[^0-9])/i
  );
  if (namedMatch) {
    const kw = parseInt(namedMatch[1], 10);
    if (isValidWeek(kw)) {
      const year =
        namedMatch[2] && isPlausibleYear(namedMatch[2])
          ? ` ${namedMatch[2]}`
          : "";
      return sanitizeBaseName(`Plan KW ${kw}${year}`);
    }
  }

  // 2) Standalone "KW 16" (no "Plan" prefix) with optional year after "/" or "-"
  const kwOnlyMatch = normalizedText.match(
    /\bk[\s.\-_]*w[\s:;,.\-_]*(\d{1,2})(?:\s*[/\-]\s*(\d{2,4})(?!\.))?(?:\s|$|[^0-9])/i
  );
  if (kwOnlyMatch) {
    const kw = parseInt(kwOnlyMatch[1], 10);
    if (isValidWeek(kw)) {
      const year =
        kwOnlyMatch[2] && isPlausibleYear(kwOnlyMatch[2])
          ? ` ${kwOnlyMatch[2]}`
          : "";
      return sanitizeBaseName(`Plan KW ${kw}${year}`);
    }
  }

  // 3) Compact / OCR-fragmented text: strip everything non-alphanumeric
  const compact = normalizedText.toLowerCase().replace(/[^a-z0-9]/g, "");

  const compactNamedMatch = compact.match(
    /(?:dienstplan|plan)kw(\d{1,2})/
  );
  if (compactNamedMatch) {
    const kw = parseInt(compactNamedMatch[1], 10);
    if (isValidWeek(kw)) {
      return sanitizeBaseName(`Plan KW ${kw}`);
    }
  }

  const compactKwOnlyMatch = compact.match(/kw(\d{1,2})/);
  if (compactKwOnlyMatch) {
    const kw = parseInt(compactKwOnlyMatch[1], 10);
    if (isValidWeek(kw)) {
      return sanitizeBaseName(`Plan KW ${kw}`);
    }
  }

  return null;
}

export interface ExtractedPdfNaming {
  detectedPlanKwName: string | null;
  detectedFallbackName: string | null;
}

function extractKuchenFeinbackLabel(text: string): string | null {
  const normalized = text
    .replace(/\u00A0/g, " ")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  // Accept common separators/variants like:
  // "Kuchen / Feinback", "Kuchen-Feinback", "Kuchen Feinback".
  const match = normalized.match(/\bkuchen\b\s*(?:[\/-]|\|)?\s*\bfeinback\b/i);
  if (!match) {
    return null;
  }

  return "Kuchen Feinback";
}

function isNoiseFallbackLine(line: string): boolean {
  const normalized = line.trim();
  if (!normalized) {
    return true;
  }

  // Common footer/header disclaimers that should never become fallback names.
  if (/^aenderungen vorbehalten!?$/i.test(normalized) || /^änderungen vorbehalten!?$/i.test(normalized)) {
    return true;
  }

  // Pure page counters like "Seite 1".
  if (/^seite\s+\d+$/i.test(normalized)) {
    return true;
  }

  // Lines that only contain punctuation/symbols are not useful names.
  if (!/[\p{L}\p{N}]/u.test(normalized)) {
    return true;
  }

  return false;
}

function pickFallbackLine(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0);

  const meaningful = lines.find((line) => !isNoiseFallbackLine(line));
  return meaningful ?? null;
}

export function extractNamingFromText(text: string): ExtractedPdfNaming {
  const planKwName = extractPlanKwName(text);
  const enstelleTrailingText = extractEnstelleTrailingText(text);
  const kuchenFeinbackLabel = extractKuchenFeinbackLabel(text);
  const namingDescriptor = enstelleTrailingText ?? kuchenFeinbackLabel;
  const combinedPlanKwName =
    planKwName && namingDescriptor
      ? sanitizeBaseName(`${planKwName} ${namingDescriptor}`)
      : planKwName;

  const fallbackLine = pickFallbackLine(text);

  return {
    detectedPlanKwName: combinedPlanKwName,
    detectedFallbackName:
      (namingDescriptor ? sanitizeBaseName(namingDescriptor) : null) ??
      (fallbackLine ? sanitizeBaseName(fallbackLine) : null),
  };
}
