import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from backfill import run, MAX_DOWNLOADS, MAX_REVIEWS
from request_safety import RequestSafety, operation_lock

FIT = b'\x0e' + b'\0' * 7 + b'.FIT' + b'\0\0'
RUN_ID = '12345678-1234-1234-1234-123456789012'


class Clock:
    def __init__(self):
        self.value = 1_800_000_000
        self.sleeps = []
        self.on_sleep = lambda: None

    def now(self):
        return self.value

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.value += seconds
        self.on_sleep()


class BackfillTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.private = Path(self.temporary.name)
        (self.private / 'connection.json').write_text(json.dumps({
            'garminUserProfileId': '123', 'timezone': 'Europe/Madrid', 'athleteId': 42,
        }))
        self.clock = Clock()
        self.messages = []
        self.calls = []
        self.error = None
        self.profile = '123'
        self.ack = Mock(return_value=True)
        self.factory_calls = 0

    def factory(self, safety):
        self.factory_calls += 1
        def request(name, value):
            safety.before_request()
            self.calls.append((name, self.clock.now()))
            if name.startswith('fit:') and self.error is not None:
                safety.fail(self.error)
                raise self.error
            safety.after_request()
            return value
        return SimpleNamespace(
            login=lambda tokens: request('login', None),
            get_rhr_day=lambda day: request('identity', {'userProfileId': self.profile}),
            download_activity=lambda activity_id, dl_fmt: request('fit:' + activity_id, FIT),
            ActivityDownloadFormat=SimpleNamespace(ORIGINAL='original'),
        )

    def execute(self, ids, **kwargs):
        return run(self.private, ids, RUN_ID, emit=self.messages.append,
                   acknowledge=self.ack, client_factory=self.factory,
                   safety_factory=lambda *args, **kw: RequestSafety(
                       *args, **kw, now=self.clock.now, sleep=self.clock.sleep), **kwargs)

    def cache(self, activity_id, data=FIT):
        directory = self.private / 'fits' / '123'
        directory.mkdir(parents=True, exist_ok=True)
        (directory / (activity_id + '.fit')).write_bytes(data)

    def fits(self):
        return [item for item in self.messages if item['type'] == 'fit']

    def test_cached_files_need_no_login_no_requests_and_ack_each(self):
        self.cache('1')
        self.cache('2')
        self.execute(['1', '2'])
        self.assertEqual(self.factory_calls, 0)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.fits(), [
            {'type': 'fit', 'id': '1', 'ready': True, 'cached': True},
            {'type': 'fit', 'id': '2', 'ready': True, 'cached': True},
        ])
        self.assertEqual(self.ack.call_count, 2)
        self.assertEqual(self.messages[-1], {'type': 'done', 'reason': 'COMPLETE'})
        self.assertFalse((self.private / 'request-safety.json').exists())

    def test_serial_downloads_are_spaced_and_reuse_one_identity_check(self):
        self.execute(['1', '2', '3'])
        self.assertEqual(self.factory_calls, 1)
        self.assertEqual([name for name, _ in self.calls], ['login', 'identity', 'fit:1', 'fit:2', 'fit:3'])
        times = [value for _, value in self.calls]
        self.assertTrue(all(right - left >= 15 for left, right in zip(times, times[1:])))
        self.assertTrue(all(seconds <= 1 for seconds in self.clock.sleeps))
        self.assertTrue(any(item['type'] == 'waiting' for item in self.messages))
        self.assertEqual((self.private / 'fits' / '123' / '1.fit').read_bytes(), FIT)
        state = json.loads((self.private / 'request-safety.json').read_text())
        until = datetime.fromisoformat(state['cooldownUntil']).timestamp()
        self.assertEqual(until, self.clock.now() + 120)

    def test_ack_stop_prevents_next_download(self):
        self.ack.return_value = False
        self.execute(['1', '2'])
        self.assertEqual(len(self.fits()), 1)
        self.assertEqual(self.messages[-1]['reason'], 'CANCELLED')
        self.assertEqual([name for name, _ in self.calls], ['login', 'identity', 'fit:1'])

    def test_cancel_before_start_does_not_login(self):
        (self.private / ('backfill-' + RUN_ID + '.cancel')).touch()
        self.execute(['1'])
        self.assertEqual(self.calls, [])
        self.assertEqual(self.messages[-1]['reason'], 'CANCELLED')

    def test_cancel_during_pause_prevents_next_network_request(self):
        self.clock.on_sleep = lambda: (self.private / ('backfill-' + RUN_ID + '.cancel')).touch()
        self.execute(['1', '2'])
        self.assertEqual([name for name, _ in self.calls], ['login'])
        self.assertEqual(self.messages[-1]['reason'], 'CANCELLED')

    def test_parent_exit_before_first_read_prevents_client_creation(self):
        with patch('backfill.os.getppid', side_effect=[42, 1]):
            self.execute(['1'])
        self.assertEqual(self.factory_calls, 0)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.messages[-1]['reason'], 'CANCELLED')

    def test_parent_exit_during_pause_prevents_following_request(self):
        with patch('backfill.os.getppid', return_value=42) as parent:
            self.clock.on_sleep = lambda: setattr(parent, 'return_value', 1)
            self.execute(['1', '2'])
        self.assertEqual([name for name, _ in self.calls], ['login'])
        self.assertEqual(self.messages[-1]['reason'], 'CANCELLED')
        self.assertEqual(self.clock.sleeps, [1])

    def test_maximum_twenty_downloads_no_following_network(self):
        self.execute([str(value) for value in range(1, MAX_DOWNLOADS + 2)])
        self.assertEqual(len(self.fits()), MAX_DOWNLOADS)
        self.assertEqual(self.messages[-1]['reason'], 'BUDGET')
        self.assertEqual(sum(name.startswith('fit:') for name, _ in self.calls), MAX_DOWNLOADS)

    def test_hundred_cached_reviews_are_permitted(self):
        for value in range(1, MAX_REVIEWS + 1):
            self.cache(str(value))
        self.execute([str(value) for value in range(1, MAX_REVIEWS + 1)])
        self.assertEqual(len(self.fits()), MAX_REVIEWS)
        self.assertEqual(self.factory_calls, 0)

    def test_invalid_ids_or_run_id_never_reach_provider(self):
        for ids in [['../123'], [123], ['0'], ['1'] * 101, {}]:
            with self.subTest(ids=str(ids)[:30]), self.assertRaises(ValueError):
                self.execute(ids)
        with self.assertRaises(ValueError):
            run(self.private, ['1'], '../invalid', client_factory=self.factory)
        self.assertEqual(self.calls, [])

    def test_wrong_account_cannot_download(self):
        self.profile = '999'
        self.execute(['1', '2'])
        self.assertEqual(self.messages[-1]['reason'], 'AUTH')
        self.assertFalse(any(name.startswith('fit:') for name, _ in self.calls))

    def test_download_failure_stops_without_retry_or_next_id(self):
        self.error = RuntimeError('SECRET provider payload')
        self.execute(['1', '2'])
        self.assertEqual(self.messages[-1], {'type': 'done', 'reason': 'ERROR'})
        self.assertEqual(self.fits()[0]['ready'], False)
        self.assertNotIn('SECRET', json.dumps(self.messages))
        self.assertEqual([name for name, _ in self.calls].count('fit:1'), 1)
        self.assertFalse(any(name == 'fit:2' for name, _ in self.calls))

    def test_rate_limit_preserves_retry_after_and_stops(self):
        self.error = RuntimeError('PRIVATE')
        self.error.response = SimpleNamespace(status_code=429, headers={'Retry-After': '7200'})
        self.execute(['1', '2'])
        self.assertEqual(self.messages[-1], {'type': 'done', 'reason': 'RATE_LIMIT', 'retryAfterSeconds': 7200})
        state = json.loads((self.private / 'request-safety.json').read_text())
        self.assertEqual(datetime.fromisoformat(state['blockedUntil']).timestamp(), self.clock.now() + 7200)
        self.assertEqual(len(self.fits()), 1)

    def test_persisted_cooldown_blocks_network_but_cached_files_work(self):
        self.execute(['1'])
        self.messages.clear()
        self.calls.clear()
        self.execute(['1', '2'])
        self.assertEqual(self.calls, [])
        self.assertTrue(self.fits()[0]['cached'])
        self.assertEqual(self.messages[-1]['reason'], 'COOLDOWN')

    def test_rate_limit_blocks_network_after_worker_restart(self):
        blocked = datetime.fromtimestamp(self.clock.now() + 3600, timezone.utc).isoformat()
        (self.private / 'request-safety.json').write_text(json.dumps({'blockedUntil': blocked}))
        self.execute(['1'])
        self.assertEqual(self.calls, [])
        self.assertEqual(self.messages[-1]['reason'], 'RATE_LIMIT')

    def test_corrupt_cache_is_removed_and_does_not_trigger_retry(self):
        self.cache('1', b'not a fit')
        self.execute(['1', '2'])
        self.assertEqual(self.calls, [])
        self.assertEqual(self.messages[-1]['reason'], 'ERROR')
        self.assertFalse((self.private / 'fits' / '123' / '1.fit').exists())

    def test_shared_lock_excludes_second_athlete_worker(self):
        with tempfile.TemporaryDirectory() as shared:
            with operation_lock(shared):
                with self.assertRaisesRegex(Exception, 'BUSY'):
                    self.execute(['1'], lock_directory=shared)
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main()
