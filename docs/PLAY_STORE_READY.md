# Play Store Ready Notes

## Feature-Beschreibung

IPTV Mat Player ist ein legaler IPTV-Player fuer eigene M3U/M3U8- und Xtream-Quellen. Die App stellt keine Sender, Streams, Playlists oder Medieninhalte bereit.

## Datenschutz-Hinweis

Die App verarbeitet vom Nutzer eingegebene IPTV-Quellen, Zugangsdaten und Wiedergabe-Metadaten, um Playlists zu laden und Streams abzuspielen. Zugangsdaten werden nicht in unverschluesseltem Browser-Speicher abgelegt. Auf Android steht ein Keystore-gestuetzter Secure Storage zur Verfuegung.

## Berechtigungen

- `INTERNET`: Erforderlich fuer Nutzer-Playlists, IPTV-Streams und die Verbindung zum Render Backend.

## Sicherheit

- Globaler Cleartext-Traffic ist deaktiviert.
- Render CORS ist auf Vercel und Capacitor Origins begrenzt.
- Backend-Logs redigieren sensible Felder.
- Rate Limiting ist aktiv.
- Recording/DVR darf nur als Vormerkung oder geplant beschrieben werden, solange kein echter Backend-Recorder existiert.
- Pro ist fuer `4,99 EUR / Monat` mit Google Play Billing Produkt-ID `iptv_mat_player_pro_monthly` vorbereitet. Bis Billing vollstaendig implementiert ist, darf die App nur "Pro bald verfuegbar" anzeigen.

## Upload-Voraussetzung

Fuer den Play Store Upload muss ein Release-Keystore vorhanden sein und ueber `android/release-signing.properties` oder Umgebungsvariablen konfiguriert werden:

```properties
IPTV_MAT_UPLOAD_STORE_FILE=release-key.jks
IPTV_MAT_UPLOAD_STORE_PASSWORD=...
IPTV_MAT_UPLOAD_KEY_ALIAS=...
IPTV_MAT_UPLOAD_KEY_PASSWORD=...
```
