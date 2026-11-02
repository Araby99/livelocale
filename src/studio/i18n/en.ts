import type { Message } from './catalogue.js';

/** English Studio copy: the source catalogue. Every key's Arabic lives in `ar.ts`. */
export const en = {
  'common.arrow': '→',
  'language.switch_to_ar': 'Show the Studio in Arabic',
  'language.switch_to_en': 'Show the Studio in English',
  'tips.title': 'Welcome to LiveLocale',
  'tips.step1': 'Hold Alt/Option and click any text.',
  'tips.step2':
    'Type your fix. The page updates as you type, and your changes are kept in this browser.',
  'tips.step3': 'When you are done, press Send to developer and paste the link to your developer.',
  'tips.name_label': 'Your name (optional, credited in the pull request)',
  'tips.start': 'Start editing',
  'drafts.unsent': { one: '1 change not sent', other: '{count} changes not sent' },
  'send.title': 'Send to developer',
  'send.name_label': 'Your name',
  'send.note_label': 'Note for the developer (optional)',
  'send.include_sent': {
    one: 'Also include 1 change already sent',
    other: 'Also include {count} changes already sent',
  },
  'send.nothing_to_send': 'There are no changes to send.',
  'send.empty': 'empty',
  'send.overflow': {
    one: '1 of {total} changes is in this link. Send again for the rest.',
    other: '{count} of {total} changes are in this link. Send again for the rest.',
  },
  'send.encode_failed': 'Could not create the link: {reason}',
  'send.too_long': 'This batch is too long for a chat message. Use Download file instead.',
  'send.copy': 'Copy link',
  'send.download': 'Download file',
  'send.close': 'Close',
  'send.open_github': 'Open on GitHub',
  'send.github_hint':
    'Press “Submit new issue” on GitHub. A pull-request link appears as a comment about a minute later.',
  'send.copied': 'Link copied. Paste it to your developer in chat or email.',
  'send.downloaded': 'File saved. Send it to your developer.',
  'send.opened': 'GitHub opened in a new tab.',
  'send.copy_failed':
    'Copy did not work in this browser. Select the link above, copy it, then press “I copied it”.',
  'send.copied_confirm': 'I copied it',
  'send.mark_failed': 'Could not mark the changes as sent.',
  'send.save_failed': 'Could not save the file.',
  'link_error.not_found': 'This is not a LiveLocale change link. A change link contains "lc1.".',
  'link_error.ambiguous': 'This text holds more than one change link. Paste one link at a time.',
  'link_error.damaged':
    'This change link is damaged or incomplete, which happens when an email or chat app breaks a long link. Ask the sender to send the file instead.',
  'link_error.too_big': 'This change link is larger than LiveLocale accepts (500 changes, 512 KB).',
  'link_error.unsupported_version':
    'This change link was made by a newer LiveLocale. Update the site and try again.',
  'link_error.unsupported_environment':
    'This browser cannot create or read change links. Use a current Chrome, Edge or Firefox, or Safari 16.4 or later.',
  'link_error.unreadable': 'Could not read the change link.',
  'backup.too_many': 'More than {max} changes: send some of them first, then download the backup.',
  'backup.no_link': 'No change link found in this file.',
  // A plural for the Arabic forms; the English keeps its 0.10 wording for every count.
  'backup.restored': { other: 'Restored {count} changes ({skipped} already here).' },
} as const satisfies Record<string, Message>;
