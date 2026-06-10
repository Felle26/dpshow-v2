"use client";

import { useEffect, useMemo, useState } from "react";

type BelehrungFile = {
  name: string;
  size: number;
  uploadedAt: string;
  modifiedAt: string;
  url: string;
  extractedName: string;
  extractedTopic: string;
};

export default function BelehrungFileTabs() {
  const [files, setFiles] = useState<BelehrungFile[]>([]);
  const [expandedNames, setExpandedNames] = useState<Record<string, boolean>>({});
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const deriveYear = (file: BelehrungFile): string => {
    const yearFromFilename = file.name.match(/(20\d{2})/);
    if (yearFromFilename?.[1]) {
      return yearFromFilename[1];
    }

    const uploadYear = new Date(file.uploadedAt).getFullYear();
    return Number.isNaN(uploadYear) ? "Unbekannt" : String(uploadYear);
  };

  const groupedByNameAndYear = useMemo(() => {
    const groupedByName = new Map<string, Map<string, BelehrungFile[]>>();

    for (const file of files) {
      const nameKey = file.extractedName?.trim() || "Unbekannt";
      const yearKey = deriveYear(file);

      if (!groupedByName.has(nameKey)) {
        groupedByName.set(nameKey, new Map<string, BelehrungFile[]>());
      }

      const yearMap = groupedByName.get(nameKey)!;
      const existingFiles = yearMap.get(yearKey) ?? [];
      existingFiles.push(file);
      yearMap.set(yearKey, existingFiles);
    }

    const nameGroups = Array.from(groupedByName.entries())
      .map(([name, yearMap]) => {
        const yearGroups = Array.from(yearMap.entries())
          .map(([year, yearFiles]) => ({
            year,
            files: yearFiles.sort(
              (a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
            ),
          }))
          .sort((a, b) => Number(b.year) - Number(a.year));

        return {
          name,
          years: yearGroups,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "de"));

    return nameGroups;
  }, [files]);

  const yearKeyFor = (name: string, year: string) => `${name}::${year}`;

  const toggleName = (name: string) => {
    setExpandedNames((current) => ({
      ...current,
      [name]: !current[name],
    }));
  };

  const toggleYear = (name: string, year: string) => {
    const key = yearKeyFor(name, year);
    setExpandedYears((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  useEffect(() => {
    const loadFiles = async () => {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch("/api/upload-belehrung", { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Dateien konnten nicht geladen werden");
          return;
        }

        const nextFiles: BelehrungFile[] = Array.isArray(data.files) ? data.files : [];
        setFiles(nextFiles);

      } catch {
        setError("Dateien konnten nicht geladen werden");
      } finally {
        setIsLoading(false);
      }
    };

    loadFiles();
  }, []);

  useEffect(() => {
    if (groupedByNameAndYear.length === 0) {
      setExpandedNames({});
      setExpandedYears({});
      return;
    }

    const firstName = groupedByNameAndYear[0];
    const firstYear = firstName.years[0];

    if (firstName) {
      setExpandedNames((current) => ({
        [firstName.name]: current[firstName.name] ?? true,
      }));
    }

    if (firstName && firstYear) {
      const firstYearKey = yearKeyFor(firstName.name, firstYear.year);
      setExpandedYears((current) => ({
        [firstYearKey]: current[firstYearKey] ?? true,
      }));
    }
  }, [groupedByNameAndYear]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">Belehrungs-Zertifikate</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Gruppiert nach Name und darunter nach Jahr
      </p>

      {isLoading ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Lade Zertifikate...</p>
      ) : error ? (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </p>
      ) : files.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Noch keine Belehrungs-Zertifikate vorhanden.</p>
      ) : (
        <div className="mt-4 space-y-6">
          {groupedByNameAndYear.map((nameGroup) => (
            <div
              key={nameGroup.name}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60"
            >
              <button
                type="button"
                onClick={() => toggleName(nameGroup.name)}
                className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-lg font-bold text-slate-900 transition-colors hover:bg-slate-100 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
                aria-expanded={Boolean(expandedNames[nameGroup.name])}
              >
                <span>{nameGroup.name}</span>
                <span>{expandedNames[nameGroup.name] ? "▾" : "▸"}</span>
              </button>

              {expandedNames[nameGroup.name] ? (
                <div className="mt-3 space-y-3">
                  {nameGroup.years.map((yearGroup) => {
                    const yearKey = yearKeyFor(nameGroup.name, yearGroup.year);
                    const isYearExpanded = Boolean(expandedYears[yearKey]);

                    return (
                      <div
                        key={yearKey}
                        className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <button
                          type="button"
                          onClick={() => toggleYear(nameGroup.name, yearGroup.year)}
                          className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-800 dark:text-slate-200"
                          aria-expanded={isYearExpanded}
                        >
                          <span>
                            {yearGroup.year} ({yearGroup.files.length} PDF{yearGroup.files.length !== 1 ? "s" : ""})
                          </span>
                          <span>{isYearExpanded ? "▾" : "▸"}</span>
                        </button>

                        {isYearExpanded ? (
                          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                            <div className="space-y-4">
                              {yearGroup.files.map((file) => (
                                <div
                                  key={file.name}
                                  className="overflow-hidden rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
                                >
                                  <div className="border-b border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                                    <p className="font-semibold text-slate-900 dark:text-slate-100">{file.name}</p>
                                    <p className="text-slate-600 dark:text-slate-400">Thema: {file.extractedTopic}</p>
                                  </div>
                                  <iframe
                                    src={file.url}
                                    title={file.name}
                                    className="h-[68vh] min-h-120 w-full"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
