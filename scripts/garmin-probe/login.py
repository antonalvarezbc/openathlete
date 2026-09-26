"""Authenticate only after an explicit athlete request. Credentials use stdin, never argv."""
import json
import logging
import os
from pathlib import Path
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from request_safety import RequestSafety, classify_error, operation_lock

def read_message():
    line = sys.stdin.readline(8192)
    if not line or len(line) >= 8192:
        raise ValueError("InvalidInput")
    return json.loads(line)

def main():
    logging.disable(logging.CRITICAL)
    os.umask(0o077)
    try:
        from garminconnect import Garmin
        private = Path(os.environ["OA_GARMIN_PRIVATE_DIR"])
        data = read_message()
        def mfa():
            print(json.dumps({"mfaRequired": True}), flush=True)
            return read_message()["code"]
        lock_directory = Path(os.environ.get("OA_GARMIN_LOCK_DIRECTORY", str(private)))
        with operation_lock(lock_directory):
            safety = RequestSafety(lock_directory)
            try:
                # Credential login keeps the SDK's existing strategy/MFA flow.
                # Guard the entire operation; SDK-created transports are not paced
                # per request like the cached-session sync/backfill clients.
                safety.before_request()
                client = Garmin(data["email"], data["password"], prompt_mfa=mfa, retry_attempts=0)
                client.login()
                day = datetime.now(ZoneInfo(data["timezone"])).date().isoformat()
                profile = (client.get_rhr_day(day) or {}).get("userProfileId")
                if not profile:
                    raise ValueError("MissingIdentity")
                private.mkdir(parents=True, exist_ok=True, mode=0o700)
                client.client.dump(str(private / "tokens"))
                connection = {"athleteId": data["athleteId"], "garminUserProfileId": str(profile), "timezone": data["timezone"]}
                temp = private / "connection.json.tmp"
                temp.write_text(json.dumps(connection))
                temp.replace(private / "connection.json")
                print(json.dumps({"connected": True}), flush=True)
            except Exception as exc:
                safety.fail(exc)
                raise
            finally:
                if safety.started:
                    safety.after_request()
    except Exception as exc:
        # Never forward exception messages, credentials, headers or provider payloads.
        reason, retry_after = classify_error(exc)
        message = {"failed": True}
        if reason in ('BUSY', 'COOLDOWN', 'RATE_LIMIT', 'AUTH'):
            message['code'] = reason
        if retry_after is not None:
            message['retryAfterSeconds'] = retry_after
        print(json.dumps(message), flush=True)

if __name__ == "__main__":
    main()
