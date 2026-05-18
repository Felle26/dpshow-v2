"use client";

import { DragEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type UploadedFile = {
  name: string;
  size: number;
  uploadedAt: string;
  modifiedAt: string;
  url: string;
};

type UploadResultFile = {
  name: string;
  savedAs: string;
  detectedName: string | null;
  planKwMatched: boolean;
};

interface PDFUploadProps {
  onUploadComplete?: () => void;
}

export default function PDFUpload({ onUploadComplete }: PDFUploadProps) {
  const router = useRouter();
  const lastChangedAtRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [uploadResults, setUploadResults] = useState<UploadResultFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [serverFiles, setServerFiles] = useState<UploadedFile[]>([]);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const formatDate = (isoDate: string) => {
    return new Date(isoDate).toLocaleString("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const loadServerFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const response = await fetch("/api/upload-pdf", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        setMessage({
          type: "error",
          text: data.error || "Dateiliste konnte nicht geladen werden",
        });
        return;
      }

      setServerFiles(data.files || []);
    } catch {
      setMessage({
        type: "error",
        text: "Dateiliste konnte nicht geladen werden",
      });
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    loadServerFiles();
  }, []);

  useEffect(() => {
    let ignore = false;

    fetch("/api/upload-timestamp")
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
      fetch("/api/upload-timestamp")
        .then((response) => response.json())
        .then((data) => {
          const nextTimestamp = data.lastChangedAt ?? null;
          if (!nextTimestamp || nextTimestamp === lastChangedAtRef.current || ignore) {
            return;
          }

          lastChangedAtRef.current = nextTimestamp;
          loadServerFiles();
        })
        .catch(() => {
          // ignore
        });
    }, 5000);

    return () => {
      ignore = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const handleDeleteFile = async (filename: string) => {
    const confirmed = window.confirm(`Datei wirklich löschen?\n${filename}`);
    if (!confirmed) {
      return;
    }

    setDeletingFile(filename);
    try {
      const response = await fetch(
        `/api/upload-pdf?filename=${encodeURIComponent(filename)}`,
        {
          method: "DELETE",
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage({
          type: "error",
          text: data.error || "Datei konnte nicht gelöscht werden",
        });
        return;
      }

      setMessage({
        type: "success",
        text: data.message || "Datei gelöscht",
      });
      await loadServerFiles();
      router.refresh();
    } catch {
      setMessage({
        type: "error",
        text: "Datei konnte nicht gelöscht werden",
      });
    } finally {
      setDeletingFile(null);
    }
  };

  const uploadFiles = async (filesToUpload: File[]) => {
    if (filesToUpload.length === 0) {
      setMessage({ type: "error", text: "Bitte wähle mindestens eine PDF-Datei" });
      return;
    }

    setIsLoading(true);
    const formData = new FormData();

    for (const file of filesToUpload) {

      if (file.type !== "application/pdf") {
        setMessage({
          type: "error",
          text: `${file.name} ist keine PDF-Datei. Nur PDFs werden akzeptiert.`,
        });
        setIsLoading(false);
        return;
      }

      formData.append("files", file);
    }

    try {
      const response = await fetch("/api/upload-pdf", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setUploadResults([]);
        setMessage({ type: "error", text: data.error || "Upload fehlgeschlagen" });
      } else {
        const resultFiles: UploadResultFile[] = Array.isArray(data.files)
          ? data.files
          : [];

        setUploadResults(resultFiles);
        setMessage({
          type: "success",
          text: `${filesToUpload.length} Datei(en) erfolgreich hochgeladen!`,
        });
        setSelectedFiles([]);
        await loadServerFiles();
        if (onUploadComplete) {
          onUploadComplete();
        }
        router.refresh();
      }
    } catch {
      setUploadResults([]);
      setMessage({
        type: "error",
        text: "Fehler beim Upload. Bitte versuche es erneut.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    const droppedFiles = Array.from(event.dataTransfer.files).filter(
      (file) => file.type === "application/pdf"
    );

    setMessage({ type: "", text: "" });
    setUploadResults([]);
    setSelectedFiles(droppedFiles);

    if (droppedFiles.length === 0) {
      setMessage({
        type: "error",
        text: "Es wurden keine PDF-Dateien abgelegt.",
      });
      return;
    }

    await uploadFiles(droppedFiles);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFiles = Array.from(event.target.files ?? []).filter(
      (file) => file.type === "application/pdf"
    );

    setMessage({ type: "", text: "" });
    setUploadResults([]);
    setSelectedFiles(pickedFiles);

    if (pickedFiles.length === 0) {
      setMessage({
        type: "error",
        text: "Es wurden keine PDF-Dateien ausgewählt.",
      });
      return;
    }

    await uploadFiles(pickedFiles);
    event.target.value = "";
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        📄 PDF-Dateien verwalten
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="lg:col-span-1 bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-900 dark:text-white">Dateien auf dem Server</h4>
            <button
              type="button"
              onClick={loadServerFiles}
              disabled={isLoadingFiles}
              className="text-sm px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-60"
            >
              Aktualisieren
            </button>
          </div>

          {isLoadingFiles ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Lade Dateiliste...</p>
          ) : serverFiles.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Noch keine PDF-Dateien auf dem Server.</p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {serverFiles.map((file) => (
                <li key={file.name} className="text-sm text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 rounded p-2 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-blue-700 dark:text-blue-300 hover:underline break-all"
                    >
                      {file.name}
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDeleteFile(file.name)}
                      disabled={deletingFile === file.name}
                      className="shrink-0 text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60 disabled:opacity-60"
                    >
                      {deletingFile === file.name ? "Lösche..." : "Löschen"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Upload: {formatDate(file.uploadedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="lg:col-span-2 space-y-4">
          <input
            id="pdfInput"
            type="file"
            multiple
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          <div
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragOver
                ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
                : "border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
            }`}
          >
            <div className="space-y-2">
              <div className="text-4xl">📁</div>
              <p className="text-gray-700 dark:text-gray-300">
                Ziehe PDF-Dateien hier hinein
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Oder wähle sie per Klick aus. Der Upload startet automatisch.
              </p>
              <label
                htmlFor="pdfInput"
                className="inline-flex cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Dateien auswählen
              </label>
            </div>
          </div>

          {/* Ausgewählte Dateien anzeigen */}
          {selectedFiles.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/30 rounded p-4">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                Ausgewählte Dateien ({selectedFiles.length}):
              </p>
              <ul className="space-y-1">
                {selectedFiles.map((file, idx) => (
                  <li key={idx} className="text-sm text-blue-800 dark:text-blue-300">
                    ✓ {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Meldungen */}
          {message.text && (
            <div
              className={`rounded p-3 text-sm ${
                message.type === "success"
                  ? "bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200"
                  : "bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200"
              }`}
            >
              {message.type === "success" ? "✓ " : "✕ "}
              {message.text}
            </div>
          )}

          {uploadResults.length > 0 && (
            <div className="rounded border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3">
              <p className="text-sm font-semibold text-green-900 dark:text-green-200 mb-2">
                Erkannte Namen beim Upload:
              </p>
              <ul className="space-y-2">
                {uploadResults.map((file, idx) => (
                  <li
                    key={`${file.savedAs}-${idx}`}
                    className="text-sm text-green-900 dark:text-green-200"
                  >
                    <p className="font-medium">Original: {file.name}</p>
                    <p>
                      Erkannt: {file.detectedName ?? "Kein Muster gefunden"}
                    </p>
                    <p>
                      Muster: {file.planKwMatched ? "Plan KW erkannt" : "Fallback verwendet"}
                    </p>
                    <p className="font-semibold">Gespeichert als: {file.savedAs}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isLoading && (
            <div className="w-full rounded-lg bg-blue-600 px-4 py-2 text-center font-semibold text-white">
              Wird hochgeladen...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
