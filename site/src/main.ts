// The page's entry: brand styles, then the three small behaviours. Of the video, only the cut for
// this viewport is fetched, and only while the video is on screen.
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
import { startDemoVideo } from './demo-video';
import { startDoors } from './doors';
import { startCopyButtons } from './copy';

const demo = document.querySelector<HTMLElement>('[data-demo]');
if (demo)
  startDemoVideo(
    demo,
    { wide: { webm: wideWebm, mp4: wideMp4 }, narrow: { webm: narrowWebm, mp4: narrowMp4 } },
    chapters.duration
  );
startDoors();
startCopyButtons();
