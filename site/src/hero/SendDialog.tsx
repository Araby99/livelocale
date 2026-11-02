// What Send shows: the real change link for the visitor's edits, which the packed demo Studio
// opens. Nothing is sent from this page; the dialog explains what the developer would do with it.
import { useEffect, useRef, useState } from 'react';
import { buildDemoLink, demoStudioHref } from './link';
import type { HeroEdit } from './model';

export const PULL_REQUEST_DOCS = 'https://github.com/Araby99/livelocale#-share-link-on-any-host';

interface SendDialogProps {
  edits: readonly HeroEdit[];
  base: string;
  onClose: () => void;
}

export function SendDialog({ edits, base, onClose }: SendDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const linkRef = useRef<HTMLTextAreaElement>(null);
  const [link, setLink] = useState('');
  const [copyNote, setCopyNote] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    let live = true;
    void buildDemoLink(edits, demoStudioHref(base, location.origin)).then((built) => {
      if (live) setLink(built);
    });
    return () => {
      live = false;
    };
  }, [edits, base]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopyNote('Copied');
    } catch {
      linkRef.current?.select();
      setCopyNote('Press Ctrl+C to copy');
    }
  };

  return (
    <dialog ref={dialogRef} className="send-dialog" aria-labelledby="send-title" onClose={onClose}>
      <h2 id="send-title" className="send-title">
        This is what your developer would receive
      </h2>
      <textarea
        ref={linkRef}
        className="send-link"
        data-testid="change-link"
        aria-label="Change link"
        readOnly
        rows={4}
        value={link}
      />
      <div className="send-copy">
        <button type="button" className="button" disabled={!link} onClick={() => void copy()}>
          Copy
        </button>
        <span aria-live="polite">{copyNote}</span>
      </div>
      <p>
        Your developer opens this link in the Studio, or runs{' '}
        <code>{'npx livelocale apply <link> --pr'}</code>, and gets a pull request with your fixes.
        Nothing was sent from this page.
      </p>
      <div className="send-actions">
        <a href={PULL_REQUEST_DOCS}>How pull requests work</a>
        <button
          type="button"
          className="button button-quiet"
          onClick={() => dialogRef.current?.close()}
        >
          Close
        </button>
      </div>
    </dialog>
  );
}
