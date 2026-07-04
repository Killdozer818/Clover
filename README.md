# Clover

Clover is a private reading shelf PWA for tracking books, reading sessions, streaks, ratings, and reading stats.

## Account Sync

Clover uses Clerk for sign-in and Neon Postgres for account storage. Each signed-in user gets one saved Clover state in the database, with browser storage kept as a local fallback.

Required environment variables:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `DATABASE_URL`

## Install on Phone

1. Deploy the project to an HTTPS host such as Vercel.
2. Open the deployed URL on your phone.
3. On iPhone, use Safari > Share > Add to Home Screen.
4. On Android, use Chrome > Install app or Add to Home screen.
