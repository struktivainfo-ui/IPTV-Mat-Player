# IPTV Mat Player - Production Checklist

## Android Release

- App version is synchronized: `versionName 8.1.0`, `versionCode 81`, title `IPTV Mat Player`, UI badge `v8.1 Premium`.
- Release build uses `minifyEnabled true` and `shrinkResources true`.
- Release build is signed with a local upload key that is excluded from Git.
- Debuggable release builds are disabled with `debuggable false`.
- `android:allowBackup` is disabled and data extraction rules exclude local app data.
- Global cleartext traffic is disabled through `network_security_config`.
- Native player plugin is registered in `MainActivity` and launches `NativePlayerActivity`.
- Native secure storage plugin is registered for encrypted Android credential storage.
- Production CORS allows only the Vercel domain and Capacitor Android origin.

## Privacy And Data

- Xtream credentials and M3U URLs are not persisted in unencrypted `localStorage`.
- Android uses Keystore-backed AES-GCM secure storage when credentials are saved.
- Source profiles keep only safe metadata; passwords and M3U URLs must be entered again.
- The privacy policy must explain that IPTV source credentials are processed locally and, when configured, through the Render backend proxy.
- The app must not ship provider credentials, copyrighted playlists, or demo streams.
- Suggested privacy policy text: "IPTV Mat Player stellt keine Sender, Streams, Playlists oder Inhalte bereit. Nutzer koennen eigene Quellen eintragen. Zugangsdaten werden nur fuer den Import und die Wiedergabe verwendet und nicht fuer Werbezwecke verkauft."
- Paywall is prepared for yearly `iptv_mat_player_pro_yearly` at `5,99 EUR / Jahr` and lifetime `iptv_mat_player_pro_lifetime` at `24,99 EUR`, but the UI must say "Pro bald verfuegbar" until Google Play Billing is fully implemented.

## Play Store

- Use an app-owned upload key and keep the keystore/passwords backed up offline.
- Prepare a privacy policy URL before publishing.
- Complete the Data Safety form for network access and locally entered IPTV credentials.
- Permissions explanation: `INTERNET` is required to reach user-supplied IPTV sources and the Render backend proxy.
- Confirm that the app does not provide copyrighted IPTV content and only plays user-supplied sources.
- Test the signed `.aab` on at least one real Android device through internal testing.

## Backend And Security

- Render backend health endpoint must return `ok: true` before production release.
- Vercel must define `VITE_API_URL=https://iptv-mat-backend-v6-6.onrender.com`.
- Render CORS must include only the Vercel production domain and Capacitor origins.
- Render rate limiting must stay enabled.
- Proxy endpoints must keep URL validation and timeouts enabled.
- Logging must not include usernames, passwords, full M3U URLs, or stream tokens.
- DVR/Recording is currently only a planning or reminder feature. Do not market it as real recording until a backend recorder exists.

## Final Smoke Test

- Install internal test build from Play Console or bundletool.
- Import one valid M3U URL.
- Import one valid Xtream account.
- Start one TS live stream in the native Android player.
- Start one HLS stream in the native Android player.
- Verify invalid M3U/Xtream URLs show clear errors.
- Verify app restart does not expose credentials in persistent storage.
