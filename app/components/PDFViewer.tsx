'use client';

import React, { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { DrawingColor, DrawingTool, DrawingToolbar } from './DrawingToolbar';
import { OnScreenKeyboard } from './OnScreenKeyboard';

if (typeof window !== 'undefined') {
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
}

interface PDFViewerProps {
  pdfUrl: string;
  pdfName: string;
  onDrawingSaved?: () => void;
}

interface SavedDrawing {
  id: string;
  page: number;
  createdAt: string;
  url: string;
}

type ViewMode = 'single' | 'all';

interface PDFPageCanvasProps {
  pdf: any;
  pageNumber: number;
  pageDrawings: SavedDrawing[];
  zoomFactor: number;
  resizeVersion: number;
  isActive: boolean;
  currentTool: DrawingTool;
  currentColor: DrawingColor;
  textInput: string;
  fontSize: number;
  onActivate: (pageNumber: number) => void;
  onOverlayCanvasReady: (pageNumber: number, canvas: HTMLCanvasElement | null) => void;
  onPageElementReady: (pageNumber: number, element: HTMLDivElement | null) => void;
  onPageRenderError: (message: string | null) => void;
  editingDrawingId: string | null;
  editingEnabled: boolean;
}

function PDFPageCanvas({
  pdf,
  pageNumber,
  pageDrawings,
  zoomFactor,
  resizeVersion,
  isActive,
  currentTool,
  currentColor,
  textInput,
  fontSize,
  onActivate,
  onOverlayCanvasReady,
  onPageElementReady,
  onPageRenderError,
  editingDrawingId,
  editingEnabled,
}: PDFPageCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const renderVersionRef = useRef(0);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    onOverlayCanvasReady(pageNumber, overlayCanvasRef.current);
    return () => {
      onOverlayCanvasReady(pageNumber, null);
    };
  }, [onOverlayCanvasReady, pageNumber]);

  useEffect(() => {
    onPageElementReady(pageNumber, wrapperRef.current);
    return () => {
      onPageElementReady(pageNumber, null);
    };
  }, [onPageElementReady, pageNumber]);

  useEffect(() => {
    let isCancelled = false;
    const renderVersion = renderVersionRef.current + 1;
    renderVersionRef.current = renderVersion;

    const renderPage = async () => {
      if (!pdf || !canvasRef.current || !overlayCanvasRef.current || !wrapperRef.current) {
        return;
      }

      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // Ignore stale cancellation errors.
          }
        }

        const page = await pdf.getPage(pageNumber);
        if (isCancelled || renderVersion !== renderVersionRef.current) {
          return;
        }

        const wrapperWidth = Math.max(wrapperRef.current.clientWidth - 8, 320);
        const viewport = page.getViewport({ scale: 1 });
        const baseScale = Math.min(wrapperWidth / viewport.width, 2);
        const scaledViewport = page.getViewport({ scale: baseScale * zoomFactor });

        const canvas = canvasRef.current;
        const overlayCanvas = overlayCanvasRef.current;
        if (!canvas || !overlayCanvas) {
          return;
        }

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        overlayCanvas.width = scaledViewport.width;
        overlayCanvas.height = scaledViewport.height;
        overlayCanvas.style.cursor = currentTool === 'text' ? 'text' : 'crosshair';

        const context = canvas.getContext('2d');
        const overlayContext = overlayCanvas.getContext('2d');
        if (!context || !overlayContext) {
          return;
        }

        context.clearRect(0, 0, canvas.width, canvas.height);
        overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        const renderTask = page.render({
          canvasContext: context,
          viewport: scaledViewport,
        });

        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (isCancelled || renderVersion !== renderVersionRef.current) {
          return;
        }

        for (const drawing of pageDrawings.filter((d) => d.id !== editingDrawingId)) {
          if (isCancelled || renderVersion !== renderVersionRef.current) {
            return;
          }

          const image = new Image();
          await new Promise<void>((resolve) => {
            image.onload = () => {
              overlayContext.drawImage(
                image,
                0,
                0,
                overlayCanvas.width,
                overlayCanvas.height
              );
              resolve();
            };
            image.onerror = () => {
              resolve();
            };
            image.src = drawing.url;
          });
        }
      } catch (err: any) {
        const message = String(err?.message || err || '');
        const isExpectedCancel =
          message.includes('Rendering cancelled') ||
          message.includes('cancelled') ||
          message.includes('Cannot use the same canvas during multiple render() operations');

        if (!isCancelled && !isExpectedCancel) {
          onPageRenderError(`Fehler beim Rendern von Seite ${pageNumber}: ${message}`);
          console.error(err);
        }
      } finally {
        renderTaskRef.current = null;
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignore stale cancellation errors.
        }
      }
    };
  }, [currentTool, onPageRenderError, pageDrawings, pageNumber, pdf, resizeVersion, zoomFactor]);

  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const overlayCanvas = overlayCanvasRef.current;
    if (!overlayCanvas) {
      return;
    }

    overlayCanvas.setPointerCapture(e.pointerId);
    onActivate(pageNumber);

    const pos = getPointerPos(e);
    if (!pos) {
      return;
    }

    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) {
      return;
    }

    if (currentTool === 'text') {
      if (textInput.trim()) {
        ctx.font = `${fontSize}px Arial`;
        const metrics = ctx.measureText(textInput);
        const textWidth = metrics.width;
        const padding = 6;

        ctx.fillStyle = 'rgba(255, 255, 150, 0.9)';
        ctx.fillRect(
          pos.x - padding,
          pos.y - padding,
          textWidth + padding * 2,
          fontSize + padding * 2
        );

        ctx.strokeStyle = 'rgba(200, 200, 0, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          pos.x - padding,
          pos.y - padding,
          textWidth + padding * 2,
          fontSize + padding * 2
        );

        ctx.fillStyle = currentColor;
        ctx.textBaseline = 'top';
        ctx.fillText(textInput, pos.x, pos.y);
      }
      return;
    }

    isDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !overlayCanvasRef.current) {
      return;
    }

    const pos = getPointerPos(e);
    if (!pos) {
      return;
    }

    const ctx = overlayCanvasRef.current.getContext('2d');
    if (!ctx) {
      return;
    }

    if (currentTool === 'brush') {
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      return;
    }

    if (currentTool === 'eraser') {
      ctx.clearRect(pos.x - 10, pos.y - 10, 20, 20);
    }
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
    const ctx = overlayCanvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.closePath();
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        className={`w-full transition-colors ${
          isActive ? 'outline-2 outline-blue-500 dark:outline-blue-400' : ''
        }`}
      >
        <div ref={wrapperRef} className="relative mx-auto w-full max-w-full overflow-hidden bg-white">
          <canvas
            ref={canvasRef}
            className="block bg-white"
          />
          <canvas
            ref={overlayCanvasRef}
            onPointerDown={editingEnabled ? startDrawing : undefined}
            onPointerMove={editingEnabled ? draw : undefined}
            onPointerUp={editingEnabled ? stopDrawing : undefined}
            onPointerCancel={editingEnabled ? stopDrawing : undefined}
            className={`absolute top-0 left-0 touch-none${editingEnabled ? '' : ' pointer-events-none'}`}
          />
        </div>
      </div>
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Seite {pageNumber}
        {isActive ? ' • aktiv' : ''}
      </div>
    </div>
  );
}

