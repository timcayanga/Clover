# Optional receipt capture location

## User flow

Upload → **Use location for next receipt photo** → foreground permission → detected
country with **Clear** → **Take photo** → existing background import progress.
Choosing files or Photo Library never inherits the current location. Without permission,
scanning continues with printed evidence and the existing default-currency fallback.

Country boundaries are resolved locally with pinned `@rapideditor/country-coder` 5.6.1.
No external reverse-geocoding endpoint, IP-country lookup, EXIF location extraction,
background subscription, or coordinate upload is involved. This avoids VPN-based IP
country mistakes, though browser/device location itself is still an imperfect hint.

The native helper requests balanced foreground location only after the explicit action.
The location lookup is capped at four seconds after the permission decision. Poor accuracy
(over 5 km), Android mocked fixes, stale fixes, and uncertain border locations are declined.
The fix must be captured within ten minutes; the receipt's date must be within 36 hours
of capture. Current location must not classify receipts from an earlier trip.

## Evidence and precedence

1. Existing explicit currency, including a user correction.
2. Unambiguous location printed on the receipt.
3. Opted-in device country bound to this photo and a recent receipt date.
4. User default currency.

Conflicting printed countries cannot be resolved with GPS. Country context stays separate
from OCR/model extraction, never enters prompts, never increases extraction confidence,
and never changes raw source text, amounts, existing confirmed records or user settings.
Normalized `currency_resolution` identifies the suggestion and confidence 0.7. The import
audit stores country, capture/location timestamps and approximate accuracy; coordinates
and arbitrary extra keys are stripped. Native offline storage keeps the context encrypted
with the queued file and forwards it at multipart completion. Recovery reuses that context.

## Verification

- `qa:receipt-camera`: real offline country-boundary lookup for Jakarta, Bali, Manila,
  London, New York, border/ocean/invalid fixes; IDR suggestion, printed USD/SGD precedence,
  conflicting regions, old/undated receipts, raw immutability, idempotent replay, and upload transport.
- `mobile/scripts/receipt-location-check.mjs`: no startup permission request, denied permission
  without GPS access, granted country-only result, mocked Android fix, service failure.
- `native-upload-password-regression.ts`: actual server multipart handoff with original image;
  country context preserved and precise coordinates stripped.
- Native auth/upload navigation checks pass with the new optional helper mocked explicitly.
- Retained private corpus: all 44 primary fixtures and 104-row China Bank deep comparison passed.
- Local browser view hit the existing missing ClerkProvider configuration in this worktree;
  no real location permission was granted and no customer receipt was uploaded for testing.
- Full release gate/deployment status is recorded in `output/receipt-location-2026-10-23/`.

## Release boundary

The web/API change can ship independently. iOS/Android require a future native binary for
`expo-location` and foreground permission text; no binary or OTA is part of this task.
Update/recheck App Store App Privacy and Google Play Data safety declarations for the
optional country context linked to an import before publishing that future binary.
The public Privacy Policy now explains the actual collection, purpose and choices.

The required security gate also identified newly published Next.js advisories. Next.js was
patched within the existing major to 15.5.28; the web production audit then reported zero
high/critical advisories. No security gate or advisory suppression was weakened.
