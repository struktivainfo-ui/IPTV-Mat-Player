import React, { useEffect, useMemo, useState } from "react";
import Player from "./components/Player.jsx";
import { EmptyState, StatusPanel } from "./components/ui.jsx";
import { APP_BADGE, categoryKey, DEFAULT_ITEMS, EMPTY_ITEM, itemGroup } from "./lib/appData.js";
import { BACKEND_URL, checkBackendHealth, createPlaybackUrl, fetchM3UProxy, fetchXtreamProxy, isLikelyHls, isLikelyTs, mapLive, mapSeries, mapVod, parseM3UAsync } from "./lib/importers.js";
import { isNativeAndroid, openNativePlayer } from "./lib/nativePlayer.js";
import { secureGet, secureSet } from "./lib/secureStorage.js";
import { load, save } from "./lib/storage.js";

const LEGAL_NOTICE =
  "Diese App ist ausschliesslich ein IPTV-Player. Es werden keine Sender, Streams, Playlists oder Inhalte bereitgestellt. Nutzer sind selbst verantwortlich fuer die Inhalte, die sie importieren.";

const DEFAULT_SETTINGS = {
  autoplay: true,
  language: "de",
  tvMode: false,
  mobileNav: true,
  playerMode: "native",
  bufferMode: "strong",
  safeMode: true,
};
const PRO_PRODUCT_ID = "iptv_mat_player_pro_monthly";
const PRO_PRICE = "4,99 EUR / Monat";
const FREE_FAVORITE_LIMIT = 20;

function SectionButton({ active, children, ...props }) {
  return (
    <button className={active ? "premiumNavActive focusable" : "premiumNavBtn focusable"} {...props}>
      {children}
    </button>
  );
}

function StreamTile({ item, active, favorite, onOpen, onPlay, onToggleFavorite, tvMode }) {
  return (
    <button className={`streamTile focusable ${active ? "streamTileActive" : ""} ${tvMode ? "streamTileTv" : ""}`} onClick={onOpen}>
      <div className="streamLogo">{item.cover ? <img src={item.cover} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span>{String(item.title || "TV").slice(0, 2).toUpperCase()}</span>}</div>
      <div className="streamText">
        <b>{item.title}</b>
        <small>{itemGroup(item)} - {item.source || "Import"}</small>
      </div>
      <div className="streamActions">
        <span className="streamBadge">{item.section === "movie" ? "Film" : item.section === "series" ? "Serie" : "Live"}</span>
        <button className="ghostBtn focusable" onClick={(event) => { event.stopPropagation(); onToggleFavorite(); }}>
          {favorite ? "Favorit" : "Merken"}
        </button>
        <button className="primary focusable" onClick={(event) => { event.stopPropagation(); onPlay(); }}>
          Play
        </button>
      </div>
    </button>
  );
}

function PosterTile({ item, active, favorite, onOpen, onPlay, onToggleFavorite }) {
  return (
    <button className={`posterTile focusable ${active ? "posterTileActive" : ""}`} onClick={onOpen}>
      <div className="posterArt">
        {item.cover ? <img src={item.cover} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span>{String(item.title || "IP").slice(0, 2).toUpperCase()}</span>}
      </div>
      <div className="posterCopy">
        <b>{item.title}</b>
        <small>{item.section === "series" ? "Serie" : "Film"} - {itemGroup(item)}</small>
      </div>
      <div className="posterActions">
        <span>{favorite ? "Favorit" : item.badge}</span>
        <button className="primary focusable" onClick={(event) => { event.stopPropagation(); onPlay(); }}>Play</button>
        <button className="ghostBtn focusable" onClick={(event) => { event.stopPropagation(); onToggleFavorite(); }}>{favorite ? "Entfernen" : "Merken"}</button>
      </div>
    </button>
  );
}