export function PDFViewer({ pdfUrl, pdfName, onDrawingSaved }: PDFViewerProps) {
  const scrollStep = 420;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const overlayCanvasMapRef = useRef<Record<number, HTMLCanvasElement | null>>({});
  const pageElementMapRef = useRef<Record<number, HTMLDivElement | null>>({});
  const [pdf, setPdf] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activePage, setActivePage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [currentColor, setCurrentColor] = useState<DrawingColor>('#000000');
  const [currentTool, setCurrentTool] = useState<DrawingTool>('brush');
  const [textInput, setTextInput] = useState('');
  const [fontSize, setFontSize] = useState(24);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedDrawings, setSavedDrawings] = useState<SavedDrawing[]>([]);
  const [drawingsVersion, setDrawingsVersion] = useState(0);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [resizeVersion, setResizeVersion] = useState(0);
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);
  const [editingEnabled, setEditingEnabled] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [showTextKeyboard, setShowTextKeyboard] = useState(false);
  const [showPasswordKeyboard, setShowPasswordKeyboard] = useState(false);

  useEffect(() => {
    fetch('/api/edit-password')
      .then((r) => r.json())
      .then((data) => {
        setPasswordRequired(data.passwordSet);
        if (!data.passwordSet) {
          // Kein Passwort gesetzt – direkt freischalten
          setEditingEnabled(false);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!editingEnabled || currentTool !== 'text') {
      setShowTextKeyboard(false);
    }
  }, [currentTool, editingEnabled]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (editingEnabled) {
      el.style.touchAction = 'none';
    } else {
      el.style.touchAction = '';
    }
    return () => {
      el.style.touchAction = '';
    };
  }, [editingEnabled]);

  const handleUnlockClick = async () => {
    if (editingEnabled) {
      setEditingEnabled(false);
      setShowTextKeyboard(false);
      return;
    }

    let requiresPassword = passwordRequired;
    try {
      const statusResponse = await fetch('/api/edit-password', { cache: 'no-store' });
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        requiresPassword = !!statusData.passwordSet;
        setPasswordRequired(requiresPassword);
      }
    } catch {
      // Bei Netz-/API-Fehler auf den zuletzt bekannten Status zurückfallen.
    }

    if (!requiresPassword) {
      setEditingEnabled(true);
      setViewMode('single');
      setCurrentPage(activePage);
      return;
    }
    setPasswordInput('');
    setPasswordError('');
    setShowPasswordKeyboard(true);
    setShowPasswordModal(true);
  };

  const handlePasswordSubmit = async () => {
    try {
      const res = await fetch(
        `/api/edit-password?password=${encodeURIComponent(passwordInput)}`
      );
      const data = await res.json();
      if (data.unlocked) {
        setEditingEnabled(true);
        setViewMode('single');
        setCurrentPage(activePage);
        setShowPasswordModal(false);
        setPasswordInput('');
        setPasswordError('');
        setShowPasswordKeyboard(false);
      } else {
        setPasswordError('Falsches Passwort');
      }
    } catch {
      setPasswordError('Fehler beim Prüfen des Passworts');
    }
  };

  useEffect(() => {
    const loadPdf = async () => {
      try {
        setError(null);
        const pdfDoc = await getDocument(pdfUrl).promise;
        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        setCurrentPage(1);
        setActivePage(1);
      } catch (err) {
        setError(`Fehler beim Laden der PDF: ${err}`);
        console.error(err);
      }
    };

    loadPdf();
  }, [pdfUrl]);

  useEffect(() => {
    let ignore = false;

    const loadSavedDrawings = async () => {
      try {
        const response = await fetch(
          `/api/drawings/list?pdfName=${encodeURIComponent(pdfName)}`,
          { cache: 'no-store' }
        );

        if (!response.ok) {
          if (!ignore) {
            setSavedDrawings([]);
          }
          return;
        }

        const data = await response.json();
        const drawings: SavedDrawing[] = Array.isArray(data.drawings)
          ? data.drawings
          : [];

        const sorted = drawings.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        if (!ignore) {
          setSavedDrawings(sorted);
        }
      } catch {
        if (!ignore) {
          setSavedDrawings([]);
        }
      }
    };

    loadSavedDrawings();

    return () => {
      ignore = true;
    };
  }, [drawingsVersion, pdfName]);

  useEffect(() => {
    const onResize = () => {
      setResizeVersion((value) => value + 1);
    };

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    if (viewMode !== 'all') {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const updateActivePageFromScroll = () => {
      const containerRect = container.getBoundingClientRect();
      const containerCenter = containerRect.top + containerRect.height / 2;
      let nextActivePage = activePage;
      let smallestDistance = Number.POSITIVE_INFINITY;

      for (const [pageKey, element] of Object.entries(pageElementMapRef.current)) {
        if (!element) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        const pageCenter = rect.top + rect.height / 2;
        const distance = Math.abs(pageCenter - containerCenter);

        if (distance < smallestDistance) {
          smallestDistance = distance;
          nextActivePage = Number(pageKey);
        }
      }

      if (nextActivePage !== activePage) {
        setActivePage(nextActivePage);
      }
    };

    updateActivePageFromScroll();
    container.addEventListener('scroll', updateActivePageFromScroll, { passive: true });
    window.addEventListener('resize', updateActivePageFromScroll);

    return () => {
      container.removeEventListener('scroll', updateActivePageFromScroll);
      window.removeEventListener('resize', updateActivePageFromScroll);
    };
  }, [activePage, currentPage, resizeVersion, totalPages, viewMode]);

  const displayedPages =
    totalPages > 0
      ? viewMode === 'all'
        ? Array.from({ length: totalPages }, (_, index) => index + 1)
        : [currentPage]
      : [];

  const handleZoomIn = () => {
    setZoomFactor((value) => Math.min(3, parseFloat((value + 0.1).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoomFactor((value) => Math.max(0.5, parseFloat((value - 0.1).toFixed(2))));
  };

  const handleClear = () => {
    const canvas = overlayCanvasMapRef.current[activePage];
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleSave = async () => {
    const canvas = overlayCanvasMapRef.current[activePage];
    if (!canvas) {
      setError('Keine aktive Seite zum Speichern verfügbar.');
      return;
    }

    setIsSaving(true);
    try {
      const drawingDataUrl = canvas.toDataURL('image/png');
      const blob = await fetch(drawingDataUrl).then((response) => response.blob());

      const formData = new FormData();
      formData.append('file', blob, `drawing-${Date.now()}.png`);
      formData.append('pdfName', pdfName);
      formData.append('page', activePage.toString());

      const response = await fetch('/api/drawings/save', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Fehler beim Speichern der Zeichnung');
      }

      alert(`Zeichnung auf Seite ${activePage} erfolgreich gespeichert!`);
      if (editingDrawingId) {
        await fetch('/api/drawings/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drawingId: editingDrawingId, pdfName }),
        });
        setEditingDrawingId(null);
      }
      setDrawingsVersion((value) => value + 1);
      if (onDrawingSaved) {
        onDrawingSaved();
      }
    } catch (err) {
      setError(`Fehler beim Speichern: ${err}`);
      alert(`Fehler: ${err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePageChange = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentPage > 1) {
      const nextPage = currentPage - 1;
      setCurrentPage(nextPage);
      setActivePage(nextPage);
    } else if (direction === 'next' && currentPage < totalPages) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      setActivePage(nextPage);
    }
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'single') {
      setCurrentPage(activePage);
    }
  };

  const handleActivatePage = (pageNumber: number) => {
    setActivePage(pageNumber);
    if (viewMode === 'single') {
      setCurrentPage(pageNumber);
    }
  };

  const handleOverlayCanvasReady = (pageNumber: number, canvas: HTMLCanvasElement | null) => {
    overlayCanvasMapRef.current[pageNumber] = canvas;
  };

  const handlePageElementReady = (pageNumber: number, element: HTMLDivElement | null) => {
    pageElementMapRef.current[pageNumber] = element;
  };

  const handleDeleteDrawing = async (drawing: SavedDrawing) => {
    try {
      const response = await fetch('/api/drawings/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawingId: drawing.id, pdfName }),
      });
      if (response.ok) {
        if (editingDrawingId === drawing.id) {
          setEditingDrawingId(null);
          const canvas = overlayCanvasMapRef.current[drawing.page];
          if (canvas) {
            canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
          }
        }
        setDrawingsVersion((value) => value + 1);
      }
    } catch (err) {
      setError(`Fehler beim Löschen: ${err}`);
    }
  };

  const handleEditDrawing = (drawing: SavedDrawing) => {
    setActivePage(drawing.page);
    if (viewMode === 'single') {
      setCurrentPage(drawing.page);
    }
    const loadOntoCanvas = () => {
      const canvas = overlayCanvasMapRef.current[drawing.page];
      if (!canvas) {
        setTimeout(loadOntoCanvas, 100);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = drawing.url;
    };
    loadOntoCanvas();
    setEditingDrawingId(drawing.id);
    setShowLayersPanel(false);
  };

  const pageLayerDrawings = savedDrawings.filter((d) => d.page === activePage);

  return (
    <div className="flex h-full flex-col bg-slate-100 dark:bg-slate-950">
      {/* Passwort-Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-104 max-w-[92vw] rounded-xl bg-white p-7 shadow-2xl dark:bg-slate-900">
            <h3 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">🔒 Passwort eingeben</h3>
            <p className="mb-4 text-base text-gray-600 dark:text-gray-400">
              Bitte gib das Passwort ein, um den Ändern-Bereich freizuschalten.
            </p>
            <input type="hidden" value={passwordInput} readOnly />
            {showPasswordKeyboard && (
              <OnScreenKeyboard
                value={passwordInput}
                onChange={setPasswordInput}
                onEnter={handlePasswordSubmit}
                onClose={() => setShowPasswordKeyboard(false)}
                numericOnly
                displayLabel="PIN"
                maskDisplay
              />
            )}
            {passwordError && (
              <p className="mb-3 text-base font-semibold text-red-600 dark:text-red-400">{passwordError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handlePasswordSubmit}
                className="min-h-12 flex-1 rounded-lg bg-blue-500 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-600"
              >
                Entsperren
              </button>
              <button
                onClick={() => { setShowPasswordModal(false); setPasswordInput(''); setPasswordError(''); setShowPasswordKeyboard(false); }}
                className="min-h-12 flex-1 rounded-lg bg-gray-200 px-4 py-3 text-base font-semibold text-gray-900 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ändern-Toolbar (nur sichtbar wenn entsperrt) */}
      {editingEnabled && (
        <DrawingToolbar
          currentColor={currentColor}
          currentTool={currentTool}
          textInput={textInput}
          fontSize={fontSize}
          onColorChange={setCurrentColor}
          onToolChange={setCurrentTool}
          onTextChange={setTextInput}
          onFontSizeChange={setFontSize}
          onSave={handleSave}
          onClear={handleClear}
          isSaving={isSaving}
          showLayersPanel={showLayersPanel}
          onLayersToggle={() => setShowLayersPanel((v) => !v)}
          onTextKeyboardShow={() => setShowTextKeyboard(true)}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-300 bg-white px-5 py-4 dark:border-gray-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleViewModeChange('single')}
            className={`min-h-12 rounded-full px-5 py-3 text-base font-semibold transition-colors ${
              viewMode === 'single'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600'
            }`}
          >
            Einzelseite
          </button>
          <button
            onClick={() => handleViewModeChange('all')}
            className={`min-h-12 rounded-full px-5 py-3 text-base font-semibold transition-colors ${
              viewMode === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600'
            }`}
          >
            Alle Seiten
          </button>
          <span className="text-base font-semibold text-gray-700 dark:text-gray-300">
            Aktive Seite: {activePage} / {Math.max(totalPages, 1)}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleUnlockClick}
            title={editingEnabled ? 'Ändern-Bereich sperren' : 'Ändern-Bereich entsperren'}
            className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl transition-colors ${
              editingEnabled
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-gray-400 hover:bg-gray-500 text-white'
            }`}
          >
            {editingEnabled ? '🔓' : '🔒'}
          </button>
          <button
            onClick={handleZoomOut}
            aria-label="Zoom verkleinern"
            title="Zoom verkleinern"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-500 text-2xl leading-none text-white transition-colors hover:bg-gray-600"
          >
            -
          </button>
          <button
            onClick={handleZoomIn}
            aria-label="Zoom vergrößern"
            title="Zoom vergrößern"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-500 text-2xl leading-none text-white transition-colors hover:bg-gray-600"
          >
            +
          </button>
        </div>
      </div>

      {error && (
        <div className="border border-red-400 bg-red-100 p-4 text-red-900 dark:border-red-700 dark:bg-red-900 dark:text-red-100">
          {error}
        </div>
      )}

      <div className="relative flex-1 min-h-0">
        <div ref={scrollContainerRef} className="h-full overflow-auto bg-slate-200 px-3 py-5 dark:bg-slate-800 sm:px-5">
        {pdf ? (
          <div className="mx-auto flex w-full max-w-full flex-col gap-8">
            {displayedPages.map((pageNumber) => (
              <PDFPageCanvas
                key={`${pdfName}-${pageNumber}`}
                pdf={pdf}
                pageNumber={pageNumber}
                pageDrawings={savedDrawings.filter((drawing) => drawing.page === pageNumber)}
                zoomFactor={zoomFactor}
                resizeVersion={resizeVersion}
                isActive={activePage === pageNumber}
                currentTool={currentTool}
                currentColor={currentColor}
                textInput={textInput}
                fontSize={fontSize}
                onActivate={handleActivatePage}
                onOverlayCanvasReady={handleOverlayCanvasReady}
                onPageElementReady={handlePageElementReady}
                onPageRenderError={setError}
                editingDrawingId={editingDrawingId}
                editingEnabled={editingEnabled}
              />
            ))}
          </div>
        ) : (
          <div className="text-gray-500 dark:text-gray-400">PDF wird geladen...</div>
        )}
        </div>

        {/* Scroll-Buttons */}
        <button
          onPointerDown={() => scrollContainerRef.current?.scrollBy({ top: -scrollStep, behavior: 'smooth' })}
          aria-label="Nach oben scrollen"
          className="absolute right-4 top-4 z-10 flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-3xl text-white shadow-lg backdrop-blur-sm active:bg-black/60"
        >
          ↑
        </button>
        <button
          onPointerDown={() => scrollContainerRef.current?.scrollBy({ top: scrollStep, behavior: 'smooth' })}
          aria-label="Nach unten scrollen"
          className="absolute right-4 bottom-4 z-10 flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-3xl text-white shadow-lg backdrop-blur-sm active:bg-black/60"
        >
          ↓
        </button>

        {/* Ebenen-Panel */}
        {showLayersPanel && (
          <div className="absolute bottom-0 left-0 top-0 z-20 flex w-72 flex-col overflow-hidden border-r border-gray-200 bg-white/95 shadow-xl backdrop-blur-sm dark:border-gray-700 dark:bg-slate-900/95">
            <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Ebenen – Seite {activePage}
              </h3>
              <button
                onClick={() => setShowLayersPanel(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full text-xl leading-none text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-gray-100"
                aria-label="Panel schließen"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {pageLayerDrawings.length === 0 ? (
                <p className="p-3 text-base text-gray-500 dark:text-gray-400">
                  Keine Zeichnungen auf Seite {activePage}.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {pageLayerDrawings.map((drawing) => (
                    <div
                      key={drawing.id}
                      className={`rounded-lg border p-3 ${
                        editingDrawingId === drawing.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <img
                        src={drawing.url}
                        alt="Zeichnung"
                        className="w-full rounded border border-gray-200 dark:border-gray-600"
                      />
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        {new Date(drawing.createdAt).toLocaleString('de-DE')}
                        {editingDrawingId === drawing.id && (
                          <span className="ml-1 font-semibold text-blue-500"> (wird bearbeitet)</span>
                        )}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleEditDrawing(drawing)}
                          className="min-h-11 flex-1 rounded px-3 py-2 text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-colors"
                        >
                          ✏️ Bearbeiten
                        </button>
                        <button
                          onClick={() => handleDeleteDrawing(drawing)}
                          className="min-h-11 flex-1 rounded px-3 py-2 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white transition-colors"
                        >
                          🗑️ Löschen
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {totalPages > 0 && viewMode === 'single' && (
        <div className="flex items-center justify-center gap-4 border-t border-gray-300 bg-white p-5 dark:border-gray-700 dark:bg-slate-900">
          <button
            onClick={() => handlePageChange('prev')}
            disabled={currentPage === 1}
            className="min-h-12 rounded-lg bg-gray-400 px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-gray-500 disabled:bg-gray-300 dark:disabled:bg-gray-700"
          >
            ← Vorherige
          </button>
          <span className="text-lg font-semibold text-gray-900 dark:text-white">
            Seite {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => handlePageChange('next')}
            disabled={currentPage === totalPages}
            className="min-h-12 rounded-lg bg-gray-400 px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-gray-500 disabled:bg-gray-300 dark:disabled:bg-gray-700"
          >
            Nächste →
          </button>
        </div>
      )}

      {editingEnabled && currentTool === 'text' && showTextKeyboard && !showPasswordModal && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-black/25 px-4 pb-4 pt-3 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-5xl rounded-xl border border-gray-300 bg-gray-100 p-3 shadow-2xl dark:border-gray-700 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Text-Tastatur</p>
              <button
                type="button"
                onClick={() => setShowTextKeyboard(false)}
                className="min-h-10 rounded-lg bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
              >
                Schliessen
              </button>
            </div>
            <OnScreenKeyboard
              value={textInput}
              onChange={setTextInput}
              onClose={() => setShowTextKeyboard(false)}
              displayLabel="Text"
            />
          </div>
        </div>
      )}
    </div>
  );
}
