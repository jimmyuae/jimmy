# Render Free Deployment Guide

## 1. Upload to GitHub

Upload the extracted project files to GitHub. Do not upload `.env`, `node_modules`, or any private credential note.

## 2. Create a Render Web Service

1. Open Render Dashboard.
2. Click `New` > `Web Service`.
3. Select the GitHub repository.
4. Keep `Language` as `Docker`.
5. Keep branch as `main`.
6. Leave Root Directory empty.
7. Select the `Free` instance.

## 3. Add environment variables

Use Render's `Add from .env` option and paste:

```env
NODE_ENV=production
PORT=3000
APP_URL=https://your-service-name.onrender.com
JWT_SECRET=change_this_to_a_long_random_secret

ADMIN_ID=ADMIN-001
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change_this_password

WORKER_ID=EMP-001
WORKER_EMAIL=staff@example.com
WORKER_PASSWORD=change_this_password

FACE_VERIFY_MODE=manual
STORE_RADIUS_M=500
```

After deployment, update `APP_URL` to your real Render URL, then redeploy.

## 4. Deploy and test

Open the Render URL and test:

- Admin login
- Staff login
- Profile picture upload
- Store grouping by location/mall
- Store first-location capture
- Check-in selfie
- Check-out sales report
- Admin selfie review
- Location warning count
- Monthly PDF report

## Important

Render Free is suitable for demo/testing. It is not ideal for official HR, salary, or long-term attendance data because this project currently uses SQLite and local file storage.


## Important storage note

This app no longer auto-deletes records. On free hosting, local files can still be lost after restart or redeploy. For real long-term storage, use a persistent disk or external database/storage.
