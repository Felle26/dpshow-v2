import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-8">
          Dienstplan Monitor
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-12">
          Willkommen zur Dienstplan Anwendung
        </p>

        <div className="flex gap-6 justify-center flex-wrap">
          <Link
            href="/show"
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            📺 Anzeige Bereich
          </Link>

          <Link
            href="/admin"
            className="px-8 py-4 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg transition-colors"
          >
            ⚙️ Admin Bereich
          </Link>

          <Link
            href="/bereiche"
            className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors"
          >
            🗂️ Bereiche
          </Link>
          <Link
            href="/belehrung"
            className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors"
          >
            🏅 Zertifikate
          </Link>
        </div>
      </div>
    </div>
  );
}
