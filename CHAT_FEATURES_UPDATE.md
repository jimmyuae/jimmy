# Jimmy Community Chat Update

This version adds the internal Jimmy Community group chat for Admin, Manager, and Merchandiser users.

## Included

- Bottom-right floating chat button
- WhatsApp-style Jimmy Community group chat
- Jimmy logo and group name in chat header
- Verified badge next to sender names
- Text messages
- Image, video, audio, and document attachments
- Voice message recording
- Reply to message by pressing Reply or swiping right on mobile
- Unsend own messages within 5 minutes
- New message sound
- Unread message badge
- Browser notification permission request after login
- 30-day server retention for chat messages and attachments
- Message sender profile preview
- Monthly sales summary from sender profile
- View Monthly Sales Report from sender profile

## Notes

- Files are stored in Supabase Storage under the `chat/` folder.
- Files are limited to 25 MB each.
- Messages older than 30 days are cleaned automatically by the server scheduled task.
- Browser notifications work while the website/PWA is open or running in the browser. Full closed-app push notification requires a separate Web Push setup.
