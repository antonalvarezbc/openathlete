"""Validate an original FIT or extract the only FIT member from its ZIP."""
import io
import zipfile

MAX_FIT_BYTES = 20 * 1024 * 1024


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
