# Holidaily

Landingpage fuer Holidaily pools mit serverseitigem Kundenkonto, Website-Chat und einer versteckten Admin-Funktion fuer zentral gespeicherte Texte und Bilder.

## Struktur

- `index.html`: Seitenstruktur, Kundenkonto, Website-Chat, versteckter Admin-Login und Inline-Bearbeitung
- `styles.css`: Layout, Design und Styling fuer den internen Admin-Bereich
- `assets/`: Bilder, Icons und statische Medien
- `server/app.py`: statischer Dateiserver plus API fuer Kundenkonto, Notizen, Merkliste, Chat, Admin-Login und Live-Inhalte
- `server/db/`: JSON-Speicher fuer Chat, Benutzerkonten und Sessions
- `render.yaml`: Render-Blueprint fuer den Live-Betrieb mit persistentem Speicher
- `railway.json`: Railway-Startkonfiguration fuer einen einzelnen Web-Service
- `.env.example`: lokale und produktive Umgebungsvariablen als Vorlage

## Lokal starten

1. Im Projektordner den Holidaily-Server starten:
   `python server/app.py`
2. Im Browser oeffnen:
   `http://127.0.0.1:4173`

Die Seite wird damit zusammen mit einer kleinen API gestartet. Kundenkonto, gemerkte Modelle, Notizen, Chat-Nachrichten sowie Admin-Texte und Admin-Bilder werden zentral in `server/db/` abgelegt und sind dadurch auf allen Geraeten sichtbar, die dieselbe Server-Instanz nutzen.

## Live auf Render

Die einfachste Live-Variante fuer dieses Projekt ist ein einzelner Render Web Service, der Frontend und API gemeinsam ausliefert.

1. Repository nach GitHub pushen.
2. In Render `New +` -> `Blueprint` waehlen und das Repo verbinden.
3. `render.yaml` importieren.
4. Im Service diese Environment-Variablen setzen:
   `HOLIDAILY_ADMIN_NAME`
   `HOLIDAILY_ADMIN_EMAIL`
   `HOLIDAILY_ADMIN_PASSWORD`
5. Deploy starten.
6. Danach unter `Settings -> Custom Domains` deine Domain `holidaily.pool-traeume-bueber.de` hinzufuegen.

Wichtig:

- Der Plan muss persistenten Speicher unterstuetzen, weil die Daten als JSON-Dateien gespeichert werden.
- Das Blueprint mountet den persistenten Speicher unter `/var/data`.
- Ohne persistenten Speicher waeren Konten, Notizen, Chat und Admin-Aenderungen nach einem Redeploy weg.

## Live auf Railway

Wenn Render nervt, ist Railway die naechste einfache Variante.

1. Repository nach GitHub pushen.
2. In Railway ein neues Projekt aus dem Repo anlegen.
3. Einen persistenten Volume an den Service haengen und als Mount Path zum Beispiel `/data` setzen.
4. Diese Variablen setzen:
   `HOST=0.0.0.0`
   `HOLIDAILY_DB_DIR=/data`
   `HOLIDAILY_ADMIN_NAME=...`
   `HOLIDAILY_ADMIN_EMAIL=...`
   `HOLIDAILY_ADMIN_PASSWORD=...`
5. Deploy starten.
6. Danach unter `Networking` die Domain `holidaily.pool-traeume-bueber.de` verbinden.

Auch hier gilt:

- Ohne Volume gehen die Daten bei Redeploys verloren.
- Frontend und API laufen am einfachsten gemeinsam auf derselben Railway-Domain.
- Der aktuelle Railway-Service ist unter `https://holidaily-pools.up.railway.app` erreichbar, sobald ein gueltiges Deployment aktiv ist.
- Falls GitHub Pages parallel noch aktiv ist, probiert das Frontend diesen Railway-Host automatisch als API-Fallback.
- Fuer die finale Live-Domain darf `holidaily.pool-traeume-bueber.de` nicht weiter auf GitHub Pages zeigen, sonst bleibt HTTPS kaputt.

## Statisches Hosting mit externer API

Das Frontend kann weiterhin statisch gehostet werden. Fuer den geraeteuebergreifenden Zugriff auf Konten, Notizen, Merkliste, Nachrichten und Admin-Aenderungen muss dann zusaetzlich `server/app.py` auf einer erreichbaren Domain laufen.

- Standardmaessig nutzt das Frontend `"/api"` als Basis.
- Wenn das Frontend statisch auf einer anderen Domain liegt, probiert es zusaetzlich automatisch `https://api.<deine-domain>/api`.
- Fuer einen schnellen Browser-Test kannst du die API auch direkt per URL setzen, z. B. `?apiBase=https://dein-service.up.railway.app/api`. Die Seite merkt sich diesen Wert danach im Browser.
- Fuer getrenntes Hosting kann die API-Basis ueber das Meta-Tag `<meta name="holidaily-api-base" content=\"https://deine-api-domain/api\">` oder ueber `window.HOLIDAILY_API_BASE` gesetzt werden.
- Ohne laufende API funktionieren Login, Merkliste, Notizen, Nachrichten und Admin-Aenderungen nicht geraeteuebergreifend.

## Adminpanel oeffnen

Der Admin-Zugang ist auf der Seite bewusst versteckt.

1. Auf das `H` im Holidaily-Logo `5x` schnell hintereinander klicken.
2. Im eingeblendeten internen Dialog mit den gesetzten Admin-Umgebungsvariablen anmelden.
3. Danach werden die Admin-Funktionen freigeschaltet.

## Was der Admin kann

- Texte direkt auf der Seite per Inline-Editing aendern
- Bilder im freigeschalteten Admin-Bereich austauschen
- Aenderungen zentral speichern
- Originalzustand wiederherstellen

## Wichtiger Hinweis

Der aktuelle Stand ist fuer eine kleine Live-Seite geeignet, aber nicht fuer sensible Kundendaten oder mehrere Admin-Rollen.
Es gibt noch keine echte Benutzerverwaltung, kein Datenbank-Backend und keine feinere Rechtevergabe.

## Links

- Repository: https://github.com/rg-ru/holidaily
- E-Mail: Info@Holidaily-pools.de
- WhatsApp: https://wa.me/491632178170
