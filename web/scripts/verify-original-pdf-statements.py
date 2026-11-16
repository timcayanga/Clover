"""Verify local PDF source bytes and page labels without importing financial data."""

import csv
import hashlib
import json
import os
from pathlib import Path

import pymupdf

HERE = Path(__file__).parent
ROOT = Path(os.environ.get("CLOVER_STATEMENT_SAMPLES_ROOT", Path.home() / "Documents/Bank Statements"))
MANIFEST = HERE / "fixtures/original-pdf-statements/manifest.json"
REQUIRED_TAGS = {"text_layer", "scanned", "hybrid", "password_protected", "multi_account"}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


with (ROOT / "Organized Samples/FILE INDEX.csv").open(newline="", encoding="utf-8-sig") as index:
    indexed = {
        (Path(row["destination"]).resolve(), row["sha256"])
        for row in csv.DictReader(index)
    }

tags = set()
identities = set()
digests = set()
for case in json.loads(MANIFEST.read_text())["cases"]:
    case_id = case["id"]
    sha256 = case["sha256"]
    assert case_id not in identities and sha256 not in digests, f"{case_id}: duplicate case or source"
    identities.add(case_id)
    digests.add(sha256)
    tags.update(case["tags"])
    if "source" in case:
        path = ROOT / case["source"]
        assert digest(path) == sha256, f"{case_id}: source bytes changed"
        assert (path.resolve(), sha256) in indexed, f"{case_id}: source missing from organized index"
    else:
        candidates = [path for path in (ROOT / case["sourceDirectory"]).iterdir()
                      if path.is_file() and path.suffix.lower() == ".pdf" and digest(path) == sha256]
        assert len(candidates) == 1, f"{case_id}: expected one matching original"
        path = candidates[0]

    with pymupdf.open(path) as document:
        assert document.is_pdf and len(document) == case["pages"], f"{case_id}: incorrect page count"
        assert bool(document.needs_pass) == case["passwordRequired"], f"{case_id}: wrong password gate"
        if document.needs_pass:
            assert not document.authenticate("clover-qa-intentionally-wrong"), f"{case_id}: wrong password accepted"
            assert case["expected"]["rowsBeforeUnlock"] == 0
        else:
            text_pages = [page.number + 1 for page in document if page.get_text().strip()]
            assert text_pages == case["textPages"], f"{case_id}: text profile changed"
            for page_number in case.get("rasterPages", []):
                page = document[page_number - 1]
                assert any(
                    (bounds := pymupdf.Rect(image["bbox"])).width * bounds.height
                    >= 0.85 * page.rect.width * page.rect.height
                    for image in page.get_image_info()
                ), f"{case_id}: page {page_number} is missing its page-sized raster"
            counts = case["expected"]["visibleTransactionRowsByPage"]
            assert len(counts) == len(document) and all(isinstance(count, int) and count >= 0 for count in counts)
            accounts = case["expected"].get("accounts")
            if accounts:
                assert len(accounts) == case["expected"]["accountCount"]
                assert sum(account["movementCount"] for account in accounts) == sum(counts)
    print(f"PASS {case_id}")

assert REQUIRED_TAGS <= tags, f"Missing coverage: {REQUIRED_TAGS - tags}"
print(f"Verified {len(identities)} original PDF fixtures across all five requested classes.")
