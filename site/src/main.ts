// The page's entry: brand styles, then the small behaviours. Of the video, only the take for this
// viewport (the wide cut, or the tall phone take) is fetched, and only while the video is on
// screen; the right-to-left clip loads as it nears the screen.
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/sections.css';
import './styles/terminal.css';
import wideWebm from '../media/hero/hero-wide.webm?url';
import wideMp4 from '../media/hero/hero-wide.mp4?url';
import phoneWebm from '../media/hero/hero-phone.webm?url';
import phoneMp4 from '../media/hero/hero-phone.mp4?url';
import chapters from '../media/hero/chapters.json';
import phoneChapters from '../media/hero/chapters-phone.json';
import rtlSiteWebm from '../media/docs/rtl-site.webm?url';
import rtlSiteMp4 from '../media/docs/rtl-site.mp4?url';
import { startDemoVideo } from './demo-video';
import { startDoors } from './doors';
import { startCopyButtons } from './copy';
import { startClip } from './lib/clip';

const demo = document.querySelector<HTMLElement>('[data-demo]');
if (demo)
  startDemoVideo(
    demo,
    { wide: { webm: wideWebm, mp4: wideMp4 }, phone: { webm: phoneWebm, mp4: phoneMp4 } },
    { wide: chapters.duration, phone: phoneChapters.duration }
  );
startDoors();
startCopyButtons();

// The locales section's clip: its sources are set here (hashed by Vite) and attached by startClip
// only when the clip nears the screen. Its poster is in the HTML, so it shows without JavaScript.
const rtlSite = document.querySelector<HTMLElement>('#locales [data-clip]');
if (rtlSite) {
  rtlSite
    .querySelector<HTMLSourceElement>('[data-clip-webm]')
    ?.setAttribute('data-src', rtlSiteWebm);
  rtlSite.querySelector<HTMLSourceElement>('[data-clip-mp4]')?.setAttribute('data-src', rtlSiteMp4);
  startClip(rtlSite, window);
}
