'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

if (typeof window !== 'undefined') {
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
}

interface PDFFile {
  name: string;
  uploadDate: string;
  released?: boolean;
  archived?: boolean;
}

interface PDFThumbnailStripProps {
  onPDFSelect: (pdfName: string, pdfUrl: string) => void;
  selectedPdfName?: string;
  onNewFilesDetected?: () => void;
}

interface FileMeta {
  kw: number | null;
  year: number;
}

function extractKw(name: string): number | null {
  const kwMatch = name.match(/(?:^|[^a-z0-9])k\W*w\W*([0-5]?\d)(?:\D|$)/i);
  if (!kwMatch) {
    return null;
  }

  const week = Number.parseInt(kwMatch[1], 10);
  if (!Number.isFinite(week) || week < 1 || week > 53) {
    return null;
  }

  return week;
}

function extractYear(uploadDate: string): number {
  const parsed = new Date(uploadDate);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.getFullYear();
  }

  return new Date().getFullYear();
}

function getIsoWeekRange(year: number, week: number): { start: Date; end: Date } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const start = new Date(week1Monday);
  start.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  return { start, end };
}

function formatDate(date: Date, shortYear = false): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear());
  const yearPart = shortYear ? year.slice(-2) : year;

  return `${day}.${month}.${yearPart}`;
}

