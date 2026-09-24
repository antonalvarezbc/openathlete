import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import Mock
from fit_files import collect_fits, fit_bytes, MAX_FIT_BYTES

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

    def test_limit_cache_completed_and_profile_isolation(self):
        with tempfile.TemporaryDirectory() as private:
            client = Mock()
            client.download_activity.return_value = zipped('../../outside.fit')
            activities = [{'id': str(i)} for i in range(1, 6)]
            result = collect_fits(client, activities, private, '123', ['1'])
            self.assertEqual(len(result['fits']), 3)
            self.assertEqual(result['fitsPending'], 1)
            self.assertEqual(client.download_activity.call_count, 3)
            self.assertTrue((Path(private) / 'fits/123/2.fit').exists())
            self.assertFalse((Path(private) / 'outside.fit').exists())
            client.reset_mock()
            collect_fits(client, [{'id': '2'}], private, '123', [])
            client.download_activity.assert_not_called()
            collect_fits(client, [{'id': '2'}], private, '999', [])
            client.download_activity.assert_called_once()

    def test_failures_do_not_starve_pending_activities(self):
        with tempfile.TemporaryDirectory() as private:
            client = Mock()
            client.download_activity.side_effect = RuntimeError('private response')
            activities = [{'id': str(i)} for i in range(1, 5)]
            first = collect_fits(client, activities, private, '123', [])
            self.assertTrue(all(not item['ready'] for item in first['fits']))
            second = collect_fits(client, activities, private, '123', [])
            self.assertEqual(second['fits'][0]['id'], '4')
            self.assertNotIn('private response', str(second))

    def test_rate_limit_stops_batch_without_retry(self):
        with tempfile.TemporaryDirectory() as private:
            client = Mock()
            failure = type('GarminConnectTooManyRequestsError', (Exception,), {})
            client.download_activity.side_effect = failure()
            result = collect_fits(client, [{'id': str(i)} for i in range(1, 5)], private, '123', [])
            client.download_activity.assert_called_once()
            self.assertEqual(result['fitsPending'], 3)

    def test_invalid_cache_can_be_downloaded_on_next_manual_attempt(self):
        with tempfile.TemporaryDirectory() as private:
            client = Mock()
            client.download_activity.return_value = zipped()
            directory = Path(private) / 'fits/123'
            directory.mkdir(parents=True)
            (directory / '1.fit').write_bytes(b'invalid')
            first = collect_fits(client, [{'id': '1'}], private, '123', [])
            self.assertFalse(first['fits'][0]['ready'])
            client.download_activity.assert_not_called()
            second = collect_fits(client, [{'id': '1'}], private, '123', [])
            self.assertTrue(second['fits'][0]['ready'])
            client.download_activity.assert_called_once()

    def test_rejects_ids_before_download(self):
        with tempfile.TemporaryDirectory() as private:
            client = Mock()
            with self.assertRaises(ValueError):
                collect_fits(client, [{'id': '../secret'}], private, '123', [])
            client.download_activity.assert_not_called()


if __name__ == '__main__':
    unittest.main()
