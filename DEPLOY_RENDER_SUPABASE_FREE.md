# Deploy Jimmy on Render Free + Supabase Free

This is the recommended free setup for persistent data.

## Architecture

- Render Free: runs the Node.js web app only
- Supabase Free: stores PostgreSQL database data permanently
- Supabase Storage: stores selfies, profile pictures, app files, and PDF reports

## Why not local SQLite?

Free web servers often use temporary local storage. This means local SQLite databases and uploaded files can disappear after restart/redeploy. This version does not depend on local storage for data.

## Render setup

1. Upload this project to GitHub.
2. In Render, create a new Web Service.
3. Select the GitHub repo.
4. Runtime: Docker.
5. Instance type: Free.
6. Add environment variables from `.env.example`.
7. Replace Supabase values with your real values.
8. Deploy.

## Required variables

```env
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=jimmy-attendance
```

Without these, the server will not start.
