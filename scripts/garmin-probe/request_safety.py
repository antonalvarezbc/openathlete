"""Shared, local-only safeguards for manual Garmin operations.

These are deliberately conservative application limits, not published Garmin quotas.
No operation starts automatically and a provider error never triggers a retry here.
"""
import fcntl
import json
import math
import os
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

COOLDOWN_SECONDS = 120
RATE_LIMIT_SECONDS = 3600


class OperationStopped(Exception):
    def __init__(self, reason, retry_after=None):
        super().__init__(reason)
        self.reason = reason
        self.retry_after = retry_after


def iso_time(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def exception_chain(error):
    seen = set()
    while error is not None and id(error) not in seen:
        seen.add(id(error))
        yield error
        error = error.__cause__ or error.__context__


def classify_error(error, now=None):
    """Look through wrapper exceptions without ever returning provider messages."""
    now = time.time() if now is None else now
    chain = list(exception_chain(error))
    for item in chain:
        if isinstance(item, OperationStopped):
            return item.reason, item.retry_after
    # A wrapped 429 takes precedence over an outer authentication exception.
    retry_after = None
    is_limited = False
    is_auth = False
    for item in chain:
        response = getattr(item, 'response', None)
        status = getattr(response, 'status_code', None)
        if status is None:
            status = getattr(item, 'status_code', None)
        name = type(item).__name__
        if status == 429 or name == 'GarminConnectTooManyRequestsError':
            is_limited = True
            raw = getattr(response, 'headers', {}).get('Retry-After') if response is not None else None
            if isinstance(raw, str):
                try:
                    seconds = float(raw)
                    if math.isfinite(seconds):
                        retry_after = max(retry_after or 0, math.ceil(seconds))
                except ValueError:
                    try:
                        until = parsedate_to_datetime(raw)
                        if until.tzinfo is None:
                            until = until.replace(tzinfo=timezone.utc)
                        retry_after = max(retry_after or 0, math.ceil(until.timestamp() - now))
                    except (ValueError, TypeError, OverflowError):
                        pass
        if status in (401, 403) or name == 'GarminConnectAuthenticationError':
            is_auth = True
        if isinstance(item, ValueError) and str(item) == 'AccountMismatch':
            is_auth = True
    if is_limited:
        return 'RATE_LIMIT', max(RATE_LIMIT_SECONDS, retry_after or 0)
    return ('AUTH', None) if is_auth else ('ERROR', None)


@contextmanager
def operation_lock(directory):
    directory = Path(directory)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    with open(directory / 'garmin-operation.lock', 'a') as handle:
        os.chmod(handle.name, 0o600)
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise OperationStopped('BUSY') from exc
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


class RequestSafety:
    def __init__(self, directory, interval=1, cancelled=lambda: False,
                 emit=lambda message: None, now=time.time, sleep=time.sleep):
        self.directory = Path(directory)
        self.path = self.directory / 'request-safety.json'
        self.interval = interval
        self.cancelled = cancelled
        self.emit = emit
        self.now = now
        self.sleep = sleep
        self.started = False
        self.last_request = None
        self.stopped = None
        try:
            self.state = json.loads(self.path.read_text())
        except FileNotFoundError:
            self.state = {}
        if not isinstance(self.state, dict):
            raise ValueError('InvalidSafetyState')

    def check_cancelled(self):
        if self.cancelled():
            raise OperationStopped('CANCELLED')

    def _save(self):
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        temporary = self.path.with_suffix('.tmp')
        temporary.write_text(json.dumps(self.state))
        os.chmod(temporary, 0o600)
        temporary.replace(self.path)

    def _remaining(self, key):
        value = self.state.get(key)
        if value is None:
            return 0
        until = datetime.fromisoformat(value)
        if until.tzinfo is None:
            raise ValueError('InvalidSafetyState')
        return max(0, math.ceil(until.timestamp() - self.now()))

    def check_network_allowed(self):
        self.check_cancelled()
        if self.stopped is not None:
            raise self.stopped
        if not self.started:
            blocked = self._remaining('blockedUntil')
            if blocked:
                raise OperationStopped('RATE_LIMIT', blocked)
            cooldown = self._remaining('cooldownUntil')
            if cooldown:
                raise OperationStopped('COOLDOWN', cooldown)

    def before_request(self):
        self.check_network_allowed()
        self.started = True
        if self.last_request is not None:
            next_request = self.last_request + self.interval
            if self.now() < next_request:
                self.emit({'type': 'waiting', 'nextRequestAt': iso_time(next_request)})
            while self.now() < next_request:
                self.check_cancelled()
                self.sleep(min(1, next_request - self.now()))
        self.check_cancelled()
        self.last_request = self.now()
        self.state['lastRequestAt'] = iso_time(self.last_request)
        self.state['cooldownUntil'] = iso_time(self.last_request + COOLDOWN_SECONDS)
        self._save()

    def after_request(self):
        # Give Garmin a full pause after the response, including slow downloads.
        self.last_request = self.now()
        self.state['lastRequestAt'] = iso_time(self.last_request)
        self.state['cooldownUntil'] = iso_time(self.last_request + COOLDOWN_SECONDS)
        self._save()

    def fail(self, error):
        # Persist throttling before a wrapper can catch/reclassify the exception.
        reason, retry_after = classify_error(error, self.now())
        if reason == 'RATE_LIMIT':
            previous = self._remaining('blockedUntil')
            self.state['blockedUntil'] = iso_time(self.now() + max(previous, retry_after or RATE_LIMIT_SECONDS))
            self._save()
        self.stopped = error
        return reason, retry_after


def protect_client(client, safety):
    """Guard every request of this locally owned client; never patch dependencies."""
    from requests.adapters import HTTPAdapter

    class ConservativeAdapter(HTTPAdapter):
        def __init__(self, allow_missing=False):
            super().__init__(max_retries=0)
            self.allow_missing = allow_missing

        def send(self, request, **kwargs):
            safety.before_request()
            try:
                response = super().send(request, **kwargs)
                # Optional wellness endpoints may legitimately be unavailable;
                # their 404/501 handling belongs to optional_read. Authentication
                # refresh uses the other session and stops on every HTTP error.
                missing = self.allow_missing and response.status_code in (404, 501)
                if response.status_code >= 400 and not missing:
                    response.raise_for_status()
                return response
            except Exception as exc:
                safety.fail(exc)
                raise
            finally:
                safety.after_request()

    for session in (client.client.cs, client.client._api_session):
        for protocol in ('https://', 'http://'):
            session.mount(protocol, ConservativeAdapter(
                allow_missing=session is client.client._api_session))
    return client


class SingleProfileRead:
    """Profile needed for endpoint paths, fetched once; settings are unused here."""
    def _load_social_profile(self):
        profile = self.connectapi('/userprofile-service/socialProfile')
        name = profile.get('displayName') if isinstance(profile, dict) else None
        if not isinstance(name, str) or not name.strip():
            raise ValueError('InvalidProfile')
        self.display_name = name
        self.full_name = profile.get('fullName', '')

    def _load_profile_and_settings(self):
        self._load_social_profile()


def manual_client(safety):
    """Resume cached tokens with garminconnect 0.3.15, no credential fallback."""
    from garminconnect import Garmin

    class ManualGarmin(SingleProfileRead, Garmin):
        def login(self, tokenstore):
            self.client.load(tokenstore)
            self._load_social_profile()

    return protect_client(ManualGarmin(retry_attempts=0), safety)
