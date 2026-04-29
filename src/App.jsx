import React, { useEffect, useMemo, useState } from "react";
import Player from "./components/Player.jsx";
import {
  AutoZapPanel,
  Card,
  CommandBar,
  EmptyState,
  EpgCard,
  EpgTimeline,
  Login,
  ProgramGuide,
  ProgramRow,
  RecordingCard,
  SmartRail,
  SourceProfilesPanel,
  Stat,
  StatusPanel,
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
import { BACKEND_URL, createPlaybackUrl, fetchM3UProxy, fetchXtreamProxy, isLikelyHls, isLikelyTs, mapLive, mapSeries, mapVod, parseM3UAsync } from "./lib/importers.js";
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
      language: "de",
      tvMode: false,
      tvDensity: "large",
      deviceMode: "auto",
      mobileNav: true,
      playerMode: "native",
      playerFit: "contain",
      startFullscreen: false,
      bufferMode: "normal",
      safeMode: true,
      epgXmltvUrl: "",
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
  const epgConnected = EPG_EVENTS.length > 0;
  const language = settings.language === "en" ? "en" : "de";
  const copy = {
    de: {
      start: "Start",
      library: "Mediathek",
      myList: "Meine Liste",
      import: "Import",
      settings: "Einstellungen",
      openCurrent: "Aktuellen Inhalt oeffnen",
      tvOn: "TV-Modus an",
      tvOff: "TV-Modus aus",
      manage: "Verwalten",
      categories: "Kategorien",
      playerSettings: "Player Einstellungen",
      tvSettings: "TV Einstellungen",
      phoneSettings: "Handy Einstellungen",
      languageSettings: "Sprache",
      german: "Deutsch",
      english: "Englisch",
      autoplay: "Autoplay",
      nativePlayer: "Nativer Player",
      fullscreen: "Vollbild beim Start",
      fitContain: "Anpassen",
      fitCover: "Fuellen",
      bufferEco: "Sparsam",
      bufferNormal: "Normal",
      bufferStrong: "Stabil",
      large: "Gross",
      xl: "Extra gross",
      compact: "Kompakte Listen",
      animations: "Animationen",
      adult: "16+ ausblenden",
      safeDelete: "Loesch-Schutz",
      clearProgress: "Fortschritt loeschen",
      clearApp: "App-Inhalte leeren",
      importSettings: "Import & Quellen",
      appSettings: "App Einstellungen",
      legalNotice: "Diese App ist nur ein Player. Es werden keine Inhalte, Senderlisten oder Streams bereitgestellt.",
    },
    en: {
      start: "Home",
      library: "Library",
      myList: "My List",
      import: "Import",
      settings: "Settings",
      openCurrent: "Open current item",
      tvOn: "TV mode on",
      tvOff: "TV mode off",
      manage: "Manage",
      categories: "Categories",
      playerSettings: "Player settings",
      tvSettings: "TV settings",
      phoneSettings: "Phone settings",
      languageSettings: "Language",
      german: "German",
      english: "English",
      autoplay: "Autoplay",
      nativePlayer: "Native player",
      fullscreen: "Start fullscreen",
      fitContain: "Fit",
      fitCover: "Fill",
      bufferEco: "Low buffer",
      bufferNormal: "Normal",
      bufferStrong: "Stable",
      large: "Large",
      xl: "Extra large",
      compact: "Compact lists",
      animations: "Animations",
      adult: "Hide 16+",
      safeDelete: "Delete protection",
      clearProgress: "Clear progress",
      clearApp: "Clear app content",
      importSettings: "Import & sources",
      appSettings: "App settings",
      legalNotice: "This app is only a player. No content, channel lists or streams are provided.",
    },
  }[language];

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

  function updateSetting(key, value) {
    persist("settings", { ...settings, [key]: value }, setSettings);
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
      setStatus(`${error.message} WebPlayer-Fallback wird geoeffnet.`);
      setPage("details");
    }
  }

  function handlePlayOrOpen(target = selectedItem) {
    const item = resolveItemTarget(target);
    persist("selected", item.id, setSelected);
    if (nativeAndroid && settings.playerMode !== "web") {
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
      const parsed = await parseM3UAsync(text, (progress) => setImportStep(`M3U wird verarbeitet ... ${progress}%`));
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

  async function importM3UFromText() {
    try {
      setBusy(true);
      setImportError("");
      setImportStep("M3U Text wird verarbeitet ...");
      const parsed = await parseM3UAsync(m3uText, (progress) => setImportStep(`M3U wird verarbeitet ... ${progress}%`));
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
    } finally {
      setBusy(false);
    }
  }

  async function mergeM3UText() {
    try {
      setBusy(true);
      setImportError("");
      setImportStep("M3U wird ergaenzt ...");
      const parsed = await parseM3UAsync(m3uText, (progress) => setImportStep(`M3U wird ergaenzt ... ${progress}%`));
      if (!parsed.length) {
        throw new Error("Keine M3U Sender im Text gefunden.");
      }
      const itemsSave = persist("items", [...items, ...parsed], setItems);
      setStatus(itemsSave.warning || `${parsed.length} M3U-Eintraege ergaenzt.`);
      setImportStep("M3U wurde ergaenzt, vorhandene Inhalte bleiben erhalten.");
    } catch (error) {
      setImportError(error.message);
      setStatus(error.message);
    } finally {
      setBusy(false);
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
      {page === "home" ? (
        <>
          <section className="cleanHub">
            {[
              ["dashboard", copy.start],
              ["media", copy.library],
              ["guide", "EPG"],
              ["manage", copy.manage],
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
                <div className="quickMenu">
                  <button className="primary focusable" onClick={() => setPage("details")}>{copy.openCurrent}</button>
                  <button className="secondary focusable" onClick={() => setPage("watch")}>{copy.myList}</button>
                  <button className="secondary focusable" onClick={() => updateSetting("tvMode", !tvMode)}>{tvMode ? copy.tvOff : copy.tvOn}</button>
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
          {hub === "manage" ? <section className="card"><h3>{copy.manage}</h3><div className="quickMenu"><button className="primary focusable" onClick={() => setPage("account")}>{copy.importSettings}</button><button className="secondary focusable" onClick={() => setPage("categories")}>{copy.categories}</button><button className="secondary focusable" onClick={() => setPage("system")}>{copy.settings}</button></div></section> : null}
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
              <button className="primary focusable" onClick={() => handlePlayOrOpen(selectedItem)}>{nativeAndroid && settings.playerMode !== "web" ? "Nativ abspielen" : "Abspielen / Details"}</button>
              <button className="secondary focusable" onClick={() => toggleWatch(selectedItem.id)}>{watch.includes(selectedItem.id) ? "Aus Watchlist" : "Zur Watchlist"}</button>
              <button className="danger focusable" onClick={() => deleteItem(selectedItem.id)}>Sender loeschen</button>
            </div>
            {settings.trailer && selectedItem.trailerUrl && !tvMode ? <video className="trailer" src={selectedItem.trailerUrl} muted autoPlay playsInline loop /> : null}
            {selectedItem.streamUrl ? nativeAndroid && settings.playerMode !== "web" ? <div className="infoBox">Android nutzt den nativen ExoPlayer fuer stabile TS/HLS-Wiedergabe. Stelle bei Problemen unter Einstellungen auf WebPlayer um.</div> : <Player src={selectedPlaybackUrl} preferHls={selectedPreferHls} preferTs={selectedPreferTs} autoplay={settings.autoplay} onProgress={updateProgress} onEnded={completePlayback} onStatus={setStatus} onDiagnostic={updateDiagnostics} tvMode={tvMode} /> : <EmptyState title="Keine Quelle geladen" text="Importiere zuerst eine eigene M3U- oder Xtream-Quelle." action="Import oeffnen" onClick={() => setPage("account")} />}
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
            <h3>EPG</h3>
            <EmptyState title="EPG noch nicht verbunden" text="Die App bringt keine Programmdaten mit. Spaeter kann hier eine eigene XMLTV-Quelle zugeordnet werden." action="EPG vorbereiten" onClick={() => setPage("epg")} />
          </section>
        </>
      ) : null}
      {page === "details" ? <section className="card"><img className="detailImg" src={selectedItem.cover} /><div className="chips"><span className="chip active">{selectedItem.badge}</span><span className="chip">{selectedItem.year}</span><span className="chip">{selectedItem.duration}</span><span className="chip">{selectedItem.source || "app"}</span></div><h2>{selectedItem.title}</h2><p>{selectedItem.description}</p><button className="primary focusable" onClick={() => nativeAndroid && settings.playerMode !== "web" ? playItemNative(selectedItem) : toggleWatch(selectedItem.id)}>{nativeAndroid && settings.playerMode !== "web" ? "Nativ starten" : watch.includes(selectedItem.id) ? "Aus Watchlist" : "Zur Watchlist"}</button><button className="secondary focusable" onClick={() => navigator.clipboard?.writeText(selectedItem.streamUrl).then(() => setStatus("Stream-URL kopiert."))}>Stream kopieren</button><button className="danger focusable" onClick={() => deleteItem(selectedItem.id)}>Diesen Sender loeschen</button>{nativeAndroid && settings.playerMode !== "web" ? <div className="infoBox">Nativer Android-Player ist bevorzugt. Falls er nicht startet, kannst du hier sofort den WebPlayer verwenden.<br /><button className="secondary focusable" onClick={() => updateSetting("playerMode", "web")}>WebPlayer verwenden</button></div> : <Player src={selectedPlaybackUrl} preferHls={selectedPreferHls} preferTs={selectedPreferTs} autoplay={false} onProgress={updateProgress} onEnded={completePlayback} onStatus={setStatus} onDiagnostic={updateDiagnostics} tvMode={tvMode} />}</section> : null}
      {page === "watch" ? <><section className="card"><h3>Weiter ansehen</h3>{continueWatching.length ? <div className="grid">{continueWatching.map((item) => <Card key={item.id} it={item} tvMode={tvMode} onClick={() => setSelectedPersist(item.id)} />)}</div> : <EmptyState title="Noch kein Fortschritt" text="Sobald du Inhalte anschaust, erscheinen sie hier." />}</section><section className="card"><h3>Watchlist</h3>{watchlist.length ? <div className="grid">{watchlist.map((item) => <Card key={item.id} it={item} tvMode={tvMode} onClick={() => setSelectedPersist(item.id)} />)}</div> : <EmptyState title="Watchlist leer" text="Fuege Inhalte ueber Details oder Startseite hinzu." />}</section></> : null}
      {page === "categories" ? <section className="card"><h3>Menue: Kategorie Manager</h3><p className="muted">Kategorien ausblenden, dauerhaft loeschen oder wieder anzeigen. Ausblenden ist sicherer als Loeschen.</p><input className="focusable" placeholder="Kategorie suchen ..." value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} /><div className="catActions"><button className="secondary focusable" onClick={restoreAllCategories}>Alle wieder anzeigen</button><button className="secondary focusable" onClick={() => setCategorySearch("")}>Suche loeschen</button></div><div className="catList">{categoryList.map((category) => <div className={`catRow focusable ${hiddenSet.has(category.key) ? "catHidden" : ""}`} key={category.key}><div><b>{category.name}</b><small>{category.section} - {category.count} Eintraege - {Object.keys(category.sourceCount).join(", ")}</small></div><button className={hiddenSet.has(category.key) ? "primary focusable" : "secondary focusable"} onClick={() => toggleCategory(category.key)}>{hiddenSet.has(category.key) ? "Einblenden" : "Ausblenden"}</button><button className="danger focusable" onClick={() => deleteCategory(category.key)}>Loeschen</button></div>)}</div></section> : null}
      {page === "epg" ? <><section className="card epgHero"><h3>EPG vorbereiten</h3><p className="muted">EPG ist noch nicht verbunden. Die App liefert keine Programmdaten mit; spaeter kann eine eigene XMLTV-Quelle importiert und Sendern zugeordnet werden.</p><input className="focusable" placeholder="XMLTV-URL vormerken, z.B. https://anbieter/epg.xml" value={settings.epgXmltvUrl || ""} onChange={(event) => updateSetting("epgXmltvUrl", event.target.value)} /><input className="focusable" placeholder="Sendung, Sender oder Genre suchen ..." value={epgSearch} onChange={(event) => setEpgSearch(event.target.value)} /><select className="focusable" value={epgFilter} onChange={(event) => setEpgFilter(event.target.value)}>{epgGenres.map((genre) => <option key={genre} value={genre}>{genre}</option>)}</select>{epgConnected ? <><EpgTimeline events={epgFiltered} onOpen={openEpgDetails} onRecord={scheduleRecording} minutesOf={minutesOf} /><div className="epgProList">{epgFiltered.map((event) => <EpgCard key={event.id} event={event} onOpen={openEpgDetails} onRecord={scheduleRecording} tvMode={tvMode} />)}</div></> : <EmptyState title="Noch keine XMLTV-Daten verbunden" text="Die Struktur fuer Suche und Sender-Zuordnung ist vorbereitet. Der echte XMLTV-Importer kommt in einer naechsten Version." />}</section>{selectedEpg ? <section className="card"><h3>Sendungsdetails</h3><div className="chips"><span className="chip active">{selectedEpg.genre}</span><span className="chip">{selectedEpg.start} - {selectedEpg.end}</span><span className="chip">{epgDuration(selectedEpg)}</span></div><h2>{selectedEpg.title}</h2><p className="muted">{selectedEpg.channel}</p><p>{selectedEpg.description}</p><button className="primary focusable" onClick={() => scheduleRecording(selectedEpg)}>Diese Sendung vormerken</button><button className="secondary focusable" onClick={() => setSelectedEpg(null)}>Details schliessen</button></section> : null}</> : null}
      {page === "recordings" ? <section className="card"><h3>Planungsbereich</h3><p className="muted">Hier merkt die App Sendungen nur vor. Das ist keine echte Aufnahmefunktion. Automatische Aufnahmen brauchen einen separaten Backend-Recorder.</p>{recordings.length ? <div className="recordingList">{recordings.map((recording) => <RecordingCard key={recording.id} rec={recording} onRemove={removeRecording} />)}</div> : <EmptyState title="Keine Planungen" text="Oeffne den EPG und merke eine Sendung vor." action="EPG oeffnen" onClick={() => setPage("epg")} />}<button className="secondary focusable" onClick={clearRecordings}>Alle Planungen loeschen</button><div className="infoBox">Produktionshinweis: Ein echter Recorder ist erst aktiv, wenn ein Backend-Dienst die Streams serverseitig verarbeitet.</div></section> : null}
      {page === "account" ? <><section className="card legalNotice"><h3>Rechtlicher Hinweis</h3><p>{copy.legalNotice}</p><small>Importiere nur Quellen, fuer die du eine gueltige Berechtigung hast.</small></section><section className="menuGrid"><div className="card"><h3>Xtream Import</h3><input className="focusable" placeholder="Server-URL, z.B. https://example.com:8080" value={auth.server} onChange={(event) => persist("auth", { ...auth, server: event.target.value }, setAuth)} /><input className="focusable" placeholder="Benutzername" value={auth.username} onChange={(event) => persist("auth", { ...auth, username: event.target.value }, setAuth)} /><input className="focusable" placeholder="Passwort" type="password" value={auth.password} onChange={(event) => persist("auth", { ...auth, password: event.target.value }, setAuth)} /><button className="secondary focusable" disabled={busy} onClick={testConn}>Verbindung testen</button><button className="primary focusable" disabled={busy} onClick={importXtream}>{busy ? "Bitte warten ..." : "Xtream importieren"}</button><small className="muted">Zugangsdaten werden nur in dieser Sitzung gehalten und nicht als Profil gespeichert.</small></div><div className="card"><h3>M3U Import</h3><input className="focusable" placeholder="M3U/M3U8 URL einfuegen" value={m3uUrl} onChange={(event) => setM3uUrl(event.target.value)} /><button className="primary focusable" disabled={busy} onClick={importM3UFromUrl}>{busy ? "Bitte warten ..." : "M3U laden"}</button><textarea className="focusable" placeholder="Optional: Listeninhalt aus Datei einfuegen" value={m3uText} onChange={(event) => setM3uText(event.target.value)} /><button className="primary focusable" disabled={busy} onClick={importM3UFromText}>Liste aus Inhalt laden</button><button className="secondary focusable" disabled={busy} onClick={mergeM3UText}>Liste ergaenzen</button></div></section><SourceProfilesPanel profiles={sourceProfiles} profileName={profileName} setProfileName={setProfileName} onSave={saveCurrentSourceProfile} onApply={applySourceProfile} onRemove={removeSourceProfile} /><StatusPanel status={status} importStep={importStep} importError={importError} /></> : null}
      {page === "system" ? <section className="settingsPage"><h2>{copy.appSettings}</h2><section className="settingsGroup"><h3>{copy.languageSettings}</h3><div className="settingsGrid"><button className={`settingTile focusable ${language === "de" ? "settingActive" : ""}`} onClick={() => updateSetting("language", "de")}><b>{copy.german}</b><small>Deutsch</small></button><button className={`settingTile focusable ${language === "en" ? "settingActive" : ""}`} onClick={() => updateSetting("language", "en")}><b>{copy.english}</b><small>English</small></button></div></section><section className="settingsGroup"><h3>{copy.tvSettings}</h3><div className="settingsGrid"><button className={`settingTile focusable ${tvMode ? "settingActive" : ""}`} onClick={() => updateSetting("tvMode", !tvMode)}><b>{tvMode ? copy.tvOff : copy.tvOn}</b><small>Leanback Layout</small></button><button className={`settingTile focusable ${settings.tvDensity === "large" ? "settingActive" : ""}`} onClick={() => updateSetting("tvDensity", "large")}><b>{copy.large}</b><small>TV UI</small></button><button className={`settingTile focusable ${settings.tvDensity === "xl" ? "settingActive" : ""}`} onClick={() => updateSetting("tvDensity", "xl")}><b>{copy.xl}</b><small>TV UI</small></button><button className={`settingTile focusable ${settings.startFullscreen ? "settingActive" : ""}`} onClick={() => updateSetting("startFullscreen", !settings.startFullscreen)}><b>{copy.fullscreen}</b><small>Player</small></button></div></section><section className="settingsGroup"><h3>{copy.phoneSettings}</h3><div className="settingsGrid"><button className={`settingTile focusable ${settings.mobileNav ? "settingActive" : ""}`} onClick={() => updateSetting("mobileNav", !settings.mobileNav)}><b>Bottom Navigation</b><small>Handy</small></button><button className={`settingTile focusable ${settings.compact ? "settingActive" : ""}`} onClick={() => updateSetting("compact", !settings.compact)}><b>{copy.compact}</b><small>Listen</small></button><button className={`settingTile focusable ${settings.motion ? "settingActive" : ""}`} onClick={() => updateSetting("motion", !settings.motion)}><b>{copy.animations}</b><small>UI</small></button></div></section><section className="settingsGroup"><h3>{copy.playerSettings}</h3><div className="settingsGrid"><button className={`settingTile focusable ${settings.autoplay ? "settingActive" : ""}`} onClick={() => updateSetting("autoplay", !settings.autoplay)}><b>{copy.autoplay}</b><small>Streamstart</small></button><button className={`settingTile focusable ${settings.playerMode === "native" ? "settingActive" : ""}`} onClick={() => updateSetting("playerMode", "native")}><b>{copy.nativePlayer}</b><small>Android TS/HLS</small></button><button className={`settingTile focusable ${settings.playerFit === "contain" ? "settingActive" : ""}`} onClick={() => updateSetting("playerFit", "contain")}><b>{copy.fitContain}</b><small>Bildformat</small></button><button className={`settingTile focusable ${settings.playerFit === "cover" ? "settingActive" : ""}`} onClick={() => updateSetting("playerFit", "cover")}><b>{copy.fitCover}</b><small>Bildformat</small></button>{[["eco", copy.bufferEco], ["normal", copy.bufferNormal], ["strong", copy.bufferStrong]].map(([value, label]) => <button key={value} className={`settingTile focusable ${settings.bufferMode === value ? "settingActive" : ""}`} onClick={() => updateSetting("bufferMode", value)}><b>{label}</b><small>Buffer</small></button>)}</div></section><section className="settingsGroup"><h3>Sicherheit</h3><div className="settingsGrid"><button className={`settingTile focusable ${settings.adult ? "settingActive" : ""}`} onClick={() => updateSetting("adult", !settings.adult)}><b>{copy.adult}</b><small>Filter</small></button><button className={`settingTile focusable ${settings.safeMode ? "settingActive" : ""}`} onClick={() => updateSetting("safeMode", !settings.safeMode)}><b>{copy.safeDelete}</b><small>Schutz</small></button><button className="settingTile focusable" onClick={clearProgress}><b>{copy.clearProgress}</b><small>Verlauf</small></button><button className="settingTile danger focusable" onClick={resetApp}><b>{copy.clearApp}</b><small>Reset</small></button></div></section></section> : null}
      <nav className={settings.mobileNav ? "" : "navHidden"}>{[["home", copy.start], ["watch", copy.myList], ["account", copy.import], ["system", copy.settings]].map(([key, label]) => <button key={key} className={page === key ? "navActive focusable" : "navBtn focusable"} onClick={() => setPage(key)}>{label}</button>)}</nav>
    </div>
  );
}
