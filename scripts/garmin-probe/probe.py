"""Bounded, read-only Garmin diagnostic. No OpenAthlete/database access."""
import argparse
from datetime import date, datetime, timedelta, timezone
from getpass import getpass
import json
import logging
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent


def dates_ending(end):
    return [(end - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]


def error_record(exc):
    # Never persist exception messages: they can contain credentials/URLs/payloads.
    status = getattr(getattr(exc, "response", None), "status_code", None)
    return {"status": "error", "error_type": type(exc).__name__,
            "http_status": status if isinstance(status, int) else None}


def collect(client, end):
    checks = {}
    calls = [("activities", lambda: client.get_activities(0, 3))]
    for day in dates_ending(end):
        for kind, method in (("sleep", client.get_sleep_data),
                             ("hrv", client.get_hrv_data),
                             ("rhr", client.get_rhr_day)):
            calls.append((f"{day}/{kind}", lambda m=method, d=day: m(d)))
    for label, call in calls:
        try:
            value = call()
            checks[label] = {"status": "empty" if value is None or value == {} or value == [] else "received",
                             "data": value}
        except Exception as exc:
            checks[label] = error_record(exc)
            # Stop on authentication/rate limits rather than issuing 21 more calls.
            if type(exc).__name__ in ("GarminConnectTooManyRequestsError", "GarminConnectAuthenticationError") or checks[label]["http_status"] in (401, 403, 429):
                break
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--end-date", type=date.fromisoformat,
                        default=date.today() - timedelta(days=1),
                        help="Last health day YYYY-MM-DD (default: yesterday, local time)")
    parser.add_argument("--login", action="store_true", help="Enter credentials instead of resuming saved tokens")
    args = parser.parse_args()
    if not sys.stdin.isatty():
        parser.error("Run from an interactive terminal; do not pipe credentials.")
    from garminconnect import Garmin
    logging.disable(logging.CRITICAL)
    os.umask(0o077)
    private = ROOT / ".private"
    private.mkdir(mode=0o700, exist_ok=True)
    private.chmod(0o700)
    tokens = private / "tokens"
    report = {"library": "garminconnect==0.3.15", "mode": "read-only",
              "end_date": args.end_date.isoformat(), "checks": {}}
    try:
        if args.login or not (tokens / "garmin_tokens.json").exists():
            print("Cuenta Garmin de Athleta (con su autorización). No se escribe en Garmin ni OpenAthlete.")
            client = Garmin(input("Email Garmin: ").strip(), getpass("Contraseña Garmin: "),
                            prompt_mfa=lambda: getpass("Código MFA: "), retry_attempts=0)
        else:
            client = Garmin(retry_attempts=0)
        client.login(str(tokens))
        report["authentication"] = {"status": "ok"}
        report["checks"] = collect(client, args.end_date)
    except Exception as exc:
        report["authentication"] = error_record(exc)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    target = private / f"report-{stamp}.json"
    with target.open("x", encoding="utf-8") as output:
        json.dump(report, output, indent=2, ensure_ascii=False)
    print("Autenticación:", report["authentication"]["status"])
    for label, result in report["checks"].items():
        print(label, result["status"], result.get("error_type", ""))
    print(f"Informe privado: {target}")
    print("'received' solo confirma respuesta; compara los valores con Garmin Connect.")
    failed = report["authentication"]["status"] != "ok" or any(
        r["status"] == "error" for r in report["checks"].values())
    if failed:
        print("Si la sesión guardada ha caducado, vuelve a ejecutar con --login.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
