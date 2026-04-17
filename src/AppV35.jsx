import React, { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import { load, save } from "./lib/storage.js";
import { DEFAULT_PROFILES_V35, DEFAULT_SETTINGS_V35, DEMO_EPG_V35, DEMO_ITEMS_V35 } from "./lib/demoCatalogV35.js";
import {
  describeConnectionMode,
  explainNetworkError,
  fetchXtreamJson,
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

function LoginView({ onLogin }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");

  return (
    <div className="loginScreen">
      <div className="loginCard">
        <div className="badge">v3.5</div>
        <h1>IPTV Mat Player</h1>
        <p className="muted">Vercel-ready Import, Proxy und Web-Player in einer App.</p>
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

function PosterCard({ item, onClick, compact }) {
  return (
    <button className={`posterCard ${compact ? "posterCardCompact" : ""}`} onClick={onClick}>
      <img src={item.cover} alt={item.title} />
      <div className="posterBody">
        <div className="posterHeader">
          <span className="miniBadge">{item.badge}</span>
          <span className="posterMeta">{item.category}</span>
        </div>
        <div className="posterTitle">{item.title}</div>
        <div className="posterMeta">
          {item.year} · {item.episodeTitle || item.duration}
        </div>
        <div className="progressLine">
          <div style={{ width: `${item.progress || 0}%` }} />
        </div>
      </div>
    </button>
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

function PlayerView({ url, autoplay, onProgress, onStatus, title, connectionLabel }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [phase, setPhase] = useState(url ? "loading" : "idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return undefined;
    }

    const cleanup = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    if (!url) {
      cleanup();
      setPhase("idle");
      setError("Fuer diesen Eintrag ist noch kein abspielbarer Stream verfuegbar.");
      return cleanup;
    }

    setError("");
    setPhase("loading");
    onStatus?.(`${title || "Stream"} wird vorbereitet ...`);

    const handleTimeUpdate = () => {
      if (!video.duration || !Number.isFinite(video.duration)) {
        return;
      }
      onProgress?.(Math.round((video.currentTime / video.duration) * 100));
    };

    const fail = (message) => {
      setError(message);
      setPhase("error");
      onStatus?.(message);
    };

    const handleCanPlay = () => {
      setPhase("ready");
      onStatus?.(`${title || "Stream"} ist bereit.`);
      if (autoplay) {
        video.play().catch(() => {});
      }
    };

    const handleWaiting = () => {
      setPhase((currentPhase) => (currentPhase === "error" ? currentPhase : "buffering"));
    };

    const handlePlaying = () => setPhase("ready");
    const handleError = () => fail("Das Video-Element konnte den Stream nicht abspielen.");

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("error", handleError);

    if (Hls.isSupported() && (url.includes(".m3u8") || url.includes("/api/media?"))) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hlsRef.current = hls;
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data?.fatal) {
          fail("Der HLS-Stream konnte nicht geladen werden.");
        }
      });
    } else {
      video.src = url;
      video.load();
    }

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("error", handleError);
      cleanup();
    };
  }, [autoplay, onProgress, onStatus, title, url]);

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

