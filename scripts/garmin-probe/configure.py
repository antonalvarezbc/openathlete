"""Bind the locally tested Garmin session to an explicitly selected OA athlete."""
import argparse
import json
import os
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--athlete-id', type=int, required=True)
    parser.add_argument('--timezone', required=True, help='IANA timezone, e.g. Europe/Madrid')
    args = parser.parse_args()
    if args.athlete_id <= 0:
        parser.error('athlete-id must be positive')
    ZoneInfo(args.timezone)
    private = ROOT / '.private'
    profile_ids = set()
    for path in sorted(private.glob('report-*.json'), reverse=True):
        report = json.loads(path.read_text())
        if report.get('authentication', {}).get('status') != 'ok':
            continue
        for key, entry in report.get('checks', {}).items():
            if key.endswith('/rhr') and (entry.get('data') or {}).get('userProfileId'):
                profile_ids.add(str(entry['data']['userProfileId']))
        break
    if len(profile_ids) != 1:
        parser.error('Run a successful local probe first; a single Garmin identity is required.')
    os.umask(0o077)
    target = private / 'connection.json'
    # Never silently rebind an existing athlete configuration.
    with target.open('x') as output:
        json.dump({'athleteId': args.athlete_id, 'garminUserProfileId': profile_ids.pop(), 'timezone': args.timezone}, output)
    print(f'Configured OA athlete ID {args.athlete_id}. No Garmin requests were made.')


if __name__ == '__main__':
    main()
