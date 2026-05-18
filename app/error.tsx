'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function GlobalErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const router = useRouter();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const supportCode = useMemo(() => {
    if (error.digest) {
      return `ERR-${error.digest}`;
    }

    const timePart = Date.now().toString(36).toUpperCase();
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ERR-${timePart}-${randomPart}`;
  }, [error]);

  useEffect(() => {
    console.error(error);
  }, [error]);

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/');
  };

  const handleCopySupportCode = async () => {
    try {
      await navigator.clipboard.writeText(supportCode);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }

    window.setTimeout(() => setCopyState('idle'), 1800);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-red-50 px-6 py-10 dark:bg-slate-950">
      <div className="w-full max-w-xl rounded-2xl border border-red-200 bg-white p-8 text-center shadow-xl dark:border-red-900/40 dark:bg-slate-900">
        <p className="text-sm font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Fehler</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Etwas ist schiefgelaufen</h1>
        <p className="mt-2 text-base text-slate-600 dark:text-slate-300">
          Beim Laden der Seite ist ein unerwarteter Fehler aufgetreten.
        </p>
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50/70 px-4 py-3 text-left dark:border-red-900/50 dark:bg-red-900/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
            Support-Code
          </p>
          <p className="mt-1 font-mono text-sm font-bold text-red-800 dark:text-red-200">{supportCode}</p>
          <button
            onClick={handleCopySupportCode}
            className="mt-3 min-h-10 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:bg-slate-800 dark:text-red-300 dark:hover:bg-slate-700"
          >
            {copyState === 'copied' ? 'Code kopiert' : copyState === 'error' ? 'Kopieren fehlgeschlagen' : 'Code kopieren'}
          </button>
        </div>

        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={handleBack}
            className="min-h-12 rounded-lg bg-slate-200 px-5 py-3 text-base font-semibold text-slate-900 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
          >
            Zurueck
          </button>
          <button
            onClick={() => unstable_retry()}
            className="min-h-12 rounded-lg bg-red-500 px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-red-600"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    </main>
  );
}
