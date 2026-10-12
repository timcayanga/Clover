# Boost Bank source review queue

A Malaysian Boost Bank Digital Savings Account source was discovered in the first Scribd batch. The downloaded PDF contains one physical page but prints `1 of 5`. Retain its original, checksum, source URL and missing-page reason privately. It has not been uploaded to staging or accepted as learning, and no complete Boost Bank parser support is claimed.

The visible layout has a savings summary and debit/credit/running-balance activity in RM. Future implementation must require complete page evidence, preserve account-number spacing/leading zeros, distinguish opening-balance rows from movements, and reconcile individual columns against running and final balances. Treat explicit `RM` as Malaysian ringgit evidence; incidental text such as `ALL` in boilerplate is not a currency signal for this statement.

This sample's font text layer corrupts/merges values and identifiers. Generic extraction is not reliable evidence. Do not accept generic guesses, missing closing values, fabricated account digits or placeholder balances as reviewed labels. Obtain the missing source pages or another complete supported download before implementing and verifying this layout. Preserve the review queue entry rather than replacing it with generated content.
