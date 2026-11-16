# Import polling egress reduction

The import progress endpoint now uses the existing compatibility-aware status projection (12 columns instead of 25). Its response fields and Profile access checks are unchanged. No stored data is modified by this read optimization.

Transactions enrichment keeps its immediate first run and 30-second interval. A pending run prevents overlapping enrichment/display work. Background tabs still submit enrichment work but skip metadata and transaction display reloads. Visibility restoration triggers a refresh immediately; unmount removes the listener and interval and prevents subsequent display reads.

The deployed baseline already used light transaction summaries during enrichment. This change retains that behavior. Shared summary caching and broader removal of raw payload reads are deferred until their invalidation and classification dependencies are measured; no egress percentage or latency improvement is claimed without production usage measurements.

The new import-egress regression executes the actual progress route and page effect with isolated dependencies. It checks the SQL projection and parameterization, response values, access rejection, missing imports, background processing, skipped hidden display reads, overlapping request prevention, visibility restoration, and cleanup. It runs in the existing import-upload-handoff quality-gate command without a live database.
