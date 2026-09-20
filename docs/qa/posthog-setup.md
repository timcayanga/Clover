# Configure PostHog read access for Clover

Clover already has a public ingestion token for sending events. The personal API key below is separate: Clover Admin uses it on the server to query aggregates and verify receipt. Do not replace the public token with this secret.

1. Sign in to the PostHog organization that owns Clover and select the Clover project.
2. Open **Settings → Personal API keys** (US direct link: https://us.posthog.com/settings/user-api-keys).
3. Choose **Create a personal API key**, label it **Clover staging analytics**, limit it to the Clover project, and grant **Query → Read** (`query:read`). Clover's current aggregate query integration does not need write/delete access.
4. Copy the key immediately; PostHog does not display it again. Keep it private; do not paste it into chat or a frontend/public environment variable.
5. Open **Project settings** and copy the numeric **Project ID**. This is not the public project token.
6. In Vercel, open the existing **Clover project → Settings → Environment Variables**. Set these for **Preview**, scoped to the **staging** branch where branch-specific values are used:
   - `POSTHOG_PERSONAL_API_KEY`: the new private key.
   - `POSTHOG_PROJECT_ID`: the numeric project ID.
   - `POSTHOG_APP_URL`: `https://us.posthog.com` (or `https://eu.posthog.com` if Clover's project is in the EU).
7. Keep `NEXT_PUBLIC_POSTHOG_KEY` as the existing public ingestion token and `NEXT_PUBLIC_POSTHOG_HOST` as the matching ingestion domain (`https://us.i.posthog.com` or `https://eu.i.posthog.com`). The native app reads that public configuration from Clover's API; it never receives the personal API key.
8. Tell Codex the staging variables are saved. Redeploy staging to load the new server values, then verify **Admin → Analytics** and a small aggregate query against recent staging events.

In PostHog, filter `analytics_environment = staging` and break down by `platform` (`desktop_web`, `mobile_web`, `ios`, `android`, `server`). Inspect `device_type`, `device_model`, `os_version`, `app_version` and `app_build` where applicable. A missing native model on a browser/server event is expected, not a failed capture.

Sources checked September 20, 2026:
- https://posthog.com/docs/api/personal-api-keys
- https://posthog.com/docs/api/queries (Query Read prerequisite and project settings)
- https://vercel.com/docs/environment-variables
