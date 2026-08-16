import React from 'react';

export const EmptySelection = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="w-16 h-16 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex items-center justify-center text-indigo-400 shadow-xs mb-6">
        <svg
          className="w-8 h-8 text-indigo-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
          />
        </svg>
      </div>
      <h3 className="text-slate-200 font-semibold tracking-wide font-outfit">Select an Element</h3>
      <p className="text-xs text-slate-500 max-w-xs mt-2 leading-relaxed">
        Hover over elements in the live preview iframe and click to load them into the visual
        editing sidebar.
      </p>
    </div>
  );
};
