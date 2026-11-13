# Tourin mobile app (PWA)

Tourin can be installed from its HTTPS website as a Progressive Web App (PWA). It remains a web app; this does not create an App Store or Play Store package.

## Publish and install

1. Commit and push the project to the `main` branch so the existing GitHub Pages workflow publishes it.
2. Open the published URL ending in `/tourin/` on a phone. Do not open `index.html` as a `file://` URL; service workers and installation require HTTPS (or localhost during development).
3. On Android, use the browser's **Install app** or **Add to Home screen** prompt. On iPhone/iPad, open the page in Safari, tap **Share**, then **Add to Home Screen**.
4. If the app was already open when a new version was deployed, close and reopen it to load the updated app shell.

The service worker caches the Tourin app shell so its files can open offline. Sign-in and shared trip data require an internet connection. Device location is opt-in and only used while the app is open; this PWA does not provide dependable background tracking.

## Supabase setup

1. In Supabase, run `supabase-schema.sql` in **SQL Editor**.
2. In **Authentication**, disable public sign-ups and invite the administrator and participants.
3. Insert each invited account's `user_id` and assigned `role` (`admin` or `participant`) in `public.user_roles`, using the SQL example in `supabase-schema.sql`.
4. Keep `supabase-config.js` set to the project URL and browser-safe publishable/anon key. Never put a service-role or secret key in this app.
5. Test sign-in with both account types. Administrators can manage participant contacts, schedules, and lodging; participant accounts can read schedules and lodging but cannot read the participant contact directory or change trip data.

The group directory is separate from authentication accounts. Add participant login accounts by inviting them in Supabase; add their contact information in Tourin's administrator-only Participants section.
