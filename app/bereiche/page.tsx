'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PDFPreviewWithLayers } from '@/app/components/PDFPreviewWithLayers';

interface PDFFile {
  name: string;
  uploadDate: string;
}

interface NamedGroup {
  key: string;
  label: string;
  exactPhrase: string;
}

const NAMED_GROUPS: NamedGroup[] = [
  { key: 'kueche', label: 'Küche', exactPhrase: 'kueche' },
  { key: 'kuchen-feinback', label: 'Kuchen Feinback', exactPhrase: 'kuchen feinback' },
  {
    key: 'baeckerei-brot-broetchen-ofen',
    label: 'Bäckerei Brot Brötchen Ofen',
    exactPhrase: 'baeckerei brot broetchen ofen',
  },
  { key: 'kraftfahrer', label: 'Kraftfahrer', exactPhrase: 'kraftfahrer' },
  { key: 'konditorei', label: 'Konditorei', exactPhrase: 'konditorei' },
];

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchesNamedGroup(fileName: string, group: NamedGroup): boolean {
  const normalized = normalizeName(fileName.replace(/\.pdf$/i, ''));
  const phrase = normalizeName(group.exactPhrase);
  const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^| )${escapedPhrase}( |$)`, 'i');
  return pattern.test(normalized);
}

function parseNameDateTimestamp(fileName: string): number | null {
  const base = fileName.replace(/\.pdf$/i, '');

  const explicitDates = [...base.matchAll(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2}|\d{4})\b/g)];
  if (explicitDates.length > 0) {
    const timestamps = explicitDates
      .map((match) => {
        const day = Number.parseInt(match[1], 10);
        const month = Number.parseInt(match[2], 10);
        const yearRaw = Number.parseInt(match[3], 10);
        const year = match[3].length === 2 ? 2000 + yearRaw : yearRaw;

        const date = new Date(year, month - 1, day);
        const valid =
          date.getFullYear() === year &&
          date.getMonth() === month - 1 &&
          date.getDate() === day;

        return valid ? date.getTime() : Number.NaN;
      })
      .filter((value) => Number.isFinite(value));

    if (timestamps.length > 0) {
      return Math.max(...timestamps);
    }
  }

  const kwMatch = base.match(/\bkw\s*([0-5]?\d)(?:\D+(20\d{2}|\d{2}))?/i);
  if (kwMatch) {
    const week = Number.parseInt(kwMatch[1], 10);
    const yearPart = kwMatch[2];
    if (Number.isFinite(week) && week >= 1 && week <= 53 && yearPart) {
      const parsedYear = Number.parseInt(yearPart, 10);
      const year = yearPart.length === 2 ? 2000 + parsedYear : parsedYear;

      const jan4 = new Date(Date.UTC(year, 0, 4));
      const jan4Day = jan4.getUTCDay() || 7;
      const week1Monday = new Date(jan4);
      week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

      const targetMonday = new Date(week1Monday);
      targetMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
      return targetMonday.getTime();
    }
  }

  return null;
}

export default function BereichePage() {
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeGroupKey, setActiveGroupKey] = useState<string>(NAMED_GROUPS[0]?.key ?? 'kueche');

  useEffect(() => {
    let ignore = false;

    const loadFiles = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/files');
        if (!response.ok) {
          throw new Error('Dateiliste konnte nicht geladen werden.');
        }

        const data = await response.json();
        const pdfFiles = Array.isArray(data.files)
          ? data.files.filter((f: PDFFile) => f.name.toLowerCase().endsWith('.pdf'))
          : [];

        if (!ignore) {
          setFiles(pdfFiles);
          setError(null);
        }
      } catch (err) {
        if (!ignore) {
          setError(`Fehler: ${err}`);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadFiles();

    return () => {
      ignore = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const sorted = [...files].sort((a, b) => {
      const dateA = parseNameDateTimestamp(a.name) ?? new Date(a.uploadDate).getTime();
      const dateB = parseNameDateTimestamp(b.name) ?? new Date(b.uploadDate).getTime();

      if (dateA !== dateB) {
        return dateB - dateA;
      }

      return b.name.localeCompare(a.name, 'de', { numeric: true, sensitivity: 'base' });
    });

    return NAMED_GROUPS.map((group) => ({
      ...group,
      files: sorted.filter((file) => matchesNamedGroup(file.name, group)),
    }));
  }, [files]);

  useEffect(() => {
    if (!grouped.some((group) => group.key === activeGroupKey)) {
      setActiveGroupKey(grouped[0]?.key ?? NAMED_GROUPS[0]?.key ?? 'kueche');
    }
  }, [activeGroupKey, grouped]);

  const activeGroup =
    grouped.find((group) => group.key === activeGroupKey) ?? grouped[0] ?? null;

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-200 p-6 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Dienstplan Bereiche</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Anzeige nach Bereichen mit separaten Reitern
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/show"
                className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Zur Show
              </Link>
              <Link
                href="/admin"
                className="rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-orange-700"
              >
                Zum Admin
              </Link>
              <Link
                href="/"
                className="rounded-lg bg-slate-300 px-4 py-2 font-semibold text-slate-900 transition-colors hover:bg-slate-400 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
              >
                Startseite
              </Link>
            </div>
          </div>
        </header>

        {loading && (
          <section className="rounded-xl border border-slate-200 bg-white p-6 text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            Lädt Dienstpläne...
          </section>
        )}

        {error && (
          <section className="rounded-xl border border-red-300 bg-red-50 p-6 text-red-900 shadow-sm dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </section>
        )}

        {!loading && !error && (
          <section className="rounded-xl border border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div className="flex flex-wrap gap-2">
                {grouped.map((group) => (
                  <button
                    key={group.key}
                    onClick={() => setActiveGroupKey(group.key)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                      activeGroup?.key === group.key
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {group.label} ({group.files.length})
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4">
              {activeGroup && activeGroup.files.length > 0 ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <span className="font-semibold">Aktiver Bereich:</span> {activeGroup.label}
                  </div>

                  <div className="space-y-6">
                    {activeGroup.files.map((file) => (
                      <div
                        key={file.name}
                        className="overflow-hidden rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{file.name}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            Hochgeladen: {new Date(file.uploadDate).toLocaleString('de-DE')}
                          </p>
                        </div>
                        <div className="h-[68vh] min-h-120 overflow-hidden">
                          <PDFPreviewWithLayers
                            pdfUrl={`/dienstplan-uploads/${encodeURIComponent(file.name)}`}
                            pdfName={file.name}
                            showViewModeControls={false}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-6 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Für diesen Bereich wurden noch keine passenden PDFs gefunden.
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
