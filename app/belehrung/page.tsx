'use client';

import Link from "next/link";
import { useState } from "react";
import PDFUpload from "@/app/components/PDFUpload";
import BelehrungFileTabs from "@/app/components/BelehrungFileTabs";


export default function belehrungPage() {
  const year: number = 2026;
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"dateien" | "upload">("dateien");




  return (
    <>
      <div className="admin-scrollbar h-full min-h-0 overflow-y-auto bg-linear-to-br from-slate-50 to-slate-200 p-6 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Mitarbeiter Zertifikate </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Zertifikate der Mitarbeiter Schulung von {year} {year !== new Date().getFullYear() ? 'bis ' + new Date().getFullYear() : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              
              <Link
                href="/"
                className="rounded-lg bg-slate-300 px-4 py-2 font-semibold text-slate-900 transition-colors hover:bg-slate-400 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
              >
                Startseite
              </Link>
            </div>
          </div>
        </header>
        </div>

        <div className="mx-auto max-w-6xl">
          <div className="flex gap-2 border-b border-slate-300 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setActiveTab("dateien")}
              className={`px-4 py-3 font-semibold border-b-2 transition-colors ${
                activeTab === "dateien"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Mitarbeiter Zertifikate
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={`px-4 py-3 font-semibold border-b-2 transition-colors ${
                activeTab === "upload"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              PDF Upload
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-6xl space-y-6">
          {activeTab === "dateien" ? <BelehrungFileTabs /> : null}
          {activeTab === "upload" ? (
            <PDFUpload
              uploadUrl="/api/upload-belehrung"
              showServerFiles={false}
              title="📄 Belehrungs-PDF hochladen"
            />
          ) : null}
        </div>
      </div>
    </>
  );
}