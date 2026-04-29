# IPTV Mat Player Pro - Production Checklist

## Android Release

- App version is synchronized: `versionName 6.7.0`, `versionCode 67`, title `IPTV Mat Player Pro`, UI badge `v6.7 release`.
- Release build uses `minifyEnabled true` and `shrinkResources true`.
- Release build is signed with a local upload key that is excluded from Git.
- Debuggable release builds are disabled with `debuggable false`.
- `android:allowBackup` is disabled and data extraction rules exclude local app data.
- Cleartext traffic is controlled through `network_security_config`.
- Native player plugin is registered in `MainActivity` and launches `NativePlayerActivity`.

## Privacy And Data

- Xtream credentials and M3U URLs are not persisted in unencrypted `localStorage`.
- Source profiles keep only safe metadata; passwords and M3U URLs must be entered again.
- The privacy policy must explain that IPTV source credentials are processed locally and, when configured, through the Render backend proxy.
- The app must not ship provider credentials, copyrighted playlists, or demo streams.

## Play Store

- Use an app-owned upload key and keep the keystore/passwords backed up offline.
- Prepare a privacy policy URL before publishing.
- Complete the Data Safety form for network access and locally entered IPTV credentials.
- Confirm that the app does not provide copyrighted IPTV content and only plays user-supplied sources.
- Test the signed `.aab` on at least one real Android device through internal testing.

## Backend And Security

- Render backend health endpoint must return `ok: true` before production release.
- Proxy endpoints must keep URL validation and timeouts enabled.
- Logging must not include usernames, passwords, full M3U URLs, or stream tokens.
- DVR is currently only a planning feature. Do not market it as real recording until a backend recorder exists.

## Final Smoke Test

- Install internal test build from Play Console or bundletool.
- Import one valid M3U URL.
- Import one valid Xtream account.
- Start one TS live stream in the native Android player.
- Start one HLS stream in the native Android player.
- Verify invalid M3U/Xtream URLs show clear errors.
- Verify app restart does not expose credentials in persistent storage.
