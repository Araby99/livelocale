import React, { useEffect, useRef, type ReactNode } from 'react';
import { useStudioText } from '../../../i18n/StudioLanguage.js';
import { FOCUSABLE_SELECTOR } from '../hooks/useDialog.js';

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
  /**
   * Extra controls shown after the drawer toggles in compact mode, and in a row of their own
   * above the viewer in the wide layout (the Edit / Browse switch).
   */
  toolbar?: ReactNode;
  /**
   * The page text runs right to left. Its lines start on the right, where the editor drawer
   * would cover them, so below the breakpoint the drawer opens on the left instead.
   */
  rtlContent?: boolean;
}

const KEYS_DRAWER_ID = 'studio-drawer-keys';
const SIDE_DRAWER_ID = 'studio-drawer-side';
// Drawers start below the toggle row so the Keys and Editor toggles stay clickable.
const DRAWER = 'absolute top-12 bottom-0 z-30 w-[min(400px,45vw)] p-2';

const toggleClass = (open: boolean) =>
  `px-3 py-1.5 rounded-xl border text-xs font-semibold transition duration-150 ${
    open
      ? 'bg-accent-soft border-accent-line text-accent-fg'
      : 'bg-raised border-line text-fg hover:text-fg hover:border-line-strong'
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
  rtlContent = false,
}: StudioLayoutProps) => {
  const { t } = useStudioText();
  const compactOpen = isWide ? null : openPanel;
  const keysDrawerRef = useRef<HTMLDivElement>(null);
  const sideDrawerRef = useRef<HTMLDivElement>(null);
  const keysToggleRef = useRef<HTMLButtonElement>(null);
  const sideToggleRef = useRef<HTMLButtonElement>(null);
  // The drawer its own toggle opened. Only such a drawer takes focus on open and hands it back
  // to the toggle on Escape; one opened from outside (an Alt+Click pick) leaves focus alone.
  const openedByToggle = useRef<StudioPanel>(null);

  useEffect(() => {
    if (compactOpen === null || compactOpen !== openedByToggle.current) {
      openedByToggle.current = null;
      return;
    }
    const drawer = compactOpen === 'keys' ? keysDrawerRef.current : sideDrawerRef.current;
    drawer?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
  }, [compactOpen]);

  useEffect(() => {
    if (compactOpen === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // An open dialog owns Escape; the drawer behind it stays open.
      if (document.querySelector('[aria-modal="true"]') !== null) return;
      const opener =
        openedByToggle.current !== compactOpen
          ? null
          : compactOpen === 'keys'
            ? keysToggleRef.current
            : sideToggleRef.current;
      onOpenPanelChange(null);
      opener?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [compactOpen, onOpenPanelChange]);

  const toggle = (panel: Exclude<StudioPanel, null>) => {
    const opening = openPanel !== panel;
    openedByToggle.current = opening ? panel : null;
    onOpenPanelChange(opening ? panel : null);
  };

  return (
    <main
      className={`flex-1 flex overflow-hidden min-h-0 bg-app ${
        isWide ? 'gap-6 p-6' : 'relative gap-0 p-2'
      }`}
    >
      <div
        ref={keysDrawerRef}
        id={KEYS_DRAWER_ID}
        data-testid={KEYS_DRAWER_ID}
        className={isWide ? 'h-full shrink-0' : `${DRAWER} start-0`}
        hidden={!isWide && compactOpen !== 'keys'}
      >
        {keys}
      </div>

      <div className="flex-1 min-w-0 h-full flex flex-col gap-2">
        {!isWide && (
          <div className="flex items-center gap-2 shrink-0 select-none">
            <button
              ref={keysToggleRef}
              type="button"
              data-testid="studio-toggle-keys"
              aria-expanded={compactOpen === 'keys'}
              aria-controls={KEYS_DRAWER_ID}
              onClick={() => toggle('keys')}
              className={toggleClass(compactOpen === 'keys')}
            >
              {t('layout.keys')}
            </button>
            <button
              ref={sideToggleRef}
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
        {isWide && toolbar && (
          <div className="flex items-center gap-2 shrink-0 select-none">{toolbar}</div>
        )}
        {viewer}
      </div>

      <div
        ref={sideDrawerRef}
        id={SIDE_DRAWER_ID}
        data-testid={SIDE_DRAWER_ID}
        className={isWide ? 'h-full shrink-0' : `${DRAWER} ${rtlContent ? 'start-0' : 'end-0'}`}
        hidden={!isWide && compactOpen !== 'side'}
      >
        {side}
      </div>
    </main>
  );
};
