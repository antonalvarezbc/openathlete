"""Bounded original-FIT downloads. Only called by an explicit manual sync."""
import io
import json
import os
import re
import time
import zipfile
from pathlib import Path

MAX_FIT_BYTES = 20 * 1024 * 1024
FIT_BATCH_SIZE = 3


def fit_bytes(data):
    if not isinstance(data, bytes) or len(data) > MAX_FIT_BYTES:
        raise ValueError('FitSize')
    if data[:2] == b'PK':
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = [e for e in archive.infolist() if not e.is_dir() and e.filename.lower().endswith('.fit')]
            # Multisport/multiple originals require explicit mapping; never guess.
            if len(entries) != 1 or entries[0].file_size > MAX_FIT_BYTES:
                raise ValueError('FitArchive')
            with archive.open(entries[0]) as source:
                data = source.read(MAX_FIT_BYTES + 1)
    if len(data) < 14 or len(data) > MAX_FIT_BYTES or data[8:12] != b'.FIT':
        raise ValueError('FitFormat')
    return data


def collect_fits(client, activities, private, profile_id, completed):
    if not re.fullmatch(r'\d+', str(profile_id)):
        raise ValueError('AccountMismatch')
    directory = Path(private) / 'fits' / str(profile_id)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    attempts_file = directory / 'attempts.json'
    try:
        attempts = json.loads(attempts_file.read_text())
    except (FileNotFoundError, ValueError):
        attempts = {}
    ids = list(dict.fromkeys(a['id'] for a in activities if a['id'] not in completed))
    if any(not re.fullmatch(r'\d+', item) for item in ids):
        raise ValueError('InvalidActivityId')
    # Failed activities do not starve unattempted ones on the next button press.
    ids.sort(key=lambda item: attempts.get(item, 0))
    selected = ids[:FIT_BATCH_SIZE]
    result = {'fits': [], 'fitsPending': len(ids) - len(selected)}
    for activity_id in selected:
        attempts[activity_id] = time.time()
        target = directory / (activity_id + '.fit')
        try:
            if target.exists():
                if target.stat().st_size > MAX_FIT_BYTES:
                    raise ValueError('FitSize')
                fit_bytes(target.read_bytes())
            else:
                data = client.download_activity(activity_id, dl_fmt=client.ActivityDownloadFormat.ORIGINAL)
                data = fit_bytes(data)
                temporary = target.with_suffix('.tmp')
                with open(temporary, 'wb') as output:
                    os.chmod(temporary, 0o600)
                    output.write(data)
                temporary.replace(target)
            result['fits'].append({'id': activity_id, 'ready': True})
        except Exception as error:
            # Invalid cached originals must not make every future retry fail locally.
            try:
                target.unlink(missing_ok=True)
            except OSError:
                pass
            result['fits'].append({'id': activity_id, 'ready': False})
            # Stop immediately on throttling/authentication, without retries.
            if type(error).__name__ in ('GarminConnectTooManyRequestsError', 'GarminConnectAuthenticationError'):
                result['fitsPending'] += len(selected) - len(result['fits'])
                break
    temporary = attempts_file.with_suffix('.tmp')
    temporary.write_text(json.dumps(attempts))
    os.chmod(temporary, 0o600)
    temporary.replace(attempts_file)
    return result
