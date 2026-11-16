"""Prepare local EAS credentials without putting passwords in shell history."""
import getpass
import json
import os
from pathlib import Path
import plistlib
import subprocess
from datetime import datetime, timezone


def file_path(prompt):
    path = Path(input(prompt).strip().strip("\"'")).expanduser().resolve()
    if not path.is_file():
        raise ValueError("File does not exist. Use Finder's Copy as Pathname.")
    return path


def main():
    root = Path(__file__).resolve().parents[1]
    certificate = file_path("Full path to clover-distribution.p12: ")
    profile = file_path("Full path to the .mobileprovision file: ")
    decoded = subprocess.run(
        ["security", "cms", "-D", "-i", str(profile)],
        capture_output=True, check=True,
    )
    data = plistlib.loads(decoded.stdout)
    if "6XX38GYURG" not in data.get("TeamIdentifier", []):
        raise ValueError("Profile is not for Clover's Apple team.")
    entitlements = data.get("Entitlements", {})
    if not entitlements.get("application-identifier", "").endswith(".ph.clover.app"):
        raise ValueError("Profile is not for ph.clover.app.")
    if data.get("ProvisionedDevices") or data.get("ProvisionsAllDevices") or entitlements.get("get-task-allow"):
        raise ValueError("Use an App Store Connect distribution profile.")
    expires = data.get("ExpirationDate")
    if not expires or expires.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        raise ValueError("Profile has expired.")
    password = getpass.getpass("Certificate export password (hidden): ")
    if password != getpass.getpass("Confirm password (hidden): "):
        raise ValueError("Passwords did not match.")
    destination = root / "credentials.json"
    if destination.exists():
        raise ValueError("credentials.json already exists; leaving it unchanged.")
    credentials = {"ios": {
        "provisioningProfilePath": str(profile),
        "distributionCertificate": {"path": str(certificate), "password": password},
    }}
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        json.dump(credentials, stream, indent=2)
        stream.write("\n")
    print("Local signing configuration saved privately. Profile identity and expiry verified.")
    print("EAS will validate the certificate/password and profile match during the build.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError, plistlib.InvalidFileException) as error:
        raise SystemExit(f"Signing setup stopped: {error}")
