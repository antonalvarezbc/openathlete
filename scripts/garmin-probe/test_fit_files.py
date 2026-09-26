import io
import unittest
import zipfile
from unittest.mock import patch
from fit_files import fit_bytes, MAX_FIT_BYTES

FIT = bytes([14, 16, 0, 0, 0, 0, 0, 0]) + b'.FIT' + b'\0\0'


def zipped(name='activity.fit', data=FIT):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as archive:
        archive.writestr(name, data)
    return output.getvalue()


class FitTests(unittest.TestCase):
    def test_original_zip_and_raw_fit(self):
        self.assertEqual(fit_bytes(FIT), FIT)
        self.assertEqual(fit_bytes(zipped()), FIT)

    def test_bad_oversized_and_ambiguous_archives(self):
        for data in (b'invalid', b'x' * (MAX_FIT_BYTES + 1), zipped('activity.gpx')):
            with self.assertRaises(ValueError):
                fit_bytes(data)
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w') as archive:
            archive.writestr('one.fit', FIT)
            archive.writestr('two.fit', FIT)
        with self.assertRaises(ValueError):
            fit_bytes(output.getvalue())

    def test_zip_member_path_is_not_extracted_to_disk(self):
        with patch.object(zipfile.ZipFile, 'extract', side_effect=AssertionError('Do not extract paths')), \
                patch.object(zipfile.ZipFile, 'extractall', side_effect=AssertionError('Do not extract paths')):
            self.assertEqual(fit_bytes(zipped('../../outside.fit')), FIT)


if __name__ == '__main__':
    unittest.main()
