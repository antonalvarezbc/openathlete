"""Authenticate only after an explicit athlete request. Credentials use stdin, never argv."""
import json
import logging
import os
from pathlib import Path
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

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
    except Exception:
        # Never forward exception messages, credentials, headers or provider payloads.
        print(json.dumps({"failed": True}), flush=True)

if __name__ == "__main__":
    main()
