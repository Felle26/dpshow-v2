'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { PDFViewer } from '../components/PDFViewer';
import { PDFThumbnailStrip } from '../components/PDFThumbnailStrip';
import { Screensaver } from '../components/Screensaver';
import { OnScreenKeyboard } from '../components/OnScreenKeyboard';

export default function ShowPage() {
  const [selectedPdf, setSelectedPdf] = useState<{ name: string; url: string } | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [isScreensaverActive, setIsScreensaverActive] = useState(false);
  const [screensaverTimeout, setScreensaverTimeout] = useState(5);
  const [showQuickLinkEnabled, setShowQuickLinkEnabled] = useState(false);
  const [showQuickLinkUrl, setShowQuickLinkUrl] = useState('');
  const [isQuickLinkOpen, setIsQuickLinkOpen] = useState(false);
  const [showQuickLinkKeyboard, setShowQuickLinkKeyboard] = useState(false);
  const [quickLinkKeyboardValue, setQuickLinkKeyboardValue] = useState('');
  const [pixelShiftIndex, setPixelShiftIndex] = useState(0);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const quickLinkIframeRef = useRef<HTMLIFrameElement | null>(null);

  const pixelShiftOffsets = React.useMemo(
    () => [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 0, y: 2 },
      { x: -1, y: 2 },
      { x: -2, y: 1 },
      { x: -2, y: 0 },
      { x: -2, y: -1 },
      { x: -1, y: -2 },
      { x: 0, y: -2 },
      { x: 1, y: -2 },
      { x: 2, y: -1 },
    ],
    []
  );

  const handlePDFSelect = (pdfName: string, pdfUrl: string) => {
    setSelectedPdf({ name: pdfName, url: pdfUrl });
  };

  const handleDrawingSaved = () => {
    // Optional: Refresh thumbnail strip
    console.log('Zeichnung gespeichert');
  };

  const handleNewFilesDetected = useCallback(() => {
    setShowUpdateBanner(true);
  }, []);

  const loadScreensaverConfig = async () => {
    try {
      const res = await fetch('/api/screensaver-config');
      if (res.ok) {
        const data = await res.json();
        setScreensaverTimeout(data.timeoutMinutes);
        setShowQuickLinkEnabled(Boolean(data.showQuickLinkEnabled));
        setShowQuickLinkUrl(typeof data.showQuickLinkUrl === 'string' ? data.showQuickLinkUrl : '');
      }
    } catch {
      // ignore
    }
  };

  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsScreensaverActive(false);

    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    inactivityTimerRef.current = setTimeout(() => {
      setIsScreensaverActive(true);
    }, screensaverTimeout * 60 * 1000);
  }, [screensaverTimeout]);

  const handleScreensaverActivity = useCallback(() => {
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  useEffect(() => {
    loadScreensaverConfig();
  }, []);

  useEffect(() => {
    if (!showQuickLinkEnabled || !showQuickLinkUrl) {
      setIsQuickLinkOpen(false);
      setShowQuickLinkKeyboard(false);
      setQuickLinkKeyboardValue('');
    }
  }, [showQuickLinkEnabled, showQuickLinkUrl]);

  const quickLinkTargetOrigin = React.useMemo(() => {
    try {
      return new URL(showQuickLinkUrl).origin;
    } catch {
      return '*';
    }
  }, [showQuickLinkUrl]);

  const postQuickLinkMessage = useCallback(
    (payload: Record<string, unknown>) => {
      const frameWindow = quickLinkIframeRef.current?.contentWindow;
      if (!frameWindow) {
        return;
      }

      frameWindow.postMessage(
        {
          source: 'dpshow-osk',
          ...payload,
        },
        quickLinkTargetOrigin
      );
    },
    [quickLinkTargetOrigin]
  );

  const handleQuickLinkKeyboardChange = useCallback(
    (next: string) => {
      setQuickLinkKeyboardValue((prev) => {
        if (next === prev) {
          return prev;
        }

        if (next.length === 0 && prev.length > 0) {
          postQuickLinkMessage({ type: 'clear' });
          return next;
        }

        if (next.length === prev.length - 1 && prev.startsWith(next)) {
          postQuickLinkMessage({ type: 'backspace' });
          return next;
        }

        if (next.length === prev.length + 1 && next.startsWith(prev)) {
          postQuickLinkMessage({ type: 'append', value: next.slice(-1) });
          return next;
        }

        postQuickLinkMessage({ type: 'setValue', value: next });
        return next;
      });
    },
    [postQuickLinkMessage]
  );

  const handleQuickLinkKeyboardEnter = useCallback(() => {
    postQuickLinkMessage({ type: 'submit' });
  }, [postQuickLinkMessage]);

  useEffect(() => {
    // Starte den Inaktivitäts-Timer
    resetInactivityTimer();

    // Event-Listener für Benutzeraktivität
    const handleActivity = () => {
      resetInactivityTimer();
    };

    window.addEventListener('click', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [resetInactivityTimer]);

  useEffect(() => {
    const disableContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const disableRightMouseButton = (event: MouseEvent) => {
      if (event.button === 2) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener('contextmenu', disableContextMenu, true);
    document.addEventListener('mousedown', disableRightMouseButton, true);

    return () => {
      document.removeEventListener('contextmenu', disableContextMenu, true);
      document.removeEventListener('mousedown', disableRightMouseButton, true);
    };
  }, []);

  useEffect(() => {
    const shiftInterval = window.setInterval(() => {
      setPixelShiftIndex((prev) => (prev + 1) % pixelShiftOffsets.length);
    }, 90000);

    return () => {
      window.clearInterval(shiftInterval);
    };
  }, [pixelShiftOffsets]);

  const currentPixelShift = pixelShiftOffsets[pixelShiftIndex] ?? { x: 0, y: 0 };

  return (
    <div
      className="flex flex-col h-full bg-slate-100 dark:bg-slate-950"
      style={{
        transform: `translate3d(${currentPixelShift.x}px, ${currentPixelShift.y}px, 0) scale(1.01)`,
        transformOrigin: 'center center',
        transition: 'transform 1200ms ease-in-out',
      }}
    >
      {/* Screensaver */}
      {isScreensaverActive && <Screensaver onActivity={handleScreensaverActivity} />}

      {/* Neue-Dateien-Banner */}
      {showUpdateBanner && (
        <div className="flex items-center justify-between gap-4 bg-amber-400 dark:bg-amber-500 px-5 py-3 text-amber-900 dark:text-amber-950 z-30">
          <span className="text-base font-semibold">
            📂 Dateiliste hat sich geändert – Seite aktualisieren um die Änderungen zu sehen.
          </span>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => window.location.reload()}
              className="min-h-12 rounded-lg bg-amber-700 px-4 py-2 text-base font-semibold text-white transition-colors hover:bg-amber-800"
            >
              🔄 Jetzt aktualisieren
            </button>
            <button
              onClick={() => setShowUpdateBanner(false)}
              className="min-h-12 rounded-lg bg-amber-600/40 px-4 py-2 text-base font-semibold text-amber-900 transition-colors hover:bg-amber-600/60 dark:text-amber-950"
              aria-label="Hinweis schließen"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {showQuickLinkEnabled && showQuickLinkUrl && (
        <div className="z-40 flex items-center justify-end border-b border-slate-300 bg-white/95 px-5 py-3 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
          <div className="flex items-center gap-2">
            {isQuickLinkOpen && (
              <button
                type="button"
                onClick={() => setShowQuickLinkKeyboard((prev) => !prev)}
                className="rounded-lg bg-slate-600 px-4 py-3 text-sm font-bold text-white shadow transition-colors hover:bg-slate-700"
              >
                {showQuickLinkKeyboard ? '⌨ Tastatur aus' : '⌨ Tastatur ein'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setIsQuickLinkOpen((prev) => {
                  const next = !prev;
                  if (!next) {
                    setShowQuickLinkKeyboard(false);
                    setQuickLinkKeyboardValue('');
                  }
                  return next;
                });
              }}
              className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow transition-colors hover:bg-blue-700"
            >
              {isQuickLinkOpen ? '✕ Seite schließen' : '🌐 Seite öffnen'}
            </button>
          </div>
        </div>
      )}

      {/* Viewer Area */}
      <div className="flex-1 min-h-0">
        {selectedPdf ? (
          <PDFViewer
            pdfUrl={selectedPdf.url}
            pdfName={selectedPdf.name}
            onDrawingSaved={handleDrawingSaved}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-600 dark:text-gray-400">
            <div className="text-center">
              <p className="mb-4 text-4xl">📄</p>
              <p className="text-2xl font-medium">Wähle eine PDF aus der Leiste unten</p>
            </div>
          </div>
        )}
      </div>

      {isQuickLinkOpen && showQuickLinkEnabled && showQuickLinkUrl && (
        <div className="fixed inset-0 z-30 bg-white dark:bg-slate-950">
          <iframe
            ref={quickLinkIframeRef}
            src={showQuickLinkUrl}
            title="Externe Webseite"
            className="h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      {isQuickLinkOpen && showQuickLinkKeyboard && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-black/25 px-4 pb-4 pt-3 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-5xl rounded-xl border border-gray-300 bg-gray-100 p-3 shadow-2xl dark:border-gray-700 dark:bg-slate-900">
            <OnScreenKeyboard
              value={quickLinkKeyboardValue}
              onChange={handleQuickLinkKeyboardChange}
              onEnter={handleQuickLinkKeyboardEnter}
              onClose={() => setShowQuickLinkKeyboard(false)}
              displayLabel="CMS Eingabe"
            />
          </div>
        </div>
      )}

      {/* Thumbnail Strip */}
      <PDFThumbnailStrip
        onPDFSelect={handlePDFSelect}
        selectedPdfName={selectedPdf?.name}
        onNewFilesDetected={handleNewFilesDetected}
      />
    </div>
  );
}
