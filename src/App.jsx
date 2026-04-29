import React, { useEffect, useMemo, useState } from "react";
import Player from "./components/Player.jsx";
import {
  AutoZapPanel,
  Card,
  CommandBar,
  EmptyState,
  EpgCard,
  EpgTimeline,
  FeatureOverview,
  FinalAuditPanel,
  Login,
  MiniStatus,
  ProgramGuide,
  ProgramRow,
  RecordingCard,
  SmartRail,
  SourceProfilesPanel,
  Stat,
  StatusPanel,
  StreamDiagnosticsPanel,
  EPG_EVENTS,
} from "./components/ui.jsx";
import {
  arr,
  APP_BADGE,
  categoryKey,
  DEFAULT_ITEMS,
  EMPTY_ITEM,
  EPG_ROWS,
  epgDuration,
  itemGroup,
  minutesOf,
} from "./lib/appData.js";
import { BACKEND_URL, createPlaybackUrl, fetchM3UProxy, fetchXtreamProxy, isLikelyHls, isLikelyTs, mapLive, mapSeries, mapVod, parseM3U } from "./lib/importers.js";
import { isNativeAndroid, openNativePlayer } from "./lib/nativePlayer.js";
import { load, save } from "./lib/storage.js";

export default function App() {
  const [session, setSession] = useState(() => load("session", null));
  const [items, setItems] = useState(() => load("items", DEFAULT_ITEMS));
  const [selected, setSelected] = useState(() => load("selected", ""));
  const [watch, setWatch] = useState(() => load("watch", []));
  const [hiddenCategories, setHiddenCategories] = useState(() => load("hiddenCategories", []));
  const [settings, setSettings] = useState(() =>
    load("settings", {
      autoplay: true,
      autosave: true,
      compact: false,
      adult: false,
      trailer: true,
      motion: true,
      sort: "name",
      tvMode: false,
      tvDensity: "large",
      safeMode: true,
    })
  );
  const [page, setPage] = useState("home");
  const [hub, setHub] = useState("dashboard");
  const [programView, setProgramView] = useState("guide");
  const [autoZap, setAutoZap] = useState(false);
  const [zapSeconds, setZapSeconds] = useState(() => load("zapSeconds", 8));
  const [tab, setTab] = useState("live");
  const [group, setGroup] = useState("Alle");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Bereit.");
  const [auth, setAuth] = useState(() => load("auth", { server: "", username: "", password: "" }));
  const [m3uUrl, setM3uUrl] = useState(() => load("m3uUrl", ""));
  const [m3uText, setM3uText] = useState("");
  const [profileName, setProfileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [importCount, setImportCount] = useState(() => load("importCount", 0));
  const [stamp, setStamp] = useState(() => load("stamp", ""));
  const [importStep, setImportStep] = useState("");
  const [importError, setImportError] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [epgSearch, setEpgSearch] = useState("");
  const [epgFilter, setEpgFilter] = useState("Alle");
  const [selectedEpg, setSelectedEpg] = useState(null);
  const [recordings, setRecordings] = useState(() => load("recordings", []));
  const [sourceProfiles, setSourceProfiles] = useState(() => load("sourceProfiles", []));
  const [streamDiagnostics, setStreamDiagnostics] = useState(() =>
    load("streamDiagnostics", {
      state: "idle",
      lastError: "",
      lastUrl: "",
      updatedAt: 0,
    })
  );

  const selectedItem = items.find((entry) => entry.id === selected) || items[0] || EMPTY_ITEM;
  const nativeAndroid = isNativeAndroid();
  const selectedPlaybackUrl = createPlaybackUrl(selectedItem.streamUrl, selectedItem.source);
  const selectedPreferHls = isLikelyHls(selectedItem.streamUrl, selectedPlaybackUrl);
  const selectedPreferTs = isLikelyTs(selectedItem.streamUrl, selectedPlaybackUrl);
  const hiddenSet = useMemo(() => new Set(hiddenCategories), [hiddenCategories]);
  const visibleItems = useMemo(() => items.filter((entry) => !hiddenSet.has(categoryKey(entry))), [items, hiddenSet]);
  const categories = useMemo(() => {
    const map = new Map();
    for (const entry of items) {
      const key = categoryKey(entry);
      const name = itemGroup(entry);
      const existing = map.get(key) || { key, name, section: entry.section, count: 0, sourceCount: {} };
      existing.count += 1;
      existing.sourceCount[entry.source || "app"] = (existing.sourceCount[entry.source || "app"] || 0) + 1;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name, "de"));
  }, [items]);
  const groups = useMemo(
    () => ["Alle", ...Array.from(new Set(visibleItems.filter((entry) => tab === "all" || entry.section === tab).map((entry) => itemGroup(entry)))).sort((a, b) => a.localeCompare(b, "de"))],
    [visibleItems, tab]
  );
  const filtered = useMemo(() => {
    const nextItems = visibleItems.filter(
      (entry) =>
        (tab === "all" || entry.section === tab) &&
        (group === "Alle" || itemGroup(entry) === group) &&
        (!search || `${entry.title} ${entry.category} ${entry.description} ${entry.group}`.toLowerCase().includes(search.toLowerCase())) &&
        (!settings.adult || entry.rating !== "16+")
    );

    if (settings.sort === "progress") {
      nextItems.sort((a, b) => (b.progress || 0) - (a.progress || 0));
    } else {
      nextItems.sort((a, b) => String(a.title).localeCompare(String(b.title), "de"));
    }

    return nextItems;
  }, [visibleItems, tab, group, search, settings.adult, settings.sort]);

  const liveCount = visibleItems.filter((entry) => entry.section === "live").length;
  const movieCount = visibleItems.filter((entry) => entry.section === "movie").length;
  const seriesCount = visibleItems.filter((entry) => entry.section === "series").length;
  const continueWatching = [...visibleItems].filter((entry) => entry.progress > 0).sort((a, b) => b.progress - a.progress).slice(0, 8);
  const watchlist = visibleItems.filter((entry) => watch.includes(entry.id));
  const liveNow = visibleItems.filter((entry) => entry.section === "live").slice(0, 8);
  const recommended = useMemo(() => {
    const favoriteGroup = itemGroup(selectedItem);
    return visibleItems.filter((entry) => entry.id !== selectedItem.id && (itemGroup(entry) === favoriteGroup || entry.section === selectedItem.section)).slice(0, 8);
  }, [visibleItems, selectedItem]);
  const latest = [...visibleItems].slice(-8).reverse();
  const categoryList = useMemo(
    () => categories.filter((entry) => !categorySearch || `${entry.name} ${entry.section}`.toLowerCase().includes(categorySearch.toLowerCase())),
    [categories, categorySearch]
  );
  const tvMode = !!settings.tvMode;
  const health = { total: items.length, visible: visibleItems.length, hidden: hiddenCategories.length, watch: watch.length, recordings: recordings.length };
  const epgFiltered = useMemo(
    () => EPG_EVENTS.filter((entry) => (epgFilter === "Alle" || entry.genre === epgFilter) && (!epgSearch || `${entry.title} ${entry.channel} ${entry.genre}`.toLowerCase().includes(epgSearch.toLowerCase()))),
    [epgSearch, epgFilter]
  );
  const epgGenres = useMemo(() => ["Alle", ...Array.from(new Set(EPG_EVENTS.map((entry) => entry.genre))).sort((a, b) => a.localeCompare(b, "de"))], []);

  useEffect(() => {
    const onKey = (event) => {
      if (!tvMode) {
        return;
      }

      const focusables = Array.from(document.querySelectorAll("button,input,select,textarea,.focusable")).filter((element) => !element.disabled && element.offsetParent !== null);
      const current = document.activeElement;
      const index = focusables.indexOf(current);

      if (["ArrowRight", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        (focusables[index + 1] || focusables[0])?.focus?.();
      }
      if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        (focusables[index - 1] || focusables[focusables.length - 1])?.focus?.();
      }
      if (event.key === "Backspace" || event.key === "Escape") {
        if (page !== "home") {
          event.preventDefault();
          setPage("home");
        }
      }
      if (event.key === "Enter" && current?.click) {
        current.click();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tvMode, page]);

  useEffect(() => {
    if (!autoZap) {
      return undefined;
    }

    const liveList = visibleItems.filter((entry) => entry.section === "live");

    if (!liveList.length) {
      setAutoZap(false);
      setStatus("Auto-Zapping gestoppt: keine Live-Sender sichtbar.");
      return undefined;
    }

    const timer = setInterval(() => {
      const currentIndex = liveList.findIndex((entry) => entry.id === selected);
      const next = liveList[(currentIndex + 1 + liveList.length) % liveList.length];

      if (next) {
        persist("selected", next.id, setSelected);
        setStatus(`Auto-Zapping: ${next.title}`);
      }
    }, Math.max(3, Number(zapSeconds) || 8) * 1000);

    return () => clearInterval(timer);
  }, [autoZap, visibleItems, selected, zapSeconds]);

  function persist(key, value, setter) {
    const result = save(key, value);
    setter(value);
    return result;
  }

  function notify(message) {
    setStatus(message);
    setToast(message);
    setTimeout(() => setToast(""), 2600);
  }

  function updateDiagnostics(nextDiagnostics) {
    const value = { ...streamDiagnostics, ...nextDiagnostics };
    persist("streamDiagnostics", value, setStreamDiagnostics);
  }

  function setSelectedPersist(id) {
    persist("selected", id, setSelected);
    setPage("details");
  }

  function resolveItemTarget(target) {
    if (!target) {
      return selectedItem;
    }

    if (typeof target === "string") {
      return items.find((entry) => entry.id === target) || selectedItem;
    }

    return target;
  }

  async function playItemNative(target = selectedItem) {
    const item = resolveItemTarget(target);
    try {
      await openNativePlayer(item);
      setStatus(`Nativer Player geoeffnet: ${item.title}`);
    } catch (error) {
      setImportError(error.message);
      setStatus(error.message);
    }
  }

  function handlePlayOrOpen(target = selectedItem) {
    const item = resolveItemTarget(target);
    persist("selected", item.id, setSelected);
    if (nativeAndroid) {
      playItemNative(item);
      return;
    }
    setPage("details");
  }

  function updateProgress(progress) {
    if (!settings.autosave || !selectedItem) {
      return;
    }
    persist("items", items.map((entry) => (entry.id === selectedItem.id ? { ...entry, progress: Math.max(entry.progress || 0, progress) } : entry)), setItems);
  }

  function completePlayback() {
    persist("items", items.map((entry) => (entry.id === selectedItem.id ? { ...entry, progress: 100 } : entry)), setItems);
  }

  function toggleWatch(id) {
    const nextWatch = watch.includes(id) ? watch.filter((entry) => entry !== id) : [...watch, id];
    persist("watch", nextWatch, setWatch);
  }

  function hideCategory(key) {
    const nextCategories = Array.from(new Set([...hiddenCategories, key]));
    persist("hiddenCategories", nextCategories, setHiddenCategories);
    notify("Kategorie ausgeblendet.");
  }

  function showCategory(key) {
    const nextCategories = hiddenCategories.filter((entry) => entry !== key);
    persist("hiddenCategories", nextCategories, setHiddenCategories);
    notify("Kategorie wieder sichtbar.");
  }

  function toggleCategory(key) {
    hiddenSet.has(key) ? showCategory(key) : hideCategory(key);
  }

  function deleteCategory(key) {
    if (settings.safeMode && !confirm("Kategorie wirklich dauerhaft loeschen?")) {
      return;
    }
    const nextItems = items.filter((entry) => categoryKey(entry) !== key);
    persist("items", nextItems, setItems);
    showCategory(key);
    if (nextItems.length && categoryKey(selectedItem) === key) {
      persist("selected", nextItems[0].id, setSelected);
    }
    setStatus("Kategorie dauerhaft geloescht.");
  }

  function deleteItem(id) {
    if (settings.safeMode && !confirm("Diesen Eintrag wirklich loeschen?")) {
      return;
    }
    const nextItems = items.filter((entry) => entry.id !== id);
    persist("items", nextItems, setItems);
    persist("watch", watch.filter((entry) => entry !== id), setWatch);
    if (selected === id && nextItems.length) {
      persist("selected", nextItems[0].id, setSelected);
    }
    notify("Eintrag geloescht.");
  }

  function restoreAllCategories() {
    persist("hiddenCategories", [], setHiddenCategories);
    setStatus("Alle Kategorien wieder sichtbar.");
  }

  function resetApp() {
    if (settings.safeMode && !confirm("App-Inhalte und lokale Listen wirklich leeren?")) {
      return;
    }
    persist("items", DEFAULT_ITEMS, setItems);
    persist("selected", "", setSelected);
    persist("watch", [], setWatch);
    persist("hiddenCategories", [], setHiddenCategories);
    setStatus("Lokale Inhalte, Kategorien und Listen wurden geleert.");
    setImportStep("");
    setImportError("");
  }

  function clearProgress() {
    persist("items", items.map((entry) => ({ ...entry, progress: 0 })), setItems);
    setStatus("Fortschritte wurden zurueckgesetzt.");
  }

  async function testConn() {
    if (!auth.server || !auth.username || !auth.password) {
      setStatus("Bitte Zugangsdaten ausfuellen.");
      return;
    }
    try {
      setBusy(true);
      setImportError("");
      setImportStep(BACKEND_URL ? "Verbindung wird ueber das Backend geprueft ..." : "Verbindung wird geprueft ...");
      const info = await fetchXtreamProxy(auth, "get_live_categories");
      setStatus(`Verbindung OK. Kategorien: ${arr(info).length}`);
      setImportStep(BACKEND_URL ? "Backend-Proxy und Xtream-Verbindung OK." : "Verbindung OK.");
    } catch (error) {
      setImportError(error.message);
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function importXtream() {
    if (!auth.server || !auth.username || !auth.password) {
      setStatus("Bitte Server, Benutzername und Passwort ausfuellen.");
      return;
    }
    try {
      setBusy(true);
      setImportError("");
      setImportStep("1/3 Live TV wird geladen ...");
      setStatus(BACKEND_URL ? "Xtream Import laeuft ueber Backend-Proxy ..." : "Xtream Import laeuft ...");
      let liveData = [];
      let vodData = [];
      let seriesData = [];
      const errors = [];

      try {
        liveData = await fetchXtreamProxy(auth, "get_live_streams");
      } catch (error) {
        errors.push(`Live: ${error.message}`);
      }
      setImportStep("2/3 Filme werden geladen ...");
      try {
        vodData = await fetchXtreamProxy(auth, "get_vod_streams");
      } catch (error) {
        errors.push(`Filme: ${error.message}`);
      }
      setImportStep("3/3 Serien werden geladen ...");
      try {
        seriesData = await fetchXtreamProxy(auth, "get_series");
      } catch (error) {
        errors.push(`Serien: ${error.message}`);
      }

      const mapped = [...mapLive(liveData, auth), ...mapVod(vodData, auth), ...mapSeries(seriesData)];

      if (errors.length) {
        setImportError(errors.join(" | "));
      }
      if (!mapped.length) {
        throw new Error("Keine importierbaren Eintraege gefunden. Pruefe Zugangsdaten, URL oder Anbieter-CORS.");
      }

      const itemsSave = persist("items", mapped, setItems);
      persist("hiddenCategories", [], setHiddenCategories);
      persist("selected", mapped[0].id, setSelected);
      persist("importCount", mapped.length, setImportCount);
      const stampValue = new Date().toLocaleString("de-DE");
      persist("stamp", stampValue, setStamp);
      setImportStep("Xtream Import abgeschlossen.");
      setStatus(itemsSave.warning || `${mapped.length} Xtream-Eintraege importiert.`);
    } catch (error) {
      setImportError(error.message);
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function importM3UFromUrl() {
    const sourceInput = m3uUrl.trim() || m3uText.trim();

    if (!sourceInput) {
      setStatus("Bitte M3U URL oder M3U Text eingeben.");
      return;
    }
    try {
      setBusy(true);
      setImportError("");
      setImportStep(
        sourceInput.includes("#EXTM3U") || sourceInput.includes("#EXTINF")
          ? "M3U Text wird verarbeitet ..."
          : BACKEND_URL
            ? "M3U wird ueber das Backend geladen ..."
            : "M3U wird geladen ..."
      );
      if (m3uUrl.trim()) {
        persist("m3uUrl", m3uUrl.trim(), setM3uUrl);
      }
      const text = await fetchM3UProxy(sourceInput);
      const parsed = parseM3U(text);
      if (!parsed.length) {
        throw new Error("Keine M3U Sender gefunden. Pruefe Datei oder Format.");
      }
      const itemsSave = persist("items", parsed, setItems);
      persist("hiddenCategories", [], setHiddenCategories);
      persist("selected", parsed[0].id, setSelected);
      persist("importCount", parsed.length, setImportCount);
      const stampValue = new Date().toLocaleString("de-DE");
      persist("stamp", stampValue, setStamp);
      setImportStep("M3U Import abgeschlossen.");
      setStatus(itemsSave.warning || `${parsed.length} M3U-Eintraege importiert.`);
      if (sourceInput === m3uText.trim()) {
        setM3uText("");
      }
    } catch (error) {
      setImportError(error.message);
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  function importM3UFromText() {
    try {
      setImportError("");
      setImportStep("M3U Text wird verarbeitet ...");
      const parsed = parseM3U(m3uText);
      if (!parsed.length) {
        throw new Error("Keine M3U Sender im Text gefunden.");
      }
      const itemsSave = persist("items", parsed, setItems);
      persist("hiddenCategories", [], setHiddenCategories);
      persist("selected", parsed[0].id, setSelected);
      persist("importCount", parsed.length, setImportCount);
      const stampValue = new Date().toLocaleString("de-DE");
      persist("stamp", stampValue, setStamp);
      setImportStep("M3U Text Import abgeschlossen.");
      setStatus(itemsSave.warning || `${parsed.length} M3U-Eintraege importiert.`);
    } catch (error) {
      setImportError(error.message);
      setStatus(error.message);
    }
  }

  function mergeM3UText() {
    try {
      const parsed = parseM3U(m3uText);
      if (!parsed.length) {
        throw new Error("Keine M3U Sender im Text gefunden.");
      }
      const itemsSave = persist("items", [...items, ...parsed], setItems);
      setStatus(itemsSave.warning || `${parsed.length} M3U-Eintraege ergaenzt.`);
      setImportStep("M3U wurde ergaenzt, vorhandene Inhalte bleiben erhalten.");
    } catch (error) {
      setImportError(error.message);
      setStatus(error.message);
    }
  }

  function openEpgDetails(event) {
    setSelectedEpg(event);
    setPage("epg");
  }

  function scheduleRecording(event) {
    const target = items.find((entry) => String(entry.title).toLowerCase().includes(String(event.targetTitle || event.title).toLowerCase())) || selectedItem;
    const recording = {
      id: `rec-${Date.now()}`,
      title: event.title,
      channel: event.channel,
      start: event.start,
      end: event.end,
      genre: event.genre,
      status: "geplant - kein Recorder aktiv",
      streamUrl: target?.streamUrl || "",
      createdAt: new Date().toLocaleString("de-DE"),
    };
    const next = [...recordings, recording];
    persist("recordings", next, setRecordings);
      setStatus(`Planung vorgemerkt: ${event.title}. Das ist noch keine echte Aufnahme; dafuer braucht es einen Backend-Recorder.`);
    setSelectedEpg(event);
    setPage("recordings");
  }

  function removeRecording(id) {
    persist("recordings", recordings.filter((entry) => entry.id !== id), setRecordings);
    setStatus("Planung entfernt.");
  }

  function clearRecordings() {
    if (settings.safeMode && !confirm("Alle Planungen loeschen?")) {
      return;
    }
    persist("recordings", [], setRecordings);
    setStatus("Planungen geloescht.");
  }

  function saveCurrentSourceProfile() {
    const trimmedName = profileName.trim();
    if (!trimmedName) {
      setStatus("Bitte zuerst einen Profilnamen eingeben.");
      return;
    }

    const profile = m3uUrl.trim()
      ? {
          id: `profile-${Date.now()}`,
          name: trimmedName,
          type: "m3u",
          protected: true,
          label: "M3U-Quelle",
          updatedAt: new Date().toLocaleString("de-DE"),
        }
      : {
          id: `profile-${Date.now()}`,
          name: trimmedName,
          type: "xtream",
          server: auth.server,
          username: auth.username ? "***" : "",
          protected: true,
          updatedAt: new Date().toLocaleString("de-DE"),
        };

    const nextProfiles = [...sourceProfiles.filter((entry) => entry.name !== trimmedName), profile];
    persist("sourceProfiles", nextProfiles, setSourceProfiles);
    setProfileName("");
    setStatus(`Quellprofil gespeichert: ${trimmedName}`);
  }

  function applySourceProfile(profile) {
    if (profile.type === "m3u") {
      setStatus(`M3U-Profil geladen: ${profile.name}. URL aus Sicherheitsgruenden bitte neu eingeben.`);
      return;
    }

    setAuth({ server: profile.server || "", username: "", password: "" });
    setStatus(`Xtream-Profil geladen: ${profile.name}. Benutzername und Passwort bitte neu eingeben.`);
  }

  function removeSourceProfile(profileId) {
    persist("sourceProfiles", sourceProfiles.filter((entry) => entry.id !== profileId), setSourceProfiles);
    setStatus("Quellprofil entfernt.");
  }

  function startAutoZap() {
    setTab("live");
    setGroup("Alle");
    setAutoZap(true);
    notify("Auto-Zapping gestartet.");
  }

  function stopAutoZap() {
    setAutoZap(false);
    notify("Auto-Zapping gestoppt.");
  }

  if (!session) {
    return <Login onLogin={(data) => { save("session", data); setSession(data); }} />;
  }

  return (
    <div className={`app ${settings.motion ? "motion" : ""} ${tvMode ? "tvMode" : ""} tvDensity-${settings.tvDensity || "large"}`}>
      <header className="top">
        <div>
          <div className="badge">{APP_BADGE}</div>
          <h1>IPTV Mat Player</h1>
          <p>{tvMode ? "TV-Modus aktiv - Fernbedienung bereit" : new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}</p>
        </div>
        <button className="secondary focusable" onClick={() => { save("session", null); setSession(null); }}>
          Logout
        </button>
      </header>
      {toast ? <div className="toast">{toast}</div> : null}
      <MiniStatus busy={busy} autoZap={autoZap} tvMode={tvMode} hidden={hiddenCategories.length} recordings={recordings.length} />
      {page === "home" ? (
        <>
          <FinalAuditPanel />
          <section className="cleanHub">
            {[
              ["dashboard", "Start"],
              ["media", "Mediathek"],
              ["guide", "EPG"],
              ["manage", "Verwalten"],
            ].map(([key, label]) => (
              <button key={key} className={`hubBtn focusable ${hub === key ? "hubActive" : ""}`} onClick={() => setHub(key)}>
                {label}
              </button>
            ))}
          </section>
          {hub === "dashboard" ? (
            <>
              <section className="card">
                <h3>Smart Home</h3>
                <p className="muted">Startseite wie eine echte Streaming-App: Weiter schauen, Live jetzt, Empfehlungen und neue Inhalte.</p>
                <FeatureOverview />
                <div className="quickMenu">
                  <button className="primary focusable" onClick={() => setPage("details")}>Aktuellen Inhalt oeffnen</button>
                  <button className="secondary focusable" onClick={() => setPage("watch")}>Meine Liste</button>
                  <button className="secondary focusable" onClick={() => persist("settings", { ...settings, tvMode: !tvMode }, setSettings)}>{tvMode ? "TV-Modus aus" : "TV-Modus an"}</button>
                </div>
              </section>
              <AutoZapPanel enabled={autoZap} seconds={zapSeconds} setSeconds={(value) => { setZapSeconds(value); save("zapSeconds", value); }} onStart={startAutoZap} onStop={stopAutoZap} current={selectedItem} />
              <SmartRail title="Weiter schauen" items={continueWatching} onOpen={setSelectedPersist} tvMode={tvMode} empty="Sobald du etwas anschaust, erscheint es hier." />
              <SmartRail title="Live jetzt" items={liveNow} onOpen={setSelectedPersist} tvMode={tvMode} />
              <SmartRail title="Fuer dich empfohlen" items={recommended} onOpen={setSelectedPersist} tvMode={tvMode} />
              <SmartRail title="Zuletzt hinzugefuegt" items={latest} onOpen={setSelectedPersist} tvMode={tvMode} />
            </>
          ) : null}
          {hub === "media" ? <section className="card"><h3>Mediathek</h3><p className="muted">Programme sind jetzt uebersichtlicher: Guide-Ansicht, Karten-Ansicht oder kompakte Liste.</p><div className="quickMenu"><button className="primary focusable" onClick={() => { setTab("live"); setGroup("Alle"); }}>Live TV</button><button className="secondary focusable" onClick={() => { setTab("movie"); setGroup("Alle"); }}>Filme</button><button className="secondary focusable" onClick={() => { setTab("series"); setGroup("Alle"); }}>Serien</button><button className="secondary focusable" onClick={() => { setTab("all"); setGroup("Alle"); }}>Alle</button></div></section> : null}
          {hub === "guide" ? <section className="card"><h3>EPG & Planung</h3><p className="muted">Programmuebersicht und Vormerkungen sind zusammengefasst.</p><div className="quickMenu"><button className="primary focusable" onClick={() => setPage("epg")}>EPG oeffnen</button><button className="secondary focusable" onClick={() => setPage("recordings")}>Planungen</button></div></section> : null}
          {hub === "manage" ? <section className="card"><h3>Verwalten</h3><p className="muted">Import, Kategorien, Systemcheck und Einstellungen sind gesammelt.</p><div className="quickMenu"><button className="primary focusable" onClick={() => setPage("account")}>Import & Einstellungen</button><button className="secondary focusable" onClick={() => setPage("categories")}>Kategorien</button><button className="secondary focusable" onClick={() => setPage("system")}>Systemcheck</button></div></section> : null}
          <section className="stats">
            <Stat l="Live TV" v={liveCount} h="sichtbar" />
            <Stat l="Filme" v={movieCount} h="sichtbar" />
            <Stat l="Serien" v={seriesCount} h="sichtbar" />
            <Stat l="Ausgeblendet" v={hiddenCategories.length} h="Kategorien" />
          </section>
          <section className="hero" style={{ backgroundImage: `linear-gradient(180deg,rgba(7,10,18,.10),rgba(7,10,18,.95)),url(${selectedItem.cover})` }}>
            <div className="chips">{["live", "movie", "series", "all"].map((entry) => <button key={entry} className={`chip focusable ${tab === entry ? "active" : ""}`} onClick={() => { setTab(entry); setGroup("Alle"); }}>{entry}</button>)}</div>
            <h2>{selectedItem.title}</h2>
            <p>{selectedItem.description}</p>
            <div>
              <button className="primary focusable" onClick={() => handlePlayOrOpen(selectedItem)}>{nativeAndroid ? "Nativ abspielen" : "Abspielen / Details"}</button>
              <button className="secondary focusable" onClick={() => toggleWatch(selectedItem.id)}>{watch.includes(selectedItem.id) ? "Aus Watchlist" : "Zur Watchlist"}</button>
              <button className="danger focusable" onClick={() => deleteItem(selectedItem.id)}>Sender loeschen</button>
            </div>
            {settings.trailer && selectedItem.trailerUrl && !tvMode ? <video className="trailer" src={selectedItem.trailerUrl} muted autoPlay playsInline loop /> : null}
            {selectedItem.streamUrl ? nativeAndroid ? <div className="infoBox">Android nutzt den nativen Player fuer stabile TS-Wiedergabe. Tippe auf "Nativ abspielen".</div> : <Player src={selectedPlaybackUrl} preferHls={selectedPreferHls} preferTs={selectedPreferTs} autoplay={settings.autoplay} onProgress={updateProgress} onEnded={completePlayback} onStatus={setStatus} onDiagnostic={updateDiagnostics} tvMode={tvMode} /> : <EmptyState title="Keine Quelle geladen" text="Importiere zuerst eine eigene M3U- oder Xtream-Quelle." action="Import oeffnen" onClick={() => setPage("account")} />}
          </section>
          <CommandBar search={search} setSearch={setSearch} tab={tab} setTab={setTab} group={group} setGroup={setGroup} groups={groups} programView={programView} setProgramView={setProgramView} total={filtered.length} />
          <section className="card sortPanel">
            <button className={`chip focusable ${settings.sort === "name" ? "active" : ""}`} onClick={() => persist("settings", { ...settings, sort: "name" }, setSettings)}>A-Z</button>
            <button className={`chip focusable ${settings.sort === "progress" ? "active" : ""}`} onClick={() => persist("settings", { ...settings, sort: "progress" }, setSettings)}>Fortschritt</button>
          </section>
          <section className="card">
            <h3>Programmauswahl</h3>
            {programView === "guide" ? <ProgramGuide items={filtered} selectedId={selected} onSelect={(id) => persist("selected", id, setSelected)} onPlay={handlePlayOrOpen} onDelete={deleteItem} tvMode={tvMode} /> : null}
            {programView === "cards" ? (filtered.length ? <div className="grid">{filtered.map((item) => <Card key={item.id} it={item} compact={settings.compact} tvMode={tvMode} onClick={() => handlePlayOrOpen(item)} />)}</div> : <EmptyState title="Keine Inhalte sichtbar" text="Pruefe Suchfilter, Kategorien oder ausgeblendete Gruppen." action="Kategorien oeffnen" onClick={() => setPage("categories")} />) : null}
            {programView === "list" ? <div className="simpleProgramList">{filtered.map((item) => <ProgramRow key={item.id} it={item} active={item.id === selected} onClick={() => persist("selected", item.id, setSelected)} onPlay={() => handlePlayOrOpen(item)} onDelete={() => deleteItem(item.id)} />)}</div> : null}
          </section>
          <section className="card">
            <h3>High-End EPG Vorschau</h3>
            <div className="epgProList">{EPG_EVENTS.slice(0, 3).map((event) => <EpgCard key={event.id} event={event} onOpen={openEpgDetails} onRecord={scheduleRecording} tvMode={tvMode} />)}</div>
            <button className="secondary focusable" onClick={() => setPage("epg")}>EPG komplett oeffnen</button>
          </section>
          <StreamDiagnosticsPanel diagnostics={streamDiagnostics} currentTitle={selectedItem.title} />
        </>
      ) : null}
      {page === "details" ? <><section className="card"><img className="detailImg" src={selectedItem.cover} /><div className="chips"><span className="chip active">{selectedItem.badge}</span><span className="chip">{selectedItem.year}</span><span className="chip">{selectedItem.duration}</span><span className="chip">{selectedItem.source || "app"}</span></div><h2>{selectedItem.title}</h2><p>{selectedItem.description}</p><button className="primary focusable" onClick={() => nativeAndroid ? playItemNative(selectedItem) : toggleWatch(selectedItem.id)}>{nativeAndroid ? "Nativ starten" : watch.includes(selectedItem.id) ? "Aus Watchlist" : "Zur Watchlist"}</button><button className="secondary focusable" onClick={() => navigator.clipboard?.writeText(selectedItem.streamUrl).then(() => setStatus("Stream-URL kopiert."))}>Stream kopieren</button><button className="danger focusable" onClick={() => deleteItem(selectedItem.id)}>Diesen Sender loeschen</button>{nativeAndroid ? <div className="infoBox">Auf Android wird dieser Stream im nativen ExoPlayer geoeffnet, nicht mehr im WebView.</div> : <Player src={selectedPlaybackUrl} preferHls={selectedPreferHls} preferTs={selectedPreferTs} autoplay={false} onProgress={updateProgress} onEnded={completePlayback} onStatus={setStatus} onDiagnostic={updateDiagnostics} tvMode={tvMode} />}</section><StreamDiagnosticsPanel diagnostics={streamDiagnostics} currentTitle={selectedItem.title} /></> : null}
      {page === "watch" ? <><section className="card"><h3>Weiter ansehen</h3>{continueWatching.length ? <div className="grid">{continueWatching.map((item) => <Card key={item.id} it={item} tvMode={tvMode} onClick={() => setSelectedPersist(item.id)} />)}</div> : <EmptyState title="Noch kein Fortschritt" text="Sobald du Inhalte anschaust, erscheinen sie hier." />}</section><section className="card"><h3>Watchlist</h3>{watchlist.length ? <div className="grid">{watchlist.map((item) => <Card key={item.id} it={item} tvMode={tvMode} onClick={() => setSelectedPersist(item.id)} />)}</div> : <EmptyState title="Watchlist leer" text="Fuege Inhalte ueber Details oder Startseite hinzu." />}</section></> : null}
      {page === "categories" ? <section className="card"><h3>Menue: Kategorie Manager</h3><p className="muted">Kategorien ausblenden, dauerhaft loeschen oder wieder anzeigen. Ausblenden ist sicherer als Loeschen.</p><input className="focusable" placeholder="Kategorie suchen ..." value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} /><div className="catActions"><button className="secondary focusable" onClick={restoreAllCategories}>Alle wieder anzeigen</button><button className="secondary focusable" onClick={() => setCategorySearch("")}>Suche loeschen</button></div><div className="catList">{categoryList.map((category) => <div className={`catRow focusable ${hiddenSet.has(category.key) ? "catHidden" : ""}`} key={category.key}><div><b>{category.name}</b><small>{category.section} - {category.count} Eintraege - {Object.keys(category.sourceCount).join(", ")}</small></div><button className={hiddenSet.has(category.key) ? "primary focusable" : "secondary focusable"} onClick={() => toggleCategory(category.key)}>{hiddenSet.has(category.key) ? "Einblenden" : "Ausblenden"}</button><button className="danger focusable" onClick={() => deleteCategory(category.key)}>Loeschen</button></div>)}</div></section> : null}
      {page === "epg" ? <><section className="card epgHero"><h3>High-End EPG Modus</h3><p className="muted">Programmuebersicht mit Details, Zeiten und Vormerkungen. Die Planung wird lokal gespeichert; echte Mitschnitte benoetigen spaeter einen Backend-Recorder.</p><input className="focusable" placeholder="Sendung, Sender oder Genre suchen ..." value={epgSearch} onChange={(event) => setEpgSearch(event.target.value)} /><select className="focusable" value={epgFilter} onChange={(event) => setEpgFilter(event.target.value)}>{epgGenres.map((genre) => <option key={genre} value={genre}>{genre}</option>)}</select><EpgTimeline events={epgFiltered} onOpen={openEpgDetails} onRecord={scheduleRecording} minutesOf={minutesOf} /><div className="epgProList">{epgFiltered.map((event) => <EpgCard key={event.id} event={event} onOpen={openEpgDetails} onRecord={scheduleRecording} tvMode={tvMode} />)}</div></section>{selectedEpg ? <section className="card"><h3>Sendungsdetails</h3><div className="chips"><span className="chip active">{selectedEpg.genre}</span><span className="chip">{selectedEpg.start} - {selectedEpg.end}</span><span className="chip">{epgDuration(selectedEpg)}</span></div><h2>{selectedEpg.title}</h2><p className="muted">{selectedEpg.channel}</p><p>{selectedEpg.description}</p><button className="primary focusable" onClick={() => scheduleRecording(selectedEpg)}>Diese Sendung vormerken</button><button className="secondary focusable" onClick={() => setSelectedEpg(null)}>Details schliessen</button></section> : null}</> : null}
      {page === "recordings" ? <section className="card"><h3>Planungsbereich</h3><p className="muted">Hier merkt die App Sendungen nur vor. Das ist keine echte Aufnahmefunktion. Automatische Aufnahmen brauchen einen separaten Backend-Recorder.</p>{recordings.length ? <div className="recordingList">{recordings.map((recording) => <RecordingCard key={recording.id} rec={recording} onRemove={removeRecording} />)}</div> : <EmptyState title="Keine Planungen" text="Oeffne den EPG und merke eine Sendung vor." action="EPG oeffnen" onClick={() => setPage("epg")} />}<button className="secondary focusable" onClick={clearRecordings}>Alle Planungen loeschen</button><div className="infoBox">Produktionshinweis: Ein echter Recorder ist erst aktiv, wenn ein Backend-Dienst die Streams serverseitig verarbeitet.</div></section> : null}
      {page === "account" ? <><section className="menuGrid"><div className="card"><h3>Xtream Import</h3><input className="focusable" placeholder="Server-URL, z.B. https://example.com:8080" value={auth.server} onChange={(event) => persist("auth", { ...auth, server: event.target.value }, setAuth)} /><input className="focusable" placeholder="Benutzername" value={auth.username} onChange={(event) => persist("auth", { ...auth, username: event.target.value }, setAuth)} /><input className="focusable" placeholder="Passwort" type="password" value={auth.password} onChange={(event) => persist("auth", { ...auth, password: event.target.value }, setAuth)} /><button className="secondary focusable" disabled={busy} onClick={testConn}>Verbindung testen</button><button className="primary focusable" disabled={busy} onClick={importXtream}>{busy ? "Bitte warten ..." : "Xtream importieren"}</button><p className="muted">Zugangsdaten werden nur fuer diese Sitzung gehalten und nicht dauerhaft unverschluesselt gespeichert.</p></div><div className="card"><h3>M3U Import</h3><input className="focusable" placeholder="M3U/M3U8 URL oder direkte M3U hier einfuegen" value={m3uUrl} onChange={(event) => setM3uUrl(event.target.value)} /><button className="primary focusable" disabled={busy} onClick={importM3UFromUrl}>{busy ? "Bitte warten ..." : "M3U laden"}</button><textarea className="focusable" placeholder="Optional: komplette M3U hier einfuegen ..." value={m3uText} onChange={(event) => setM3uText(event.target.value)} /><button className="primary focusable" onClick={importM3UFromText}>M3U Text ersetzen</button><button className="secondary focusable" onClick={mergeM3UText}>M3U Text ergaenzen</button></div></section><SourceProfilesPanel profiles={sourceProfiles} profileName={profileName} setProfileName={setProfileName} onSave={saveCurrentSourceProfile} onApply={applySourceProfile} onRemove={removeSourceProfile} /><section className="card"><h3>TV & Einstellungen</h3><button className={`chip focusable ${tvMode ? "active" : ""}`} onClick={() => persist("settings", { ...settings, tvMode: !tvMode }, setSettings)}>{tvMode ? "TV-Modus aktiv" : "TV-Modus aktivieren"}</button><button className={`chip focusable ${settings.tvDensity === "large" ? "active" : ""}`} onClick={() => persist("settings", { ...settings, tvDensity: "large" }, setSettings)}>TV gross</button><button className={`chip focusable ${settings.tvDensity === "xl" ? "active" : ""}`} onClick={() => persist("settings", { ...settings, tvDensity: "xl" }, setSettings)}>TV extra gross</button>{[["autoplay", "Autoplay"], ["autosave", "Auto-Fortschritt"], ["compact", "Compact Mode"], ["adult", "16+ ausblenden"], ["trailer", "Trailer"], ["motion", "Animationen"], ["safeMode", "Loesch-Schutz"]].map(([key, label]) => <button key={key} className={`chip focusable ${settings[key] ? "active" : ""}`} onClick={() => persist("settings", { ...settings, [key]: !settings[key] }, setSettings)}>{label}</button>)}<button className="secondary focusable" onClick={clearProgress}>Fortschritt loeschen</button><button className="secondary focusable" onClick={resetApp}>App-Inhalte leeren</button><StatusPanel status={status} importStep={importStep} importError={importError} /></section><StreamDiagnosticsPanel diagnostics={streamDiagnostics} currentTitle={selectedItem.title} /></> : null}
      {page === "system" ? <section className="card"><h3>System</h3><div className="healthGrid"><Stat l="Gesamt" v={health.total} h="Eintraege" /><Stat l="Sichtbar" v={health.visible} h="nach Filter" /><Stat l="Ausgeblendet" v={health.hidden} h="Kategorien" /><Stat l="Watchlist" v={health.watch} h="Eintraege" /><Stat l="Planungen" v={health.recordings} h="lokal" /><Stat l="Auto-Zap" v={autoZap ? "An" : "Aus"} h={`${zapSeconds}s`} /></div><StatusPanel status={status} importStep={importStep} importError={importError} /><button className="secondary focusable" onClick={() => setStatus("Systemcheck OK. Menues, Filter und Speicher sind erreichbar.")}>Systemcheck starten</button><button className="secondary focusable" onClick={() => setPage("account")}>Import-Menue oeffnen</button></section> : null}
      <nav>{[["home", "Start"], ["watch", "Meine Liste"], ["account", "Import"], ["system", "System"]].map(([key, label]) => <button key={key} className={page === key ? "navActive focusable" : "navBtn focusable"} onClick={() => setPage(key)}>{label}</button>)}</nav>
    </div>
  );
}
