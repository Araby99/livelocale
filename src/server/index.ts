export { FileMutator, type FileMutatorOptions } from './file-mutator.js';
export { KeyScanner } from './key-scanner.js';
export { createLiveLocaleHandler, type HandlerConfig } from './next-handler.js';
export { createTranslations, type CreateTranslationsOptions } from './translations.js';
export {
  createMutationRouter,
  type MutationRouter,
  type MutationGateway,
  type GitGateway,
  type GitStatus,
  type GitChange,
} from './router.js';
export { GitClient } from './git-client.js';
export {
  createGitHubGateway,
  type GitHubGateway,
  type GitHubGatewayConfig,
} from './github-gateway.js';
export { getLiveLocaleMode, isLiveLocaleEnabled, type LiveLocaleMode } from '../core/env.js';

// Watermark utilities — used in Server Components to encode translation keys
// as invisible zero-width prefixes during SSR, enabling plug-and-play detection
// by the client-side DOM scanner without manual data-i18n-* attributes.
export { wrapTranslationEngine, wrapNextIntl, type WrapOptions } from '../client/wrap.js';
export {
  encodeKey,
  decodeKey,
  stripWatermark,
  sanitizeZeroWidth,
  removeWatermarks,
  hasWatermark,
  unwrap,
} from '../client/watermark.js';
