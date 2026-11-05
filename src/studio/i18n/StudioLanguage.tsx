import { englishText, type StudioText } from './catalogue.js';

export interface StudioTextState {
  t: StudioText;
}

const ENGLISH: StudioTextState = { t: englishText };

/** The Studio's text function. The Studio interface is English only. */
export function useStudioText(): StudioTextState {
  return ENGLISH;
}
