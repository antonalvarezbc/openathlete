import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock, patch
from datetime import datetime, timezone
import time
from request_safety import OperationStopped, operation_lock
import login

class LoginTests(unittest.TestCase):
    def test_mfa_and_session_only_storage(self):
        with tempfile.TemporaryDirectory() as directory:
            calls = []
            test = self
            class Garmin:
                def __init__(self, email, password, prompt_mfa, retry_attempts):
                    self.mfa = prompt_mfa
                    self.client = self
                    self.assertions = (email, password, retry_attempts)
                def login(self):
                    with test.assertRaises(OperationStopped):
                        with operation_lock(directory):
                            pass
                    calls.append(self.mfa())
                    with test.assertRaises(OperationStopped):
                        with operation_lock(directory):
                            pass
                def get_rhr_day(self, day):
                    return {"userProfileId": 123}
                def dump(self, path):
                    Path(path).mkdir()
                    (Path(path) / "garmin_tokens.json").write_text('{"session":"fake"}')
            stream = io.StringIO(json.dumps({"email":"qa@example.test","password":"SECRET","athleteId":2,"timezone":"Europe/Madrid"})+'\n'+json.dumps({"code":"123456"})+'\n')
            output = io.StringIO()
            with patch.dict(os.environ, {"OA_GARMIN_PRIVATE_DIR": directory}), patch.dict("sys.modules", {"garminconnect": types.SimpleNamespace(Garmin=Garmin)}), patch("sys.stdin", stream), contextlib.redirect_stdout(output):
                login.main()
            self.assertEqual(calls, ["123456"])
            self.assertIn('"mfaRequired": true', output.getvalue())
            self.assertIn('"connected": true', output.getvalue())
            self.assertNotIn("SECRET", output.getvalue())
            saved = (Path(directory)/"connection.json").read_text()
            self.assertNotIn("SECRET", saved)
            self.assertEqual(json.loads(saved)["athleteId"], 2)

    def test_failure_does_not_expose_credentials_or_create_connection(self):
        with tempfile.TemporaryDirectory() as directory:
            class failing:
                def __init__(self, *args, **kwargs):
                    raise RuntimeError("SECRET")
            output = io.StringIO()
            with patch.dict(os.environ, {"OA_GARMIN_PRIVATE_DIR":directory}), patch.dict("sys.modules", {"garminconnect":types.SimpleNamespace(Garmin=failing)}), patch("sys.stdin", io.StringIO('{"email":"qa","password":"SECRET"}\n')), contextlib.redirect_stdout(output):
                login.main()
            self.assertEqual(json.loads(output.getvalue()), {"failed": True})
            self.assertFalse((Path(directory)/"connection.json").exists())

    def invoke(self, private, shared, factory):
        output = io.StringIO()
        stream = io.StringIO(json.dumps({"email": "qa@example.test", "password": "SECRET",
                                        "athleteId": 2, "timezone": "Europe/Madrid"}) + '\n')
        with patch.dict(os.environ, {"OA_GARMIN_PRIVATE_DIR": private,
                                     "OA_GARMIN_LOCK_DIRECTORY": shared}), \
                patch.dict("sys.modules", {"garminconnect": types.SimpleNamespace(Garmin=factory)}), \
                patch("sys.stdin", stream), contextlib.redirect_stdout(output):
            login.main()
        self.assertNotIn('SECRET', output.getvalue())
        return json.loads(output.getvalue())

    def test_global_lock_prevents_login_for_another_athlete(self):
        with tempfile.TemporaryDirectory() as shared, tempfile.TemporaryDirectory() as private:
            factory = Mock()
            with operation_lock(shared):
                result = self.invoke(private, shared, factory)
            self.assertEqual(result, {'failed': True, 'code': 'BUSY'})
            factory.assert_not_called()
            self.assertFalse((Path(private) / 'connection.json').exists())

    def test_shared_cooldown_and_rate_limit_prevent_credential_login(self):
        for key, code, seconds in [('cooldownUntil', 'COOLDOWN', 120),
                                   ('blockedUntil', 'RATE_LIMIT', 3600)]:
            with self.subTest(code=code), tempfile.TemporaryDirectory() as shared, tempfile.TemporaryDirectory() as private:
                until = datetime.fromtimestamp(time.time() + seconds, timezone.utc).isoformat()
                state = Path(shared) / 'request-safety.json'
                state.write_text(json.dumps({key: until}))
                factory = Mock()
                result = self.invoke(private, shared, factory)
                factory.assert_not_called()
                self.assertEqual(result['code'], code)
                self.assertGreater(result['retryAfterSeconds'], seconds - 5)
                self.assertLessEqual(result['retryAfterSeconds'], seconds)

    def test_login_rate_limit_is_shared_and_sanitized(self):
        with tempfile.TemporaryDirectory() as shared, tempfile.TemporaryDirectory() as private:
            error = RuntimeError('SECRET')
            error.status_code = 429
            client = Mock()
            client.login.side_effect = error
            factory = Mock(return_value=client)
            result = self.invoke(private, shared, factory)
            self.assertEqual(result, {'failed': True, 'code': 'RATE_LIMIT', 'retryAfterSeconds': 3600})
            client.get_rhr_day.assert_not_called()
            state = json.loads((Path(shared) / 'request-safety.json').read_text())
            self.assertGreater(datetime.fromisoformat(state['blockedUntil']).timestamp(), time.time() + 3590)
            self.assertGreater(datetime.fromisoformat(state['cooldownUntil']).timestamp(), time.time() + 110)
            self.assertFalse((Path(private) / 'connection.json').exists())

    def test_login_auth_failure_has_no_provider_message(self):
        with tempfile.TemporaryDirectory() as shared, tempfile.TemporaryDirectory() as private:
            error = RuntimeError('SECRET')
            error.status_code = 403
            client = Mock()
            client.login.side_effect = error
            self.assertEqual(self.invoke(private, shared, Mock(return_value=client)),
                             {'failed': True, 'code': 'AUTH'})

if __name__ == '__main__':
    unittest.main()
