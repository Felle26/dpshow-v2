'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PDFUpload from '@/app/components/PDFUpload';
import { PDFPreviewWithLayers } from '@/app/components/PDFPreviewWithLayers';

interface Drawing {
  id: string;
  fileName: string;
  pdfName: string;
  page: number;
  createdAt: string;
  url: string;
}

interface PDFFile {
  name: string;
  uploadDate: string;
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

interface FileMeta {
  kw: number | null;
  year: number;
}

interface GroupedFileGroup {
  key: string;
  label: string;
  files: PDFFile[];
}

export default function AdminPage() {
  const router = useRouter();
  const lastChangedAtRef = useRef<string | null>(null);
  const [adminAccessChecked, setAdminAccessChecked] = useState(false);
  const [adminAccessGranted, setAdminAccessGranted] = useState(false);
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [drawings, setDrawings] = useState<Record<string, Drawing[]>>({});
  const [loading, setLoading] = useState(true);
  const [deletingDrawing, setDeletingDrawing] = useState<string | null>(null);
  const [deletingPdf, setDeletingPdf] = useState<string | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);
  const [selectedPdfForPreview, setSelectedPdfForPreview] = useState<string | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [isPasswordSet, setIsPasswordSet] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [activeTab, setActiveTab] = useState<'dienstplan' | 'optionen'>('dienstplan');
  const [screensaverTimeout, setScreensaverTimeout] = useState(5);
  const [sportsSwitchMinutes, setSportsSwitchMinutes] = useState(5);
  const [weatherLocationName, setWeatherLocationName] = useState('Deutschland');
  const [weatherLatitude, setWeatherLatitude] = useState('51.1657');
  const [weatherLongitude, setWeatherLongitude] = useState('10.4515');
  const [screensaverStatus, setScreensaverStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle');

  const loadPasswordStatus = async () => {
    try {
      const res = await fetch('/api/edit-password');
      if (res.ok) {
        const data = await res.json();
        setIsPasswordSet(data.passwordSet);
      }
    } catch {
      // ignore
    }
  };

  const loadScreensaverConfig = async () => {
    try {
      setScreensaverStatus('loading');
      const res = await fetch('/api/screensaver-config');
      if (res.ok) {
        const data = await res.json();
        setScreensaverTimeout(data.timeoutMinutes);
        setSportsSwitchMinutes(data.sportsSwitchMinutes ?? 5);
        setWeatherLocationName(data.weatherLocationName ?? 'Deutschland');
        setWeatherLatitude(String(data.weatherLatitude ?? 51.1657));
        setWeatherLongitude(String(data.weatherLongitude ?? 10.4515));
      }
      setScreensaverStatus('idle');
    } catch {
      setScreensaverStatus('error');
      setTimeout(() => setScreensaverStatus('idle'), 2000);
    }
  };

  const handleSaveScreensaverTimeout = async () => {
    if (!Number.isFinite(screensaverTimeout) || screensaverTimeout < 1 || screensaverTimeout > 60) {
      setScreensaverStatus('error');
      setTimeout(() => setScreensaverStatus('idle'), 2000);
      return;
    }

    if (!Number.isFinite(sportsSwitchMinutes) || sportsSwitchMinutes < 1 || sportsSwitchMinutes > 60) {
      setScreensaverStatus('error');
      setTimeout(() => setScreensaverStatus('idle'), 2000);
      return;
    }

    if (!weatherLocationName.trim()) {
      setScreensaverStatus('error');
      setTimeout(() => setScreensaverStatus('idle'), 2000);
      return;
    }

    setScreensaverStatus('saving');
    try {
      const res = await fetch('/api/screensaver-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeoutMinutes: screensaverTimeout,
          sportsSwitchMinutes,
          weatherLocationName: weatherLocationName.trim() || 'Deutschland',
        }),
      });
      if (!res.ok) throw new Error();

