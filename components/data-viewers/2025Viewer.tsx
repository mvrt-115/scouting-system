'use client';

type ViewerRow = Record<string, any>;

export function Year2025Viewer({
  rows,
  title,
}: {
  rows: ViewerRow[];
  title?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-purple-200/70 bg-white/85 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
      <div className="border-b border-purple-200/70 px-6 py-4 dark:border-zinc-800">
        <h2 className="text-xl font-black text-purple-950 dark:text-white">{title || 'Legacy Viewer'}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-purple-200 dark:border-zinc-800">
            <tr className="text-sm text-purple-900 dark:text-purple-200">
              <th className="px-4 py-3">Match</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Scout</th>
              <th className="px-4 py-3">Auto</th>
              <th className="px-4 py-3">Teleop</th>
              <th className="px-4 py-3">Endgame</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-purple-100/70 text-sm text-slate-700 last:border-b-0 dark:border-zinc-800 dark:text-slate-200">
                <td className="px-4 py-3">{row.matchNumber || '-'}</td>
                <td className="px-4 py-3 font-bold text-purple-900 dark:text-purple-300">{row.teamNumber || '-'}</td>
                <td className="px-4 py-3">{row.scoutName || '-'}</td>
                <td className="px-4 py-3">{row['Auto Scoring Rating'] || row.autoSpeaker || '-'}</td>
                <td className="px-4 py-3">{row['Scoring Threat Rating'] || row.teleopSpeaker || '-'}</td>
                <td className="px-4 py-3">{row['Climb Level'] || row.endgame || '-'}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No data
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
