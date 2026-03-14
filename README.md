# holidaily

Landingpage fuer holidaily pools mit lokalem Konto-Bereich und einem serverseitigen Support-Chat.

## Struktur

- `index.html`: Website-Frontend
- `styles.css`: Design der Landingpage
- `app.js`: lokale Konto-/Merkliste-/Notiz-Logik
- `site-config.js`: Runtime-Konfiguration fuer getrenntes Frontend-/Backend-Hosting
- `support-chat.js`: Nutzer-Chat gegen die REST-API
- `admin/`: getrenntes Admin-Panel fuer Support-Chats
- `server/`: Express-Backend, REST-API und Chat-DB-Anbindung
- `server/db/schema.sql`: Tabellenstruktur fuer die separate Chat-Datenbank
- `assets/`: Bilder und statische Assets

## Chat-Architektur

- Nutzer-Frontend: `index.html` + `support-chat.js`
- Backend/API: `server/index.js`
- Admin-Panel: `admin/index.html`
- Separate Chat-Datenbank: `data/chat-support.sqlite`

Die Chat-Daten laufen bewusst nicht ueber eine normale App-Datenbank, sondern ueber eine eigene SQLite-Datei mit eigener DB-Verbindung in `server/db/chat-db.js`.

## Setup

1. `.env.example` nach `.env` kopieren.
2. Admin-Zugang und `ADMIN_SESSION_SECRET` in `.env` setzen.
3. Falls Website/Admin nicht ueber denselben Node-Server laufen, in `site-config.js` die Backend-URL setzen:

   ```js
   window.HolidailyRuntimeConfig.backendBaseUrl = "https://dein-backend.example.com";
   ```

4. Abhaengigkeiten installieren:

   ```bash
   npm install
   ```

5. Optional einen Passwort-Hash erzeugen:

   ```bash
   npm run hash:password -- DeinStarkesPasswort
   ```

6. Server starten:

   ```bash
   npm run dev
   ```

7. Website aufrufen:

   - Frontend: `http://localhost:3000/`
   - Admin-Panel: `http://localhost:3000/admin/`

## GitHub Pages

Fuer die statische Auslieferung ueber GitHub Pages gibt es jetzt den Workflow
`.github/workflows/deploy-pages.yml`.

Wichtig:

- Die Landingpage und das Admin-Frontend koennen damit als statische Dateien auf GitHub Pages veroeffentlicht werden.
- Der Express-/SQLite-Teil laeuft nicht auf GitHub Pages. Fuer den echten Support-Chat braucht es weiter einen Node.js-Host fuer `server/index.js`.
- Der Pages-Workflow erzeugt `site-config.js` automatisch mit `BACKEND_BASE_URL`. Standard-Fallback ist `https://holidaily-chat-api-rgru.onrender.com`.
- Falls Website/Admin auf einer anderen Domain als das Backend laufen, muessen auf dem Backend `ALLOWED_WEB_ORIGINS`, `ADMIN_COOKIE_SAME_SITE=none` und `ADMIN_COOKIE_SECURE=true` gesetzt werden.
- Falls die Repository-Einstellung fuer Pages noch nicht aktiv ist, muss unter GitHub einmalig `Settings -> Pages -> Build and deployment -> Source -> GitHub Actions` gesetzt werden.

## Render Deploy

Die produktive Chat-API ist fuer Render vorbereitet ueber [render.yaml](/C:/Users/dansi/Downloads/holidaily/render.yaml).

Empfohlener Ablauf:

1. In Render `New +` -> `Blueprint` waehlen und dieses Repository verbinden.
2. Render liest `render.yaml` ein und erstellt einen Node-Webservice mit persistentem Disk fuer SQLite.
3. Beim ersten Deploy nur noch das geheime Feld `ADMIN_PASSWORD` setzen.
4. Wenn Render den vorgeschlagenen Host `https://holidaily-chat-api-rgru.onrender.com` verwenden kann, ist keine weitere Aenderung noetig.
5. Falls Render eine andere URL vergibt, in GitHub unter `Settings -> Secrets and variables -> Actions -> Variables` die Variable `BACKEND_BASE_URL` auf diese URL setzen und den Pages-Workflow erneut ausfuehren.

Render-Details im Repo:

- Persistente SQLite-DB ueber `/var/data/chat-support.sqlite`
- CORS fuer `https://rg-ru.github.io`
- Sichere Admin-Cookies fuer Cross-Origin-Login von GitHub Pages zum Backend
- Admin-E-Mail auf `dan.siemens@outlook.de` vorbelegt, Passwort bleibt als Render-Secret ausserhalb von Git

## REST-Endpunkte

- `POST /api/chat/conversations`
- `GET /api/chat/conversations/:conversationId`
- `POST /api/chat/conversations/:conversationId/messages`
- `POST /api/admin/auth/login`
- `GET /api/admin/auth/session`
- `POST /api/admin/auth/logout`
- `GET /api/admin/conversations`
- `GET /api/admin/conversations/:conversationId`
- `POST /api/admin/conversations/:conversationId/messages`
- `PATCH /api/admin/conversations/:conversationId/status`
- `DELETE /api/admin/conversations/:conversationId`

## Sicherheit

- Input-Validierung im Backend
- Parametrisierte SQL-Statements gegen SQL-Injection
- Support-Chat-Token werden nur gehasht in der Chat-DB gespeichert
- Admin-Login ueber signiertes HttpOnly-Cookie
- Admin-API mit Rate-Limit
- Nachrichten werden im Frontend nur per `textContent` gerendert, nicht als HTML

## Hinweis

Das Projekt benoetigt fuer den Support-Chat jetzt Node.js. Reines Oeffnen von `index.html` ohne Server reicht fuer das Chat-System nicht mehr aus.
