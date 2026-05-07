# Koyeb Free Deployment Guide for Jimmy Attendance

## Before deployment

Do not upload the private credential note to GitHub. Only upload the project folder.

This version uses free manual selfie review. No paid face recognition API is required.

## 1. Upload project to GitHub

1. Extract this ZIP.
2. Open the `jimmy-attendance` folder.
3. Upload the project files to a GitHub repository.
4. Make sure the repository contains files like `server.js`, `package.json`, `Dockerfile`, and `public/`.
5. Do not upload `JIMMY_PRIVATE_LOGIN_NOTE_DO_NOT_UPLOAD.txt`.

## 2. Create Koyeb service

1. Log in to Koyeb.
2. Click `Create Service`.
3. Choose GitHub as the source.
4. Select your repository.
5. Select branch `main`.
6. Choose Dockerfile deployment.
7. Select the free instance.

## 3. Set the port

Use:

```text
Port: 3000
Protocol: HTTP
Public: Yes
```

## 4. Add environment variables

Add the values from your private note in Koyeb's Environment Variables section.

Required variables:

```text
NODE_ENV=production
PORT=3000
APP_URL=https://your-koyeb-domain.koyeb.app
JWT_SECRET=your_long_random_secret
ADMIN_ID=from_private_note
ADMIN_EMAIL=from_private_note
ADMIN_PASSWORD=from_private_note
WORKER_ID=from_private_note
WORKER_EMAIL=from_private_note
WORKER_PASSWORD=from_private_note
FACE_VERIFY_MODE=manual
STORE_RADIUS_M=500
```

After the first deployment, copy your real Koyeb URL and update `APP_URL`, then redeploy.

## 5. Deploy

Click Deploy. When it shows Healthy or Running, open your public Koyeb URL.

## 6. Test

1. Open the website.
2. Log in as Admin using the Admin ID and password from the private note.
3. Add or edit stores and products.
4. Log out.
5. Log in as Merchandiser using the Staff ID and password from the private note.
6. Test selfie capture, location, check-in, checkout, and sales report.
7. Return to Admin > Attendance.
8. View the submitted check-in/check-out selfies.
9. Approve or reject the manual selfie review.
10. Test monthly PDF generation.

## Free hosting warning

Koyeb Free is suitable for demos only. Do not use this free setup for official salary attendance or business-critical data unless you understand the storage limitations. For production, move SQLite and local files to production-grade database and storage.
