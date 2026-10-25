# Native Word receipts

Read `grab-parser-rules.md`. DOCX support is currently bounded to one complete
native Grab receipt; accepting the container is not permission to guess a ledger
from arbitrary Word prose. `.doc`, `.docm`, embedded objects, tracked revisions,
DTD/entities and unsupported receipt layouts require review. No macros, external
links, scripts or remote images are executed or fetched.

Preserve uploaded source bytes, the SHA-256 of each read XML part, complete native
text, separate parsed rows and normalized transactions. Do not derive page counts
from Word layout. Read one supported AlternateContent representation, never both
compatibility copies. Require exact pickup date, booking, payment evidence,
currency and independently reconciling headline/summary/fare components. A source
export with clipped amounts must not be repaired by guessed digits.

Maximum uploaded and expanded XML is 4 MiB; at most 512 archive entries and bounded
XML traversal. Unsupported documents fail with a typed source-review reason
before generic or AI fallbacks. Existing PDF and spreadsheet readers and cache
namespaces are preserved.

Browser and native selection allow `.docx` consistently. Native upload-format coverage must validate every public import extension before release; the bounded server reader still enforces source integrity and supported receipt scope.
