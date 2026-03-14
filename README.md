# holidaily

Landingpage fuer holidaily pools mit lokalem Konto-Bereich und einem serverseitigen Support-Chat.

## Struktur

- `index.html`: Website-Frontend
- `styles.css`: Design der Landingpage
- `app.js`: lokale Konto-/Merkliste-/Notiz-Logik
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
3. Abhaengigkeiten installieren:

   ```bash
   npm install
   ```

4. Optional einen Passwort-Hash erzeugen:

   ```bash
   npm run hash:password -- DeinStarkesPasswort
   ```

5. Server starten:

   ```bash
   npm run dev
   ```

6. Website aufrufen:

   - Frontend: `http://localhost:3000/`
   - Admin-Panel: `http://localhost:3000/admin/`

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
