export type PrefName = 'tips-seen' | 'translator-name' | 'github-repo';

/** Used when `localStorage` is missing or throws (private windows, blocked site data). */
const memoryPrefs = new Map<PrefName, string>();

function storageKey(name: PrefName): string {
  return `livelocale:${name}`;
}

/** A remembered Studio preference, or null. */
export function readPref(name: PrefName): string | null {
  try {
    return localStorage.getItem(storageKey(name));
  } catch {
    return memoryPrefs.get(name) ?? null;
  }
}

/** Remembers a Studio preference; null forgets it. */
export function writePref(name: PrefName, value: string | null): void {
  if (value === null) memoryPrefs.delete(name);
  else memoryPrefs.set(name, value);
  try {
    if (value === null) localStorage.removeItem(storageKey(name));
    else localStorage.setItem(storageKey(name), value);
  } catch {
    // Memory already holds it.
  }
}

function copyWithTextarea(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.left = '-1000px';
  try {
    document.body.appendChild(textarea);
    textarea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

/** Copies `text`; false when neither the Clipboard API nor `execCommand('copy')` worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Try the older path.
  }
  return copyWithTextarea(text);
}

/** Saves `text` as a UTF-8 plain-text file named `fileName`. */
export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  try {
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
