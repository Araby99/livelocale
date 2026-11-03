// The page's entry: brand styles, then the small behaviours. Of the video, only the cut for this
// viewport is fetched, and only while the video is on screen; the Arabic clip loads as it nears
// the screen.
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/sections.css';
import './styles/terminal.css';
import wideWebm from '../media/hero/hero-wide.webm?url';
import wideMp4 from '../media/hero/hero-wide.mp4?url';
import narrowWebm from '../media/hero/hero-narrow.webm?url';
import narrowMp4 from '../media/hero/hero-narrow.mp4?url';
import chapters from '../media/hero/chapters.json';
import arabicWebm from '../media/docs/arabic-switch.webm?url';
import arabicMp4 from '../media/docs/arabic-switch.mp4?url';
import { startDemoVideo } from './demo-video';
import { startDoors } from './doors';
import { startCopyButtons } from './copy';
import { startClip } from './lib/clip';

const demo = document.querySelector<HTMLElement>('[data-demo]');
if (demo)
  startDemoVideo(
    demo,
    { wide: { webm: wideWebm, mp4: wideMp4 }, narrow: { webm: narrowWebm, mp4: narrowMp4 } },
    chapters.duration
  );
startDoors();
startCopyButtons();

// The Arabic section's clip: its sources are set here (hashed by Vite) and attached by startClip
// only when the clip nears the screen. Its poster is in the HTML, so it shows without JavaScript.
const arabic = document.querySelector<HTMLElement>('#arabic [data-clip]');
if (arabic) {
  arabic.querySelector<HTMLSourceElement>('[data-clip-webm]')?.setAttribute('data-src', arabicWebm);
  arabic.querySelector<HTMLSourceElement>('[data-clip-mp4]')?.setAttribute('data-src', arabicMp4);
  startClip(arabic, window);
}
