import contextlib
import io
import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from request_safety import (OperationStopped, RequestSafety, classify_error,
                            manual_client, operation_lock)
from test_backfill import Clock


class SafetyTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.clock = Clock()
        self.safety = RequestSafety(self.directory.name, interval=15,
                                    now=self.clock.now, sleep=self.clock.sleep)

    def test_nested_rate_limit_takes_priority_over_auth_wrapper(self):
        underlying = RuntimeError('PRIVATE')
        underlying.response = SimpleNamespace(status_code=429, headers={'Retry-After': '30'})
        Authentication = type('GarminConnectAuthenticationError', (Exception,), {})
        wrapped = Authentication('PRIVATE outer')
        wrapped.__cause__ = underlying
        self.assertEqual(classify_error(wrapped, self.clock.now()), ('RATE_LIMIT', 3600))

    def test_retry_after_supports_http_dates(self):
        from email.utils import format_datetime
        until = datetime.fromtimestamp(self.clock.now() + 7200, timezone.utc)
        error = RuntimeError('PRIVATE')
        error.response = SimpleNamespace(status_code=429, headers={'Retry-After': format_datetime(until)})
        self.assertEqual(classify_error(error, self.clock.now()), ('RATE_LIMIT', 7200))

    def test_wrapped_401_and_403_are_auth_failures(self):
        for status in (401, 403):
            underlying = RuntimeError('PRIVATE')
            underlying.response = SimpleNamespace(status_code=status, headers={})
            error = RuntimeError('WRAPPED')
            error.__cause__ = underlying
            self.assertEqual(classify_error(error), ('AUTH', None))

    def test_status_code_on_exception_is_classified_without_response(self):
        for status, reason in [(401, 'AUTH'), (403, 'AUTH'), (429, 'RATE_LIMIT')]:
            with self.subTest(status=status):
                error = RuntimeError('PRIVATE')
                error.status_code = status
                self.assertEqual(classify_error(error)[0], reason)

    def test_cycle_in_exception_chain_is_bounded(self):
        error = RuntimeError('PRIVATE')
        error.__cause__ = error
        self.assertEqual(classify_error(error), ('ERROR', None))

    def test_latched_error_blocks_further_requests_in_same_process(self):
        self.safety.before_request()
        self.safety.fail(RuntimeError('PRIVATE'))
        with self.assertRaises(RuntimeError):
            self.safety.before_request()
        self.assertEqual(self.clock.sleeps, [])

    def test_cooldown_counts_from_response_end(self):
        self.safety.before_request()
        self.clock.value += 30
        self.safety.after_request()
        state = json.loads((Path(self.directory.name) / 'request-safety.json').read_text())
        self.assertEqual(datetime.fromisoformat(state['cooldownUntil']).timestamp(), self.clock.now() + 120)
        replacement = RequestSafety(self.directory.name, now=self.clock.now)
        with self.assertRaises(OperationStopped) as captured:
            replacement.before_request()
        self.assertEqual(captured.exception.reason, 'COOLDOWN')
        self.assertEqual(captured.exception.retry_after, 120)

    def test_expired_cooldown_allows_request(self):
        self.safety.before_request()
        self.clock.value += 121
        replacement = RequestSafety(self.directory.name, now=self.clock.now)
        replacement.before_request()

    def test_guard_lock_remains_available_after_exception(self):
        with self.assertRaises(RuntimeError):
            with operation_lock(self.directory.name):
                raise RuntimeError('PRIVATE')
        with operation_lock(self.directory.name):
            pass

    def test_malformed_state_never_starts_network(self):
        (Path(self.directory.name) / 'request-safety.json').write_text('broken')
        with self.assertRaises(ValueError):
            RequestSafety(self.directory.name)


