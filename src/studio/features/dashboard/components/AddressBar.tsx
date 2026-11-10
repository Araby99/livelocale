import React, { useState } from 'react';
import { useStudioText } from '../../../i18n/StudioLanguage.js';
import { suggestPages } from '../../../recent-pages.js';

/** What the Studio did with a typed address: opened it, or refused it as not on this site. */
export type NavigateResult = 'ok' | 'refused';

export interface AddressBarProps {
  /** The display path of the page the preview shows. */
  path: string;
  /** The display path of a navigation in progress, shown instead of `path`. */
  pendingPath: string | null;
  recent: readonly string[];
  sitePages: readonly string[];
  onNavigate: (input: string) => NavigateResult;
}

const LIST_ID = 'studio-address-list';
const ERROR_ID = 'studio-address-error';
const optionId = (index: number) => `studio-address-option-${index}`;

/** The path with each segment between `/`s in its own <bdi>, so RTL segments keep their order. */
function PathText({ path }: { path: string }) {
  const segments = path.split('/');
  return (
    <span dir="ltr">
      {segments.map((segment, i) => (
        <React.Fragment key={i}>
          {i > 0 && '/'}
          {segment !== '' && <bdi>{segment}</bdi>}
        </React.Fragment>
      ))}
    </span>
  );
}

/** The preview's address field: an ARIA 1.2 combobox suggesting recent and site pages. */
export function AddressBar({ path, pendingPath, recent, sitePages, onNavigate }: AddressBarProps) {
  const { t } = useStudioText();
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [refused, setRefused] = useState(false);

  const query = editing ?? '';
  const groups = suggestPages(query, recent, sitePages);
  const options = [...groups.recent, ...groups.site];
  const expanded = open && options.length > 0;
  const showEmpty = open && options.length === 0 && query.trim() === '';
  const activeOption = expanded && active >= 0 && active < options.length ? active : -1;

  const openList = () => {
    setOpen(true);
    setActive(-1);
  };

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const navigate = (input: string) => {
    if (onNavigate(input) === 'ok') {
      setEditing(null);
      setRefused(false);
    } else {
      setEditing(input);
      setRefused(true);
    }
    close();
  };

  const move = (step: 1 | -1) => {
    if (options.length === 0) return;
    if (activeOption === -1) setActive(step === 1 ? 0 : options.length - 1);
    else setActive((activeOption + step + options.length) % options.length);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openList();
        if (!event.altKey) move(event.key === 'ArrowDown' ? 1 : -1);
        return;
      case 'Enter':
        if (event.nativeEvent.isComposing) return;
        event.preventDefault();
        navigate(options[activeOption] ?? editing ?? pendingPath ?? path);
        return;
      case 'Escape':
        if (open) {
          event.preventDefault();
          close();
        } else if (editing !== null || refused) {
          event.preventDefault();
          setEditing(null);
          setRefused(false);
          close();
        }
        return;
    }
  };

  const renderGroup = (labelId: string, label: string, paths: string[], offset: number) =>
    paths.length === 0 ? null : (
      <div role="group" aria-labelledby={labelId}>
        <div
          role="presentation"
          id={labelId}
          className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted"
        >
          {label}
        </div>
        {paths.map((page, i) => {
          const index = offset + i;
          const selected = index === activeOption;
          return (
            <div
              key={page}
              role="option"
              id={optionId(index)}
              data-testid="address-option"
              data-path={page}
              aria-selected={selected ? 'true' : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => navigate(page)}
              className={`px-3 py-1.5 font-mono text-xs text-fg cursor-pointer truncate hover:bg-raised-hover ${
                selected ? 'bg-raised-hover' : ''
              }`}
            >
              <PathText path={page} />
            </div>
          );
        })}
      </div>
    );

  return (
    <div className="relative flex-1 min-w-0">
      <input
        id="studio-address"
        data-testid="address-field"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={LIST_ID}
        aria-activedescendant={activeOption >= 0 ? optionId(activeOption) : undefined}
        aria-invalid={refused ? 'true' : undefined}
        aria-describedby={refused ? ERROR_ID : undefined}
        aria-label={t('viewer.address_label')}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="off"
        dir="ltr"
        value={editing ?? pendingPath ?? path}
        onFocus={openList}
        onChange={(event) => {
          setEditing(event.target.value);
          setRefused(false);
          openList();
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setEditing(null);
          setRefused(false);
          close();
        }}
        className="w-full h-7 px-2.5 rounded-md bg-raised border border-line-strong text-fg font-mono text-xs"
      />
      {expanded && (
        <div
          id={LIST_ID}
          role="listbox"
          aria-label={t('viewer.address_label')}
          className="absolute inset-x-0 top-full mt-1 z-20 max-h-72 overflow-y-auto rounded-md bg-raised border border-line py-1 shadow-lg"
        >
          {renderGroup('studio-address-recent', t('viewer.pages_recent'), groups.recent, 0)}
          {renderGroup(
            'studio-address-site',
            t('viewer.pages_site'),
            groups.site,
            groups.recent.length
          )}
        </div>
      )}
      {showEmpty && (
        <div
          id="studio-address-empty"
          role="status"
          className="absolute inset-x-0 top-full mt-1 z-20 rounded-md bg-raised border border-line px-3 py-2 text-xs text-fg-muted"
        >
          {t('viewer.pages_empty')}
        </div>
      )}
      {refused && (
        <div
          id={ERROR_ID}
          role="alert"
          className="absolute inset-x-0 top-full mt-1 z-20 rounded-md bg-raised border border-line px-3 py-2 text-xs text-danger-fg"
        >
          {t('viewer.address_refused')}
        </div>
      )}
    </div>
  );
}
