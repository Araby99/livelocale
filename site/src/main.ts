// The page's entry: brand styles, then the three small behaviours. Nothing else loads; the video
// files are fetched only once the page has loaded and the video is on screen.
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/sections.css';
import webm from '../media/hero/hero.webm?url';
import mp4 from '../media/hero/hero.mp4?url';
import chapters from '../media/hero/chapters.json';
import { startDemoVideo } from './demo-video';
import { startDoors } from './doors';
import { startCopyButtons } from './copy';

const demo = document.querySelector<HTMLElement>('[data-demo]');
if (demo) startDemoVideo(demo, { webm, mp4 }, chapters.duration);
startDoors();
startCopyButtons();
