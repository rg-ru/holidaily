# Holidaily

Landingpage fuer Holidaily pools mit lokalem Kundenkonto und einer versteckten Admin-Testfunktion fuer Texte und Bilder.

## Struktur

- `index.html`: Seitenstruktur, Kundenkonto, versteckter Admin-Login und Inline-Bearbeitung
- `styles.css`: Layout, Design und Styling fuer den internen Admin-Bereich
- `assets/`: Bilder, Icons und statische Medien

## Lokal starten

1. Im Projektordner den Holidaily-Server starten:
   `python server/app.py`
2. Im Browser oeffnen:
   `http://127.0.0.1:4173`

Die Seite wird damit zusammen mit einer kleinen Chat-API gestartet. Texte und Bilder bleiben lokal im Browser gespeichert, Chat-Nachrichten werden dagegen zentral in `server/db/chat-store.json` abgelegt und sind dadurch auf allen Admin-Geraeten sichtbar, die denselben Server nutzen.

## Adminpanel oeffnen

Der Admin-Zugang ist auf der Seite bewusst versteckt.

1. Auf das `H` im Holidaily-Logo `5x` schnell hintereinander klicken.
2. Im eingeblendeten internen Dialog anmelden mit:
   `Name: Daniil`
   `E-Mail: daniil.siemens@icloud.com`
   `Passwort: pools.daniil`
3. Danach werden die Admin-Funktionen freigeschaltet.

## Was der Admin kann

- Texte direkt auf der Seite per Inline-Editing aendern
- Bilder im freigeschalteten Admin-Bereich austauschen
- Aenderungen lokal im Browser speichern
- Originalzustand wiederherstellen

## Wichtiger Hinweis

Der aktuelle Admin-Zugang ist nur fuer die Testversion gedacht.
Da die Zugangsdaten im Frontend liegen und die Inhalte nur lokal gespeichert werden, ist das nicht fuer eine Live-Umgebung geeignet.

## Links

- Repository: https://github.com/rg-ru/holidaily
- E-Mail: Info@Holidaily-pools.de
- WhatsApp: https://wa.me/491632178170