export function PDFThumbnailStrip({ onPDFSelect, selectedPdfName, onNewFilesDetected }: PDFThumbnailStripProps) {
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const knownFileNamesRef = React.useRef<Set<string> | null>(null);
  const lastUploadAtRef = React.useRef<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  function scrollStrip(direction: 'left' | 'right') {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.85;
    scrollRef.current.scrollBy({ left: direction === 'right' ? amount : -amount, behavior: 'smooth' });
  }

  const fileMeta = useMemo<Record<string, FileMeta>>(() => {
    const map: Record<string, FileMeta> = {};

    for (const file of files) {
      map[file.name] = {
        kw: extractKw(file.name),
        year: extractYear(file.uploadDate),
      };
    }

    return map;
  }, [files]);

  const sortedFiles = useMemo(() => {
    const copy = [...files];
    copy.sort((a, b) => {
      const metaA = fileMeta[a.name];
      const metaB = fileMeta[b.name];
      const kwA = metaA?.kw ?? null;
      const kwB = metaB?.kw ?? null;
      const yearA = metaA?.year ?? new Date().getFullYear();
      const yearB = metaB?.year ?? new Date().getFullYear();

      if (kwA !== null && kwB !== null) {
        if (yearA !== yearB) {
          return yearB - yearA;
        }

        if (kwA !== kwB) {
          return kwB - kwA;
        }

        return b.name.localeCompare(a.name, 'de', { numeric: true, sensitivity: 'base' });
      }

      if (kwA !== null) {
        return -1;
      }

      if (kwB !== null) {
        return 1;
      }

      return b.name.localeCompare(a.name, 'de', { numeric: true, sensitivity: 'base' });
    });

    return copy;
  }, [fileMeta, files]);

  const groupedFiles = useMemo(() => {
    const groups = new Map<string, { label: string; files: PDFFile[] }>();

    for (const file of sortedFiles) {
      const meta = fileMeta[file.name];
      const kw = meta?.kw ?? null;
      const year = meta?.year ?? new Date().getFullYear();
      const key = kw === null ? 'ohne-kw' : `kw-${kw}-${year}`;

      let label = 'Ohne KW';
      if (kw !== null) {
        const range = getIsoWeekRange(year, kw);
        label = `KW ${kw} | ${formatDate(range.start, true)} - ${formatDate(range.end)}`;
      }

      if (!groups.has(key)) {
        groups.set(key, { label, files: [] });
      }

      groups.get(key)!.files.push(file);
    }

    return [...groups.entries()].map(([key, value]) => ({ key, ...value }));
  }, [sortedFiles]);

  useEffect(() => {
    if (sortedFiles.length === 0) {
      return;
    }

    if (selectedPdfName && sortedFiles.some((file) => file.name === selectedPdfName)) {
      return;
    }

    const firstFile = sortedFiles[0];
    onPDFSelect(firstFile.name, `/dienstplan-uploads/${encodeURIComponent(firstFile.name)}`);
  }, [onPDFSelect, selectedPdfName, sortedFiles]);

  // Laden der Dateien
  useEffect(() => {
    let ignore = false;

    const createPdfThumbnail = async (pdfUrl: string): Promise<string | null> => {
      try {
        const loadingTask = getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        // Fit in the larger touch-friendly strip tile size.
        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = 56;
        const targetHeight = 76;
        const scale = Math.min(targetWidth / baseViewport.width, targetHeight / baseViewport.height);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const context = canvas.getContext('2d');
        if (!context) {
          return null;
        }

        await page.render({
          canvasContext: context,
          viewport,
        }).promise;

        return canvas.toDataURL('image/png');
      } catch {
        return null;
      }
    };

    const loadFiles = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/files?scope=show', { cache: 'no-store' });
        if (!response.ok) throw new Error('Fehler beim Laden der Dateien');

        const data = await response.json();
        const pdfFiles = (Array.isArray(data.files)
          ? data.files.filter((f: PDFFile) => f.name.toLowerCase().endsWith('.pdf'))
          : []) as PDFFile[];

        setFiles(pdfFiles);

        // Merke initiale Dateinamen; beim erneuten Laden auf neue prüfen
        const names = new Set<string>(pdfFiles.map((f: PDFFile) => f.name));
        if (knownFileNamesRef.current === null) {
          knownFileNamesRef.current = names;
        } else {
          const hasNew = [...names].some((n) => !knownFileNamesRef.current!.has(n));
          if (hasNew) {
            knownFileNamesRef.current = names;
            if (!ignore && onNewFilesDetected) onNewFilesDetected();
          }
        }

        // Lade Thumbnails
        if (pdfFiles.length > 0) {
          const thumbs: Record<string, string> = {};
          for (const file of pdfFiles) {
            try {
              const pdfUrl = `/api/files/${encodeURIComponent(file.name)}`;
              const thumbnail = await createPdfThumbnail(pdfUrl);
              if (thumbnail) {
                thumbs[file.name] = thumbnail;
              }
            } catch (err) {
              console.error(`Fehler beim Laden des Thumbnails für ${file.name}:`, err);
            }
          }
          if (!ignore) {
            setThumbnails(thumbs);
          }
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

    const syncUploadTimestamp = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      fetch('/api/upload-timestamp')
        .then((r) => r.json())
        .then((data) => {
          const ts: string | null = data.lastChangedAt ?? null;
          if (lastUploadAtRef.current === null) {
            lastUploadAtRef.current = ts;
            return;
          }

          if (ts && ts !== lastUploadAtRef.current) {
            lastUploadAtRef.current = ts;
            if (onNewFilesDetected) onNewFilesDetected();
          }
        })
        .catch(() => {});
    };

    syncUploadTimestamp();

    // Alle 30 Sekunden prüfen, ob sich die Dateiliste geändert hat.
    const intervalId = setInterval(syncUploadTimestamp, 30_000);
    document.addEventListener('visibilitychange', syncUploadTimestamp);

    return () => {
      ignore = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', syncUploadTimestamp);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-20 items-center justify-center bg-gray-100 dark:bg-slate-800">
        <span className="text-base text-gray-600 dark:text-gray-300">Lädt...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-20 items-center justify-center bg-red-100 text-base text-red-900 dark:bg-red-900 dark:text-red-100">
        {error}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center bg-gray-100 dark:bg-slate-800">
        <span className="text-base text-gray-600 dark:text-gray-300">Keine PDFs gefunden</span>
      </div>
    );
  }

  return (
    <div className="relative border-t border-gray-300 bg-white px-3 py-4 dark:border-gray-700 dark:bg-slate-900">
      {/* Left scroll button */}
      <button
        onClick={() => scrollStrip('left')}
        aria-label="Nach links scrollen"
        className="absolute left-0 top-1/2 z-10 -translate-y-1/2 flex h-full w-12 items-center justify-center bg-linear-to-r from-white via-white/90 to-transparent text-gray-600 transition-opacity hover:text-gray-900 dark:from-slate-900 dark:via-slate-900/90 dark:text-gray-300 dark:hover:text-white"
      >
        <span className="text-2xl font-bold">‹</span>
      </button>

      {/* Right scroll button */}
      <button
        onClick={() => scrollStrip('right')}
        aria-label="Nach rechts scrollen"
        className="absolute right-0 top-1/2 z-10 -translate-y-1/2 flex h-full w-12 items-center justify-center bg-linear-to-l from-white via-white/90 to-transparent text-gray-600 transition-opacity hover:text-gray-900 dark:from-slate-900 dark:via-slate-900/90 dark:text-gray-300 dark:hover:text-white"
      >
        <span className="text-2xl font-bold">›</span>
      </button>

      <div
        ref={scrollRef}
        className="snap-x snap-mandatory overflow-x-auto px-10 py-1 [scrollbar-none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex min-w-max gap-4">
          {groupedFiles.map((group) => (
            <section
              key={group.key}
              className="shrink-0 snap-start rounded-xl border border-gray-300 bg-gray-50 p-3 dark:border-gray-700 dark:bg-slate-800"
              style={{ width: 'min(90vw, 52rem)' }}
            >
              <h3 className="mb-3 text-base font-bold text-gray-800 dark:text-gray-100">{group.label}</h3>
              <div className="grid grid-cols-3 gap-2">
                {group.files.map((file) => (
                  <button
                    key={file.name}
                    onClick={() =>
                      onPDFSelect(file.name, `/dienstplan-uploads/${encodeURIComponent(file.name)}`)
                    }
                    title={file.name}
                    className={`flex min-h-28 w-full flex-col items-center gap-2 rounded-lg border px-2 py-2 text-center transition-colors ${
                      selectedPdfName === file.name
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500 dark:bg-blue-900/20'
                        : 'border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-slate-700'
                    }`}
                  >
                    {thumbnails[file.name] ? (
                      <div className="relative h-16 w-12 overflow-hidden rounded-sm border border-gray-300 bg-white dark:border-gray-600">
                        <img
                          src={thumbnails[file.name]}
                          alt={file.name}
                          className="h-full w-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="flex h-16 w-12 items-center justify-center rounded-sm border border-gray-300 bg-gray-200 dark:border-gray-600 dark:bg-slate-700">
                        <span className="text-sm">📄</span>
                      </div>
                    )}

                    <span className="line-clamp-2 text-xs font-semibold leading-tight text-gray-800 dark:text-gray-200">
                      {file.name.replace(/\.pdf$/i, '')}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
