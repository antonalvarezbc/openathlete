export type ActivityFileKind = 'fit' | 'gpx' | 'tcx';

/** Manual imports accept FIT, GPX and TCX files, by extension. */
export function activityFileKind(name: string): ActivityFileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.fit')) return 'fit';
  if (lower.endsWith('.gpx')) return 'gpx';
  if (lower.endsWith('.tcx')) return 'tcx';
  return null;
}

/** The activity name a file suggests: its file name without extension. */
export const fileActivityName = (name: string) =>
  name.replace(/\.(fit|gpx|tcx)$/i, '').slice(0, 100);

/**
 * The track name written in a GPX ("Morning Run", "Rodaje"), read in the
 * browser only to suggest the activity name. Empty when there is none.
 */
export function gpxTrackName(xml: string) {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return '';
    const track = doc.getElementsByTagName('trk')[0];
    const name = track
      ? [...track.children].find((child) => child.localName === 'name')
      : undefined;
    return (name?.textContent ?? '').trim().slice(0, 100);
  } catch {
    return '';
  }
}

/**
 * The notes written on a TCX activity ("Long run"), read in the browser only
 * to suggest the activity name. Empty when there are none.
 */
export function tcxActivityName(xml: string) {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return '';
    const activity = [...doc.getElementsByTagName('*')].find(
      (element) => element.localName === 'Activity',
    );
    const notes = activity
      ? [...activity.children].find((child) => child.localName === 'Notes')
      : undefined;
    return (notes?.textContent ?? '').trim().slice(0, 100);
  } catch {
    return '';
  }
}
