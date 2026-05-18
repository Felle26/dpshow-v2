'use client';

import { useRouter } from 'next/navigation';

export default function NotFoundPage() {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/');
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10 dark:bg-slate-950">
      <div className="w-full max-w-xl rounded-2xl border border-slate-300 bg-white p-8 text-center shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <p className="text-6xl font-black text-slate-700 dark:text-slate-200">404</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">Seite nicht gefunden</h1>
        <p className="mt-2 text-base text-slate-600 dark:text-slate-300">
          Die angeforderte Seite existiert nicht oder wurde verschoben.
        </p>

        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={handleBack}
            className="min-h-12 rounded-lg bg-blue-500 px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-600"
          >
            Zurueck
          </button>
          <button
            onClick={() => router.push('/')}
            className="min-h-12 rounded-lg bg-slate-200 px-5 py-3 text-base font-semibold text-slate-900 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
          >
            Startseite
          </button>
        </div>
      </div>
    </main>
  );
}
