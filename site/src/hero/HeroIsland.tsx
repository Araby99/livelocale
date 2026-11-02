// The broken hero, live: the visitor fixes the three planted mistakes, each edit adds a pair to
// the pull-request card, and Send shows the real change link. It renders exactly the shell's
// html.js start state first, so nothing moves when it mounts. On a touch device the mistakes are
// tap-the-typo buttons and a note says the real thing is Alt+Click on a computer.
import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersTouch } from '../lib/input-mode';
import { EditPopover } from './EditPopover';
import { MistakeText } from './MistakeText';
import { MISTAKES, applyEdit, isFixed, leftLabel, progress } from './model';
import type { HeroEdit, Mistake, MistakeKey } from './model';
import { PrCard } from './PrCard';
import { PULL_REQUEST_DOCS, SendDialog } from './SendDialog';

const DOCS = 'https://github.com/Araby99/livelocale#readme';

function mistake(key: MistakeKey): Mistake {
  return MISTAKES.find((m) => m.key === key)!;
}

export function HeroIsland({ base }: { base: string }) {
  const [edits, setEdits] = useState<HeroEdit[]>([]);
  const [editing, setEditing] = useState<MistakeKey | null>(null);
  const [sending, setSending] = useState(false);
  const [touch] = useState(() => prefersTouch((q) => window.matchMedia(q)));
  const mistakeEls = useRef(new Map<MistakeKey, HTMLElement>());
  const copyRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const completionRef = useRef<HTMLHeadingElement>(null);
  // Where focus goes after the next render: back to a mistake, the completion heading or Send.
  const pendingFocus = useRef<MistakeKey | 'completion' | 'send' | null>(null);
  const { fixed, total, done, left } = progress(edits);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target === 'completion') completionRef.current?.focus();
    else if (target === 'send') sendRef.current?.focus();
    else mistakeEls.current.get(target)?.focus();
  });

  const save = (key: MistakeKey, value: string) => {
    const next = applyEdit(edits, key, value);
    pendingFocus.current = progress(next).done && !done ? 'completion' : key;
    setEdits(next);
    setEditing(null);
  };
  const cancel = (key: MistakeKey) => {
    pendingFocus.current = key;
    setEditing(null);
  };
  const dismiss = useCallback(() => setEditing(null), []);
  // A tap applies the fix itself. The tapped button turns into the patch, so focus moves only
  // when the last fix brings up the completion.
  const tap = (key: MistakeKey) => {
    const next = applyEdit(edits, key, mistake(key).fixed);
    if (progress(next).done && !done) pendingFocus.current = 'completion';
    setEdits(next);
  };

  const text = (key: MistakeKey) => {
    const m = mistake(key);
    return (
      <MistakeText
        mistake={m}
        edit={edits.find((e) => e.key === key)}
        fixed={isFixed(edits, key)}
        onOpen={() => setEditing(key)}
        onTap={touch ? () => tap(key) : undefined}
        elementRef={(el) => {
          if (el) mistakeEls.current.set(key, el);
          else mistakeEls.current.delete(key);
        }}
      />
    );
  };

  const anchor = editing ? mistakeEls.current.get(editing) : undefined;

  return (
    <div className="hero-live">
      <p className="hero-bar" aria-live="polite">
        <span className={left === 0 ? 'bar-done' : undefined}>{leftLabel(left)}</span>
      </p>
      <div className="hero-grid">
        <div className="hero-copy" ref={copyRef}>
          <p className="diff-old">
            <del>Collect screenshots of every typo before launch.</del>
          </p>
          <h1>
            <span className="lead-patch">Stop</span> {text('hero.title')} screenshots.
          </h1>
          {touch ? (
            <>
              <p className="hero-hint">Tap a typo to fix it.</p>
              <p className="hero-note">
                On a computer, hold Alt and click any text to edit the real thing.
              </p>
            </>
          ) : (
            <p className="hero-hint">↑ hold Alt and click the typo</p>
          )}
          <p className="hero-lede">
            Anyone on your team fixes text {text('hero.lede')} on the site.
          </p>
          <p className="hero-lede">
            You get a pull request. CI catches what was never {text('hero.ci')}.
          </p>
          {editing && anchor && copyRef.current && (
            <EditPopover
              key={editing}
              initial={edits.find((e) => e.key === editing)?.to ?? mistake(editing).broken}
              anchor={anchor}
              container={copyRef.current}
              onSave={(value) => save(editing, value)}
              onCancel={() => cancel(editing)}
              onDismiss={dismiss}
            />
          )}
        </div>
        <PrCard
          edits={edits}
          fixed={fixed}
          total={total}
          onSend={() => setSending(true)}
          sendRef={sendRef}
        />
      </div>
      {done && (
        <div className="completion">
          <h2 className="completion-title" tabIndex={-1} ref={completionRef}>
            That&apos;s LiveLocale. Install it.
          </h2>
          <code className="chip">npm i livelocale</code>
          <a className="button" href={DOCS}>
            Read the docs
          </a>
          <a className="button button-quiet" href={`${base}demo/livelocale/index.html`}>
            Try the full Studio
          </a>
          <p className="completion-note">
            The full Studio runs on a sample site. Send shows the change link; nothing is sent and
            no pull request is made from this page.{' '}
            <a href={PULL_REQUEST_DOCS}>How pull requests work</a>
          </p>
        </div>
      )}
      {sending && (
        <SendDialog
          edits={edits}
          base={base}
          onClose={() => {
            pendingFocus.current = 'send';
            setSending(false);
          }}
        />
      )}
    </div>
  );
}