      const data = await res.json();
      setSportsSwitchMinutes(data.sportsSwitchMinutes ?? sportsSwitchMinutes);
      setWeatherLatitude(String(data.weatherLatitude ?? weatherLatitude));
      setWeatherLongitude(String(data.weatherLongitude ?? weatherLongitude));
      setWeatherLocationName(data.weatherLocationName ?? weatherLocationName);
      setScreensaverStatus('saved');
      setTimeout(() => setScreensaverStatus('idle'), 2000);
    } catch {
      setScreensaverStatus('error');
      setTimeout(() => setScreensaverStatus('idle'), 2000);
    }
  };

  const fileMeta = React.useMemo<Record<string, FileMeta>>(() => {
    const map: Record<string, FileMeta> = {};
    for (const file of files) {
      map[file.name] = {
        kw: extractKw(file.name),
        year: extractYear(file.uploadDate),
      };
    }
    return map;
  }, [files]);

  const sortedFiles = React.useMemo(() => {
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

  const groupedFiles = React.useMemo<GroupedFileGroup[]>(() => {
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
  }, [sortedFiles, fileMeta]);

  const handleSavePassword = async () => {
    if (editPassword && !/^\d+$/.test(editPassword)) {
      setPasswordStatus('error');
      setTimeout(() => setPasswordStatus('idle'), 2000);
      return;
    }

    setPasswordStatus('saving');
    try {
      const res = await fetch('/api/edit-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: editPassword }),
      });
      if (!res.ok) throw new Error();
      setIsPasswordSet(!!editPassword);
      setEditPassword('');
      setPasswordStatus('saved');
      setTimeout(() => setPasswordStatus('idle'), 2000);
    } catch {
      setPasswordStatus('error');
      setTimeout(() => setPasswordStatus('idle'), 2000);
    }
  };

  const handleRemovePassword = async () => {
    if (!window.confirm('Passwort wirklich entfernen? Dann ist der Ändern-Bereich ohne Passwort zugänglich.')) return;
    setPasswordStatus('saving');
    try {
      const res = await fetch('/api/edit-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: '' }),
      });
      if (!res.ok) throw new Error();
      setIsPasswordSet(false);
      setPasswordStatus('saved');
      setTimeout(() => setPasswordStatus('idle'), 2000);
    } catch {
      setPasswordStatus('error');
      setTimeout(() => setPasswordStatus('idle'), 2000);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/files');
      if (!response.ok) throw new Error('Fehler beim Laden der Dateien');

      const data = await response.json();
      const pdfFiles = Array.isArray(data.files)
        ? data.files.filter((f: PDFFile) => f.name.toLowerCase().endsWith('.pdf'))
        : [];

      setFiles(pdfFiles);

      // Lade Zeichnungen für jede PDF
      const allDrawings: Record<string, Drawing[]> = {};
      for (const file of pdfFiles) {
        try {
          const drawResponse = await fetch(
            `/api/drawings/list?pdfName=${encodeURIComponent(file.name)}`
          );
          if (drawResponse.ok) {
            const drawData = await drawResponse.json();
            allDrawings[file.name] = drawData.drawings || [];
          }
        } catch (err) {
          console.error(`Fehler beim Laden der Zeichnungen für ${file.name}:`, err);
        }
      }
      setDrawings(allDrawings);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Prüfe, ob bereits in dieser Session bestätigt wurde
    const sessionConfirmed = typeof window !== 'undefined' && sessionStorage.getItem('adminAccessConfirmed') === 'true';

    if (sessionConfirmed) {
      // In dieser Session bereits bestätigt - direkt laden
      setAdminAccessGranted(true);
      setAdminAccessChecked(true);
    } else {
      // Erste Anfrage in dieser Session
      const confirmed = window.confirm('Admin-Bereich öffnen?');
      if (!confirmed) {
        router.replace('/');
        return;
      }

      // Speichere die Bestätigung in dieser Session
      sessionStorage.setItem('adminAccessConfirmed', 'true');
      setAdminAccessGranted(true);
      setAdminAccessChecked(true);
    }
  }, [router]);

  useEffect(() => {
    if (!adminAccessGranted) {
      return;
    }

    loadData();
    loadPasswordStatus();
    loadScreensaverConfig();
  }, [adminAccessGranted]);

  useEffect(() => {
    if (!adminAccessGranted) {
      return;
    }

    let ignore = false;

    fetch('/api/upload-timestamp')
      .then((response) => response.json())
      .then((data) => {
        if (!ignore) {
          lastChangedAtRef.current = data.lastChangedAt ?? null;
        }
      })
      .catch(() => {
        // ignore
      });

    const intervalId = window.setInterval(() => {
      fetch('/api/upload-timestamp')
        .then((response) => response.json())
        .then((data) => {
          const nextTimestamp = data.lastChangedAt ?? null;
          if (!nextTimestamp || nextTimestamp === lastChangedAtRef.current || ignore) {
            return;
          }

          lastChangedAtRef.current = nextTimestamp;
          loadData();
          loadPasswordStatus();
        })
        .catch(() => {
          // ignore
        });
    }, 5000);

    return () => {
      ignore = true;
      window.clearInterval(intervalId);
    };
  }, [adminAccessGranted]);

  if (!adminAccessChecked || !adminAccessGranted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-lg font-semibold text-slate-700 dark:bg-slate-950 dark:text-slate-200">
        Sicherheitsabfrage wird geprüft...
      </div>
    );
  }

  const handleDeleteDrawing = async (drawingId: string, pdfName: string) => {
    if (!window.confirm('Änderung wirklich löschen?')) return;

    setDeletingDrawing(drawingId);
    try {
      const response = await fetch('/api/drawings/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawingId, pdfName }),
      });

      if (!response.ok) throw new Error('Fehler beim Löschen');

      setDrawings((prev) => ({
        ...prev,
        [pdfName]: prev[pdfName]?.filter((d) => d.id !== drawingId) || [],
      }));

      alert('Änderung gelöscht');
    } catch (err) {
      alert(`Fehler: ${err}`);
    } finally {
      setDeletingDrawing(null);
    }
  };

  const handleDeletePdf = async (fileName: string) => {
    if (!window.confirm('PDF und alle zugehörigen Änderungen wirklich löschen?')) return;

    setDeletingPdf(fileName);
    try {
      const response = await fetch('/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName }),
      });

      if (!response.ok) throw new Error('Fehler beim Löschen');

      setFiles((prev) => prev.filter((f) => f.name !== fileName));
      setDrawings((prev) => {
        const newDrawings = { ...prev };
        delete newDrawings[fileName];
        return newDrawings;
      });

      setSelectedPdfForPreview((prev) => (prev === fileName ? null : prev));

      alert('PDF gelöscht');
      router.refresh();
    } catch (err) {
      alert(`Fehler: ${err}`);
    } finally {
      setDeletingPdf(null);
    }
  };

  const handleDeleteGroup = async (group: GroupedFileGroup) => {
    const fileCount = group.files.length;
    if (
      !window.confirm(
        `Alle ${fileCount} PDF(s) der Gruppe "${group.label}" und zugehörige Änderungen wirklich löschen?`
      )
    ) {
      return;
    }

    setDeletingGroup(group.key);
    try {
      let successCount = 0;
      for (const file of group.files) {
        try {
          const response = await fetch('/api/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name }),
          });

          if (response.ok) {
            successCount++;
          }
        } catch (err) {
          console.error(`Fehler beim Löschen von ${file.name}:`, err);
        }
      }

      if (successCount === fileCount) {
        setFiles((prev) => prev.filter((f) => !group.files.map((gf) => gf.name).includes(f.name)));
        setDrawings((prev) => {
          const newDrawings = { ...prev };
          for (const file of group.files) {
            delete newDrawings[file.name];
          }
          return newDrawings;
        });
        setSelectedPdfForPreview((prev) =>
          group.files.map((f) => f.name).includes(prev ?? '') ? null : prev
        );
        alert(`${successCount} PDF(s) aus der Gruppe gelöscht`);
        router.refresh();
      } else {
        alert(`Nur ${successCount} von ${fileCount} PDF(s) gelöscht`);
      }
    } catch (err) {
      alert(`Fehler beim Löschen der Gruppe: ${err}`);
    } finally {
      setDeletingGroup(null);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Admin Bereich
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Verwalte Dienstplan-PDFs und Zeichnungen
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
          >
            ← Zurück
          </Link>
        </div>
      </header>

      <main className="flex-1 p-6 flex gap-6 overflow-hidden flex-col">
        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-gray-300 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('dienstplan')}
            className={`px-4 py-3 font-semibold border-b-2 transition-colors ${
              activeTab === 'dienstplan'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            📋 Dienstpläne
          </button>
          <button
            onClick={() => setActiveTab('optionen')}
            className={`px-4 py-3 font-semibold border-b-2 transition-colors ${
              activeTab === 'optionen'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            ⚙️ Optionen
          </button>
        </div>

        {/* Tab Content Container */}
        <div className="flex-1 overflow-hidden flex gap-6">
          {/* Dienstplan Tab */}
          {activeTab === 'dienstplan' && (
            <div className="flex-1 overflow-y-auto flex flex-col gap-6">
              {/* Upload Section */}
              <section className="bg-white dark:bg-slate-900 rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  📄 PDF hochladen
                </h2>
                <PDFUpload onUploadComplete={() => loadData()} />
              </section>

              {/* Files Section */}
              <section className="bg-white dark:bg-slate-900 rounded-lg shadow-lg p-6 flex-1 overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              📋 Hochgeladene Dienstpläne
            </h2>

            {loading ? (
              <p className="text-gray-600 dark:text-gray-400">Lädt...</p>
            ) : files.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400">Keine PDFs vorhanden</p>
            ) : (
              <div className="space-y-6">
                {groupedFiles.map((group) => (
                  <div
                    key={group.key}
                    className="border-2 border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-slate-800"
                  >
                    {/* Group Header */}
                    <div className="bg-linear-to-r from-blue-100 to-blue-50 dark:from-slate-700 dark:to-slate-800 px-4 py-3 border-b border-gray-300 dark:border-gray-700 flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                          {group.label}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {group.files.length} PDF{group.files.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteGroup(group)}
                        disabled={deletingGroup === group.key}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-red-300 dark:disabled:bg-red-900 text-white rounded-lg transition-colors font-semibold whitespace-nowrap"
                      >
                        {deletingGroup === group.key ? '🗑️ Löscht...' : '🗑️ Gruppe löschen'}
                      </button>
                    </div>

                    {/* Group Content */}
                    <div className="p-4 space-y-3">
                      {group.files.map((file) => (
                        <div
                          key={file.name}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-slate-900"
                        >
                          <div className="flex items-start justify-between mb-2 gap-3 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                                {file.name}
                              </h4>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                Hochgeladen: {new Date(file.uploadDate).toLocaleString('de-DE')}
                              </p>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <button
                                onClick={() =>
                                  setSelectedPdfForPreview(
                                    selectedPdfForPreview === file.name ? null : file.name
                                  )
                                }
                                className={`px-3 py-2 rounded-lg transition-colors font-semibold text-sm whitespace-nowrap ${
                                  selectedPdfForPreview === file.name
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-blue-400 hover:bg-blue-500 text-white'
                                }`}
                              >
                                {selectedPdfForPreview === file.name ? '👁️ An' : '👁️ Aus'}
                              </button>
                              <button
                                onClick={() => handleDeletePdf(file.name)}
                                disabled={deletingPdf === file.name}
                                className="px-3 py-2 bg-red-500 hover:bg-red-600 disabled:bg-red-300 dark:disabled:bg-red-900 text-white rounded-lg transition-colors font-semibold text-sm whitespace-nowrap"
                              >
                                {deletingPdf === file.name ? '🗑️ Löscht...' : '🗑️ Löschen'}
                              </button>
                            </div>
                          </div>

                          {/* Zeichnungen für diese PDF */}
                          {drawings[file.name] && drawings[file.name].length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-700">
                              <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                ✏️ Zeichnungen: {drawings[file.name].length}
                              </h5>
                              <div className="space-y-1 ml-2">
                                {drawings[file.name].map((drawing) => (
                                  <div
                                    key={drawing.id}
                                    className="flex items-center justify-between p-2 bg-gray-100 dark:bg-slate-800 rounded text-xs"
                                  >
                                    <div className="flex-1">
                                      <p className="font-medium text-gray-900 dark:text-white">
                                        Seite {drawing.page}
                                      </p>
                                      <p className="text-gray-600 dark:text-gray-400">
                                        {new Date(drawing.createdAt).toLocaleString('de-DE')}
                                      </p>
                                    </div>
                                    <div className="flex gap-1">
                                      <a
                                        href={drawing.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                                      >
                                        👁️
                                      </a>
                                      <button
                                        onClick={() => handleDeleteDrawing(drawing.id, file.name)}
                                        disabled={deletingDrawing === drawing.id}
                                        className="px-2 py-1 bg-red-500 hover:bg-red-600 disabled:bg-red-300 dark:disabled:bg-red-900 text-white rounded transition-colors"
                                      >
                                        🗑️
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
              </section>
            </div>
          )}

          {/* Optionen Tab */}
          {activeTab === 'optionen' && (
            <div className="flex-1 overflow-y-auto flex flex-col gap-6">
              {/* 1. Einschaltzeit */}
              <section className="bg-white dark:bg-slate-900 rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  1. Einschaltzeit
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Der Screensaver wird angezeigt, wenn auf der Show-Seite für die gewählte Zeit keine Aktivität erfolgt.
                </p>
                <div className="flex gap-3 flex-wrap items-center">
                  <div className="flex items-center gap-2">
                    <label htmlFor="screensaver-timeout" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Timeout (Minuten):
                    </label>
                    <input
                      id="screensaver-timeout"
                      type="number"
                      min="1"
                      max="60"
                      value={screensaverTimeout}
                      onChange={(e) => setScreensaverTimeout(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 5)))}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveScreensaverTimeout()}
                      className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="sports-switch-minutes" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Sport-Reiter Wechsel (Minuten):
                    </label>
                    <input
                      id="sports-switch-minutes"
                      type="number"
                      min="1"
                      max="60"
                      value={sportsSwitchMinutes}
                      onChange={(e) => setSportsSwitchMinutes(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 5)))}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveScreensaverTimeout()}
                      className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <button
                    onClick={handleSaveScreensaverTimeout}
                    disabled={screensaverStatus === 'saving' || screensaverStatus === 'loading'}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors whitespace-nowrap text-sm"
                  >
                    {screensaverStatus === 'loading' ? 'Lädt...' : screensaverStatus === 'saving' ? 'Speichert...' : screensaverStatus === 'saved' ? '✓ Gespeichert' : screensaverStatus === 'error' ? '✗ Fehler' : '💾 Speichern'}
                  </button>
                </div>
              </section>

              {/* 2. Wetterbericht */}
              <section className="bg-white dark:bg-slate-900 rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  2. Wetterbericht
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Ort und Koordinaten für DWD-Wetterdaten im Screensaver.
                </p>
                <div className="flex gap-3 flex-wrap items-center">
                  <div className="flex items-center gap-2">
                    <label htmlFor="weather-location" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Ort:
                    </label>
                    <input
                      id="weather-location"
                      type="text"
                      value={weatherLocationName}
                      onChange={(e) => setWeatherLocationName(e.target.value)}
                      className="w-44 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="weather-latitude" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Breite:
                    </label>
                    <input
                      id="weather-latitude"
                      type="text"
                      value={weatherLatitude}
                      readOnly
                      className="w-28 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="weather-longitude" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Länge:
                    </label>
                    <input
                      id="weather-longitude"
                      type="text"
                      value={weatherLongitude}
                      readOnly
                      className="w-28 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <button
                    onClick={handleSaveScreensaverTimeout}
                    disabled={screensaverStatus === 'saving' || screensaverStatus === 'loading'}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors whitespace-nowrap text-sm"
                  >
                    {screensaverStatus === 'loading' ? 'Lädt...' : screensaverStatus === 'saving' ? 'Speichert...' : screensaverStatus === 'saved' ? '✓ Gespeichert' : screensaverStatus === 'error' ? '✗ Fehler' : '💾 Speichern'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                  Hinweis: Koordinaten werden automatisch aus dem Ortsnamen berechnet.
                </p>
              </section>

              {/* Pin-Sektion */}
              <section className="bg-white dark:bg-slate-900 rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  🔒 Ändern-Bereich Pin
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  {isPasswordSet
                    ? 'Eine Pin ist gesetzt. Der Ändern-Bereich in der Show-Ansicht ist geschützt. Es sind nur Zahlen erlaubt.'
                    : 'Keine Pin gesetzt – der Ändern-Bereich ist frei zugänglich. Neue Pins dürfen nur Zahlen enthalten.'}
                </p>
                <div className="flex gap-2 flex-wrap items-center">
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Neue Pin..."
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value.replace(/\D+/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePassword()}
                    className="flex-1 min-w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                  />
                  <button
                    onClick={handleSavePassword}
                    disabled={passwordStatus === 'saving' || !editPassword}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors whitespace-nowrap text-sm"
                  >
                    {passwordStatus === 'saving' ? 'Speichert...' : passwordStatus === 'saved' ? '✓ Gespeichert' : passwordStatus === 'error' ? '✗ Fehler' : '💾 Pin speichern'}
                  </button>
                  {isPasswordSet && (
                    <button
                      onClick={handleRemovePassword}
                      disabled={passwordStatus === 'saving'}
                      className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors whitespace-nowrap text-sm"
                    >
                      🔓 Pin entfernen
                    </button>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* Right Panel: PDF Preview with Layers (nur im Dienstplan-Tab) */}
          {activeTab === 'dienstplan' && selectedPdfForPreview && (
            <div className="flex-1 bg-white dark:bg-slate-900 rounded-lg shadow-lg overflow-hidden flex flex-col border-2 border-blue-500 dark:border-blue-600">
              <PDFPreviewWithLayers
                pdfUrl={`/dienstplan-uploads/${encodeURIComponent(selectedPdfForPreview)}`}
                pdfName={selectedPdfForPreview}
                drawings={drawings[selectedPdfForPreview] || []}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
