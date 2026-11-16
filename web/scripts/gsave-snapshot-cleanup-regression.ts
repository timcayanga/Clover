import { strict as assert } from "node:assert";
import { parseImportText } from "@/lib/import-parser";
import { shouldRunDestructiveMultiAccountCleanup } from "@/workers/import-processor";

const gsaveOverviewOcrText = `10:18 \\ all T
& GSave ©)
REGULAR SAVINGS BALANCE AS OF 10:18 AM {®
£300,000.00
Hub My Savings FAQ
My Accounts
GSave
>| Account No.: ¥*¥*¥******¥%6972 >
CiMB PHP 0.00
#UNOready
(Ue) Account No; ¥*¥*¥****%*¥%4132 >
BA PHP 300,000.00
Auto Deposit Need Help?
€c
B A N K
| —————
Schedule recurring transfers to your GSave
accounts to fast track your savings.
Setup Auto Deposit`;

const gsaveSnapshotRows = parseImportText(gsaveOverviewOcrText, "IMG_1407.PNG", "image/png", {
  institution: "GSave",
});

assert.equal(gsaveSnapshotRows.length, 2, "Expected the GSave overview OCR to resolve two snapshot markers.");
assert.equal(
  shouldRunDestructiveMultiAccountCleanup({
    multiAccountImport: true,
    visibleTransactionsCount: 0,
    parsedRows: gsaveSnapshotRows,
  }),
  false,
  "Snapshot-only GSave multi-account imports must not delete previously imported sibling accounts."
);

assert.equal(
  shouldRunDestructiveMultiAccountCleanup({
    multiAccountImport: true,
    visibleTransactionsCount: 3,
    parsedRows: gsaveSnapshotRows,
  }),
  true,
  "Transaction-bearing multi-account imports should still clean up stale rows and placeholders."
);

assert.equal(
  shouldRunDestructiveMultiAccountCleanup({
    multiAccountImport: false,
    visibleTransactionsCount: 0,
    parsedRows: gsaveSnapshotRows,
  }),
  false,
  "Single-account imports should never trigger multi-account cleanup."
);

console.log("[PASS] Snapshot-only GSave multi-account imports skip destructive cleanup.");
