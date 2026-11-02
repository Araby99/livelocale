// The language slider: the sample page in English with its Arabic rendering stacked on top,
// clipped at the divider. What check --hardcoded found is outlined in the Arabic layer.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import i18next, { type i18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { SamplePage } from '../../sample/SamplePage';
import ar from '../../sample/locales/ar.json';
import en from '../../sample/locales/en.json';
import report from './hardcoded.json';
import { markHardcoded } from './outline';
import { summaryLine, type SampleFindings } from './report';
import { SLIDER_START, keyStep, percentFromPointer, valueText } from './slider-math';

const findings: SampleFindings = report.findings;

/** An i18next instance of its own per layer, so the two languages render side by side. */
function sampleI18n(lng: 'en' | 'ar'): i18n {
  const instance = i18next.createInstance();
  void instance.init({
    lng,
    fallbackLng: false,
    resources: { en: { translation: en }, ar: { translation: ar } },
    initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}

export function LanguageSlider() {
  const [value, setValue] = useState(SLIDER_START);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const englishRef = useRef<HTMLDivElement>(null);
  const arabicRef = useRef<HTMLDivElement>(null);
  const instances = useMemo(() => ({ en: sampleI18n('en'), ar: sampleI18n('ar') }), []);

  useLayoutEffect(() => {
    // The layers are a picture of a page: its button does nothing, and a clipped layer must not
    // take focus where nobody can see it.
    for (const layer of [englishRef.current, arabicRef.current]) if (layer) layer.inert = true;
    if (arabicRef.current) markHardcoded(arabicRef.current, findings.texts);
  }, []);

  const moveTo = (clientX: number) => {
    const track = trackRef.current;
    if (track) setValue(percentFromPointer(clientX, track.getBoundingClientRect()));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    moveTo(e.clientX);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging) moveTo(e.clientX);
  };
  const onPointerEnd = () => setDragging(false);

  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    const next = keyStep(value, e.key);
    if (next === null) return;
    e.preventDefault();
    setValue(next);
  };

  return (
    <>
      <div
        ref={trackRef}
        className={`slider-track slider-track-live${dragging ? ' is-dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div ref={englishRef} className="slider-layer" data-lang="en" lang="en">
          <p className="slider-label">English</p>
          <I18nextProvider i18n={instances.en}>
            <SamplePage findings={findings} />
          </I18nextProvider>
        </div>
        <div
          ref={arabicRef}
          className="slider-layer slider-layer-ar"
          data-lang="ar"
          lang="ar"
          dir="rtl"
          style={{ clipPath: `inset(0 0 0 ${value}%)` }}
        >
          <p className="slider-label">العربية</p>
          <I18nextProvider i18n={instances.ar}>
            <SamplePage findings={findings} />
          </I18nextProvider>
        </div>
        <span
          className="slider-divider"
          style={{ left: `clamp(2px, ${value}%, calc(100% - 2px))` }}
          aria-hidden="true"
        />
        <span
          className="slider-handle"
          role="slider"
          aria-label="Language divider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-valuetext={valueText(value)}
          tabIndex={0}
          style={{ left: `clamp(22px, ${value}%, calc(100% - 22px))` }}
          onKeyDown={onKeyDown}
        >
          <span aria-hidden="true">⇆</span>
        </span>
      </div>
      <div className="check-output" data-testid="check-output">
        <p>{summaryLine(findings)}</p>
        <pre>{report.output}</pre>
      </div>
    </>
  );
}
