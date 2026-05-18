'use client';

import React, { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
}

interface Drawing {
  id: string;
  fileName: string;
  pdfName: string;
  page: number;
  createdAt: string;
  url: string;
}

interface PDFPreviewWithLayersProps {
  pdfUrl: string;
  pdfName: string;
  drawings?: Drawing[];
}

type ViewMode = 'single' | 'all';

interface PreviewPageProps {
  pdf: any;
  pageNumber: number;
  zoomFactor: number;
  resizeVersion: number;
  isActive: boolean;
  pageDrawings: Drawing[];
  onActivate: (pageNumber: number) => void;
  onPageElementReady: (pageNumber: number, element: HTMLDivElement | null) => void;
  onPageRenderError: (message: string | null) => void;
}

function PreviewPage({
  pdf,
  pageNumber,
  zoomFactor,
  resizeVersion,
  isActive,
  pageDrawings,
  onActivate,
  onPageElementReady,
  onPageRenderError,
}: PreviewPageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const renderVersionRef = useRef(0);

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
      if (!pdf || !canvasRef.current || !wrapperRef.current) {
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
        if (!canvas) {
          return;
        }

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        const context = canvas.getContext('2d');
        if (!context) {
          return;
        }

        context.clearRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({
          canvasContext: context,
          viewport: scaledViewport,
        });

        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (isCancelled || renderVersion !== renderVersionRef.current) {
          return;
        }

        for (const drawing of pageDrawings) {
          if (isCancelled || renderVersion !== renderVersionRef.current) {
            return;
          }

          const image = new Image();
          image.crossOrigin = 'anonymous';
          await new Promise<void>((resolve) => {
            image.onload = () => {
              context.globalAlpha = 0.9;
              context.drawImage(image, 0, 0, canvas.width, canvas.height);
              context.globalAlpha = 1;
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
  }, [onPageRenderError, pageDrawings, pageNumber, pdf, resizeVersion, zoomFactor]);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => onActivate(pageNumber)}
        className={`w-full transition-colors ${
          isActive ? 'outline-2 outline-blue-500 dark:outline-blue-400' : ''
        }`}
      >
        <div ref={wrapperRef} className="mx-auto w-full max-w-full overflow-hidden bg-white">
          <canvas
            ref={canvasRef}
            className="block bg-white"
          />
        </div>
      </button>
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Seite {pageNumber}
        {isActive ? ' • fokussiert' : ''}
      </div>
    </div>
  );
}

export function PDFPreviewWithLayers({
  pdfUrl,
  pdfName,
  drawings = [],
}: PDFPreviewWithLayersProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageElementMapRef = useRef<Record<number, HTMLDivElement | null>>({});
  const [pdf, setPdf] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activePage, setActivePage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sortedDrawings, setSortedDrawings] = useState<Drawing[]>([]);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [resizeVersion, setResizeVersion] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('all');

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
    const sorted = [...drawings].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setSortedDrawings(sorted);
  }, [drawings]);

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

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'single') {
      setCurrentPage(activePage);
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

  const handleActivatePage = (pageNumber: number) => {
    setActivePage(pageNumber);
    if (viewMode === 'single') {
      setCurrentPage(pageNumber);
    }
  };

  const handlePageElementReady = (pageNumber: number, element: HTMLDivElement | null) => {
    pageElementMapRef.current[pageNumber] = element;
  };

  return (
    <div className="flex h-full flex-col bg-slate-100 dark:bg-slate-950">
      <div className="border-b border-gray-300 bg-white p-4 dark:border-gray-700 dark:bg-slate-900">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">📋 {pdfName}</h3>
        {sortedDrawings.length > 0 && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {sortedDrawings.length} Zeichnung(en) überlagert
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-300 bg-white px-4 py-3 dark:border-gray-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleViewModeChange('single')}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              viewMode === 'single'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600'
            }`}
          >
            Einzelseite
          </button>
          <button
            onClick={() => handleViewModeChange('all')}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              viewMode === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600'
            }`}
          >
            Alle Seiten
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Fokus: Seite {activePage} / {Math.max(totalPages, 1)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            aria-label="Zoom verkleinern"
            title="Zoom verkleinern"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-500 text-xl leading-none text-white transition-colors hover:bg-gray-600"
          >
            -
          </button>
          <button
            onClick={handleZoomIn}
            aria-label="Zoom vergrößern"
            title="Zoom vergrößern"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-500 text-xl leading-none text-white transition-colors hover:bg-gray-600"
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

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-slate-200 px-2 py-4 dark:bg-slate-800 sm:px-4">
        {pdf ? (
          <div className="mx-auto flex w-full max-w-full flex-col gap-8">
            {displayedPages.map((pageNumber) => (
              <PreviewPage
                key={`${pdfName}-${pageNumber}`}
                pdf={pdf}
                pageNumber={pageNumber}
                zoomFactor={zoomFactor}
                resizeVersion={resizeVersion}
                isActive={activePage === pageNumber}
                pageDrawings={sortedDrawings.filter((drawing) => drawing.page === pageNumber)}
                onActivate={handleActivatePage}
                onPageElementReady={handlePageElementReady}
                onPageRenderError={setError}
              />
            ))}
          </div>
        ) : (
          <div className="text-gray-500 dark:text-gray-400">PDF wird geladen...</div>
        )}
      </div>

      {totalPages > 0 && viewMode === 'single' && (
        <div className="flex items-center justify-between gap-4 border-t border-gray-300 bg-white p-4 dark:border-gray-700 dark:bg-slate-900">
          <div className="flex gap-4">
            <button
              onClick={() => handlePageChange('prev')}
              disabled={currentPage === 1}
              className="rounded-lg bg-gray-400 px-4 py-2 text-white transition-colors hover:bg-gray-500 disabled:bg-gray-300 dark:disabled:bg-gray-700"
            >
              ← Vorherige
            </button>
            <button
              onClick={() => handlePageChange('next')}
              disabled={currentPage === totalPages}
              className="rounded-lg bg-gray-400 px-4 py-2 text-white transition-colors hover:bg-gray-500 disabled:bg-gray-300 dark:disabled:bg-gray-700"
            >
              Nächste →
            </button>
          </div>
          <span className="text-lg font-semibold text-gray-900 dark:text-white">
            Seite {currentPage} / {totalPages}
          </span>
          <div />
        </div>
      )}

      {sortedDrawings.length > 0 && (
        <div className="max-h-40 overflow-y-auto border-t border-gray-300 bg-white p-4 dark:border-gray-700 dark:bg-slate-900">
          <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            ✏️ Alle Zeichnungen (zeitlich sortiert)
          </h4>
          <div className="space-y-2">
            {sortedDrawings.map((drawing, idx) => (
              <div
                key={drawing.id}
                className="flex items-center justify-between rounded-lg bg-gray-100 p-2 text-sm dark:bg-slate-800"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">
                    #{idx + 1} • Seite {drawing.page}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {new Date(drawing.createdAt).toLocaleString('de-DE')}
                  </p>
                </div>
                <a
                  href={drawing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-blue-500 px-3 py-1 text-xs text-white transition-colors hover:bg-blue-600"
                >
                  👁️ Ansicht
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
