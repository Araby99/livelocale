// Copy buttons for the install command: a real copied state for two seconds, announced to screen
// readers, and a fallback that selects the command when the clipboard is refused.

const COPIED_MS = 2000;

export function startCopyButtons(doc: Document = document): void {
  const announcer = doc.querySelector<HTMLElement>('[data-announcer]');
  for (const button of doc.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    const text = button.dataset.copy ?? '';
    const label = button.querySelector<HTMLElement>('.cmd-label');
    let timer: ReturnType<typeof setTimeout> | undefined;

    const say = (state: 'copied' | 'failed' | 'idle', message = '') => {
      button.dataset.state = state;
      if (label)
        label.textContent =
          state === 'copied' ? 'Copied' : state === 'failed' ? 'Press Ctrl+C' : 'Copy';
      if (announcer) announcer.textContent = message;
    };

    button.addEventListener('click', async () => {
      clearTimeout(timer);
      try {
        await navigator.clipboard.writeText(text);
        say('copied', `Copied ${text}`);
      } catch {
        const range = doc.createRange();
        const code = button.querySelector('.cmd-text');
        if (code) {
          range.selectNodeContents(code);
          const sel = getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
        say('failed', 'Could not copy. The command is selected: press Ctrl+C to copy it.');
      }
      timer = setTimeout(() => say('idle'), COPIED_MS);
    });
  }
}
