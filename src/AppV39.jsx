import React, { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { load, remove, save } from "./lib/storage.js";
import {
  buildGuideRows,
  createSecurityNotes,
  DEFAULT_AUTH_V39,
  DEFAULT_PROFILES_V39,
  DEFAULT_SETTINGS_V39,
  DEMO_ITEMS_V39,
  getCategoryOptions,
  maskSensitiveValue,
  sortLibraryItems,
} from "./lib/appDataV43.js";
import {
  buildGuideDataFromXmltv,
  buildGuideDataFromXtream,
  buildGuideQueries,
  getGuideHeadline,
} from "./lib/guideUtils.js";
import {
  buildAppApiUrl,
  describeConnectionMode,
  explainNetworkError,
  fetchJsonWithTimeout,
  fetchXtreamJson,
  isLikelyHlsUrl,
  pickFirstSeriesEpisode,
  resolvePlaybackUrl,
  safeTop,
} from "./lib/xtreamHelpers.js";

const NAV_ITEMS = [
  ["home", "Home"],
  ["details", "Details"],
  ["watchlist", "Watchlist"],
  ["account", "Account"],
];

const PLAYER_LABELS = {
  idle: "Kein Stream",
  loading: "Vorbereitung",
  ready: "Bereit",
  buffering: "Buffering",
  error: "Fehler",
};

const CATEGORY_ACTIONS = {
  live: "get_live_categories",
  movie: "get_vod_categories",
  series: "get_series_categories",
};

const SOURCE_TYPES = [
  ["xtream", "Xtream"],
  ["m3u", "M3U"],
  ["stbemu", "STBEmu"],
];

const SOURCE_LABELS = {
  xtream: "Xtream",
  m3u: "M3U",
  stbemu: "STBEmu",
  demo: "Demo",
};

const APP_VERSION = "v5.4";
const PLAYER_RETRY_LIMIT = 2;
const PLAYBACK_TIMEOUT_MS = 15000;
const STB_STREAM_CACHE_MS = 5 * 60 * 1000;

function persistState(key, value, setter) {
  save(key, value);
  setter(value);
}

function toggleEntry(list, value) {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

function readSettings() {
  return { ...DEFAULT_SETTINGS_V39, ...(load("settings", DEFAULT_SETTINGS_V39) || {}) };
}

function readAuth(settings) {
  const auth = load("auth", DEFAULT_AUTH_V39) || DEFAULT_AUTH_V39;
  return {
    sourceType: auth.sourceType || "xtream",
    server: auth.server || "",
    username: auth.username || "",
    password: settings.rememberCredentials ? auth.password || "" : "",
    m3uUrl: auth.m3uUrl || "",
    portalUrl: auth.portalUrl || "",
    macAddress: auth.macAddress || "",
    epgUrl: auth.epgUrl || "",
  };
}

function getSourceLabel(sourceType, imported = false) {
  if (!imported) {
    return SOURCE_LABELS.demo;
  }

  return SOURCE_LABELS[sourceType] || SOURCE_LABELS.xtream;
}

function getFallbackCover(item) {
  if (!item) {
    return DEMO_ITEMS_V39[0].cover;
  }

  if (item.section === "movie") {
    return DEMO_ITEMS_V39[2].cover;
  }

  if (item.section === "series") {
    return DEMO_ITEMS_V39[4].cover;
  }

  return DEMO_ITEMS_V39[0].cover;
}

function normalizeProfile(profile, index = 0) {
  const name = profile?.name || `Profil ${index + 1}`;
  return {
    id: profile?.id || `profile-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`,
    name,
    emoji: profile?.emoji || "User",
    pin: profile?.pin || "",
    kidsMode: Boolean(profile?.kidsMode || name.toLowerCase() === "kids"),
  };
}

function normalizeProfiles(profiles) {
  return (Array.isArray(profiles) ? profiles : DEFAULT_PROFILES_V39).map(normalizeProfile);
}

function normalizeBouquets(bouquets) {
  const source = Array.isArray(bouquets) && bouquets.length ? bouquets : [{ id: "bouquet-main", name: "Meine Sender", itemIds: [] }];
  return source.map((bouquet, index) => ({
    id: bouquet?.id || `bouquet-${index + 1}`,
    name: bouquet?.name || `Bouquet ${index + 1}`,
    itemIds: Array.isArray(bouquet?.itemIds) ? bouquet.itemIds : [],
  }));
}

function buildQualityLabel(level, index) {
  const height = level?.height ? `${level.height}p` : "";
  const bitrate = level?.bitrate ? `${Math.round(level.bitrate / 1000)} kbps` : "";
  return [height, bitrate].filter(Boolean).join(" | ") || `Qualitaet ${index + 1}`;
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function sanitizeImportedItems(sourceItems) {
  const seen = new Set();
  let invalidCount = 0;
  let duplicateCount = 0;
  const items = [];

  for (const item of Array.isArray(sourceItems) ? sourceItems : []) {
    const title = String(item?.title || "").trim();
    const streamUrl = String(item?.streamUrl || "").trim();
    const uniqueKey = item?.id || `${title.toLowerCase()}|${streamUrl}`;
    const hasStreamSource = Boolean(
      streamUrl ||
        (item?.server && item?.username && item?.password && item?.streamId && item?.streamType) ||
        item?.cmd
    );

    if (!title || !hasStreamSource) {
      invalidCount += 1;
      continue;
    }

    if (seen.has(uniqueKey)) {
      duplicateCount += 1;
      continue;
    }

    seen.add(uniqueKey);
    items.push({
      ...item,
      title,
      streamUrl,
      health: item?.health || "ready",
      lastCheckedAt: Date.now(),
    });
  }

  return {
    items,
    invalidCount,
    duplicateCount,
  };
}

function parseM3uAttributes(text) {
  const attributes = {};
  const pattern = /([\w-]+)="([^"]*)"/g;
  let match = pattern.exec(String(text || ""));

  while (match) {
    attributes[match[1]] = match[2];
    match = pattern.exec(String(text || ""));
  }

  return attributes;
}

function detectM3uSection(groupTitle = "", title = "") {
  const text = `${groupTitle} ${title}`.toLowerCase();

  if (/(series|serie|show|season|episode)/i.test(text)) {
    return "series";
  }

  if (/(movie|film|vod|cinema|kino)/i.test(text)) {
    return "movie";
  }

  return "live";
}

function createM3uItemsFromText(text, playlistUrl = "m3u-text://local") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const meta = {
    epgUrl: "",
  };
  const entries = [];
  const seen = new Set();
  let current = null;

  for (const line of lines) {
    if (line.startsWith("#EXTM3U")) {
      const attributes = parseM3uAttributes(line);
      meta.epgUrl = attributes["x-tvg-url"] || attributes["url-tvg"] || "";
      continue;
    }

    if (line.startsWith("#EXTINF")) {
      const commaIndex = line.indexOf(",");
      const infoPart = commaIndex >= 0 ? line.slice(0, commaIndex) : line;
      const titlePart = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : "Unbenannter Stream";
      const attributes = parseM3uAttributes(infoPart);

      current = {
        title: titlePart || attributes["tvg-name"] || "Unbenannter Stream",
        category: attributes["group-title"] || "Unkategorisiert",
        logo: attributes["tvg-logo"] || "",
        epgId: attributes["tvg-id"] || "",
        tvgName: attributes["tvg-name"] || titlePart || "",
      };
      continue;
    }

    if (line.startsWith("#")) {
      continue;
    }

    if (current) {
      entries.push({
        ...current,
        url: line,
      });
      current = null;
    }
  }

  const items = entries.reduce((accumulator, entry, index) => {
    if (!entry?.title || !entry?.url) {
      return accumulator;
    }

    const normalizedUrl = String(entry.url).trim();
    const signature = `${String(entry.title).trim().toLowerCase()}|${normalizedUrl}`;

    if (!normalizedUrl || seen.has(signature)) {
      return accumulator;
    }

    seen.add(signature);
    const section = detectM3uSection(entry.category, entry.title);
    const lowerUrl = normalizedUrl.toLowerCase();
    const streamExt = lowerUrl.includes(".m3u8") || lowerUrl.includes("output=m3u8")
      ? "m3u8"
      : lowerUrl.includes(".ts") || lowerUrl.includes("output=ts")
        ? "ts"
        : lowerUrl.includes(".mp4")
          ? "mp4"
          : "mp4";

    accumulator.push({
      id: `m3u-${index}-${entry.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: entry.title,
      category: entry.category || "Unkategorisiert",
      section,
      badge: section === "live" ? "M3U" : section === "movie" ? "VOD" : "Serie",
      year: "M3U",
      duration: section === "live" ? "Live" : section === "movie" ? "VOD" : "Serie",
      rating: section === "movie" ? "12+" : "0+",
      progress: (index * 3) % 100,
      description: `Importiert aus einer M3U-Playlist${entry.epgId ? ` mit EPG-ID ${entry.epgId}` : ""}.`,
      streamUrl: normalizedUrl,
      streamExt,
      streamType: section,
      sourceType: "m3u",
      sourceUrl: playlistUrl,
      epgSourceUrl: "",
      tvgName: entry.tvgName || entry.title,
      imported: true,
      cover: entry.logo || "",
      epgChannelId: entry.epgId || "",
    });

    return accumulator;
  }, []);

  return { items, meta };
}

function isManualM3uInput(value) {
  const text = String(value || "").trim();
  return text.includes("#EXTM3U") || text.includes("#EXTINF");
}

function buildImportSummary(label, count, invalidCount = 0, duplicateCount = 0) {
  const parts = [`${count} ${label} importiert.`];

  if (invalidCount) {
    parts.push(`${invalidCount} unvollstaendige Eintraege uebersprungen.`);
  }

  if (duplicateCount) {
    parts.push(`${duplicateCount} Duplikate bereinigt.`);
  }

  return parts.join(" ");
}

function createReliabilityChecks({
  items,
  importedItems,
  liveItems,
  movieItems,
  seriesItems,
  guideDataById,
  savedServers,
  selected,
  playbackUrl,
  playerError,
  isPreparingPlayback,
  isOnline,
  recordings,
  profiles,
}) {
  const checks = [
    {
      id: "library",
      label: "Bibliothek",
      status: items.length >= 3 ? "pass" : "warn",
      detail: `${items.length} Eintraege verfuegbar`,
    },
    {
      id: "content-balance",
      label: "Live / VOD / Serien",
      status: liveItems.length && movieItems.length && seriesItems.length ? "pass" : "warn",
      detail: `${liveItems.length} Live, ${movieItems.length} VOD, ${seriesItems.length} Serien`,
    },
    {
      id: "guide",
      label: "Guide-Daten",
      status: Object.keys(guideDataById || {}).length ? "pass" : "warn",
      detail: Object.keys(guideDataById || {}).length
        ? `${Object.keys(guideDataById || {}).length} Kanaele mit EPG`
        : "Noch keine synchronisierten Guide-Daten",
    },
    {
      id: "playback",
      label: "Playback",
      status: playerError ? "fail" : playbackUrl && !isPreparingPlayback ? "pass" : "warn",
      detail: playerError || (playbackUrl ? "Abspiel-URL vorhanden" : "Noch keine Abspiel-URL aufgebaut"),
    },
    {
      id: "import-sources",
      label: "Importquellen",
      status: importedItems.length || savedServers.length ? "pass" : "warn",
      detail: importedItems.length
        ? `${importedItems.length} importierte Eintraege aktiv`
        : savedServers.length
          ? `${savedServers.length} Serverprofile gespeichert`
          : "Keine importierten Quellen gespeichert",
    },
    {
      id: "household",
      label: "Haushalt & Profile",
      status: profiles.length >= 2 ? "pass" : "warn",
      detail: `${profiles.length} Profile verfuegbar`,
    },
    {
      id: "recordings",
      label: "Aufnahme-Planer",
      status: recordings.length ? "pass" : "warn",
      detail: recordings.length ? `${recordings.length} geplante Aufnahmen` : "Noch keine Testaufnahme vorgemerkt",
    },
    {
      id: "network",
      label: "Online-Status",
      status: isOnline ? "pass" : "fail",
      detail: isOnline ? "Netzwerk erreichbar" : "Offline erkannt",
    },
  ];

  if (selected?.health === "issue") {
    checks.push({
      id: "selected-health",
      label: "Aktueller Titel",
      status: "fail",
      detail: selected.healthMessage || "Der aktuell gewaehlte Stream hatte zuletzt ein Problem.",
    });
  }

  return checks;
}

function getReliabilityTone(results) {
  if (results.some((entry) => entry.status === "fail")) {
    return "kritisch";
  }

  if (results.some((entry) => entry.status === "warn")) {
    return "beobachten";
  }

  return "stabil";
}

function toCategoryMap(entries) {
  if (!Array.isArray(entries)) {
    return {};
  }

  return entries.reduce((accumulator, entry) => {
    const key = String(entry.category_id || entry.id || "");
    if (key) {
      accumulator[key] = entry.category_name || entry.name || "Unkategorisiert";
    }
    return accumulator;
  }, {});
}

function createImportedItem(kind, entry, index, auth, categoryMaps, fallbackCover) {
  const section = kind === "movie" ? "movie" : kind;
  const categoryMap = categoryMaps[section] || {};
  const categoryId = String(entry.category_id || "");
  const category =
    entry.category_name ||
    categoryMap[categoryId] ||
    (kind === "live" ? "Live TV" : kind === "movie" ? "Filme" : "Serien");

  const baseItem = {
    imported: true,
    sourceType: "xtream",
    server: auth.server,
    username: auth.username,
    password: auth.password,
    category,
    categoryId,
    cover: entry.stream_icon || entry.cover || fallbackCover,
    progress: (index * (kind === "live" ? 5 : kind === "movie" ? 9 : 7)) % 100,
    importedAt: Date.now(),
    epgSourceUrl: auth.epgUrl || "",
  };

  if (kind === "live") {
    return {
      ...baseItem,
      id: `live-${entry.stream_id}`,
      title: entry.name || `Live ${entry.stream_id}`,
      section: "live",
      badge: "Live",
      year: "2026",
      duration: "Live",
      rating: "0+",
      description: "Importierter Live-Eintrag mit Guide- und Favoriten-Unterstuetzung.",
      streamType: "live",
      streamId: String(entry.stream_id),
      streamExt: entry.container_extension || "m3u8",
      epgChannelId: entry.epg_channel_id || "",
      tvgName: entry.name || `Live ${entry.stream_id}`,
    };
  }

  if (kind === "movie") {
    return {
      ...baseItem,
      id: `movie-${entry.stream_id}`,
      title: entry.name || `Film ${entry.stream_id}`,
      section: "movie",
      badge: "Movie",
      year: "2026",
      duration: "Film",
      rating: "12+",
      description: "Importierter Film mit Continue Watching und Bibliotheksfiltern.",
      streamType: "movie",
      streamId: String(entry.stream_id),
      streamExt: entry.container_extension || "mp4",
    };
  }

  return {
    ...baseItem,
    id: `series-${entry.series_id || index}`,
    title: entry.name || `Serie ${index + 1}`,
    section: "series",
    badge: "Serie",
    year: "2026",
    duration: "Serie",
    rating: "12+",
    description: "Importierte Serie. Die erste Episode wird bei Bedarf automatisch aufgeloest.",
    streamType: "series",
    seriesId: String(entry.series_id || entry.stream_id || index),
    pendingEpisodeLookup: true,
  };
}

function PlayerView({
  item,
  url,
  isHls,
  isTs,
  autoplay,
  onProgress,
  onStatus,
  connectionLabel,
  isPreparing = false,
  retryEnabled = false,
  qualityLevel = -1,
  onQualitiesChange,
  onPlaybackIssue,
  videoBridgeRef,
}) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const mpegTsRef = useRef(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);
  const playbackTimeoutRef = useRef(null);
  const onProgressRef = useRef(onProgress);
  const onStatusRef = useRef(onStatus);
  const onPlaybackIssueRef = useRef(onPlaybackIssue);
  const onQualitiesChangeRef = useRef(onQualitiesChange);
  const [phase, setPhase] = useState(url ? "loading" : "idle");
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    onPlaybackIssueRef.current = onPlaybackIssue;
  }, [onPlaybackIssue]);

  useEffect(() => {
    onQualitiesChangeRef.current = onQualitiesChange;
  }, [onQualitiesChange]);

  useEffect(() => {
    if (videoBridgeRef) {
      videoBridgeRef.current = videoRef.current;
    }
  }, [videoBridgeRef]);

  useEffect(() => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = qualityLevel;
      hlsRef.current.nextLevel = qualityLevel;
    }
  }, [qualityLevel]);

  useEffect(() => {
    const video = videoRef.current;
    let cancelled = false;

    if (!video) {
      return undefined;
    }

    const cleanup = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (playbackTimeoutRef.current) {
        clearTimeout(playbackTimeoutRef.current);
        playbackTimeoutRef.current = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mpegTsRef.current) {
        mpegTsRef.current.destroy();
        mpegTsRef.current = null;
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    if (!url) {
      cleanup();
      if (isPreparing) {
        setPhase("loading");
        setError("");
        onPlaybackIssueRef.current?.("");
        return cleanup;
      }

      setPhase("idle");
      setError("Fuer diesen Eintrag ist noch kein abspielbarer Stream verfuegbar.");
      onPlaybackIssueRef.current?.("Fuer diesen Eintrag ist noch kein abspielbarer Stream verfuegbar.");
      return cleanup;
    }

    setError("");
    setPhase("loading");
    onPlaybackIssueRef.current?.("");
    onStatusRef.current?.(`${item?.title || "Stream"} wird vorbereitet ...`);

    const fail = (message) => {
      if (retryEnabled && retryCountRef.current < PLAYER_RETRY_LIMIT) {
        retryCountRef.current += 1;
        setPhase("buffering");
        setError(`Stream wird erneut verbunden (${retryCountRef.current}/${PLAYER_RETRY_LIMIT}) ...`);
        onPlaybackIssueRef.current?.(`Automatischer Wiederholungsversuch ${retryCountRef.current}/${PLAYER_RETRY_LIMIT}`);
        retryTimerRef.current = setTimeout(() => {
          setReloadToken((value) => value + 1);
        }, 1200 * retryCountRef.current);
        return;
      }

      setError(message);
      setPhase("error");
      onPlaybackIssueRef.current?.(message);
      onStatusRef.current?.(message);
    };

    const handleTimeUpdate = () => {
      if (!video.duration || !Number.isFinite(video.duration)) {
        return;
      }
      onProgressRef.current?.(Math.round((video.currentTime / video.duration) * 100));
    };

    const handleCanPlay = () => {
      if (playbackTimeoutRef.current) {
        clearTimeout(playbackTimeoutRef.current);
        playbackTimeoutRef.current = null;
      }
      retryCountRef.current = 0;
      setPhase("ready");
      onPlaybackIssueRef.current?.("");
      onStatusRef.current?.(`${item?.title || "Stream"} ist bereit.`);
      if (autoplay) {
        video.play().catch(() => {});
      }
    };

    const handleWaiting = () => {
      setPhase((current) => (current === "error" ? current : "buffering"));
    };

    const handlePlaying = () => {
      if (playbackTimeoutRef.current) {
        clearTimeout(playbackTimeoutRef.current);
        playbackTimeoutRef.current = null;
      }
      retryCountRef.current = 0;
      setPhase("ready");
      onPlaybackIssueRef.current?.("");
    };
    const handleError = () => fail("Das Video-Element konnte den Stream nicht abspielen.");

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("error", handleError);
    playbackTimeoutRef.current = setTimeout(() => {
      fail("Der Stream hat nicht rechtzeitig auf Wiedergabe reagiert.");
    }, PLAYBACK_TIMEOUT_MS);

    async function setupPlayback() {
      if (isHls) {
        const { default: Hls } = await import("hls.js/light");

        if (cancelled) {
          return;
        }

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90,
          });
          hls.loadSource(url);
          hls.attachMedia(video);
          hlsRef.current = hls;
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            const options = [
              { value: -1, label: "Auto" },
              ...hls.levels.map((level, index) => ({
                value: index,
                label: buildQualityLabel(level, index),
              })),
            ];
            onQualitiesChangeRef.current?.(options);
            hls.currentLevel = qualityLevel;
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data?.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                fail("Der HLS-Stream war nicht erreichbar.");
                return;
              }

              if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                fail("Der HLS-Stream konnte im Player nicht dekodiert werden.");
                return;
              }

              fail("Der HLS-Stream konnte nicht geladen werden.");
            }
          });
          return;
        }

        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          onQualitiesChangeRef.current?.([{ value: -1, label: "Auto" }]);
          video.src = url;
          video.load();
          return;
        }

        onQualitiesChangeRef.current?.([]);
        fail("Dieser Browser kann den HLS-Stream nicht direkt wiedergeben.");
        return;
      }

      if (isTs) {
        const module = await import("mpegts.js");
        const mpegts = module.default || module;

        if (cancelled) {
          return;
        }

        if (mpegts.getFeatureList?.().mseLivePlayback && mpegts.isSupported?.()) {
          const player = mpegts.createPlayer(
            {
              type: "mse",
              isLive: true,
              cors: true,
              url,
            },
            {
              enableWorker: true,
              enableStashBuffer: false,
              lazyLoad: false,
              liveBufferLatencyChasing: true,
              liveSync: true,
              liveSyncMaxLatency: 2,
              liveSyncTargetLatency: 1,
            }
          );
          mpegTsRef.current = player;
          player.on?.(mpegts.Events.ERROR, (errorType, errorDetail, errorInfo) => {
            const detailText = [errorType, errorDetail, errorInfo?.msg || errorInfo?.code || errorInfo]
              .filter(Boolean)
              .join(" | ");

            fail(detailText ? `TS-Livestream Fehler: ${detailText}` : "Der TS-Livestream konnte nicht geladen werden.");
          });
          player.attachMediaElement(video);
          player.load();
          if (autoplay) {
            player.play().catch(() => {});
          }
          onQualitiesChangeRef.current?.([{ value: -1, label: "Live" }]);
          return;
        }

        fail("Dieser Browser kann den TS-Livestream nicht direkt wiedergeben.");
        return;
      }

      onQualitiesChangeRef.current?.([]);
      video.src = url;
      video.load();
    }

    setupPlayback().catch(() => {
      fail("Die Wiedergabe konnte nicht vorbereitet werden.");
    });

    return () => {
      cancelled = true;
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("error", handleError);
      cleanup();
    };
  }, [autoplay, isHls, isPreparing, isTs, item?.title, reloadToken, retryEnabled, url]);

  return (
    <div className="playerShell">
      <div className="playerMetaRow">
        <span className="playerBadge">{connectionLabel || "Stream"}</span>
        <span className="playerState">{PLAYER_LABELS[phase] || PLAYER_LABELS.idle}</span>
      </div>
      <div className="playerWrap">
        <video ref={videoRef} controls playsInline preload="metadata" className="player" />
      </div>
      {error ? <div className="muted small">{error}</div> : null}
    </div>
  );
}

function LoginView({ onLogin }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");

  return (
    <div className="loginScreen">
      <div className="loginCard">
        <div className="badge">{APP_VERSION}</div>
        <h1>IPTV Mat Player</h1>
        <p className="muted">
          Device-Upgrade, DVR-Planer, PIN-Profile und installierbare TV-App in einer Version.
        </p>
        <input placeholder="Benutzername" value={user} onChange={(event) => setUser(event.target.value)} />
        <input placeholder="Passwort" type="password" value={pass} onChange={(event) => setPass(event.target.value)} />
        <button className="primary wide" onClick={() => user && pass && onLogin({ user, time: Date.now() })}>
          Einloggen
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="statCard">
      <div className="small muted">{label}</div>
      <div className="statValue">{value}</div>
      <div className="small muted">{hint}</div>
    </div>
  );
}

function PosterCard({ item, onClick, compact, isFavorite, isRecent }) {
  return (
    <button className={`posterCard ${compact ? "posterCardCompact" : ""}`} onClick={onClick}>
      <img src={item.cover || getFallbackCover(item)} alt={item.title} />
      <div className="posterBody">
        <div className="posterHeader">
          <span className="miniBadge">{item.badge}</span>
          <span className="posterMeta">{item.category}</span>
        </div>
        <div className="posterTitle">{item.title}</div>
        <div className="posterMeta">
          {item.year} · {item.episodeTitle || item.duration}
        </div>
        <div className="posterFlags">
          {isFavorite ? <span>Favorit</span> : null}
          {isRecent ? <span>Zuletzt</span> : null}
          {item.imported ? <span>Import</span> : <span>Demo</span>}
        </div>
        <div className="progressLine">
          <div style={{ width: `${item.progress || 0}%` }} />
        </div>
      </div>
    </button>
  );
}

function ContentColumn({
  title,
  subtitle,
  actionLabel,
  items,
  selectedId,
  watchlist,
  recentIds,
  guideDataById,
  onOpen,
  onAction,
}) {
  return (
    <section className="contentColumn">
      <div className="contentColumnHeader">
        <div>
          <div className="surfaceLabel">{title}</div>
          <h3>{subtitle}</h3>
        </div>
        <button className="secondary" onClick={onAction}>
          {actionLabel}
        </button>
      </div>
      <div className="contentColumnList">
        {items.map((item) => {
          const liveGuide = guideDataById[item.id];
          const meta =
            item.section === "live"
              ? liveGuide?.currentTitle || item.category
              : item.episodeTitle || item.duration || item.category;

          return (
            <button
              key={item.id}
              className={`contentLane ${selectedId === item.id ? "contentLaneActive" : ""}`}
              onClick={() => onOpen(item)}
            >
              <img src={item.cover || getFallbackCover(item)} alt={item.title} />
              <div className="contentLaneBody">
                <div className="contentLaneTop">
                  <strong>{item.title}</strong>
                  <span className="miniBadge">{item.badge}</span>
                </div>
                <span className="contentLaneMeta">{meta}</span>
                <div className="contentLaneFlags">
                  {watchlist.includes(item.id) ? <span>Favorit</span> : null}
                  {recentIds.includes(item.id) ? <span>Zuletzt</span> : null}
                  <span>{item.imported ? "Import" : "Demo"}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function BottomNav({ page, setPage }) {
  return (
    <nav className="bottomNav">
      {NAV_ITEMS.map(([key, label]) => (
        <button key={key} className={page === key ? "navActive" : "navBtn"} onClick={() => setPage(key)}>
          {label}
        </button>
      ))}
    </nav>
  );
}

export default function AppV39() {
  const autoGuideSignatureRef = useRef("");
  const reliabilitySignatureRef = useRef("");
  const videoElementRef = useRef(null);
  const [session, setSession] = useState(() => load("session", null));
  const [profiles, setProfiles] = useState(() => normalizeProfiles(load("profiles", DEFAULT_PROFILES_V39)));
  const [activeProfile, setActiveProfile] = useState(() => load("activeProfile", DEFAULT_PROFILES_V39[0].name));
  const [settings, setSettings] = useState(readSettings);
  const [items, setItems] = useState(() => sanitizeImportedItems(load("items", DEMO_ITEMS_V39)).items);
  const [watchlist, setWatchlist] = useState(() => load("watchlist", ["movie-1"]));
  const [bouquets, setBouquets] = useState(() => normalizeBouquets(load("bouquets", [])));
  const [activeBouquetId, setActiveBouquetId] = useState(() => load("activeBouquetId", "bouquet-main"));
  const [newBouquetName, setNewBouquetName] = useState("");
  const [recentIds, setRecentIds] = useState(() => load("recentIds", []));
  const [channelHistory, setChannelHistory] = useState(() => load("channelHistory", []));
  const [selectedId, setSelectedId] = useState(() => load("selectedId", DEMO_ITEMS_V39[0].id));
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [contentTab, setContentTab] = useState("live");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [status, setStatus] = useState("Bereit.");
  const [playerError, setPlayerError] = useState("");
  const [qualityOptions, setQualityOptions] = useState([{ value: -1, label: "Auto" }]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [auth, setAuth] = useState(() => readAuth(readSettings()));
  const [m3uTextInput, setM3uTextInput] = useState(() => load("m3uInput", load("m3uTextInput", "")));
  const [savedServers, setSavedServers] = useState(() => (Array.isArray(load("savedServers", [])) ? load("savedServers", []) : []));
  const [newServerName, setNewServerName] = useState("");
  const [importCount, setImportCount] = useState(() => load("importCount", 0));
  const [lastImportAt, setLastImportAt] = useState(() => load("lastImportAt", ""));
  const [newProfile, setNewProfile] = useState("");
  const [newProfilePin, setNewProfilePin] = useState("");
  const [pinPrompt, setPinPrompt] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [isInstalled, setIsInstalled] = useState(false);
  const [page, setPage] = useState("home");
  const [isResolvingSeries, setIsResolvingSeries] = useState(false);
  const [isPreparingPlayback, setIsPreparingPlayback] = useState(true);
  const [resolvedPlaybackUrl, setResolvedPlaybackUrl] = useState("");
  const [categoryMaps, setCategoryMaps] = useState(() => load("categoryMaps", { live: {}, movie: {}, series: {} }));
  const [guideDataById, setGuideDataById] = useState(() => load("guideDataById", {}));
  const [lastGuideSyncAt, setLastGuideSyncAt] = useState(() => load("lastGuideSyncAt", ""));
  const [recordings, setRecordings] = useState(() => load("recordings", []));
  const [reliabilityResults, setReliabilityResults] = useState(() => load("reliabilityResults", []));
  const [lastReliabilityRunAt, setLastReliabilityRunAt] = useState(() => load("lastReliabilityRunAt", ""));

  const selected = items.find((item) => item.id === selectedId) || items[0] || null;
  const currentProfile = useMemo(
    () => normalizeProfiles(profiles).find((profile) => profile.name === activeProfile) || normalizeProfiles(profiles)[0],
    [activeProfile, profiles]
  );
  const selectedSourceLabel = useMemo(
    () => getSourceLabel(selected?.sourceType, selected?.imported),
    [selected?.imported, selected?.sourceType]
  );
  const playbackUrl = resolvedPlaybackUrl;
  const isSelectedHls = useMemo(
    () => Boolean(selected && (isLikelyHlsUrl(playbackUrl, selected) || isLikelyHlsUrl(selected.streamUrl, selected))),
    [playbackUrl, selected]
  );
  const isSelectedTs = useMemo(() => {
    if (!selected) {
      return false;
    }

    const itemExt = String(selected.streamExt || "").toLowerCase();
    const raw = `${String(playbackUrl || "")} ${String(selected.streamUrl || "")}`.toLowerCase();
    return itemExt === "ts" || raw.includes(".ts") || raw.includes("output=ts");
  }, [playbackUrl, selected]);
  const connectionLabel = useMemo(
    () => describeConnectionMode(selected, settings.connectionMode),
    [selected, settings.connectionMode]
  );

  const sectionItems = useMemo(
    () => items.filter((item) => contentTab === "all" || item.section === contentTab),
    [contentTab, items]
  );
  const activeBouquet = useMemo(
    () => bouquets.find((bouquet) => bouquet.id === activeBouquetId) || bouquets[0] || null,
    [activeBouquetId, bouquets]
  );

  const categoryOptions = useMemo(() => getCategoryOptions(sectionItems), [sectionItems]);

  useEffect(() => {
    if (!categoryOptions.includes(categoryFilter)) {
      setCategoryFilter("all");
    }
  }, [categoryFilter, categoryOptions]);

  const filtered = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const base = sectionItems.filter((item) => {
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
      const matchesAdultFilter = settings.adultFilter ? item.rating !== "16+" : true;
      const matchesKidsMode = currentProfile?.kidsMode ? !["16+", "18+"].includes(item.rating) : true;
      const matchesBouquet =
        contentTab !== "live" || !activeBouquet || !activeBouquet.itemIds.length || activeBouquet.itemIds.includes(item.id);
      const matchesQuery =
        !query ||
        item.title.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query);

      return matchesCategory && matchesAdultFilter && matchesKidsMode && matchesBouquet && matchesQuery;
    });

    return sortLibraryItems(base, settings.sortMode, recentIds);
  }, [activeBouquet, categoryFilter, contentTab, currentProfile, deferredSearch, recentIds, sectionItems, settings.adultFilter, settings.sortMode]);

  const liveItems = useMemo(() => items.filter((item) => item.section === "live"), [items]);
  const movieItems = useMemo(() => items.filter((item) => item.section === "movie"), [items]);
  const seriesItems = useMemo(() => items.filter((item) => item.section === "series"), [items]);
  const importedItems = useMemo(() => items.filter((item) => item.imported), [items]);
  const continueWatching = useMemo(
    () =>
      [...items]
        .filter((item) => (item.progress || 0) > 0)
        .sort((a, b) => (b.progress || 0) - (a.progress || 0))
        .slice(0, 6),
    [items]
  );
  const watchlistItems = useMemo(() => items.filter((item) => watchlist.includes(item.id)), [items, watchlist]);
  const recentItems = useMemo(
    () => recentIds.map((id) => items.find((item) => item.id === id)).filter(Boolean).slice(0, 8),
    [items, recentIds]
  );
  const channelHistoryItems = useMemo(
    () => channelHistory.map((id) => items.find((item) => item.id === id)).filter(Boolean).slice(0, 8),
    [channelHistory, items]
  );
  const liveFavorites = watchlistItems.filter((item) => item.section === "live");
  const movieFavorites = watchlistItems.filter((item) => item.section === "movie");
  const seriesFavorites = watchlistItems.filter((item) => item.section === "series");
  const bouquetItems = useMemo(
    () => (activeBouquet?.itemIds || []).map((id) => items.find((item) => item.id === id)).filter(Boolean),
    [activeBouquet, items]
  );
  const guideRows = useMemo(
    () => buildGuideRows(liveItems, settings.guideFocus, contentTab === "live" ? categoryFilter : "all", guideDataById),
    [categoryFilter, contentTab, guideDataById, liveItems, settings.guideFocus]
  );
  const selectedGuide = useMemo(() => (selected ? guideDataById[selected.id] || null : null), [guideDataById, selected]);
  const liveChannelRail = useMemo(() => safeTop(liveItems, 12), [liveItems]);
  const liveHighlights = useMemo(() => safeTop(liveItems, 5), [liveItems]);
  const movieHighlights = useMemo(
    () => safeTop(sortLibraryItems(movieItems, settings.sortMode, recentIds), 5),
    [movieItems, recentIds, settings.sortMode]
  );
  const seriesHighlights = useMemo(
    () => safeTop(sortLibraryItems(seriesItems, settings.sortMode, recentIds), 5),
    [recentIds, seriesItems, settings.sortMode]
  );
  const securityNotes = useMemo(
    () => createSecurityNotes(settings, savedServers),
    [savedServers, settings]
  );
  const loadedCategoryCount = useMemo(
    () => Object.values(categoryMaps.live || {}).length + Object.values(categoryMaps.movie || {}).length + Object.values(categoryMaps.series || {}).length,
    [categoryMaps]
  );
  const importedCategoryCount = useMemo(
    () => new Set(importedItems.map((item) => String(item.category || "").trim()).filter(Boolean)).size,
    [importedItems]
  );
  const profileWatchTotals = useMemo(
    () =>
      profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        kidsMode: profile.kidsMode,
        pin: profile.pin,
        favorites:
          watchlistItems.filter((item) => (profile.kidsMode ? !["16+", "18+"].includes(item.rating) : true)).length,
        recent:
          recentItems.filter((item) => (profile.kidsMode ? !["16+", "18+"].includes(item.rating) : true)).length,
      })),
    [profiles, recentItems, watchlistItems]
  );
  const reliabilityTone = useMemo(() => getReliabilityTone(reliabilityResults), [reliabilityResults]);

  function persistSettings(nextSettings) {
    persistState("settings", nextSettings, setSettings);
  }

  function persistAuth(nextAuth) {
    const storedAuth = {
      sourceType: nextAuth.sourceType || "xtream",
      server: nextAuth.server,
      username: nextAuth.username,
      password: settings.rememberCredentials ? nextAuth.password : "",
      m3uUrl: nextAuth.m3uUrl,
      portalUrl: nextAuth.portalUrl,
      macAddress: nextAuth.macAddress,
      epgUrl: nextAuth.epgUrl,
    };
    save("auth", storedAuth);
    setAuth(nextAuth);
  }

  function persistM3uInput(value) {
    setM3uTextInput(value);
    save("m3uInput", value);
  }

  function applyImportedM3u(itemsToImport, sourceLabel, detectedEpgUrl = "", mode = "replace") {
    const nextEpgUrl = detectedEpgUrl || auth.epgUrl || "";
    const mapped = safeTop(itemsToImport || [], 400).map((item) => ({
      ...item,
      cover: item.cover || getFallbackCover(item),
      epgSourceUrl: nextEpgUrl,
      importedAt: Date.now(),
    }));
    const nextItems = mode === "merge" ? [...items, ...mapped] : mapped;

    if (nextEpgUrl && nextEpgUrl !== auth.epgUrl) {
      persistAuth({ ...auth, epgUrl: nextEpgUrl });
    }

    applyImportedLibrary(
      nextItems,
      mode === "merge"
        ? `${buildImportSummary(sourceLabel, mapped.length)} Bibliothek wurde um M3U-Eintraege erweitert.`
        : buildImportSummary(sourceLabel, mapped.length),
      { live: {}, movie: {}, series: {} }
    );
  }

  function touchRecent(id) {
    const nextRecentIds = [id, ...recentIds.filter((entry) => entry !== id)].slice(0, 12);
    persistState("recentIds", nextRecentIds, setRecentIds);
  }

  function toggleFavorite(id) {
    const nextWatchlist = toggleEntry(watchlist, id);
    persistState("watchlist", nextWatchlist, setWatchlist);
  }

  function toggleBouquetItem(bouquetId, itemId) {
    const nextBouquets = bouquets.map((bouquet) =>
      bouquet.id === bouquetId
        ? { ...bouquet, itemIds: toggleEntry(bouquet.itemIds, itemId) }
        : bouquet
    );
    persistState("bouquets", nextBouquets, setBouquets);
  }

  function addBouquet() {
    const name = newBouquetName.trim();

    if (!name) {
      return;
    }

    const nextBouquet = {
      id: `bouquet-${Date.now()}`,
      name,
      itemIds: selected?.section === "live" ? [selected.id] : [],
    };
    const nextBouquets = [...bouquets, nextBouquet];
    persistState("bouquets", nextBouquets, setBouquets);
    persistState("activeBouquetId", nextBouquet.id, setActiveBouquetId);
    setNewBouquetName("");
    setStatus(`Bouquet erstellt: ${name}`);
  }

  function removeBouquet(bouquetId) {
    const nextBouquets = bouquets.filter((bouquet) => bouquet.id !== bouquetId);
    persistState("bouquets", nextBouquets, setBouquets);
    const fallbackId = nextBouquets[0]?.id || "bouquet-main";
    persistState("activeBouquetId", fallbackId, setActiveBouquetId);
  }

  function updateProfiles(nextProfiles, nextStatus = "") {
    const normalized = normalizeProfiles(nextProfiles);
    persistState("profiles", normalized, setProfiles);
    if (nextStatus) {
      setStatus(nextStatus);
    }
  }

  function updateActiveProfilePatch(patch) {
    const nextProfiles = profiles.map((profile) =>
      profile.name === currentProfile?.name ? normalizeProfile({ ...profile, ...patch }) : profile
    );
    updateProfiles(nextProfiles, `Profil aktualisiert: ${currentProfile?.name}`);
  }

  function activateProfile(profileName) {
    persistState("activeProfile", profileName, setActiveProfile);
    setPinPrompt(null);
    setPinInput("");
    const profile = normalizeProfiles(profiles).find((entry) => entry.name === profileName);
    if (profile?.kidsMode) {
      persistSettings({ ...settings, adultFilter: true });
    }
    setStatus(`Profil aktiv: ${profileName}`);
  }

  function requestProfileChange(profile) {
    if (profile.name === activeProfile) {
      return;
    }

    if (profile.pin) {
      setPinPrompt(profile);
      setPinInput("");
      return;
    }

    activateProfile(profile.name);
  }

  function confirmProfilePin() {
    if (!pinPrompt) {
      return;
    }

    if (pinInput === pinPrompt.pin) {
      activateProfile(pinPrompt.name);
      return;
    }

    setStatus("PIN falsch. Bitte erneut pruefen.");
  }

  function trackChannelHistory(item) {
    if (!item || item.section !== "live") {
      return;
    }

    const nextHistory = [item.id, ...channelHistory.filter((entry) => entry !== item.id)].slice(0, 10);
    persistState("channelHistory", nextHistory, setChannelHistory);
  }

  function requireAuthFields() {
    if (auth.sourceType === "m3u") {
      const m3uInput = m3uTextInput.trim();

      if (!m3uInput) {
        return "Bitte eine M3U-URL oder eine komplette M3U-Liste einfuegen.";
      }

      if (isManualM3uInput(m3uInput)) {
        return "";
      }

      return isValidHttpUrl(m3uInput) ? "" : "Bitte eine gueltige M3U-URL oder eine komplette M3U-Liste verwenden.";
    }

    if (auth.sourceType === "stbemu") {
      if (!auth.portalUrl) {
        return "Bitte die Portal-URL fuer STBEmu eintragen.";
      }

      if (!isValidHttpUrl(auth.portalUrl)) {
        return "Bitte eine gueltige Portal-URL mit http oder https verwenden.";
      }

      if (!auth.macAddress) {
        return "Bitte die MAC-Adresse fuer STBEmu eintragen.";
      }

      return "";
    }

    if (!auth.server || !auth.username || !auth.password) {
      return "Bitte Server, Benutzername und Passwort ausfuellen.";
    }

    if (!isValidHttpUrl(auth.server)) {
      return "Bitte eine gueltige Server-URL mit http oder https verwenden.";
    }

    return "";
  }

  function applyImportedLibrary(mapped, nextStatus, nextCategoryMaps = { live: {}, movie: {}, series: {} }) {
    const { items: cleanedItems, invalidCount, duplicateCount } = sanitizeImportedItems(mapped);

    if (!cleanedItems.length) {
      throw new Error("Keine Eintraege gefunden.");
    }

    const nextSelected =
      cleanedItems.find((entry) => entry.section === "live" || entry.section === "movie") || cleanedItems[0];
    const timestamp = new Date().toLocaleString("de-DE");
    const finalStatus =
      nextStatus ||
      buildImportSummary("Eintraege", cleanedItems.length, invalidCount, duplicateCount);

    startTransition(() => {
      persistState("categoryMaps", nextCategoryMaps, setCategoryMaps);
      persistState("guideDataById", {}, setGuideDataById);
      persistState("items", cleanedItems, setItems);
      persistState("selectedId", nextSelected.id, setSelectedId);
      persistState("importCount", cleanedItems.length, setImportCount);
      persistState("lastImportAt", timestamp, setLastImportAt);
      persistState("lastGuideSyncAt", "", setLastGuideSyncAt);
    });

    touchRecent(nextSelected.id);
    setIsPreparingPlayback(true);
    setResolvedPlaybackUrl("");
    setCategoryFilter("all");
    setPage("home");
    setStatus(
      invalidCount || duplicateCount
        ? `${finalStatus} Stabilitaetspruefung abgeschlossen.`
        : finalStatus
    );
  }

  async function postJson(endpoint, payload) {
    return fetchJsonWithTimeout(buildAppApiUrl(endpoint), {
      method: "POST",
      timeoutMs: endpoint === "/api/m3u" ? 45000 : 20000,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  function persistGuideState(nextGuideData, syncLabel = "") {
    persistState("guideDataById", nextGuideData, setGuideDataById);

    if (syncLabel) {
      persistState("lastGuideSyncAt", syncLabel, setLastGuideSyncAt);
    }
  }

  function updateItemHealth(itemId, health, healthMessage = "") {
    if (!itemId) {
      return;
    }

    const nextItems = items.map((entry) => (
      entry.id === itemId
        ? { ...entry, health, healthMessage, lastCheckedAt: Date.now() }
        : entry
    ));

    persistState("items", nextItems, setItems);
  }

  function runReliabilityChecks() {
    const results = createReliabilityChecks({
      items,
      importedItems,
      liveItems,
      movieItems,
      seriesItems,
      guideDataById,
      savedServers,
      selected,
      playbackUrl,
      playerError,
      isPreparingPlayback,
      isOnline,
      recordings,
      profiles,
    });
    const timestamp = new Date().toLocaleString("de-DE");
    reliabilitySignatureRef.current = JSON.stringify(results);
    persistState("reliabilityResults", results, setReliabilityResults);
    persistState("lastReliabilityRunAt", timestamp, setLastReliabilityRunAt);
    setStatus(`Reliability Tests abgeschlossen: ${getReliabilityTone(results)}`);
  }

  async function loadXmltvGuideData(sourceItems, epgUrl) {
    const liveSource = safeTop(sourceItems.filter((item) => item.section === "live"), 40);
    const queries = buildGuideQueries(liveSource);

    if (!epgUrl || !queries.length) {
      return {};
    }

    const payload = await postJson("/api/epg", {
      url: epgUrl,
      queries,
      maxProgramsPerItem: 3,
      hoursForward: 18,
    });

    return buildGuideDataFromXmltv(payload?.matches || {});
  }

  async function loadXtreamGuideData(sourceItems) {
    const liveSource = safeTop(
      sourceItems.filter((item) => item.section === "live" && item.sourceType === "xtream" && item.streamId),
      12
    );

    if (!liveSource.length) {
      return {};
    }

    const guideEntries = await Promise.all(
      liveSource.map(async (item) => {
        try {
          const payload = await fetchXtreamJson({
            server: item.server,
            username: item.username,
            password: item.password,
            action: "get_short_epg",
            params: {
              stream_id: item.streamId,
              limit: 3,
            },
            mode: settings.connectionMode,
          });

          return [item.id, buildGuideDataFromXtream(payload)];
        } catch {
          return [item.id, null];
        }
      })
    );

    return guideEntries.reduce((accumulator, [itemId, guide]) => {
      if (guide?.current || guide?.next) {
        accumulator[itemId] = guide;
      }
      return accumulator;
    }, {});
  }

  async function syncGuideData(options = {}) {
    const {
      itemsOverride = items,
      authOverride = auth,
      auto = false,
      preferredEpgUrl = "",
    } = options;
    const liveSource = itemsOverride.filter((item) => item.section === "live");

    if (!liveSource.length) {
      return {};
    }

    const epgUrl =
      preferredEpgUrl ||
      authOverride.epgUrl ||
      liveSource.find((item) => item.epgSourceUrl)?.epgSourceUrl ||
      "";

    try {
      if (!auto) {
        setStatus("Guide-Daten werden synchronisiert ...");
      }

      let nextGuideData = {};

      if (epgUrl) {
        nextGuideData = await loadXmltvGuideData(liveSource, epgUrl);
      }

      if (!Object.keys(nextGuideData).length && liveSource.some((item) => item.sourceType === "xtream")) {
        nextGuideData = await loadXtreamGuideData(liveSource);
      }

      if (Object.keys(nextGuideData).length) {
        const syncLabel = new Date().toLocaleString("de-DE");
        persistGuideState(nextGuideData, syncLabel);
        if (!auto) {
          setStatus(`Guide synchronisiert: ${Object.keys(nextGuideData).length} Kanaele aktualisiert.`);
        }
      } else if (!auto) {
        setStatus("Kein Guide verfuegbar. Hinterlege eine XMLTV-URL oder nutze Xtream mit EPG.");
      }

      return nextGuideData;
    } catch (error) {
      if (!auto) {
        setStatus(error?.message || "Guide konnte nicht geladen werden.");
      }
      return {};
    }
  }

  function handleProgress(percent) {
    if (!settings.autosave || !selected || selected.section === "live") {
      return;
    }

    const nextItems = items.map((item) =>
      item.id === selected.id
        ? { ...item, progress: Math.max(item.progress || 0, percent), lastWatchedAt: Date.now() }
        : item
    );

    persistState("items", nextItems, setItems);
  }

  async function ensureSeriesEpisode(itemId) {
    const item = items.find((entry) => entry.id === itemId);

    if (!item || item.section !== "series" || item.streamId || !item.seriesId || isResolvingSeries) {
      return;
    }

    setIsResolvingSeries(true);
    setStatus("Erste Serien-Episode wird nachgeladen ...");

    try {
      const payload = await fetchXtreamJson({
        server: item.server,
        username: item.username,
        password: item.password,
        action: "get_series_info",
        params: { series_id: item.seriesId },
        mode: settings.connectionMode,
      });
      const episode = pickFirstSeriesEpisode(payload);

      if (!episode) {
        throw new Error("Keine Episode in den Serien-Daten gefunden.");
      }

      const nextItems = items.map((entry) =>
        entry.id === itemId
          ? {
              ...entry,
              streamId: episode.episodeId,
              streamExt: episode.extension,
              episodeTitle: episode.title,
              duration: episode.title,
              pendingEpisodeLookup: false,
            }
          : entry
      );

      startTransition(() => {
        persistState("items", nextItems, setItems);
      });
      setStatus(`Serie bereit: ${episode.title}`);
    } catch (error) {
      setStatus(explainNetworkError(error, settings.connectionMode));
    } finally {
      setIsResolvingSeries(false);
    }
  }

  async function openItem(item, nextPage = "details") {
    persistState("selectedId", item.id, setSelectedId);
    touchRecent(item.id);
    trackChannelHistory(item);
    setPage(nextPage);
    setIsPreparingPlayback(true);
    setPlayerError("");
    setSelectedQuality(-1);
    setQualityOptions([{ value: -1, label: "Auto" }]);
    setResolvedPlaybackUrl("");

    if (item.section === "series" && item.imported && item.sourceType === "xtream" && !item.streamId) {
      await ensureSeriesEpisode(item.id);
    }
  }

  function moveLiveSelection(direction) {
    if (!selected || selected.section !== "live" || liveItems.length < 2) {
      return;
    }

    const currentIndex = liveItems.findIndex((item) => item.id === selected.id);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + liveItems.length) % liveItems.length;
    const nextItem = liveItems[nextIndex];

    if (nextItem) {
      openItem(nextItem, page === "details" ? "details" : "home").catch(() => {});
    }
  }

  function requestFullscreen() {
    const target = videoElementRef.current;

    if (target?.requestFullscreen) {
      target.requestFullscreen().catch(() => {
        setStatus("Vollbild konnte nicht gestartet werden.");
      });
    }
  }

  async function installApp() {
    if (!installPromptEvent) {
      setStatus("Die Installation ist auf diesem Geraet aktuell nicht verfuegbar.");
      return;
    }

    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;

    if (choice?.outcome === "accepted") {
      setIsInstalled(true);
      setInstallPromptEvent(null);
      setStatus("App-Installation gestartet.");
    }
  }

  function seekTimeshift(offsetSeconds) {
    const target = videoElementRef.current;

    if (!target || !Number.isFinite(target.currentTime)) {
      return;
    }

    const nextTime = Math.max(0, target.currentTime + offsetSeconds);
    target.currentTime = nextTime;
  }

  function jumpToLiveEdge() {
    const target = videoElementRef.current;
    const seekable = target?.seekable;

    if (!target || !seekable || !seekable.length) {
      return;
    }

    target.currentTime = seekable.end(seekable.length - 1) - 0.5;
  }

  function scheduleRecording(item = selected) {
    if (!item) {
      return;
    }

    const minutes = Number(settings.preferredRecordingMinutes || 60);
    const now = Date.now();
    const nextRecording = {
      id: `recording-${now}`,
      itemId: item.id,
      title: item.title,
      sourceType: item.sourceType || "demo",
      startsAt: new Date(now).toLocaleString("de-DE"),
      durationMinutes: minutes,
      status: "geplant",
    };
    const nextRecordings = [nextRecording, ...recordings].slice(0, 20);
    persistState("recordings", nextRecordings, setRecordings);
    setStatus(`Aufnahme vorgemerkt: ${item.title} fuer ${minutes} Minuten.`);
  }

  function removeRecording(recordingId) {
    const nextRecordings = recordings.filter((entry) => entry.id !== recordingId);
    persistState("recordings", nextRecordings, setRecordings);
  }

  async function resolveStbStream(item) {
    if (!item?.stbCmd) {
      throw new Error("Dieser STBEmu-Kanal liefert keinen gueltigen Portal-Befehl.");
    }

    const isFresh =
      item?.streamUrl && item?.resolvedAt && Date.now() - Number(item.resolvedAt) < STB_STREAM_CACHE_MS;

    if (isFresh) {
      return item.streamUrl;
    }

    const payload = await postJson("/api/stb", {
      mode: "resolve",
      portalUrl: item.portalUrl,
      macAddress: item.macAddress,
      cmd: item.stbCmd,
    });

    if (!payload?.streamUrl) {
      throw new Error("STBEmu hat keine abspielbare Stream-URL geliefert.");
    }

    const nextItems = items.map((entry) =>
      entry.id === item.id
        ? {
            ...entry,
            streamUrl: payload.streamUrl,
            streamExt: String(payload.streamUrl || "").toLowerCase().includes(".m3u8")
              ? "m3u8"
              : String(payload.streamUrl || "").toLowerCase().includes(".mp4")
                ? "mp4"
                : entry.streamExt,
            resolvedAt: Date.now(),
          }
        : entry
    );

    startTransition(() => {
      persistState("items", nextItems, setItems);
    });

    return payload.streamUrl;
  }

  useEffect(() => {
    let cancelled = false;

    if (!selected) {
      setResolvedPlaybackUrl("");
      return undefined;
    }

    async function preparePlayback() {
      setIsPreparingPlayback(true);

      try {
        let nextItem = selected;

        if (nextItem.sourceType === "stbemu") {
          setStatus(`STBEmu-Link wird fuer ${nextItem.title} vorbereitet ...`);
          const streamUrl = await resolveStbStream(nextItem);

          if (cancelled) {
            return;
          }

          nextItem = { ...nextItem, streamUrl };
        }

        const nextUrl = resolvePlaybackUrl(nextItem, settings.connectionMode);

        if (cancelled) {
          return;
        }

        setResolvedPlaybackUrl(nextUrl);

        if (!nextUrl && nextItem.section === "series" && nextItem.imported && nextItem.sourceType === "xtream") {
          setStatus("Diese Serie braucht zuerst eine Episode. Tippe auf 'Episode laden'.");
        }
      } catch (error) {
        if (!cancelled) {
          setResolvedPlaybackUrl("");
          setStatus(error?.message || explainNetworkError(error, settings.connectionMode));
        }
      } finally {
        if (!cancelled) {
          setIsPreparingPlayback(false);
        }
      }
    }

    preparePlayback();

    return () => {
      cancelled = true;
    };
  }, [
    selected?.id,
    selected?.sourceType,
    selected?.streamId,
    selected?.streamUrl,
    selected?.resolvedAt,
    selected?.portalUrl,
    selected?.macAddress,
    selected?.stbCmd,
    selected?.section,
    selected?.imported,
    settings.connectionMode,
  ]);

  useEffect(() => {
    if (!settings.autoGuide) {
      return;
    }

    const importedLive = safeTop(liveItems.filter((item) => item.imported), 20);

    if (!importedLive.length) {
      return;
    }

    const signature = `${auth.epgUrl}|${lastImportAt}|${importedLive.map((item) => item.id).join(",")}`;

    if (autoGuideSignatureRef.current === signature) {
      return;
    }

    const needsGuideSync = importedLive.some((item) => !guideDataById[item.id]);

    if (!needsGuideSync) {
      return;
    }

    autoGuideSignatureRef.current = signature;
    syncGuideData({ auto: true }).catch(() => {});
  }, [auth.epgUrl, guideDataById, lastImportAt, liveItems, settings.autoGuide]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (page !== "home" && page !== "details") {
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveLiveSelection(-1);
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveLiveSelection(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [liveItems, page, selected]);

  useEffect(() => {
    if (!currentProfile?.kidsMode || !selected || !["16+", "18+"].includes(selected.rating)) {
      return;
    }

    const safeItem = items.find((item) => !["16+", "18+"].includes(item.rating)) || DEMO_ITEMS_V39[0];
    if (safeItem && safeItem.id !== selected.id) {
      openItem(safeItem, page).catch(() => {});
      setStatus("Kids-Schutz aktiv. Nicht jugendfreie Inhalte wurden ausgeblendet.");
    }
  }, [currentProfile, items, page, selected]);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPromptEvent(event);
    }

    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator?.standalone === true;
    setIsInstalled(Boolean(isStandalone));

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!selected?.id) {
      return;
    }

    if (playerError) {
      if (selected.health !== "issue" || selected.healthMessage !== playerError) {
        updateItemHealth(selected.id, "issue", playerError);
      }
      return;
    }

    if (!isPreparingPlayback && playbackUrl && selected.health !== "ready") {
      updateItemHealth(selected.id, "ready", "");
    }
  }, [isPreparingPlayback, playbackUrl, playerError, selected]);

  useEffect(() => {
    const results = createReliabilityChecks({
      items,
      importedItems,
      liveItems,
      movieItems,
      seriesItems,
      guideDataById,
      savedServers,
      selected,
      playbackUrl,
      playerError,
      isPreparingPlayback,
      isOnline,
      recordings,
      profiles,
    });
    const nextSignature = JSON.stringify(results);

    if (reliabilitySignatureRef.current === nextSignature) {
      return;
    }

    reliabilitySignatureRef.current = nextSignature;
    persistState("reliabilityResults", results, setReliabilityResults);
  }, [
    guideDataById,
    importedItems,
    isOnline,
    isPreparingPlayback,
    items,
    liveItems,
    movieItems,
    playbackUrl,
    playerError,
    profiles,
    recordings,
    savedServers,
    selected,
    seriesItems,
  ]);

  async function handleImport(authOverride = auth, m3uInputOverride = m3uTextInput) {
    const currentAuth = authOverride || auth;
    const currentM3uInput = String(m3uInputOverride || "").trim();
    const validationMessage =
      currentAuth.sourceType === "m3u"
        ? !currentM3uInput
          ? "Bitte eine M3U-URL oder eine komplette M3U-Liste einfuegen."
          : isManualM3uInput(currentM3uInput) || isValidHttpUrl(currentM3uInput)
            ? ""
            : "Bitte eine gueltige M3U-URL oder eine komplette M3U-Liste verwenden."
        : requireAuthFields();

    if (validationMessage) {
      setStatus(validationMessage);
      return;
    }

    try {
      if (currentAuth.sourceType === "m3u") {
        if (isManualM3uInput(currentM3uInput)) {
          setStatus("Manuelle M3U wird geladen ...");
          const parsed = createM3uItemsFromText(currentM3uInput);

          if (!parsed.items.length) {
            throw new Error("Keine M3U-Eintraege in der eingefuegten Liste gefunden.");
          }

          applyImportedM3u(parsed.items, "M3U-Eintraege", parsed.meta?.epgUrl || "");
          return;
        }

        setStatus("M3U wird geladen ...");

        const payload = await postJson("/api/m3u", {
          url: currentM3uInput,
        });
        const detectedEpgUrl = payload?.meta?.epgUrl || currentAuth.epgUrl || "";
        const mapped = safeTop(payload?.items || [], 200).map((item) => ({
          ...item,
          cover: item.cover || getFallbackCover(item),
          epgSourceUrl: detectedEpgUrl,
          importedAt: Date.now(),
        }));

        if (detectedEpgUrl !== currentAuth.epgUrl) {
          persistAuth({ ...currentAuth, m3uUrl: currentM3uInput, epgUrl: detectedEpgUrl });
        }

        applyImportedLibrary(
          mapped,
          buildImportSummary("M3U-Eintraege", mapped.length, payload?.meta?.invalidCount || 0, payload?.meta?.duplicateCount || 0),
          { live: {}, movie: {}, series: {} }
        );
        return;
      }

      if (currentAuth.sourceType === "stbemu") {
        setStatus("STBEmu-Portal wird geladen ...");

        const payload = await postJson("/api/stb", {
          mode: "import",
          portalUrl: currentAuth.portalUrl,
          macAddress: currentAuth.macAddress,
        });
        const mapped = safeTop(payload?.items || [], 160).map((item) => ({
          ...item,
          cover: item.cover || getFallbackCover(item),
          epgSourceUrl: currentAuth.epgUrl || "",
          importedAt: Date.now(),
        }));

        applyImportedLibrary(
          mapped,
          buildImportSummary("STBEmu-Kanaele", mapped.length),
          { live: {}, movie: {}, series: {} }
        );
        return;
      }

      setStatus("Xtream-Daten werden geladen ...");

      const [live, vod, series, liveCategories, movieCategories, seriesCategories] = await Promise.all([
        fetchXtreamJson({
          server: currentAuth.server,
          username: currentAuth.username,
          password: currentAuth.password,
          action: "get_live_streams",
          mode: settings.connectionMode,
        }),
        fetchXtreamJson({
          server: currentAuth.server,
          username: currentAuth.username,
          password: currentAuth.password,
          action: "get_vod_streams",
          mode: settings.connectionMode,
        }),
        fetchXtreamJson({
          server: currentAuth.server,
          username: currentAuth.username,
          password: currentAuth.password,
          action: "get_series",
          mode: settings.connectionMode,
        }),
        fetchXtreamJson({
          server: currentAuth.server,
          username: currentAuth.username,
          password: currentAuth.password,
          action: CATEGORY_ACTIONS.live,
          mode: settings.connectionMode,
        }),
        fetchXtreamJson({
          server: currentAuth.server,
          username: currentAuth.username,
          password: currentAuth.password,
          action: CATEGORY_ACTIONS.movie,
          mode: settings.connectionMode,
        }),
        fetchXtreamJson({
          server: currentAuth.server,
          username: currentAuth.username,
          password: currentAuth.password,
          action: CATEGORY_ACTIONS.series,
          mode: settings.connectionMode,
        }),
      ]);

      const nextCategoryMaps = {
        live: toCategoryMap(liveCategories),
        movie: toCategoryMap(movieCategories),
        series: toCategoryMap(seriesCategories),
      };

      const mapped = [
        ...safeTop(live, 80).map((entry, index) =>
          createImportedItem("live", entry, index, currentAuth, nextCategoryMaps, DEMO_ITEMS_V39[0].cover)
        ),
        ...safeTop(vod, 80).map((entry, index) =>
          createImportedItem("movie", entry, index, currentAuth, nextCategoryMaps, DEMO_ITEMS_V39[2].cover)
        ),
        ...safeTop(series, 80).map((entry, index) =>
          createImportedItem("series", entry, index, currentAuth, nextCategoryMaps, DEMO_ITEMS_V39[4].cover)
        ),
      ].map((item) => ({
        ...item,
        epgSourceUrl: currentAuth.epgUrl || item.epgSourceUrl || "",
      }));

      applyImportedLibrary(
        mapped,
        buildImportSummary("Xtream-Eintraege", mapped.length),
        nextCategoryMaps
      );
    } catch (error) {
      setStatus(error?.message || explainNetworkError(error, settings.connectionMode));
    }
  }

  function handleMergeM3uText() {
    try {
      const m3uInput = m3uTextInput.trim();

      if (!isManualM3uInput(m3uInput)) {
        setStatus("Zum Ergaenzen bitte eine komplette M3U-Liste einfuegen.");
        return;
      }

      setStatus("Manuelle M3U wird zur Bibliothek hinzugefuegt ...");
      save("m3uInput", m3uInput);
      const parsed = createM3uItemsFromText(m3uInput);

      if (!parsed.items.length) {
        throw new Error("Keine M3U-Eintraege in der eingefuegten Liste gefunden.");
      }

      applyImportedM3u(parsed.items, "M3U-Eintraege", parsed.meta?.epgUrl || "", "merge");
    } catch (error) {
      setStatus(error?.message || "M3U konnte nicht ergaenzt werden.");
    }
  }

  async function handleImportM3uFile(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setStatus(`Datei wird gelesen: ${file.name}`);
      const text = await file.text();
      persistM3uInput(text);
      const parsed = createM3uItemsFromText(text, `m3u-file://${file.name}`);

      if (!parsed.items.length) {
        throw new Error("Keine M3U-Eintraege in der Datei gefunden.");
      }

      applyImportedM3u(parsed.items, "M3U-Datei", parsed.meta?.epgUrl || "");
    } catch (error) {
      setStatus(error?.message || "M3U-Datei konnte nicht importiert werden.");
    } finally {
      event.target.value = "";
    }
  }

  function handleSaveServer() {
    const identifier =
      auth.sourceType === "m3u"
        ? (isValidHttpUrl(m3uTextInput.trim()) ? m3uTextInput.trim() : "Manuelle M3U-Liste")
        : auth.sourceType === "stbemu"
          ? auth.portalUrl
          : auth.server;
    const trimmedName = newServerName.trim() || String(identifier || "").trim();
    const validationMessage = requireAuthFields();

    if (!trimmedName || validationMessage) {
      setStatus(validationMessage || "Bitte Name und Verbindungsdaten fuer ein Serverprofil angeben.");
      return;
    }

    const nextServers = [
      {
        id: `server-${Date.now()}`,
        name: trimmedName,
        sourceType: auth.sourceType,
        server: auth.server,
        username: auth.username,
        password: settings.savePasswords ? auth.password : "",
        m3uUrl: isValidHttpUrl(m3uTextInput.trim()) ? m3uTextInput.trim() : "",
        portalUrl: auth.portalUrl,
        macAddress: auth.macAddress,
        epgUrl: auth.epgUrl,
        savedAt: new Date().toLocaleString("de-DE"),
      },
      ...savedServers,
    ].slice(0, 8);

    persistState("savedServers", nextServers, setSavedServers);
    setNewServerName("");
    setStatus(`Serverprofil gespeichert: ${trimmedName}`);
  }

  async function applySavedServer(server) {
    const nextAuth = {
      sourceType: server.sourceType || "xtream",
      server: server.server || "",
      username: server.username || "",
      password: server.password || "",
      m3uUrl: server.m3uUrl || "",
      portalUrl: server.portalUrl || "",
      macAddress: server.macAddress || "",
      epgUrl: server.epgUrl || "",
    };
    persistAuth(nextAuth);
    persistM3uInput(server.sourceType === "m3u" ? server.m3uUrl || "" : "");
    setStatus(`Serverprofil wird geladen: ${server.name}`);
    await handleImport(nextAuth, server.sourceType === "m3u" ? server.m3uUrl || "" : "");
  }

  function removeSavedServer(serverId) {
    const nextServers = savedServers.filter((server) => server.id !== serverId);
    persistState("savedServers", nextServers, setSavedServers);
  }

  function addProfile() {
    const name = newProfile.trim();

    if (!name) {
      return;
    }

    const nextProfiles = [
      ...profiles,
      normalizeProfile({
        id: `profile-${Date.now()}`,
        name,
        emoji: "New",
        pin: newProfilePin.trim(),
        kidsMode: false,
      }),
    ];
    persistState("profiles", nextProfiles, setProfiles);
    setNewProfile("");
    setNewProfilePin("");
    setStatus(`Profil erstellt: ${name}`);
  }

  function resetDemo() {
    persistState("items", DEMO_ITEMS_V39, setItems);
    persistState("selectedId", DEMO_ITEMS_V39[0].id, setSelectedId);
    persistState("importCount", 0, setImportCount);
    persistState("lastImportAt", "", setLastImportAt);
    persistState("categoryMaps", { live: {}, movie: {}, series: {} }, setCategoryMaps);
    persistState("guideDataById", {}, setGuideDataById);
    persistState("lastGuideSyncAt", "", setLastGuideSyncAt);
    setIsPreparingPlayback(true);
    setResolvedPlaybackUrl(resolvePlaybackUrl(DEMO_ITEMS_V39[0], settings.connectionMode));
    setStatus("Demo-Bibliothek geladen.");
  }

  function clearRememberedCredentials() {
    remove("auth");
    setAuth({ ...auth, password: "" });
    setStatus("Lokal gespeicherte Zugangsdaten wurden entfernt.");
  }

  if (!session) {
    return (
      <LoginView
        onLogin={(data) => {
          save("session", data);
          setSession(data);
        }}
      />
    );
  }

  return (
    <div className={`app ${settings.compactMode ? "compactMode" : ""} ${settings.focusMode ? "focusMode" : ""}`}>
      <header className="topbar">
        <div>
          <div className="badge">{APP_VERSION}</div>
          <h1>IPTV Mat Player | {activeProfile}</h1>
          <p className="muted">v4.8 Stability Core | v4.9 Reliability | v5.0 Guide Polish | v5.1 Household | v5.2 Mobile</p>
          <div className="workspaceMeta">
            <span>{connectionLabel}</span>
            <span>{importedItems.length ? `${importedItems.length} Import-Streams` : "Demo-Bibliothek aktiv"}</span>
            <span>{savedServers.length} Serverprofile</span>
            <span>{selectedSourceLabel} aktiv</span>
            <span>{lastGuideSyncAt ? `Guide ${lastGuideSyncAt}` : "Guide bereit zum Sync"}</span>
            <span>{isOnline ? "Online" : "Offline"}</span>
            <span>{isInstalled ? "Installiert" : installPromptEvent ? "Installierbar" : "Browser-App"}</span>
          </div>
        </div>
        <button
          className="secondary"
          onClick={() => {
            save("session", null);
            setSession(null);
          }}
        >
          Logout
        </button>
      </header>
      {page === "home" ? (
        <>
          <section className="dashboardGrid">
            <StatCard label="Live TV" value={liveItems.length} hint={`${getCategoryOptions(liveItems).length - 1} Kategorien`} />
            <StatCard label="VOD" value={movieItems.length} hint={`${movieFavorites.length} Favoriten`} />
            <StatCard label="Serien" value={seriesItems.length} hint={`${seriesFavorites.length} Favoriten`} />
            <StatCard label="Importiert" value={importCount || importedItems.length} hint={lastImportAt || "noch kein Import"} />
          </section>

          <section className="hero heroPremium">
            <div className="heroLeft">
              <div className="surfaceLabel">Spotlight</div>
              <div className="chips">
                {["live", "movie", "series", "all"].map((tab) => (
                  <button key={tab} className={`chip ${contentTab === tab ? "chipActive" : ""}`} onClick={() => setContentTab(tab)}>
                    {tab === "movie" ? "VOD" : tab === "series" ? "Serien" : tab === "all" ? "Alle" : "Live"}
                  </button>
                ))}
              </div>
              <h2>{selected?.title || "Keine Auswahl"}</h2>
              <p className="muted">{selected?.description || "Bitte Inhalt waehlen."}</p>
              <div className="heroFacts">
                <span>{connectionLabel}</span>
                <span>{selected?.imported ? `${selectedSourceLabel}-Quelle` : "Demo-Quelle"}</span>
                <span>{selected?.episodeTitle || selected?.duration || "Bereit"}</span>
                <span>{getGuideHeadline(selectedGuide)}</span>
              </div>
              {selectedGuide ? (
                <div className="infoPanel compactPanel">
                  <span>Jetzt: {selectedGuide.currentTitle}</span>
                  <span>Danach: {selectedGuide.nextTitle}</span>
                </div>
              ) : null}
              <div className="actions">
                <button className="primary" onClick={() => selected && toggleFavorite(selected.id)}>
                  {selected && watchlist.includes(selected.id) ? "Aus Favoriten" : "Zu Favoriten"}
                </button>
                {selected?.section === "live" ? (
                  <>
                    <button className="secondary" onClick={() => moveLiveSelection(-1)}>
                      Kanal -
                    </button>
                    <button className="secondary" onClick={() => moveLiveSelection(1)}>
                      Kanal +
                    </button>
                  </>
                ) : null}
                {selected?.section === "series" && selected?.imported && selected?.sourceType === "xtream" && !selected?.streamId ? (
                  <button className="secondary" onClick={() => ensureSeriesEpisode(selected.id)}>
                    Episode laden
                  </button>
                ) : null}
                <button className="secondary" onClick={() => persistSettings({ ...settings, focusMode: !settings.focusMode })}>
                  {settings.focusMode ? "TV-Modus aus" : "TV-Modus an"}
                </button>
              </div>
            </div>
            <div className="heroStage">
              <div
                className="heroPoster"
                style={{
                  backgroundImage: `linear-gradient(180deg, rgba(11, 44, 120, 0.08), rgba(11, 44, 120, 0.62)), radial-gradient(circle at top left, rgba(215, 25, 67, 0.28), transparent 42%), url("${selected?.cover || getFallbackCover(selected)}")`,
                }}
              >
                <div className="heroPosterMeta">
                  <span>{selected?.category || "Bibliothek"}</span>
                  <span>{selected?.rating || "0+"}</span>
                  <span>{selected?.year || "2026"}</span>
                </div>
              </div>
              <PlayerView
                item={selected}
                url={playbackUrl}
                isHls={isSelectedHls}
                isTs={isSelectedTs}
                autoplay={settings.autoplay}
                onProgress={handleProgress}
                onStatus={setStatus}
                connectionLabel={connectionLabel}
                isPreparing={isPreparingPlayback}
                retryEnabled={settings.retryPlayback}
                qualityLevel={selectedQuality}
                onQualitiesChange={setQualityOptions}
                onPlaybackIssue={setPlayerError}
                videoBridgeRef={videoElementRef}
              />
            </div>
          </section>

          <section className="contentDeck">
            <ContentColumn
              title="Live"
              subtitle="Aktuelle Kanaele"
              actionLabel="Guide"
              items={liveHighlights}
              selectedId={selected?.id}
              watchlist={watchlist}
              recentIds={recentIds}
              guideDataById={guideDataById}
              onOpen={openItem}
              onAction={() => {
                setContentTab("live");
                setCategoryFilter("all");
              }}
            />
            <ContentColumn
              title="VOD"
              subtitle="Filme auf Abruf"
              actionLabel="Bibliothek"
              items={movieHighlights}
              selectedId={selected?.id}
              watchlist={watchlist}
              recentIds={recentIds}
              guideDataById={guideDataById}
              onOpen={openItem}
              onAction={() => {
                setContentTab("movie");
                setCategoryFilter("all");
              }}
            />
            <ContentColumn
              title="Serien"
              subtitle="Staffeln & Folgen"
              actionLabel="Sammlung"
              items={seriesHighlights}
              selectedId={selected?.id}
              watchlist={watchlist}
              recentIds={recentIds}
              guideDataById={guideDataById}
              onOpen={openItem}
              onAction={() => {
                setContentTab("series");
                setCategoryFilter("all");
              }}
            />
          </section>

          {liveChannelRail.length ? (
            <section className="card">
              <div className="sectionHead">
                <h3>Fast Zapping</h3>
                <span className="muted">Pfeiltasten hoch/runter oder Schnellwahl</span>
              </div>
              <div className="channelRail">
                {liveChannelRail.map((item) => (
                  <button
                    key={item.id}
                    className={`channelChip ${selected?.id === item.id ? "channelChipActive" : ""}`}
                    onClick={() => openItem(item, page === "details" ? "details" : "home")}
                  >
                    <strong>{item.title}</strong>
                    <span>{guideDataById[item.id]?.currentTitle || item.category}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="sectionHead">
              <h3>Player Control</h3>
              <span className="muted">{qualityOptions.length > 1 ? "Mehrere Qualitaeten erkannt" : "Standard-Stream"}</span>
            </div>
            {playerError ? (
              <div className="errorPanel">
                <strong>Playback-Hinweis</strong>
                <span>{playerError}</span>
              </div>
            ) : null}
            <div className="actions">
              <button className="secondary" onClick={requestFullscreen}>
                Vollbild
              </button>
              <button className="secondary" onClick={() => scheduleRecording()}>
                Aufnahme planen
              </button>
              {selected?.section === "live" ? (
                <>
                  <button className="secondary" onClick={() => seekTimeshift(-Number(settings.timeshiftStepSeconds || 30))}>
                    -{settings.timeshiftStepSeconds || 30}s
                  </button>
                  <button className="secondary" onClick={jumpToLiveEdge}>
                    Live
                  </button>
                  <button className="secondary" onClick={() => seekTimeshift(Number(settings.timeshiftStepSeconds || 30))}>
                    +{settings.timeshiftStepSeconds || 30}s
                  </button>
                </>
              ) : null}
            </div>
            <div className="chips">
              {qualityOptions.map((option) => (
                <button
                  key={option.value}
                  className={`chip ${selectedQuality === option.value ? "chipActive" : ""}`}
                  onClick={() => setSelectedQuality(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>Alle Inhalte</h3>
              <span className="muted">{filtered.length} Treffer</span>
            </div>
            <input
              placeholder="Titel, Kategorie oder Beschreibung suchen ..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="controlCluster">
              <div className="chips">
                {categoryOptions.map((option) => (
                  <button
                    key={option}
                    className={`chip ${categoryFilter === option ? "chipActive" : ""}`}
                    onClick={() => setCategoryFilter(option)}
                  >
                    {option === "all" ? "Alle Kategorien" : option}
                  </button>
                ))}
              </div>
              <div className="chips">
                {[
                  ["featured", "Featured"],
                  ["az", "A-Z"],
                  ["recent", "Zuletzt"],
                  ["progress", "Fortschritt"],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    className={`chip ${settings.sortMode === mode ? "chipActive" : ""}`}
                    onClick={() => persistSettings({ ...settings, sortMode: mode })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="posterGrid">
              {filtered.map((item) => (
                <PosterCard
                  key={item.id}
                  item={item}
                  compact={settings.compactMode}
                  isFavorite={watchlist.includes(item.id)}
                  isRecent={recentIds.includes(item.id)}
                  onClick={() => openItem(item)}
                />
              ))}
            </div>
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>TV Guide</h3>
              <span className="muted">{guideRows.length} Kanaele</span>
            </div>
            <div className="chips">
              {[
                ["now", "Jetzt"],
                ["prime", "Prime Time"],
                ["late", "Spaet"],
              ].map(([focus, label]) => (
                <button
                  key={focus}
                  className={`chip ${settings.guideFocus === focus ? "chipActive" : ""}`}
                  onClick={() => persistSettings({ ...settings, guideFocus: focus })}
                >
                  {label}
                </button>
              ))}
              <button className="chip" onClick={() => syncGuideData()}>
                Guide sync
              </button>
            </div>
            {selectedGuide ? (
              <div className="infoPanel">
                <strong>Live jetzt auf {selected?.title}</strong>
                <span>{selectedGuide.currentTime} | {selectedGuide.currentTitle}</span>
                <span>Danach {selectedGuide.nextTime} | {selectedGuide.nextTitle}</span>
              </div>
            ) : null}
            <div className="guideList">
              {guideRows.map((row) => (
                <div key={row.id} className="guideRow">
                  <div>
                    <strong>{row.channel}</strong>
                    <div className="small muted">{row.category}</div>
                  </div>
                  <div>
                    <div className="guideProgram">
                      <span>{row.currentTime}</span>
                      <span>{row.currentTitle}</span>
                    </div>
                    <div className="guideProgram muted">
                      <span>{row.nextTime}</span>
                      <span>{row.nextTitle}</span>
                    </div>
                    <div className="progressLine">
                      <div style={{ width: `${row.progress}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="small muted">
              {lastGuideSyncAt ? `Letzter Guide-Sync: ${lastGuideSyncAt}` : "Noch kein Guide-Sync ausgefuehrt."}
            </div>
          </section>
        </>
      ) : null}

      {page === "details" && selected ? (
        <section className="card">
          <div className="sectionHead">
            <h3>Details</h3>
            <span className="muted">{selected.category}</span>
          </div>
          <div className="detailsHero">
            <img src={selected.cover || getFallbackCover(selected)} alt={selected.title} className="detailsImage" />
            <div className="detailsBody">
              <div className="surfaceLabel">Details & Playback</div>
              <div className="chips">
                <span className="chip chipActive">{selected.badge}</span>
                <span className="chip">{selected.year}</span>
                <span className="chip">{selected.episodeTitle || selected.duration}</span>
                <span className="chip">{selected.rating}</span>
              </div>
              <h2>{selected.title}</h2>
              <p className="muted">{selected.description}</p>
              <div className="infoPanel">
                <span>Quelle: {selected.imported ? `${selectedSourceLabel} Import` : "Demo Bibliothek"}</span>
                <span>Verbindungsmodus: {connectionLabel}</span>
                <span>Fortschritt: {selected.progress || 0}%</span>
                <span>Stream-Health: {selected.health === "issue" ? "Auffaellig" : "Stabil"}</span>
                {selectedGuide ? <span>Jetzt: {selectedGuide.currentTitle}</span> : null}
                {selectedGuide ? <span>Danach: {selectedGuide.nextTitle}</span> : null}
              </div>
              <div className="actions">
                <button className="primary" onClick={() => toggleFavorite(selected.id)}>
                  {watchlist.includes(selected.id) ? "Aus Favoriten" : "Zu Favoriten"}
                </button>
                {selected.section === "live" ? (
                  <>
                    <button className="secondary" onClick={() => moveLiveSelection(-1)}>
                      Kanal -
                    </button>
                    <button className="secondary" onClick={() => moveLiveSelection(1)}>
                      Kanal +
                    </button>
                  </>
                ) : null}
                {selected.section === "series" && selected.imported && selected.sourceType === "xtream" && !selected.streamId ? (
                  <button className="secondary" onClick={() => ensureSeriesEpisode(selected.id)}>
                    Episode laden
                  </button>
                ) : null}
                <button className="secondary" onClick={() => setPage("home")}>
                  Zurueck
                </button>
              </div>
            </div>
          </div>
              <PlayerView
                item={selected}
                url={playbackUrl}
                isHls={isSelectedHls}
                isTs={isSelectedTs}
                autoplay={false}
            onProgress={handleProgress}
            onStatus={setStatus}
            connectionLabel={connectionLabel}
            isPreparing={isPreparingPlayback}
            retryEnabled={settings.retryPlayback}
            qualityLevel={selectedQuality}
            onQualitiesChange={setQualityOptions}
            onPlaybackIssue={setPlayerError}
            videoBridgeRef={videoElementRef}
          />
        </section>
      ) : null}

      {page === "watchlist" ? (
        <>
          <section className="card">
            <div className="sectionHead">
              <h3>Weiter ansehen</h3>
              <span className="muted">{continueWatching.length}</span>
            </div>
            <div className="posterGrid">
              {continueWatching.map((item) => (
                <PosterCard
                  key={item.id}
                  item={item}
                  compact={settings.compactMode}
                  isFavorite={watchlist.includes(item.id)}
                  isRecent={recentIds.includes(item.id)}
                  onClick={() => openItem(item)}
                />
              ))}
            </div>
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>Zuletzt geoeffnet</h3>
              <span className="muted">{recentItems.length}</span>
            </div>
            <div className="posterGrid">
              {recentItems.map((item) => (
                <PosterCard
                  key={item.id}
                  item={item}
                  compact={settings.compactMode}
                  isFavorite={watchlist.includes(item.id)}
                  isRecent
                  onClick={() => openItem(item)}
                />
              ))}
            </div>
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>Channel History</h3>
              <span className="muted">{channelHistoryItems.length}</span>
            </div>
            <div className="posterGrid">
              {channelHistoryItems.map((item) => (
                <PosterCard
                  key={item.id}
                  item={item}
                  compact={settings.compactMode}
                  isFavorite={watchlist.includes(item.id)}
                  isRecent={recentIds.includes(item.id)}
                  onClick={() => openItem(item)}
                />
              ))}
            </div>
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>Bouquets</h3>
              <span className="muted">{bouquets.length}</span>
            </div>
            <div className="chips">
              {bouquets.map((bouquet) => (
                <button
                  key={bouquet.id}
                  className={`chip ${activeBouquetId === bouquet.id ? "chipActive" : ""}`}
                  onClick={() => persistState("activeBouquetId", bouquet.id, setActiveBouquetId)}
                >
                  {bouquet.name}
                </button>
              ))}
            </div>
            <div className="profileCreate">
              <input placeholder="Neues Bouquet" value={newBouquetName} onChange={(event) => setNewBouquetName(event.target.value)} />
              <button className="primary" onClick={addBouquet}>
                Bouquet anlegen
              </button>
            </div>
            {activeBouquet ? (
              <div className="infoPanel">
                <span>{activeBouquet.name}: {bouquetItems.length ? bouquetItems.map((item) => item.title).join(", ") : "noch leer"}</span>
                <div className="actions">
                  {selected?.section === "live" ? (
                    <button className="secondary" onClick={() => toggleBouquetItem(activeBouquet.id, selected.id)}>
                      {activeBouquet.itemIds.includes(selected.id) ? "Sender entfernen" : "Aktuellen Sender sichern"}
                    </button>
                  ) : null}
                  {bouquets.length > 1 ? (
                    <button className="secondary" onClick={() => removeBouquet(activeBouquet.id)}>
                      Bouquet loeschen
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>Aufnahme-Planer</h3>
              <span className="muted">{recordings.length}</span>
            </div>
            <div className="actions">
              <button className="primary" onClick={() => scheduleRecording()}>
                Aktuelle Auswahl vormerken
              </button>
            </div>
            <div className="savedServerList">
              {recordings.length ? (
                recordings.map((entry) => (
                  <div key={entry.id} className="savedServerCard">
                    <div>
                      <strong>{entry.title}</strong>
                      <div className="small muted">{entry.startsAt}</div>
                      <div className="small muted">{entry.durationMinutes} Minuten | {entry.status}</div>
                    </div>
                    <div className="actions">
                      <button className="secondary" onClick={() => removeRecording(entry.id)}>
                        Entfernen
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="infoPanel">
                  <span>Noch keine Aufnahmen vorgemerkt.</span>
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>Favoriten nach Bereich</h3>
              <span className="muted">{watchlistItems.length}</span>
            </div>
            <div className="favoritesColumns">
              <div className="infoPanel">
                <strong>Live</strong>
                <span>{liveFavorites.length ? liveFavorites.map((item) => item.title).join(", ") : "Keine Live-Favoriten"}</span>
              </div>
              <div className="infoPanel">
                <strong>Filme</strong>
                <span>{movieFavorites.length ? movieFavorites.map((item) => item.title).join(", ") : "Keine Film-Favoriten"}</span>
              </div>
              <div className="infoPanel">
                <strong>Serien</strong>
                <span>{seriesFavorites.length ? seriesFavorites.map((item) => item.title).join(", ") : "Keine Serien-Favoriten"}</span>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {page === "account" ? (
        <>
          <section className="card">
            <div className="sectionHead">
              <h3>Import Dashboard</h3>
              <span className="muted">autorisierte Zugriffe</span>
            </div>
            <div className="surfaceLabel">Verbindung</div>
            <div className="chips">
              {SOURCE_TYPES.map(([value, label]) => (
                <button
                  key={value}
                  className={`chip ${auth.sourceType === value ? "chipActive" : ""}`}
                  onClick={() => persistAuth({ ...auth, sourceType: value })}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="fieldGrid">
              {auth.sourceType === "xtream" ? (
                <>
                  <input
                    placeholder="Server-URL"
                    value={auth.server}
                    onChange={(event) => persistAuth({ ...auth, server: event.target.value })}
                  />
                  <input
                    placeholder="Benutzername"
                    value={auth.username}
                    onChange={(event) => persistAuth({ ...auth, username: event.target.value })}
                  />
                  <input
                    placeholder="Passwort"
                    type="password"
                    value={auth.password}
                    onChange={(event) => persistAuth({ ...auth, password: event.target.value })}
                  />
                </>
              ) : null}
              {auth.sourceType === "m3u" ? (
                <>
                  <textarea
                    placeholder="M3U-URL oder komplette M3U-Liste hier einfuegen ..."
                    value={m3uTextInput}
                    onChange={(event) => {
                      persistM3uInput(event.target.value);
                    }}
                    rows={7}
                  />
                  <input type="file" accept=".m3u,.m3u8,.txt,text/plain,audio/x-mpegurl,application/vnd.apple.mpegurl" onChange={handleImportM3uFile} />
                  <div className="infoPanel inputHint">
                    <span>Füge eine M3U-URL oder direkt deine ganze Liste ein und drücke dann Laden.</span>
                  </div>
                </>
              ) : null}
              {auth.sourceType === "stbemu" ? (
                <>
                  <input
                    placeholder="Portal-URL"
                    value={auth.portalUrl}
                    onChange={(event) => persistAuth({ ...auth, portalUrl: event.target.value })}
                  />
                  <input
                    placeholder="MAC-Adresse"
                    value={auth.macAddress}
                    onChange={(event) => persistAuth({ ...auth, macAddress: event.target.value.toUpperCase() })}
                  />
                  <div className="infoPanel inputHint">
                    <span>STBEmu-Links werden erst beim Oeffnen des Kanals neu erzeugt, damit die Session stabil bleibt.</span>
                  </div>
                </>
              ) : null}
              <input
                placeholder="XMLTV / EPG-URL (optional)"
                value={auth.epgUrl}
                onChange={(event) => persistAuth({ ...auth, epgUrl: event.target.value })}
              />
            </div>
            <div className="actions">
              <button className="primary" onClick={handleImport}>
                Laden
              </button>
              {auth.sourceType === "m3u" ? (
                <button className="secondary" onClick={handleMergeM3uText}>
                  M3U ergaenzen
                </button>
              ) : null}
              <button className="secondary" onClick={resetDemo}>
                Demo laden
              </button>
              <button className="secondary" onClick={() => syncGuideData()}>
                Guide synchronisieren
              </button>
            </div>
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>Gespeicherte Server</h3>
              <span className="muted">{savedServers.length} Profile</span>
            </div>
            <input
              placeholder="Name fuer das Serverprofil"
              value={newServerName}
              onChange={(event) => setNewServerName(event.target.value)}
            />
            <div className="actions">
              <button className="primary" onClick={handleSaveServer}>
                Serverprofil speichern
              </button>
            </div>
            <div className="savedServerList">
              {savedServers.length ? (
                savedServers.map((server) => (
                  <div key={server.id} className="savedServerCard">
                    <div>
                      <strong>{server.name}</strong>
                      <div className="small muted">{getSourceLabel(server.sourceType, true)}-Profil</div>
                      <div className="small muted">
                        {maskSensitiveValue(
                          server.sourceType === "m3u"
                            ? server.m3uUrl
                            : server.sourceType === "stbemu"
                              ? server.portalUrl
                              : server.server,
                          settings.privacyMode
                        )}
                      </div>
                      <div className="small muted">
                        {server.sourceType === "xtream"
                          ? `User: ${maskSensitiveValue(server.username, settings.privacyMode)} | Passwort: ${
                              server.password ? "gespeichert" : "leer"
                            }`
                          : server.sourceType === "stbemu"
                            ? `MAC: ${maskSensitiveValue(server.macAddress, settings.privacyMode)}`
                            : "Playlist-Profil"}
                      </div>
                    </div>
                    <div className="actions">
                      <button className="secondary" onClick={() => applySavedServer(server)}>
                        Laden
                      </button>
                      <button className="secondary" onClick={() => removeSavedServer(server.id)}>
                        Entfernen
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="infoPanel">
                  <span>Noch keine Serverprofile gespeichert.</span>
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>Reliability Center</h3>
              <span className="muted">{reliabilityTone}</span>
            </div>
            <div className="actions">
              <button className="primary" onClick={runReliabilityChecks}>
                Reliability Tests starten
              </button>
            </div>
            <div className="infoPanel">
              <span>{lastReliabilityRunAt ? `Letzter Lauf: ${lastReliabilityRunAt}` : "Noch kein manueller Reliability-Lauf."}</span>
              <span>Bewertung: {reliabilityTone}</span>
            </div>
            <div className="reliabilityGrid">
              {reliabilityResults.map((entry) => (
                <div key={entry.id} className={`reliabilityCard reliability${entry.status}`}>
                  <strong>{entry.label}</strong>
                  <span className="small muted">{entry.detail}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>Verbindung & Sicherheit</h3>
              <span className="muted">{importedItems.length ? `${importedItems.length} importierte Eintraege` : "noch keine Live-Daten"}</span>
            </div>
            <div className="settingsRow">
              {["auto", "proxy", "direct"].map((mode) => (
                <button
                  key={mode}
                  className={`chip ${settings.connectionMode === mode ? "chipActive" : ""}`}
                  onClick={() => persistSettings({ ...settings, connectionMode: mode })}
                >
                  {mode === "auto" ? "Auto" : mode === "proxy" ? "Proxy" : "Direkt"}
                </button>
              ))}
            </div>
            <div className="settingsRow">
              <button
                className={`chip ${settings.privacyMode ? "chipActive" : ""}`}
                onClick={() => persistSettings({ ...settings, privacyMode: !settings.privacyMode })}
              >
                Privacy Mode
              </button>
              <button
                className={`chip ${settings.savePasswords ? "chipActive" : ""}`}
                onClick={() => persistSettings({ ...settings, savePasswords: !settings.savePasswords })}
              >
                Passwoerter speichern
              </button>
              <button
                className={`chip ${settings.rememberCredentials ? "chipActive" : ""}`}
                onClick={() => {
                  const next = { ...settings, rememberCredentials: !settings.rememberCredentials };
                  persistSettings(next);
                  if (!next.rememberCredentials) {
                    clearRememberedCredentials();
                  }
                }}
              >
                Zugang merken
              </button>
              <button
                className={`chip ${settings.autoGuide ? "chipActive" : ""}`}
                onClick={() => persistSettings({ ...settings, autoGuide: !settings.autoGuide })}
              >
                Auto Guide
              </button>
              <button
                className={`chip ${settings.retryPlayback ? "chipActive" : ""}`}
                onClick={() => persistSettings({ ...settings, retryPlayback: !settings.retryPlayback })}
              >
                Auto Retry
              </button>
            </div>
            <div className="infoPanel">
              {securityNotes.map((note, index) => (
                <span key={index}>{note}</span>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>Profile & App Settings</h3>
              <span className="muted">{session.user}</span>
            </div>
            <div className="settingsRow">
              <button
                className={`chip ${settings.autoplay ? "chipActive" : ""}`}
                onClick={() => persistSettings({ ...settings, autoplay: !settings.autoplay })}
              >
                Trailer-Autoplay
              </button>
              <button
                className={`chip ${settings.autosave ? "chipActive" : ""}`}
                onClick={() => persistSettings({ ...settings, autosave: !settings.autosave })}
              >
                Auto-Fortschritt
              </button>
              <button
                className={`chip ${settings.compactMode ? "chipActive" : ""}`}
                onClick={() => persistSettings({ ...settings, compactMode: !settings.compactMode })}
              >
                Compact Mode
              </button>
              <button
                className={`chip ${settings.adultFilter ? "chipActive" : ""}`}
                onClick={() => persistSettings({ ...settings, adultFilter: !settings.adultFilter })}
              >
                16+ ausblenden
              </button>
              <button
                className={`chip ${settings.focusMode ? "chipActive" : ""}`}
                onClick={() => persistSettings({ ...settings, focusMode: !settings.focusMode })}
              >
                TV-Modus
              </button>
            </div>
            <div className="profileRow">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  className={`chip ${activeProfile === profile.name ? "chipActive" : ""}`}
                  onClick={() => requestProfileChange(profile)}
                >
                  {profile.emoji} {profile.name}
                </button>
              ))}
            </div>
            <div className="profileSummaryGrid">
              {profileWatchTotals.map((profile) => (
                <div key={profile.id} className={`profileSummaryCard ${currentProfile?.id === profile.id ? "profileSummaryActive" : ""}`}>
                  <strong>{profile.name}</strong>
                  <span className="small muted">{profile.kidsMode ? "Kids-Profil" : "Standard-Profil"}</span>
                  <span className="small muted">{profile.pin ? "PIN aktiv" : "Ohne PIN"}</span>
                  <span className="small muted">{profile.favorites} Favoriten | {profile.recent} zuletzt genutzt</span>
                </div>
              ))}
            </div>
            <div className="profileCreate">
              <input placeholder="Neues Profil" value={newProfile} onChange={(event) => setNewProfile(event.target.value)} />
              <input placeholder="PIN optional" value={newProfilePin} onChange={(event) => setNewProfilePin(event.target.value)} />
              <button className="primary" onClick={addProfile}>
                Profil anlegen
              </button>
            </div>
            <div className="infoPanel">
              <span>Aktives Profil: {currentProfile?.name}</span>
              <span>Kids-Modus: {currentProfile?.kidsMode ? "aktiv" : "aus"}</span>
              <span>PIN: {currentProfile?.pin ? "gesetzt" : "nicht gesetzt"}</span>
            </div>
            <div className="actions">
              <button className="secondary" onClick={() => updateActiveProfilePatch({ kidsMode: !currentProfile?.kidsMode })}>
                {currentProfile?.kidsMode ? "Kids-Modus aus" : "Kids-Modus an"}
              </button>
              <button className="secondary" onClick={() => updateActiveProfilePatch({ pin: currentProfile?.pin ? "" : "1234" })}>
                {currentProfile?.pin ? "PIN entfernen" : "PIN 1234 setzen"}
              </button>
            </div>
            <div className="infoPanel">
              <span>Aufnahme-Voreinstellung: {settings.preferredRecordingMinutes} Minuten</span>
              <span>Timeshift-Schritt: {settings.timeshiftStepSeconds} Sekunden</span>
            </div>
            <div className="actions">
              {[30, 60, 90].map((minutes) => (
                <button
                  key={minutes}
                  className={`chip ${settings.preferredRecordingMinutes === minutes ? "chipActive" : ""}`}
                  onClick={() => persistSettings({ ...settings, preferredRecordingMinutes: minutes })}
                >
                  {minutes} min DVR
                </button>
              ))}
            </div>
            <div className="actions">
              {[15, 30, 60].map((seconds) => (
                <button
                  key={seconds}
                  className={`chip ${settings.timeshiftStepSeconds === seconds ? "chipActive" : ""}`}
                  onClick={() => persistSettings({ ...settings, timeshiftStepSeconds: seconds })}
                >
                  {seconds}s Skip
                </button>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>PWA & Mobile</h3>
              <span className="muted">{isInstalled ? "installiert" : "bereit"}</span>
            </div>
            <div className="infoPanel">
              <span>Status: {isOnline ? "Online" : "Offline"}</span>
              <span>Installieren: {isInstalled ? "bereits installiert" : installPromptEvent ? "moeglich" : "noch nicht verfuegbar"}</span>
              <span>Die App kann jetzt als Startbildschirm-/Desktop-App betrieben werden.</span>
              <span>Mobile Shell: sichere Abstaende, feste Bottom-Navigation und helles TV-Layout aktiv.</span>
            </div>
            <div className="actions">
              <button className="primary" onClick={installApp}>
                App installieren
              </button>
            </div>
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>Status</h3>
              <span className="muted">{isResolvingSeries || isPreparingPlayback ? "Wird vorbereitet" : "Live"}</span>
            </div>
            <div className="infoPanel">
              <span>{status}</span>
              <span>{lastImportAt ? `Letzter Import: ${lastImportAt}` : "Noch kein Import ausgefuehrt."}</span>
              <span>{lastGuideSyncAt ? `Guide-Sync: ${lastGuideSyncAt}` : "Guide noch nicht synchronisiert."}</span>
              <span>Aktiver Modus: {getSourceLabel(auth.sourceType, true)}</span>
              <span>{isPreparingPlayback ? "Playback wird vorbereitet ..." : "Playback bereit."}</span>
              <span>{importedItems.length ? `Importierte Eintraege: ${importedItems.length}` : "Noch keine importierten Eintraege."}</span>
              <span>
                {loadedCategoryCount
                  ? `Xtream-Kategorien geladen: ${loadedCategoryCount}`
                  : importedCategoryCount
                    ? `M3U-Gruppen erkannt: ${importedCategoryCount}`
                    : "Noch keine Kategorien oder M3U-Gruppen erkannt."}
              </span>
            </div>
          </section>
        </>
      ) : null}

      {pinPrompt ? (
        <section className="modalCard">
          <div className="sectionHead">
            <h3>PIN bestaetigen</h3>
            <span className="muted">{pinPrompt.name}</span>
          </div>
          <input placeholder="PIN eingeben" value={pinInput} onChange={(event) => setPinInput(event.target.value)} />
          <div className="actions">
            <button className="primary" onClick={confirmProfilePin}>
              Freigeben
            </button>
            <button className="secondary" onClick={() => setPinPrompt(null)}>
              Abbrechen
            </button>
          </div>
        </section>
      ) : null}

      <BottomNav page={page} setPage={setPage} />
    </div>
  );
}
