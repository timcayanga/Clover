# Temporary upload lifecycle

Use a lifecycle rule on the uploads bucket so raw import files are deleted automatically after a short retention window.

Recommended policy:
- Prefix: `workspaces/`
- Delete after: `3 days` for the first release
- Allow manual deletion immediately from the app

Why:
- Keeps raw statement files out of long-term storage
- Reduces sensitive-data exposure window
- Gives users a clear privacy story

## AWS S3

Configure an expiration rule on the bucket using:
- AWS Console
- AWS CLI
- Terraform
- CloudFormation

Example behavior:
- Object upload time + 3 days
- Expire objects under `workspaces/`

## Cloudflare R2

Configure an object lifecycle rule with the same prefix and expiration window.

Notes:
- Lifecycle deletions are typically reflected within 24 hours
- Bucket lifecycle configuration requires write access to the bucket

## App behavior

The app should still:
- delete files on manual import deletion
- mark file records as deleted in PostgreSQL
- stop referencing deleted objects in preview/confirm flows