function createImportedItem(kind, entry, index, auth, fallbackCover) {
  const baseItem = {
    imported: true,
    server: auth.server,
    username: auth.username,
    password: auth.password,
    cover: entry.stream_icon || fallbackCover,
    progress: (index * (kind === "live" ? 7 : kind === "movie" ? 9 : 11)) % 100,
  };

  if (kind === "live") {
    return {
      ...baseItem,
      id: `live-${entry.stream_id}`,
      title: entry.name || `Live ${entry.stream_id}`,
      category: entry.category_name || "Live TV",
      section: "live",
      badge: "Live",
      year: "2026",
      duration: "Live",
      rating: "0+",
      description: "Importierter Live-Eintrag ueber Xtream.",
      streamType: "live",
      streamId: String(entry.stream_id),
      streamExt: entry.container_extension || "m3u8",
    };
  }

  if (kind === "movie") {
    return {
      ...baseItem,
      id: `movie-${entry.stream_id}`,
      title: entry.name || `Film ${entry.stream_id}`,
      category: entry.category_name || "Filme",
      section: "movie",
      badge: "Movie",
      year: "2026",
      duration: "Film",
      rating: "12+",
      description: "Importierter Film-Eintrag ueber Xtream.",
      streamType: "movie",
      streamId: String(entry.stream_id),
      streamExt: entry.container_extension || "mp4",
    };
  }

  return {
    ...baseItem,
    id: `series-${entry.series_id || index}`,
    title: entry.name || `Serie ${index + 1}`,
    category: entry.category_name || "Serien",
    section: "series",
    badge: "Serie",
    year: "2026",
    duration: "Serie",
    rating: "12+",
    description: "Serie importiert. Die erste Episode wird bei Bedarf nachgeladen.",
    streamType: "series",
    seriesId: String(entry.series_id || entry.stream_id || index),
  };
}

