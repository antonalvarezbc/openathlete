import { createSuuntoGuideZipFromFiles } from './suunto-guide-zip';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AdmZip = require('adm-zip');

function readEntries(zipBuffer: Buffer): Record<string, Buffer> {
  const zip = new AdmZip(zipBuffer);
  return Object.fromEntries(
    zip
      .getEntries()
      .map((entry: { entryName: string; getData: () => Buffer }) => [
        entry.entryName,
        entry.getData(),
      ]),
  );
}

describe('createSuuntoGuideZipFromFiles', () => {
  it('packs guide.json and the provided icon', () => {
    const guideJson = JSON.stringify({ name: 'Intervals' });
    const icon = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    const entries = readEntries(createSuuntoGuideZipFromFiles(guideJson, icon));

    expect(Object.keys(entries).sort()).toEqual(['guide.json', 'icon.png']);
    expect(entries['guide.json'].toString('utf-8')).toBe(guideJson);
    expect(entries['icon.png'].equals(icon)).toBe(true);
  });

  it('falls back to the bundled default icon', () => {
    const entries = readEntries(createSuuntoGuideZipFromFiles('{}'));

    // PNG signature
    expect(entries['icon.png'].subarray(0, 4).toString('hex')).toBe('89504e47');
  });
});
