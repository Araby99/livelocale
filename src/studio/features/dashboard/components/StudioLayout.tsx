import React, { useEffect, type ReactNode } from 'react';

/** The drawer open in compact mode, if any. */
export type StudioPanel = 'keys' | 'side' | null;

interface StudioLayoutProps {
  /** Three columns side by side; below the breakpoint the outer two become drawers. */
  isWide: boolean;
  keys: ReactNode;
  viewer: ReactNode;
  side: ReactNode;
  /** The label of the toggle that opens the side drawer. */
  sideLabel: string;
  openPanel: StudioPanel;
  onOpenPanelChange: (panel: StudioPanel) => void;
  /** Extra controls shown after the drawer toggles in compact mode. */
  toolbar?: ReactNode;
}

const KEYS_DRAWER_ID = 'studio-drawer-keys';
const SIDE_DRAWER_ID = 'studio-drawer-side';
const DRAWER = 'absolute inset-y-0 z-30 w-[min(400px,45vw)] p-2';

const toggleClass = (open: boolean) =>
  `px-3 py-1.5 rounded-xl border text-[11px] font-semibold transition duration-150 ${
    open
      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
      : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-slate-100 hover:border-slate-700'
  }`;

/**
 * The Studio's main area. Every slot stays at the same place in the tree in both modes, and
 * only classes and attributes change, so crossing the breakpoint never remounts the editor.
 * Drawers overlay the viewer, so the app preview keeps its width when one opens.
 */
export const StudioLayout = ({
  isWide,
  keys,
  viewer,
  side,
  sideLabel,
  openPanel,
  onOpenPanelChange,
  toolbar,
}: StudioLayoutProps) => {
  const compactOpen = isWide ? null : openPanel;

  useEffect(() => {
    if (compactOpen === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenPanelChange(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [compactOpen, onOpenPanelChange]);

  const toggle = (panel: Exclude<StudioPanel, null>) =>
    onOpenPanelChange(openPanel === panel ? null : panel);

  return (
    <main
      className={`flex-1 flex overflow-hidden min-h-0 bg-linear-to-b from-[#0b0f19] to-[#070a10] ${
        isWide ? 'gap-6 p-6' : 'relative gap-0 p-2'
      }`}
    >
      <div
        id={KEYS_DRAWER_ID}
        data-testid={KEYS_DRAWER_ID}
        className={isWide ? 'h-full shrink-0' : `${DRAWER} left-0`}
        hidden={!isWide && compactOpen !== 'keys'}
      >
        {keys}
      </div>

      <div className="flex-1 min-w-0 h-full flex flex-col gap-2">
        {!isWide && (
          <div className="flex items-center gap-2 shrink-0 select-none">
            <button
              type="button"
              data-testid="studio-toggle-keys"
              aria-expanded={compactOpen === 'keys'}
              aria-controls={KEYS_DRAWER_ID}
              onClick={() => toggle('keys')}
              className={toggleClass(compactOpen === 'keys')}
            >
              Keys
            </button>
            <button
              type="button"
              data-testid="studio-toggle-side"
              aria-expanded={compactOpen === 'side'}
              aria-controls={SIDE_DRAWER_ID}
              onClick={() => toggle('side')}
              className={toggleClass(compactOpen === 'side')}
            >
              {sideLabel}
            </button>
            {toolbar}
          </div>
        )}
        {viewer}
      </div>

      <div
        id={SIDE_DRAWER_ID}
        data-testid={SIDE_DRAWER_ID}
        className={isWide ? 'h-full shrink-0' : `${DRAWER} right-0`}
        hidden={!isWide && compactOpen !== 'side'}
      >
        {side}
      </div>
    </main>
  );
};
