-- Supports exact native-currency lookups on both suggested and automatic source matches.
CREATE INDEX CONCURRENTLY "Transaction_source_match_candidates_idx"
  ON "Transaction" ("workspaceId", "currency", "amount", "date");
