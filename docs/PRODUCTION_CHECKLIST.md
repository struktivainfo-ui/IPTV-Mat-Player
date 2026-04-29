# IPTV Mat Player v6.8 Production Checklist

## Recht und Inhalt
- Die App liefert keine Senderlisten, Streams, EPG-Daten, Logos oder sonstige Medieninhalte mit.
- Nutzer muessen bestaetigen, dass sie nur eigene legale M3U/M3U8- oder Xtream-Quellen importieren.
- Store-Beschreibung klar formulieren: "IPTV Player", nicht "kostenlose Sender", "Pay-TV" oder aehnliche Versprechen.
- Keine Beispielstreams, Demo-Bilder oder urheberrechtlich geschuetzte Logos einbauen.

## Datenschutz
- Datenschutzerklaerung fuer Play Store bereitstellen.
- Erklaeren, dass Zugangsdaten nur lokal/sitzungsbezogen genutzt werden und Quellprofile keine Passwoerter speichern.
- Wenn spaeter Cloud, Login, Push oder Backend-Recorder aktiv werden, Datenschutztext vorher aktualisieren.

## Sicherheit
- Release-Build muss `debuggable false`, `minifyEnabled true` und `shrinkResources true` behalten.
- `allowBackup` bleibt deaktiviert oder wird nur mit sicheren Backup-Regeln aktiviert.
- Cleartext/HTTP nur kontrolliert ueber `network_security_config` erlauben.
- Upload-Keystore, Passwoerter und Signing-Dateien niemals committen.

## Play Store
- Vor Upload AAB mit `./gradlew bundleRelease` bauen.
- VersionCode vor jedem Store-Release erhoehen.
- App-Kategorie, Content-Rating und Datenschutzformular ehrlich ausfuellen.
- Screenshots muessen zeigen, dass die App ein leerer Player ist und Nutzer eigene Quellen importieren.

## Technische QA
- M3U-URL, M3U-Dateiinhalt und Xtream-Zugangsdaten mit legalen Testquellen pruefen.
- Ungueltige URL, leere Liste, HTML-Antwort, Timeout und nicht abspielbaren Stream pruefen.
- Android native ExoPlayer-Wiedergabe und WebPlayer-Fallback testen.
- Große Listen auf Performance, Speicherlimit und Such-/Kategorieverhalten pruefen.