class NativeTransportTests(unittest.TestCase):
    """Exercise the pinned native client with synthetic HTTP adapter responses."""
    def setUp(self):
        from requests import Response
        self.Response = Response
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.clock = Clock()
        self.safety = RequestSafety(self.directory.name, interval=15,
                                    now=self.clock.now, sleep=self.clock.sleep)
        self.client = manual_client(self.safety)

    def response(self, status, body=b'{}', headers=None):
        response = self.Response()
        response.status_code = status
        response._content = body
        response.headers.update(headers or {})
        response.url = 'https://example.invalid/synthetic'
        return response

    def test_no_auth_refresh_or_retry_after_401(self):
        self.client.client.di_token = 'synthetic-token'
        with patch.object(self.client.client, '_token_expires_soon', return_value=False), \
                patch.object(self.client.client, '_refresh_session') as refresh, \
                patch('requests.adapters.HTTPAdapter.send', return_value=self.response(401)) as transport:
            with self.assertRaises(Exception) as captured:
                self.client.connectapi('/synthetic')
            self.assertEqual(classify_error(captured.exception)[0], 'AUTH')
            with self.assertRaises(Exception):
                self.client.connectapi('/another')
        self.assertEqual(transport.call_count, 1)
        refresh.assert_not_called()

    def test_swallowed_refresh_rate_limit_cannot_make_another_http_request(self):
        self.client.client.di_token = 'synthetic-token'
        self.client.client.di_refresh_token = 'synthetic-refresh'
        self.client.client.di_client_id = 'synthetic-id'
        with patch.object(self.client.client, '_token_expires_soon', return_value=True), \
                patch('requests.adapters.HTTPAdapter.send', return_value=self.response(429, headers={'Retry-After': '7200'})) as transport:
            with self.assertRaises(Exception) as captured:
                self.client.connectapi('/synthetic')
        self.assertEqual(classify_error(captured.exception, self.clock.now()), ('RATE_LIMIT', 7200))
        self.assertEqual(transport.call_count, 1)
        state = json.loads((Path(self.directory.name) / 'request-safety.json').read_text())
        self.assertEqual(datetime.fromisoformat(state['blockedUntil']).timestamp(), self.clock.now() + 7200)

    def test_refresh_client_error_cannot_be_swallowed_into_another_request(self):
        self.client.client.di_token = 'synthetic-token'
        self.client.client.di_refresh_token = 'synthetic-refresh'
        self.client.client.di_client_id = 'synthetic-id'
        with patch.object(self.client.client, '_token_expires_soon', return_value=True), \
                patch('requests.adapters.HTTPAdapter.send', return_value=self.response(400)) as transport:
            with self.assertRaises(Exception):
                self.client.connectapi('/synthetic')
        self.assertEqual(transport.call_count, 1)

    def test_optional_unavailable_metrics_do_not_poison_following_reads(self):
        from health_metrics import optional_read
        self.client.client.di_token = 'synthetic-token'
        result = {'warnings': []}
        with patch.object(self.client.client, '_token_expires_soon', return_value=False), \
                patch('requests.adapters.HTTPAdapter.send', side_effect=[self.response(404), self.response(200)]):
            self.assertIsNone(optional_read(result, 'body', self.client.connectapi, '/unavailable'))
            self.assertEqual(self.client.connectapi('/synthetic'), {})
        self.assertEqual(result['warnings'], ['Unavailable:body'])

    def test_profile_failure_is_not_retried_or_followed_by_settings(self):
        error = RuntimeError('PRIVATE')
        with patch.object(self.client.client, 'load') as load, \
                patch.object(self.client, 'connectapi', side_effect=error) as connect:
            with self.assertRaises(RuntimeError):
                self.client.login('/synthetic/tokens')
        load.assert_called_once_with('/synthetic/tokens')
        connect.assert_called_once_with('/userprofile-service/socialProfile')
        self.assertEqual(self.client.retry_attempts, 0)
        for session in (self.client.client.cs, self.client.client._api_session):
            self.assertEqual(session.get_adapter('https://example.invalid').max_retries.total, 0)

    def test_all_http_calls_are_spaced_including_profile_and_download(self):
        self.client.client.di_token = 'synthetic-token'
        moments = []
        def respond(*args, **kwargs):
            moments.append(self.clock.now())
            return self.response(200)
        with patch.object(self.client.client, '_token_expires_soon', return_value=False), \
                patch('requests.adapters.HTTPAdapter.send', side_effect=respond):
            self.client.connectapi('/synthetic')
            self.client.download('/synthetic-fit')
        self.assertEqual(moments[1] - moments[0], 15)


class SyncWorkerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        Path(self.directory.name, 'connection.json').write_text(json.dumps({
            'garminUserProfileId': '123', 'timezone': 'Europe/Madrid',
        }))

    def test_summary_sync_never_downloads_fits(self):
        import sync
        output = io.StringIO()
        client = Mock()
        with patch.dict(os.environ, {'OA_GARMIN_PRIVATE_DIR': self.directory.name,
                                    'OA_GARMIN_LOCK_DIRECTORY': self.directory.name}), \
                patch.object(sync, 'manual_client', return_value=client), \
                patch.object(sync, 'collect_sync', return_value={'activities': [], 'metrics': [], 'warnings': []}), \
                contextlib.redirect_stdout(output):
            sync.main()
        self.assertEqual(json.loads(output.getvalue()), {'ok': True, 'activities': [], 'metrics': [], 'warnings': []})
        client.download_activity.assert_not_called()
        self.assertEqual(client.mock_calls, [unittest.mock.call.login(str(Path(self.directory.name) / 'tokens'))])

    def test_sync_maps_provider_errors_without_raw_details(self):
        import sync
        error = RuntimeError('PRIVATE')
        error.response = SimpleNamespace(status_code=429, headers={'Retry-After': '7200'})
        output = io.StringIO()
        with patch.dict(os.environ, {'OA_GARMIN_PRIVATE_DIR': self.directory.name,
                                    'OA_GARMIN_LOCK_DIRECTORY': self.directory.name}), \
                patch.object(sync, 'manual_client', side_effect=error), \
                contextlib.redirect_stdout(output):
            sync.main()
        self.assertEqual(json.loads(output.getvalue()), {'ok': False, 'code': 'RateLimited', 'retryAfterSeconds': 7200})
        self.assertNotIn('PRIVATE', output.getvalue())

    def test_sync_stops_if_backfill_holds_global_lock(self):
        import sync
        output = io.StringIO()
        with operation_lock(self.directory.name), \
                patch.dict(os.environ, {'OA_GARMIN_PRIVATE_DIR': self.directory.name,
                                        'OA_GARMIN_LOCK_DIRECTORY': self.directory.name}), \
                patch.object(sync, 'manual_client') as factory, \
                contextlib.redirect_stdout(output):
            sync.main()
        self.assertEqual(json.loads(output.getvalue()), {'ok': False, 'code': 'Busy'})
        factory.assert_not_called()


if __name__ == '__main__':
    unittest.main()
