import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { buildFitActivityDetails } from '../../core/helpers/fit-activity-details';
import { FitParserStrategy } from '../../core/helpers/strategies/fit-parser.strategy';

export function hasActivityStream(stream: unknown): boolean {
  if (!stream || typeof stream !== 'object') return false;
  const time = (stream as { time?: unknown }).time;
  return Array.isArray(time) && time.length > 0;
}

export async function readManualFit(
  directory: string,
  profile: string,
  id: string,
) {
  if (!/^\d+$/.test(profile) || !/^\d+$/.test(id))
    throw new Error('Invalid FIT identity');
  const file = join(directory, '.private', 'fits', profile, id + '.fit');
  if ((await stat(file)).size > 20 * 1024 * 1024)
    throw new Error('FIT too large');
  const buffer = await readFile(file);
  const parsed = await new FitParserStrategy().parse(
    Uint8Array.from(buffer).buffer,
  );
  if (!parsed.stream.time?.length) throw new Error('Empty FIT stream');
  return buildFitActivityDetails(parsed);
}
