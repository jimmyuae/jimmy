# Jimmy Permanent Storage Setup, Free Option

This version is prepared to keep data permanently outside the web server filesystem.

## Recommended free setup

- Web hosting: Render Free Web Service, only for running the Node.js app
- Database: Supabase Free Postgres
- File storage: Supabase Free Storage

Why: Render Free local files are temporary, so uploaded photos, PDFs, and SQLite files can disappear after restart or redeploy. This version stores the database in Supabase Postgres and stores selfies/profile pictures/PDF reports in Supabase Storage.

## Supabase free limits

Check Supabase pricing before production use. At the time this package was prepared, Supabase Free includes 500 MB database size and 1 GB file storage.

## Step 1, create Supabase project

1. Go to Supabase.
2. Create a new project.
3. Save the database password.
4. Open Project Settings > API.
5. Copy:
   - Project URL
   - service_role key

## Step 2, get database connection string

In Supabase:

1. Go to Project Settings > Database.
2. Open Connection string.
3. Use the URI / Pooler connection string.
4. Replace `[YOUR-PASSWORD]` with your real database password.

Add it as:

```env
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
PGSSLMODE=require
```

## Step 3, Render environment variables

Paste these into Render using Add from .env:

```env
NODE_ENV=production
PORT=3000
APP_URL=https://your-app-name.onrender.com
JWT_SECRET=replace_with_a_long_random_secret
DATABASE_URL=your_supabase_postgres_connection_string
PGSSLMODE=require
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_STORAGE_BUCKET=jimmy-attendance
FACE_VERIFY_MODE=manual
STORE_RADIUS_M=500
ADMIN_ID=ADMIN-001
ADMIN_EMAIL=admin@jimmy.local
ADMIN_PASSWORD=change_this_admin_password
WORKER_ID=EMP-001
WORKER_EMAIL=merchandiser@jimmy.local
WORKER_PASSWORD=change_this_merchandiser_password
```

## Step 4, deploy

1. Upload the project files to GitHub.
2. Create a Render Web Service.
3. Choose Docker.
4. Choose Free instance for demo.
5. Add the environment variables.
6. Deploy.

The app creates the database tables automatically on first startup.

## Important

Do not expose the Supabase service_role key in frontend code. It is only used on the backend server.

For real company use, free hosting is still not ideal because the app can sleep. Data will stay in Supabase, but the Render free app may pause after inactivity.