function PosterGrid({ items, selectedId, watch, onSelect, onPlay, onToggleFavorite, emptyAction }) {
  const [visibleCount, setVisibleCount] = useState(48);

  useEffect(() => {
    setVisibleCount(48);
  }, [items]);

  const visible = items.slice(0, visibleCount);

  if (!items.length) {
    return <EmptyState title="Keine Inhalte sichtbar" text="Pruefe Suche, Kategorie oder importiere eine eigene Playlist." action={emptyAction?.label} onClick={emptyAction?.onClick} />;
  }

  return (
    <section className="posterGrid" aria-label="Mediathek">
      {visible.map((item) => (
        <PosterTile
          key={item.id}
          item={item}
          active={item.id === selectedId}
          favorite={watch.includes(item.id)}
          onOpen={() => onSelect(item)}
          onPlay={() => onPlay(item)}
          onToggleFavorite={() => onToggleFavorite(item.id)}
        />
      ))}
      {visibleCount < items.length ? (
        <button className="loadMore focusable" onClick={() => setVisibleCount((count) => count + 48)}>
          Mehr laden ({Math.min(visibleCount, items.length)} von {items.length})
        </button>
      ) : null}
    </section>
  );
}

function VirtualStreamList({ items, selectedId, watch, onSelect, onPlay, onToggleFavorite, tvMode, emptyAction }) {
  const [visibleCount, setVisibleCount] = useState(80);

  useEffect(() => {
    setVisibleCount(80);
  }, [items]);

  const visible = items.slice(0, visibleCount);

  if (!items.length) {
    return <EmptyState title="Keine Inhalte sichtbar" text="Pruefe Suche, Kategorie oder importiere eine eigene Playlist." action={emptyAction?.label} onClick={emptyAction?.onClick} />;
  }

  return (
    <section className="virtualList" aria-label="Senderliste">
      {visible.map((item) => (
        <StreamTile
          key={item.id}
          item={item}
          active={item.id === selectedId}
          favorite={watch.includes(item.id)}
          onOpen={() => onSelect(item)}
          onPlay={() => onPlay(item)}
          onToggleFavorite={() => onToggleFavorite(item.id)}
          tvMode={tvMode}
        />
      ))}
      {visibleCount < items.length ? (
        <button className="loadMore focusable" onClick={() => setVisibleCount((count) => count + 80)}>
          Mehr laden ({Math.min(visibleCount, items.length)} von {items.length})
        </button>
      ) : null}
    </section>
  );
}

