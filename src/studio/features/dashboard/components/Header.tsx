import React from 'react';

// Injected by Vite at build/dev time from package.json version (see vite.config.ts).
declare const __STUDIO_VERSION__: string;

interface HeaderProps {
  coveragePercentage: number;
}

export const Header = ({ coveragePercentage }: HeaderProps) => {
  return (
    <header className="h-16 bg-[#080b11]/90 backdrop-blur-md border-b border-slate-900/60 px-8 flex items-center justify-between shrink-0 select-none">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-linear-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        </div>
        <div>
          <h1 className="text-base font-extrabold tracking-wide font-outfit bg-linear-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
            next-i18n-lens
          </h1>
          <p className="text-[10px] text-slate-500 font-medium tracking-wider uppercase mt-0.5">
            Live Visual Translation Studio
          </p>
        </div>
      </div>

      {/* Coverage progress bar + version badge */}
      <div className="flex items-center gap-5">
        {/* Translation coverage metric */}
        <div
          className="flex items-center gap-2.5"
          title={`${coveragePercentage}% of keys translated`}
        >
          <span className="text-[10px] text-slate-500 font-medium select-none whitespace-nowrap">
            Coverage
          </span>
          <div className="w-28 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${coveragePercentage}%`,
                background:
                  coveragePercentage >= 80
                    ? 'linear-gradient(90deg, #34d399, #059669)'
                    : coveragePercentage >= 40
                      ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                      : 'linear-gradient(90deg, #f87171, #ef4444)',
              }}
            />
          </div>
          <span className="text-[10px] font-bold font-mono text-slate-400 select-none tabular-nums">
            {coveragePercentage}%
          </span>
        </div>

        <span className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-400 select-none">
          v{__STUDIO_VERSION__} (BETA)
        </span>
      </div>
    </header>
  );
};