export default function AppV35() {
  const [session, setSession] = useState(() => load("session", null));
  const [profiles, setProfiles] = useState(() => load("profiles", DEFAULT_PROFILES_V35));
  const [activeProfile, setActiveProfile] = useState(() => load("activeProfile", "Sven"));
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS_V35, ...(load("settings", DEFAULT_SETTINGS_V35) || {}) }));
  const [items, setItems] = useState(() => load("items", DEMO_ITEMS_V35));
  const [watchlist, setWatchlist] = useState(() => load("watchlist", ["movie-1"]));
  const [selectedId, setSelectedId] = useState(() => load("selectedId", DEMO_ITEMS_V35[0].id));
  const [search, setSearch] = useState("");
  const [contentTab, setContentTab] = useState("live");
  const [status, setStatus] = useState("Bereit.");
  const [auth, setAuth] = useState(() => load("auth", { server: "", username: "", password: "" }));
  const [importCount, setImportCount] = useState(() => load("importCount", 0));
  const [lastImportAt, setLastImportAt] = useState(() => load("lastImportAt", ""));
  const [newProfile, setNewProfile] = useState("");
  const [page, setPage] = useState("home");
  const [isResolvingSeries, setIsResolvingSeries] = useState(false);

  function persist(key, value, setter) {
    save(key, value);
    setter(value);
  }

  const selected = items.find((item) => item.id === selectedId) || items[0] || null;
  const playbackUrl = useMemo(() => resolvePlaybackUrl(selected, settings.connectionMode), [selected, settings.connectionMode]);
  const connectionLabel = useMemo(
    () => describeConnectionMode(selected, settings.connectionMode),
    [selected, settings.connectionMode]
  );

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const matchesTab = contentTab === "all" || item.section === contentTab;
        const q = search.toLowerCase();
        const matchesQuery =
          !q ||
          item.title.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q);
        const matchesRating = settings.adultFilter ? item.rating !== "16+" : true;
        return matchesTab && matchesQuery && matchesRating;
      }),
    [contentTab, items, search, settings.adultFilter]
  );

  const liveItems = items.filter((item) => item.section === "live");
  const movieItems = items.filter((item) => item.section === "movie");
  const seriesItems = items.filter((item) => item.section === "series");
  const importedItems = items.filter((item) => item.imported);
  const continueWatching = [...items]
    .filter((item) => (item.progress || 0) > 0)
    .sort((a, b) => (b.progress || 0) - (a.progress || 0))
    .slice(0, 6);
  const watchlistItems = items.filter((item) => watchlist.includes(item.id));

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
            }
          : entry
      );

      persist("items", nextItems, setItems);
      setStatus(`Serie bereit: ${episode.title}`);
    } catch (error) {
      setStatus(explainNetworkError(error, settings.connectionMode));
    } finally {
      setIsResolvingSeries(false);
    }
  }

  async function openItem(item, nextPage = "details") {
    persist("selectedId", item.id, setSelectedId);
    setPage(nextPage);

    if (item.section === "series" && item.imported && !item.streamId) {
      await ensureSeriesEpisode(item.id);
    }
  }

  async function handleImport() {
    if (!auth.server || !auth.username || !auth.password) {
      setStatus("Bitte Server, Benutzername und Passwort ausfuellen.");
      return;
    }

    try {
      setStatus("Xtream-Daten werden geladen ...");
      const [live, vod, series] = await Promise.all([
        fetchXtreamJson({ server: auth.server, username: auth.username, password: auth.password, action: "get_live_streams", mode: settings.connectionMode }),
        fetchXtreamJson({ server: auth.server, username: auth.username, password: auth.password, action: "get_vod_streams", mode: settings.connectionMode }),
        fetchXtreamJson({ server: auth.server, username: auth.username, password: auth.password, action: "get_series", mode: settings.connectionMode }),
      ]);

      const mapped = [
        ...safeTop(live).map((entry, index) => createImportedItem("live", entry, index, auth, DEMO_ITEMS_V35[0].cover)),
        ...safeTop(vod).map((entry, index) => createImportedItem("movie", entry, index, auth, DEMO_ITEMS_V35[2].cover)),
        ...safeTop(series).map((entry, index) => createImportedItem("series", entry, index, auth, DEMO_ITEMS_V35[4].cover)),
      ];

      if (!mapped.length) {
        throw new Error("Keine Eintraege gefunden.");
      }

      const nextSelected = mapped.find((entry) => entry.streamType === "live" || entry.streamType === "movie") || mapped[0];
      const timestamp = new Date().toLocaleString("de-DE");

      persist("items", mapped, setItems);
      persist("selectedId", nextSelected.id, setSelectedId);
      persist("importCount", mapped.length, setImportCount);
      persist("lastImportAt", timestamp, setLastImportAt);
      setPage("home");
      setStatus(`${mapped.length} Eintraege importiert. Auto oder Proxy ist fuer Vercel empfohlen.`);
    } catch (error) {
      setStatus(explainNetworkError(error, settings.connectionMode));
    }
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
    <div className={`app ${settings.compactMode ? "compactMode" : ""}`}>
      <header className="topbar">
        <div>
          <div className="badge">v3.5</div>
          <h1>IPTV Mat Player · {activeProfile}</h1>
        </div>
        <button className="secondary" onClick={() => { save("session", null); setSession(null); }}>Logout</button>
      </header>

      {page === "home" ? (
        <>
          <section className="dashboardGrid">
            <StatCard label="Live TV" value={liveItems.length} hint="Kanaele" />
            <StatCard label="Filme" value={movieItems.length} hint="VOD" />
            <StatCard label="Serien" value={seriesItems.length} hint="Library" />
            <StatCard label="Importiert" value={importCount} hint={lastImportAt || "noch kein Import"} />
          </section>

          <section className="hero">
            <div className="heroLeft">
              <div className="chips">
                {["live", "movie", "series", "all"].map((tab) => (
                  <button key={tab} className={`chip ${contentTab === tab ? "chipActive" : ""}`} onClick={() => setContentTab(tab)}>
                    {tab === "movie" ? "Filme" : tab === "series" ? "Serien" : tab === "all" ? "Alle" : "Live"}
                  </button>
                ))}
              </div>
              <h2>{selected?.title || "Keine Auswahl"}</h2>
              <p className="muted">{selected?.description || "Bitte Inhalt waehlen."}</p>
              <div className="heroFacts">
                <span>{connectionLabel}</span>
                <span>{selected?.imported ? "Xtream-Quelle" : "Demo-Quelle"}</span>
                <span>{selected?.episodeTitle || selected?.duration || "Bereit"}</span>
              </div>
              <div className="actions">
                <button className="primary" onClick={() => selected && persist("watchlist", watchlist.includes(selected.id) ? watchlist.filter((entry) => entry !== selected.id) : [...watchlist, selected.id], setWatchlist)}>
                  {selected && watchlist.includes(selected.id) ? "Aus Watchlist" : "Zur Watchlist"}
                </button>
                {selected?.section === "series" && selected?.imported && !selected?.streamId ? (
                  <button className="secondary" onClick={() => ensureSeriesEpisode(selected.id)}>Episode laden</button>
                ) : null}
              </div>
            </div>
            <PlayerView
              url={playbackUrl}
              autoplay={settings.autoplay}
              onProgress={(percent) => {
                if (!settings.autosave || !selected) {
                  return;
                }
                const nextItems = items.map((item) => item.id === selected.id ? { ...item, progress: Math.max(item.progress || 0, percent) } : item);
                persist("items", nextItems, setItems);
              }}
              onStatus={setStatus}
              title={selected?.title}
              connectionLabel={connectionLabel}
            />
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>Suche</h3>
              <span className="muted">{filtered.length}</span>
            </div>
            <input placeholder="Titel, Kategorie oder Beschreibung suchen ..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>Inhalte</h3>
              <span className="muted">{filtered.length}</span>
            </div>
            <div className="posterGrid">
              {filtered.map((item) => (
                <PosterCard key={item.id} item={item} compact={settings.compactMode} onClick={() => openItem(item)} />
              ))}
            </div>
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>EPG Demo</h3>
              <span className="muted">{DEMO_EPG_V35.length}</span>
            </div>
            <div className="epgList">
              {DEMO_EPG_V35.map((row) => (
                <div key={row.id} className="epgRow">
                  <strong>{row.time}</strong>
                  <span>{row.channel}</span>
                  <span className="muted">{row.title}</span>
                </div>
              ))}
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
            <img src={selected.cover} alt={selected.title} className="detailsImage" />
            <div className="detailsBody">
              <div className="chips">
                <span className="chip chipActive">{selected.badge}</span>
                <span className="chip">{selected.year}</span>
                <span className="chip">{selected.episodeTitle || selected.duration}</span>
                <span className="chip">{selected.rating}</span>
              </div>
              <h2>{selected.title}</h2>
              <p className="muted">{selected.description}</p>
              <div className="actions">
                <button className="primary" onClick={() => persist("watchlist", watchlist.includes(selected.id) ? watchlist.filter((entry) => entry !== selected.id) : [...watchlist, selected.id], setWatchlist)}>
                  {watchlist.includes(selected.id) ? "Aus Watchlist" : "Zur Watchlist"}
                </button>
                {selected.section === "series" && selected.imported && !selected.streamId ? (
                  <button className="secondary" onClick={() => ensureSeriesEpisode(selected.id)}>Episode laden</button>
                ) : null}
                <button className="secondary" onClick={() => setPage("home")}>Zurueck</button>
              </div>
            </div>
          </div>
          <PlayerView url={playbackUrl} autoplay={false} onProgress={() => {}} onStatus={setStatus} title={selected.title} connectionLabel={connectionLabel} />
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
                <PosterCard key={item.id} item={item} compact={settings.compactMode} onClick={() => openItem(item)} />
              ))}
            </div>
          </section>
          <section className="card">
            <div className="sectionHead">
              <h3>Watchlist</h3>
              <span className="muted">{watchlistItems.length}</span>
            </div>
            <div className="posterGrid">
              {watchlistItems.map((item) => (
                <PosterCard key={item.id} item={item} compact={settings.compactMode} onClick={() => openItem(item)} />
              ))}
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
            <input placeholder="Server-URL" value={auth.server} onChange={(event) => persist("auth", { ...auth, server: event.target.value }, setAuth)} />
            <input placeholder="Benutzername" value={auth.username} onChange={(event) => persist("auth", { ...auth, username: event.target.value }, setAuth)} />
            <input placeholder="Passwort" type="password" value={auth.password} onChange={(event) => persist("auth", { ...auth, password: event.target.value }, setAuth)} />
            <div className="actions">
              <button className="primary" onClick={handleImport}>Xtream importieren</button>
              <button className="secondary" onClick={() => { persist("items", DEMO_ITEMS_V35, setItems); persist("selectedId", DEMO_ITEMS_V35[0].id, setSelectedId); setStatus("Demo geladen."); }}>Demo laden</button>
            </div>
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>Vercel & Verbindung</h3>
              <span className="muted">{importedItems.length ? `${importedItems.length} importierte Eintraege` : "noch keine Live-Daten"}</span>
            </div>
            <p className="muted">Auto ist fuer Vercel am sichersten. Dann laufen JSON-Import und Stream-Wiedergabe ueber denselben Ursprung.</p>
            <div className="settingsRow">
              {["auto", "proxy", "direct"].map((mode) => (
                <button key={mode} className={`chip ${settings.connectionMode === mode ? "chipActive" : ""}`} onClick={() => persist("settings", { ...settings, connectionMode: mode }, setSettings)}>
                  {mode === "auto" ? "Auto" : mode === "proxy" ? "Proxy" : "Direkt"}
                </button>
              ))}
            </div>
            <div className="infoPanel">
              <span>{describeConnectionMode(selected, settings.connectionMode)}</span>
              <span>Build fuer Vercel: npm run build</span>
              <span>SPA-Fallback und /api-Proxy sind vorbereitet.</span>
            </div>
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>Profile & Settings</h3>
              <span className="muted">{session.user}</span>
            </div>
            <div className="settingsRow">
              <button className={`chip ${settings.autoplay ? "chipActive" : ""}`} onClick={() => persist("settings", { ...settings, autoplay: !settings.autoplay }, setSettings)}>Trailer-Autoplay</button>
              <button className={`chip ${settings.autosave ? "chipActive" : ""}`} onClick={() => persist("settings", { ...settings, autosave: !settings.autosave }, setSettings)}>Auto-Fortschritt</button>
              <button className={`chip ${settings.compactMode ? "chipActive" : ""}`} onClick={() => persist("settings", { ...settings, compactMode: !settings.compactMode }, setSettings)}>Compact Mode</button>
              <button className={`chip ${settings.adultFilter ? "chipActive" : ""}`} onClick={() => persist("settings", { ...settings, adultFilter: !settings.adultFilter }, setSettings)}>16+ ausblenden</button>
            </div>
            <div className="profileRow">
              {profiles.map((profile) => (
                <button key={profile.id} className={`chip ${activeProfile === profile.name ? "chipActive" : ""}`} onClick={() => persist("activeProfile", profile.name, setActiveProfile)}>
                  {profile.emoji} {profile.name}
                </button>
              ))}
            </div>
            <div className="profileCreate">
              <input placeholder="Neues Profil" value={newProfile} onChange={(event) => setNewProfile(event.target.value)} />
              <button className="primary" onClick={() => {
                const name = newProfile.trim();
                if (!name) {
                  return;
                }
                persist("profiles", [...profiles, { id: `p-${Date.now()}`, name, emoji: "New" }], setProfiles);
                setNewProfile("");
                setStatus(`Profil erstellt: ${name}`);
              }}>Profil anlegen</button>
            </div>
          </section>

          <section className="card">
            <div className="sectionHead">
              <h3>Status</h3>
              <span className="muted">{isResolvingSeries ? "Serie wird vorbereitet" : "Live"}</span>
            </div>
            <div className="infoPanel">
              <span>{status}</span>
              <span>{lastImportAt ? `Letzter Import: ${lastImportAt}` : "Noch kein Import ausgefuehrt."}</span>
              <span>{settings.connectionMode === "direct" ? "Direktmodus ist empfindlich fuer CORS." : "Proxy-Modi umgehen typische Browser-Sperren."}</span>
            </div>
          </section>
        </>
      ) : null}

      <BottomNav page={page} setPage={setPage} />
    </div>
  );
}