function CategoryRail({ liveCount, movieCount, seriesCount, onOpen }) {
  const entries = [
    ["live", "Live TV", liveCount, "Sender live starten"],
    ["movies", "Filme", movieCount, "VOD Filme ansehen"],
    ["series", "Serien", seriesCount, "Serien-Bereich oeffnen"],
  ];

  return (
    <section className="wowRail">
      <div className="railHeading">
        <h2>Live TV Kategorien</h2>
        <span>Live TV · Filme · Serien</span>
      </div>
      <div className="wowCategoryGrid">
        {entries.map(([key, title, count, text]) => (
          <button key={key} className={`wowCategoryCard focusable wowCategory-${key}`} onClick={() => onOpen(key)} disabled={!count}>
            <b>{title}</b>
            <span>{count ? `${count} Eintraege` : "Noch keine Daten"}</span>
            <small>{count ? text : "Nach Import sichtbar"}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [items, setItems] = useState(() => load("items", DEFAULT_ITEMS));
  const [selected, setSelected] = useState(() => load("selected", ""));
  const [watch, setWatch] = useState(() => load("watch", []));
  const [hiddenCategories, setHiddenCategories] = useState(() => load("hiddenCategories", []));
  const [settings, setSettings] = useState(() => load("settings", DEFAULT_SETTINGS));
  const [page, setPage] = useState("start");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("Alle");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [status, setStatus] = useState("Bereit.");
  const [importStep, setImportStep] = useState("");
  const [importError, setImportError] = useState("");
  const [importMode, setImportMode] = useState("m3u");
  const [m3uUrl, setM3uUrl] = useState(() => load("m3uUrl", ""));
  const [m3uText, setM3uText] = useState("");
  const [auth, setAuth] = useState(() => load("auth", { server: "", username: "", password: "" }));
  const [playerError, setPlayerError] = useState("");
  const [backendState, setBackendState] = useState(() => ({
    checked: false,
    ok: false,
    message: BACKEND_URL ? "Render Backend wird geprueft ..." : "Render Backend nicht konfiguriert.",
  }));

  const nativeAndroid = isNativeAndroid();
  const tvMode = !!settings.tvMode;
  const selectedItem = items.find((entry) => entry.id === selected) || items[0] || EMPTY_ITEM;
  const selectedPlaybackUrl = createPlaybackUrl(selectedItem.streamUrl, selectedItem.source);
  const selectedPreferHls = isLikelyHls(selectedItem.streamUrl, selectedPlaybackUrl);
  const selectedPreferTs = isLikelyTs(selectedItem.streamUrl, selectedPlaybackUrl);
  const hiddenSet = useMemo(() => new Set(hiddenCategories), [hiddenCategories]);
  const visibleItems = useMemo(() => items.filter((entry) => !hiddenSet.has(categoryKey(entry))), [items, hiddenSet]);
  const liveItems = visibleItems.filter((entry) => entry.section === "live");
  const movieItems = visibleItems.filter((entry) => entry.section === "movie");
  const seriesItems = visibleItems.filter((entry) => entry.section === "series");
  const favoriteItems = visibleItems.filter((entry) => watch.includes(entry.id));
  const continueItems = visibleItems.filter((entry) => entry.progress > 0).sort((a, b) => (b.progress || 0) - (a.progress || 0));
  const hasPlaylist = visibleItems.length > 0;
  const heroItem = continueItems[0] || selectedItem || liveItems[0] || movieItems[0] || seriesItems[0] || EMPTY_ITEM;
  const isPro = false;
  const activeSection = page === "movies" ? "movie" : page === "series" ? "series" : page === "favorites" ? "favorites" : "live";
  const baseItems = activeSection === "movie" ? movieItems : activeSection === "series" ? seriesItems : activeSection === "favorites" ? favoriteItems : liveItems;
  const groups = useMemo(() => ["Alle", ...Array.from(new Set(baseItems.map(itemGroup))).sort((a, b) => a.localeCompare(b, "de"))], [baseItems]);
  const filteredItems = useMemo(
    () =>
      baseItems.filter(
        (entry) =>
          (group === "Alle" || itemGroup(entry) === group) &&
          (!query || `${entry.title} ${entry.category} ${entry.group}`.toLowerCase().includes(query.toLowerCase()))
      ),
    [baseItems, group, query]
  );

  useEffect(() => {
    const onKey = (event) => {
      const isBack = event.key === "Escape" || event.key === "Backspace" || event.key === "BrowserBack";
      if (isBack && page !== "live" && page !== "start") {
        event.preventDefault();
        setPage(hasPlaylist ? "live" : "start");
        return;
      }

      if (!tvMode) {
        return;
      }

      const focusables = Array.from(document.querySelectorAll("button,input,select,textarea,.focusable")).filter((element) => !element.disabled && element.offsetParent !== null);
      const current = document.activeElement;
      const index = Math.max(0, focusables.indexOf(current));
      if (["ArrowRight", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        (focusables[index + 1] || focusables[0])?.focus?.();
      }
      if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        (focusables[index - 1] || focusables[focusables.length - 1])?.focus?.();
      }
      if (event.key === "Enter" && current?.click) {
        current.click();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, tvMode, hasPlaylist]);

  useEffect(() => {
    let cancelled = false;

    async function verifyBackend() {
      const health = await checkBackendHealth();
      if (cancelled) {
        return;
      }

      setBackendState({
        checked: true,
        ok: !!health.ok,
        message: health.ok ? `Render Backend online (${health.version || "OK"})` : health.error,
      });
    }

    verifyBackend();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSecureAuth() {
      const storedAuth = await secureGet("xtreamAuth", null);
      if (!cancelled && storedAuth?.server && storedAuth?.username && storedAuth?.password) {
        setAuth(storedAuth);
      }
    }

    loadSecureAuth();
    secureGet("m3uUrl", "").then((storedUrl) => {
      if (!cancelled && storedUrl) {
        setM3uUrl(storedUrl);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function persist(key, value, setter) {
    const result = save(key, value);
    setter(value);
    return result;
  }

  function updateSetting(key, value) {
    persist("settings", { ...settings, [key]: value }, setSettings);
  }

  function notify(message) {
    setStatus(message);
    setToast(message);
    setTimeout(() => setToast(""), 2800);
  }

  function requireBackendForUrlImport() {
    if (backendState.ok) {
      return true;
    }

    const message = backendState.message || "Render Backend nicht erreichbar.";
    setImportError(message);
    setStatus(message);
    return false;
  }

  function selectItem(item) {
    persist("selected", item.id, setSelected);
  }

  async function playItem(item = selectedItem) {
    selectItem(item);
    setPlayerError("");
    if (nativeAndroid && settings.playerMode !== "web") {
      try {
        await openNativePlayer(item);
        notify(`Player gestartet: ${item.title}`);
        return;
      } catch (error) {
        setPlayerError(`${error.message} WebPlayer-Fallback ist aktiv.`);
        updateSetting("playerMode", "web");
      }
    }
    setPage("player");
  }

  function zap(delta) {
    const currentList = liveItems.length ? liveItems : visibleItems;
    const currentIndex = Math.max(0, currentList.findIndex((entry) => entry.id === selectedItem.id));
    const nextItem = currentList[(currentIndex + delta + currentList.length) % currentList.length];
    if (nextItem) {
      playItem(nextItem);
    }
  }

  function updateProgress(progress) {
    persist("items", items.map((entry) => (entry.id === selectedItem.id ? { ...entry, progress: Math.max(entry.progress || 0, progress) } : entry)), setItems);
  }

  function toggleFavorite(id) {
    if (!watch.includes(id) && !isPro && watch.length >= FREE_FAVORITE_LIMIT) {
      notify(`Free Limit erreicht: maximal ${FREE_FAVORITE_LIMIT} Favoriten. Pro fuer ${PRO_PRICE} ist vorbereitet.`);
      setPage("settings");
      return;
    }
    persist("watch", watch.includes(id) ? watch.filter((entry) => entry !== id) : [...watch, id], setWatch);
  }

  function finishImport(mapped, label) {
    if (!mapped.length) {
      throw new Error("Die Playlist ist leer oder enthaelt keine abspielbaren Eintraege.");
    }
    const result = persist("items", mapped, setItems);
    persist("hiddenCategories", [], setHiddenCategories);
    const firstPlayable = mapped.find((entry) => entry.section === "live") || mapped[0];
    persist("selected", firstPlayable.id, setSelected);
    setQuery("");
    setGroup("Alle");
    setPage(firstPlayable.section === "movie" ? "movies" : "live");
    setImportStep("Import abgeschlossen.");
    notify(result.warning || `${mapped.length} Eintraege importiert. Live TV ist bereit.`);
    if (label === "m3u-text") {
      setM3uText("");
    }
  }

  async function importM3U(sourceKind = "url") {
    const input = sourceKind === "text" ? m3uText.trim() : m3uUrl.trim() || m3uText.trim();
    if (!input) {
      setImportError("Bitte eine M3U/M3U8-URL einfuegen oder Listeninhalt einsetzen.");
      return;
    }

    try {
      setBusy(true);
      setImportError("");
      setImportStep(BACKEND_URL && !input.includes("#EXTINF") ? "M3U wird ueber Backend geladen ..." : "M3U wird geladen ...");
      if (!input.includes("#EXTINF") && !input.includes("#EXTM3U") && !requireBackendForUrlImport()) {
        return;
      }
      const text = await fetchM3UProxy(input);
      const parsed = await parseM3UAsync(text, (progress) => setImportStep(`Playlist wird verarbeitet ... ${progress}%`));
      if (sourceKind === "url" && m3uUrl.trim()) {
        await secureSet("m3uUrl", m3uUrl.trim()).catch(() => false);
      }
      finishImport(parsed, sourceKind === "text" ? "m3u-text" : "m3u");
    } catch (error) {
      setImportError(error.message);
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function importXtream() {
    if (!auth.server || !auth.username || !auth.password) {
      setImportError("Bitte Server, Benutzername und Passwort ausfuellen.");
      return;
    }

    try {
      if (!requireBackendForUrlImport()) {
        return;
      }
      setBusy(true);
      setImportError("");
      setImportStep("Live TV wird geladen ...");
      const liveData = await fetchXtreamProxy(auth, "get_live_streams");
      setImportStep("Filme werden geladen ...");
      const vodData = await fetchXtreamProxy(auth, "get_vod_streams").catch(() => []);
      setImportStep("Serien werden geladen ...");
      const seriesData = await fetchXtreamProxy(auth, "get_series").catch(() => []);
      await secureSet("xtreamAuth", auth).catch(() => false);
      finishImport([...mapLive(liveData, auth), ...mapVod(vodData, auth), ...mapSeries(seriesData)], "xtream");
    } catch (error) {
      setImportError(error.message);
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  function deletePlaylist() {
    if (settings.safeMode && !confirm("Lokale Playlist wirklich entfernen?")) {
      return;
    }
    persist("items", DEFAULT_ITEMS, setItems);
    persist("selected", "", setSelected);
    persist("watch", [], setWatch);
    persist("hiddenCategories", [], setHiddenCategories);
    setPage("start");
    notify("Playlist entfernt.");
  }

  function toggleCategory(key) {
    persist("hiddenCategories", hiddenSet.has(key) ? hiddenCategories.filter((entry) => entry !== key) : [...hiddenCategories, key], setHiddenCategories);
  }

  function renderStart() {
    const canContinue = hasPlaylist && heroItem.streamUrl;

    return (
      <main className="wowHome">
        <section className="wowHero focusable" tabIndex="0">
          <div className="wowHeroGlow" />
          <div className="heroAurora" />
          <div className="badge">{APP_BADGE}</div>
          <span className="eyebrow">Weiter schauen</span>
          <h1>{canContinue ? heroItem.title : "Deine IPTV Welt wartet"}</h1>
          <p>{canContinue ? `${itemGroup(heroItem)} - sofort weiter abspielen` : "Fuege deine eigene Playlist hinzu und starte direkt in Live TV, Filme und Serien."}</p>
          <div className="startActions">
            <button className="primary hugeAction focusable" disabled={!canContinue} onClick={() => playItem(heroItem)}>
              Weiter schauen
            </button>
            <button className="secondary hugeAction focusable" onClick={() => setPage("import")}>
              Playlist hinzufuegen
            </button>
          </div>
          <p className="legalTiny">{LEGAL_NOTICE}</p>
        </section>
        <CategoryRail liveCount={liveItems.length} movieCount={movieItems.length} seriesCount={seriesItems.length} onOpen={(key) => setPage(key)} />
        {!hasPlaylist ? <div className="softHint">Noch keine Playlist vorhanden. Der Import ist der erste Schritt, danach erscheint hier sofort dein Premium-Startscreen.</div> : null}
      </main>
    );
  }

  function renderImport() {
    return (
      <main className="premiumImport">
        <section className="importHead">
          <button className="ghostBtn focusable" onClick={() => setPage(hasPlaylist ? "live" : "start")}>Zurueck</button>
          <h1>Playlist hinzufuegen</h1>
          <p>{LEGAL_NOTICE}</p>
        </section>
        <section className="importShell">
          <div className="modeSwitch">
            <button className={importMode === "m3u" ? "premiumNavActive focusable" : "premiumNavBtn focusable"} onClick={() => setImportMode("m3u")}>M3U / M3U8</button>
            <button className={importMode === "xtream" ? "premiumNavActive focusable" : "premiumNavBtn focusable"} onClick={() => setImportMode("xtream")}>Xtream</button>
          </div>
          {importMode === "m3u" ? (
            <div className="importForm">
              <label>M3U/M3U8 URL</label>
              <input className="focusable" placeholder="https://..." value={m3uUrl} onChange={(event) => setM3uUrl(event.target.value)} />
              <button className="primary wide focusable" disabled={busy} onClick={() => importM3U("url")}>{busy ? "Laedt ..." : "M3U laden"}</button>
              <label>Optional: Listeninhalt</label>
              <textarea className="focusable" placeholder="#EXTM3U..." value={m3uText} onChange={(event) => setM3uText(event.target.value)} />
              <button className="secondary wide focusable" disabled={busy} onClick={() => importM3U("text")}>Inhalt laden</button>
            </div>
          ) : (
            <div className="importForm">
              <label>Server</label>
              <input className="focusable" placeholder="https://server:port" value={auth.server} onChange={(event) => setAuth({ ...auth, server: event.target.value })} />
              <label>Benutzername</label>
              <input className="focusable" value={auth.username} onChange={(event) => setAuth({ ...auth, username: event.target.value })} />
              <label>Passwort</label>
              <input className="focusable" type="password" value={auth.password} onChange={(event) => setAuth({ ...auth, password: event.target.value })} />
              <button className="primary wide focusable" disabled={busy} onClick={importXtream}>{busy ? "Import laeuft ..." : "Xtream laden"}</button>
              <small className="muted">Zugangsdaten bleiben sitzungsbezogen und werden nicht in Quellprofilen gespeichert.</small>
            </div>
          )}
          <StatusPanel status={status} importStep={importStep} importError={importError} />
        </section>
      </main>
    );
  }

  function renderLibrary() {
    const headline = page === "movies" ? "Filme" : page === "series" ? "Serien" : page === "favorites" ? "Favoriten" : "Live TV";
    const isPosterView = page === "movies" || page === "series";
    return (
      <main className="premiumWorkspace">
        <section className="libraryHero">
          <div>
            <span className="eyebrow">{headline}</span>
            <h1>{selectedItem.title || headline}</h1>
            <p>{hasPlaylist ? `${filteredItems.length} sichtbar - ${visibleItems.length} importiert` : "Fuege zuerst eine eigene Playlist hinzu."}</p>
          </div>
          <div className="heroActions">
            <button className="primary hugeAction focusable" disabled={!selectedItem.streamUrl} onClick={() => playItem(selectedItem)}>
              Abspielen
            </button>
            <button className="secondary hugeAction focusable" onClick={() => setPage("import")}>
              Playlist hinzufuegen
            </button>
            {page === "live" ? (
              <>
                <button className="ghostBtn hugeAction focusable" disabled={!liveItems.length} onClick={() => zap(-1)}>Kanal -</button>
                <button className="ghostBtn hugeAction focusable" disabled={!liveItems.length} onClick={() => zap(1)}>Kanal +</button>
              </>
            ) : null}
          </div>
        </section>
        {playerError ? <div className="errorBox">{playerError}</div> : null}
        <section className="premiumFilters">
          <input className="focusable" placeholder="Sender, Film oder Kategorie suchen ..." value={query} onChange={(event) => setQuery(event.target.value)} />
          <select className="focusable" value={group} onChange={(event) => setGroup(event.target.value)}>
            {groups.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </section>
        {isPosterView ? (
          <PosterGrid items={filteredItems} selectedId={selected} watch={watch} onSelect={selectItem} onPlay={playItem} onToggleFavorite={toggleFavorite} emptyAction={{ label: "Playlist hinzufuegen", onClick: () => setPage("import") }} />
        ) : (
          <VirtualStreamList items={filteredItems} selectedId={selected} watch={watch} onSelect={selectItem} onPlay={playItem} onToggleFavorite={toggleFavorite} tvMode={tvMode} emptyAction={{ label: "Playlist hinzufuegen", onClick: () => setPage("import") }} />
        )}
      </main>
    );
  }

  function renderPlayer() {
    return (
      <main className="playerScreen">
        <button className="ghostBtn focusable" onClick={() => setPage("live")}>Zurueck</button>
        <h1>{selectedItem.title}</h1>
        <p className="muted">{itemGroup(selectedItem)} - {selectedItem.source || "Import"}</p>
        {selectedItem.streamUrl ? (
          <div className="cinemaFrame"><Player src={selectedPlaybackUrl} preferHls={selectedPreferHls} preferTs={selectedPreferTs} autoplay={settings.autoplay} onProgress={updateProgress} onStatus={setStatus} onDiagnostic={() => {}} tvMode={tvMode} /></div>
        ) : (
          <EmptyState title="Kein Stream ausgewaehlt" text="Waehle zuerst einen Sender aus deiner Playlist." action="Live TV" onClick={() => setPage("live")} />
        )}
      </main>
    );
  }

  function renderSettings() {
    const categories = Array.from(new Map(items.map((item) => [categoryKey(item), { key: categoryKey(item), name: itemGroup(item), count: items.filter((entry) => categoryKey(entry) === categoryKey(item)).length }])).values());
    return (
      <main className="settingsPage">
        <h1>Einstellungen</h1>
        <section className="settingsGroup legalNotice"><h3>Rechtlicher Hinweis</h3><p>{LEGAL_NOTICE}</p></section>
        <section className="settingsGroup">
          <h3>Player</h3>
          <div className="settingsGrid">
            <button className={`settingTile focusable ${settings.playerMode === "native" ? "settingActive" : ""}`} onClick={() => updateSetting("playerMode", "native")}><b>Nativer Player</b><small>Android / Fire TV bevorzugt</small></button>
            <button className={`settingTile focusable ${settings.playerMode === "web" ? "settingActive" : ""}`} onClick={() => updateSetting("playerMode", "web")}><b>WebPlayer</b><small>Fallback in WebView</small></button>
            <button className={`settingTile focusable ${settings.autoplay ? "settingActive" : ""}`} onClick={() => updateSetting("autoplay", !settings.autoplay)}><b>Autoplay</b><small>Stream direkt starten</small></button>
            <button className={`settingTile focusable ${settings.tvMode ? "settingActive" : ""}`} onClick={() => updateSetting("tvMode", !settings.tvMode)}><b>TV Modus</b><small>Grosse Fokus-Navigation</small></button>
          </div>
        </section>
        <section className="settingsGroup">
          <h3>Kategorien</h3>
          <div className="categoryManager">
            {categories.length ? categories.map((category) => (
              <button key={category.key} className={`categoryPill focusable ${hiddenSet.has(category.key) ? "categoryHidden" : ""}`} onClick={() => toggleCategory(category.key)}>
                {category.name} <span>{hiddenSet.has(category.key) ? "ausgeblendet" : `${category.count}`}</span>
              </button>
            )) : <p className="muted">Noch keine Kategorien vorhanden.</p>}
          </div>
        </section>
        <section className="settingsGroup">
          <h3>Pro</h3>
          <div className="proPanel">
            <div>
              <span className="goldPill">Pro bald verfuegbar</span>
              <h2>IPTV Mat Pro</h2>
              <p>4,99 EUR pro Monat. Geplant sind unbegrenzte Favoriten, mehrere Playlists, EPG Cache und Premium Player Optionen.</p>
              <small>Google Play Billing Produkt-ID: {PRO_PRODUCT_ID}</small>
            </div>
            <button className="secondary focusable" disabled>Pro bald verfuegbar</button>
          </div>
          <p className="muted">Keine Fake-Zahlung: Der Kauf wird erst aktiviert, wenn Google Play Billing voll integriert und getestet ist.</p>
        </section>
        <section className="settingsGroup">
          <h3>App</h3>
          <div className="settingsGrid">
            <button className="settingTile focusable" onClick={() => setPage("import")}><b>Playlist hinzufuegen</b><small>M3U oder Xtream laden</small></button>
            <button className={`settingTile focusable ${settings.safeMode ? "settingActive" : ""}`} onClick={() => updateSetting("safeMode", !settings.safeMode)}><b>Loesch-Schutz</b><small>Bestaetigung vor Reset</small></button>
            <button className="settingTile danger focusable" onClick={deletePlaylist}><b>Playlist entfernen</b><small>Lokale Inhalte loeschen</small></button>
          </div>
        </section>
        <section className="settingsGroup">
          <h3>EPG, Recording, Premium</h3>
          <p className="muted">EPG Cache ist fuer Pro vorbereitet. Recording ist nur als spaetere Vormerk-Funktion geplant und wird nicht als echte Aufnahme beworben.</p>
        </section>
      </main>
    );
  }

  const nav = [
    ["live", "Live TV", true],
    ["movies", "Filme", true],
    ["series", "Serien", true],
    ["favorites", "Favoriten", true],
    ["settings", "Einstellungen", true],
  ].filter((entry) => entry[2]);
  const isNavActive = (key) =>
    page === key ||
    (key === "live" && page === "player");

  return (
    <div className={`app premiumApp ${tvMode ? "tvMode" : ""}`}>
      {toast ? <div className="toast">{toast}</div> : null}
      <header className="premiumTop">
        <button className="brandButton focusable" onClick={() => setPage(hasPlaylist ? "live" : "start")}>
          <span className="brandMark" />
          <b>IPTV Mat Player</b>
          <small>{APP_BADGE}</small>
        </button>
        <nav className="premiumTopNav" aria-label="Hauptnavigation">
          {nav.map(([key, label]) => <SectionButton key={key} active={isNavActive(key)} onClick={() => { setPage(key); setGroup("Alle"); }}>{label}</SectionButton>)}
        </nav>
      </header>
      {!backendState.ok ? <div className="offlineBanner">{backendState.message} Import ueber URL, Xtream und Proxy-Wiedergabe pausieren, bis Render online ist.</div> : null}
      {page === "start" ? renderStart() : null}
      {page === "import" ? renderImport() : null}
      {["live", "movies", "series", "favorites"].includes(page) ? renderLibrary() : null}
      {page === "player" ? renderPlayer() : null}
      {page === "settings" ? renderSettings() : null}
      {settings.mobileNav ? (
        <footer className="premiumBottomNav">
          {nav.map(([key, label]) => <SectionButton key={key} active={isNavActive(key)} onClick={() => { setPage(key); setGroup("Alle"); }}>{label}</SectionButton>)}
        </footer>
      ) : null}
    </div>
  );
}
