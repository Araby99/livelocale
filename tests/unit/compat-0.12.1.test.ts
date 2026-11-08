// @vitest-environment node
// The 1.0 compatibility guard. The fixtures under tests/fixtures/compat/0.12.1/ were made by
// livelocale 0.12.1: the change links by src/core/change-link.ts at tag v0.12.1, the manifests
// and flag.js by `livelocale pack` from the same release. Links people already sent and share
// folders already deployed must keep working, so these fixtures are never regenerated. A failure
// here means a change broke a shipped format: move it to a new version (lc2., manifest format 2,
// flag v2) instead of editing the fixture.
import * as fs from 'node:fs';
import { inflateSync } from 'node:zlib';
import {
  type ChangeSet,
  decodeChangeLink,
  findChangeToken,
  fromBase64Url,
  streamInflate,
  toWire,
} from '../../src/core/change-link.js';
import { nodeInflate } from '../../src/core/change-link-node.js';
import { FLAG_SCRIPT, FLAG_SCRIPT_SIGNATURE } from '../../src/core/flag-script.js';
import {
  isShareManifest,
  manifestPages,
  parseShareManifest,
} from '../../src/core/share-manifest.js';
import { draftScope } from '../../src/studio/transport/drafts.js';

const DIR = 'tests/fixtures/compat/0.12.1';
const read = (file: string) => fs.readFileSync(`${DIR}/${file}`, 'utf8');
const json = (file: string): unknown => JSON.parse(read(file));

interface LinkFixture {
  name: string;
  token: string;
  expected: ChangeSet;
}

const fixture = json('links.json') as {
  links: LinkFixture[];
  issueBody: string;
  safeLink: string;
};

describe('lc1 change links made by 0.12.1', () => {
  it('covers repo and no repo, forced edits, a new key, a note with newlines and RTL text', () => {
    const sets = fixture.links.map((link) => link.expected);
    expect(sets.some((set) => set.repo === undefined)).toBe(true);
    expect(sets.some((set) => set.edits.some((edit) => edit.force))).toBe(true);
    expect(sets.some((set) => set.edits.some((edit) => edit.from === null))).toBe(true);
    expect(sets.some((set) => set.note.includes('\n'))).toBe(true);
    expect(sets.some((set) => set.base.length === 64)).toBe(true);
    expect(sets.some((set) => set.edits.some((edit) => edit.locale === 'ar'))).toBe(true);
  });

  for (const link of fixture.links) {
    it(`decodes ${link.name} in the browser and in the CLI`, async () => {
      expect(await decodeChangeLink(link.token, streamInflate)).toEqual(link.expected);
      expect(await decodeChangeLink(link.token, nodeInflate)).toEqual(link.expected);
    });

    it(`encodes ${link.name} to the same JSON 0.12.1 wrote, so pinned 0.12.1 Actions accept it`, () => {
      // Workflows written by `init --share` pin the livelocale version, so an old parser reads
      // links from a newer Studio. The wire JSON must stay byte for byte what 0.12.1 produced.
      const sent = inflateSync(fromBase64Url(link.token.slice('lc1.'.length))).toString('utf8');
      expect(JSON.stringify(toWire(link.expected))).toBe(sent);
    });
  }

  it('finds the link in a GitHub issue body and in an Outlook SafeLinks URL', async () => {
    const first = fixture.links[0]!;
    expect(findChangeToken(fixture.issueBody)).toBe(first.token);
    expect(await decodeChangeLink(fixture.issueBody, nodeInflate)).toEqual(first.expected);
    expect(await decodeChangeLink(fixture.safeLink, nodeInflate)).toEqual(first.expected);
  });
});

describe('share folders packed by 0.12.1', () => {
  it('reads manifest.json with and without the exposed repo', () => {
    for (const file of ['manifest.json', 'manifest-repo.json']) {
      const manifest = json(file);
      expect(isShareManifest(manifest)).toBe(true);
      expect(manifestPages(manifest as object)).toEqual(['/', '/about/']);
    }
  });

  it('reads a manifest without pages, as 0.9 to 0.11 wrote them', () => {
    const manifest = parseShareManifest(json('manifest-no-pages.json'));
    expect(manifest).not.toBeNull();
    expect(manifestPages(manifest!)).toEqual([]);
  });

  it('keeps the drafts translators saved under the same scope', () => {
    const app = 'https://acme.github.io/shop/';
    expect(draftScope(parseShareManifest(json('manifest-repo.json'))!, app)).toBe('acme/shop');
    expect(draftScope(parseShareManifest(json('manifest.json'))!, app)).toBe('path:/shop/');
  });

  it('ignores fields a newer pack adds', () => {
    const manifest = { ...(json('manifest.json') as object), addedLater: { any: 'shape' } };
    expect(isShareManifest(manifest)).toBe(true);
  });

  it('still writes flag.js v1, which doctor recognises on sites deployed with 0.12.1', () => {
    const deployed = read('flag.js');
    expect(deployed.startsWith(FLAG_SCRIPT_SIGNATURE)).toBe(true);
    expect(FLAG_SCRIPT).toBe(deployed);
  });
});
