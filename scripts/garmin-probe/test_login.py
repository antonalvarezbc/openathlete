import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch
import login

class LoginTests(unittest.TestCase):
    def test_mfa_and_session_only_storage(self):
        with tempfile.TemporaryDirectory() as directory:
            calls = []
            class Garmin:
                def __init__(self, email, password, prompt_mfa, retry_attempts):
                    self.mfa = prompt_mfa
                    self.client = self
                    self.assertions = (email, password, retry_attempts)
                def login(self):
                    calls.append(self.mfa())
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
            def failing(*args, **kwargs):
                raise RuntimeError("SECRET")
            output = io.StringIO()
            with patch.dict(os.environ, {"OA_GARMIN_PRIVATE_DIR":directory}), patch.dict("sys.modules", {"garminconnect":types.SimpleNamespace(Garmin=failing)}), patch("sys.stdin", io.StringIO('{"email":"qa","password":"SECRET"}\n')), contextlib.redirect_stdout(output):
                login.main()
            self.assertEqual(json.loads(output.getvalue()), {"failed": True})
            self.assertFalse((Path(directory)/"connection.json").exists())

if __name__ == '__main__':
    unittest.main()
