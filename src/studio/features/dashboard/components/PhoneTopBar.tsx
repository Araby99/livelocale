import React, { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { BrandMark } from './BrandMark.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';

interface PhoneTopBarProps {
  /** Share-link drafts not sent yet, shown in the Send button. */
  unsentCount: number;
  /** Whether there is anything to send; defaults to whether anything is unsent. */
  canSend?: boolean;
  /** The locale being edited; null while the person has not chosen one yet. */
  locale: string | null;
  locales: string[];
  onChooseLocale: (locale: string) => void;
  /** Opens the Send flow; the Send button renders only when set (static mode). */
  onSend?: () => void;
  /**
   * What the More menu holds (theme, keys, changes, page address). Clicking an element marked
   * `data-closes-menu` inside it closes the menu.
   */
  menu: ReactNode;
}

// At least 44 x 44 px per control, so a thumb hits it.
const CONTROL = 'min-h-11 min-w-11 shrink-0 rounded-xl border text-xs font-semibold';

/**
 * The phone's thin top bar: the mark, the locale chip and Send stay visible; everything else
 * waits behind the More menu so the site keeps almost the whole screen.
 */
export const PhoneTopBar = ({
  unsentCount,
  canSend = unsentCount > 0,
  locale,
  locales,
  onChooseLocale,
  onSend,
  menu,
}: PhoneTopBarProps) => {
  const { t } = useStudioText();
  const menuId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Escape or a tap outside closes the menu; Escape hands focus back to its button.
  useEffect(() => {
    if (!isMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      setIsMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    const onPointerDown = (event: Event) => {
      const target = event.target as Node | null;
      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return;
      setIsMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isMenuOpen]);

  const onMenuClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-closes-menu]')) setIsMenuOpen(false);
  };

  return (
    <header
      data-testid="phone-top-bar"
      className="relative h-14 bg-surface border-b border-line px-2 flex items-center gap-2 shrink-0 select-none"
    >
      <BrandMark className="h-7 w-7 shrink-0 ms-1" />

      <select
        value={locale ?? ''}
        dir="ltr"
        aria-label={t('editor.locale')}
        onChange={(event) => onChooseLocale(event.target.value)}
        className={`${CONTROL} min-w-0 px-3 bg-accent-soft border-accent-line text-accent-fg font-mono uppercase cursor-pointer`}
      >
        {locale === null && (
          <option value="" disabled>
            {t('editor.locale')}
          </option>
        )}
        {locales.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>

      <div className="flex-1" />

      {onSend && (
        <button
          type="button"
          id="studio-send-button"
          onClick={onSend}
          disabled={!canSend}
          className={`${CONTROL} px-3 bg-accent border-accent-line text-on-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap`}
        >
          {t('phone.send', { count: unsentCount })}
        </button>
      )}

      <button
        ref={menuButtonRef}
        type="button"
        aria-label={t('phone.menu')}
        aria-expanded={isMenuOpen}
        aria-controls={menuId}
        onClick={() => setIsMenuOpen((open) => !open)}
        className={`${CONTROL} inline-flex items-center justify-center ${
          isMenuOpen
            ? 'bg-accent-soft border-accent-line text-accent-fg'
            : 'bg-raised border-line text-fg'
        }`}
      >
        <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>

      {isMenuOpen && (
        <div
          ref={menuRef}
          id={menuId}
          data-testid="phone-menu"
          onClick={onMenuClick}
          className="absolute top-full inset-x-2 mt-1 z-40 flex flex-col gap-3 p-3 rounded-2xl bg-raised border border-line-strong shadow-lg animate-in fade-in duration-150"
        >
          {menu}
        </div>
      )}
    </header>
  );
};
