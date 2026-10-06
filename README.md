# Zoe’s world

A private website for Zoe’s activities, milestones, and progress. Record dates, notes, places, photos, completion status, and percentage progress; search, filter, mark favorites, and export/import journal backups.

## Run

Use Node.js 24 or newer. The tracker uses only built-in Node modules; no npm installation, Ruby, or legacy Gulp dependencies are needed.

```sh
npm run build
npm test
npm start
```

The server listens on port 8080 on the local machine. Open the site through your development environment’s supported browser access. Create the owner account on the first visit; passwords require at least 12 characters. Only the owner can add, edit, delete, import, or invite. Invitees have read access, including photos and exports.

Use **Invite someone** to create an email-bound link valid for seven days. Share that link privately; the recipient must register with that email. Links work only while the recipient can reach the running server. The same panel lists viewers and lets the owner remove their access or cancel all pending invitations. A link can be used only once. The application creates links; it does not send email.

## Storage and privacy

Journal entries, photos, password hashes, sessions, and invitations are stored in the ignored `.tmp/zoe/journal.sqlite` database. Passwords use scrypt; sessions are stored as hashed tokens and use HttpOnly, SameSite cookies. Journal API calls require a signed-in account. There are no third-party fonts, analytics, or remotely hosted assets. Exported JSON contains private memories and should be kept securely. Import merges entries by ID and accepts files under 3 MB; larger databases should be backed up directly.

Keep `.tmp/zoe` on persistent storage. Back up the SQLite database using SQLite’s backup mechanism or stop the server and copy the entire data directory, including WAL files. Exports back up experiences, not accounts or access settings.

## Configuration and hosting

- `PORT`: default `8080`.
- `HOST`: default `127.0.0.1`; set `0.0.0.0` when serving behind a trusted hosting proxy.
- `ZOE_DATA_DIR`: persistent data directory; default `.tmp/zoe`.
- `ZOE_SETUP_TOKEN`: initial owner setup code. Required when exposing a fresh database beyond loopback. Set it securely through the host’s environment settings and enter it in the first-account form; do not commit it.
- `ZOE_SECURE_COOKIES=1`: enable Secure cookies behind HTTPS. The proxy must preserve the external Host header; POST origins must match that host and the configured HTTP/HTTPS scheme.

Before Internet deployment, configure HTTPS, persistent storage, and the initial setup code. Create the owner account before sharing the site. The app has no email delivery or password recovery service; keep the owner credentials securely. Do not use the old course’s `gulp connect` server for this app: use `npm start`, which enforces API authentication. No deployment has been performed.

## Development

Edit `builds/development/index.html`, `components/scripts/experiences.js`, and `components/sass/style.scss` (currently plain CSS). `npm run build` copies the CSS and browser JavaScript into both build directories and syncs production HTML. Restart `npm start` after backend changes. There is no dependency on the old course’s missing images or its Ruby toolchain.

`npm test` creates an isolated temporary database and checks initial setup, authentication, invited viewers, owner-only writes, persistence across restart, progress updates, import, deletion, origin checks, access revocation, and logout.

## Container deployment

`Dockerfile` builds the current frontend and runs the server as an unprivileged user on port 8080. It does not install the obsolete course dependencies. Mount a persistent disk or volume at `/data` with write access for UID 1000. Use a single instance with this SQLite database.

Configure `ZOE_SETUP_TOKEN` as a secret in the hosting provider before the first boot. The container defaults to Secure cookies, so serve it through the provider’s HTTPS proxy. Keep the external Host header intact. Use `/api/session` for an HTTP health check. Create the owner account with the setup code, then invite viewers. Never bake setup codes or journal databases into the image.

Deploy this container only after selecting a hosting destination and connecting an authorized hosting account. A container image build alone does not publish the site.
