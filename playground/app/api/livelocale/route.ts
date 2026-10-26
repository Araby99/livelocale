import { createLiveLocaleHandler } from 'livelocale/server';
import * as path from 'path';

const handler = createLiveLocaleHandler({
  localesPath: path.resolve('./locales'), // Adjust relative to project root
});

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
