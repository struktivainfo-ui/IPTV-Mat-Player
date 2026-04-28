import React, { useState } from "react";
import { DEMO_ITEMS, EPG_EVENTS, epgDuration, epgNowLabel } from "../lib/appData.js";

export function Login({ onLogin }) {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="login">
      <div className="loginCard focusable">
        <div className="mark" />
        <div className="badge">v6.6 profiles diagnostics</div>
        <h1>IPTV Mat Player</h1>
        <p>Premium Stream Dashboard mit sauberer Architektur, robusterem Import und besserer Wartbarkeit.</p>
        <input placeholder="Benutzername" value={user} onChange={(event) => setUser(event.target.value)} />
        <input placeholder="Passwort" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <button className="primary wide" onClick={() => user.trim() && password.trim() && onLogin({ user: user.trim(), time: Date.now() })}>
          Einloggen
        </button>
      </div>
    </div>
  );
}

export function Stat({ l, v, h }) {
  return (
    <div className="stat focusable">
      <small>{l}</small>
      <b>{v}</b>
      {h ? <small>{h}</small> : null}
    </div>
  );
}

export function Card({ it, onClick, compact, tvMode }) {
  return (
    <button className={`poster focusable ${compact ? "compact" : ""} ${tvMode ? "posterTv" : ""}`} onClick={onClick}>
      <img src={it.cover} onError={(event) => { event.currentTarget.src = DEMO_ITEMS[0].cover; }} loading="lazy" />
      <b className="pbadge">{it.badge}</b>
      <div className="ptitle">{it.title}</div>
      <div className="pmeta">
        {it.category} - {it.source || "app"}
      </div>
      <div className="bar">
        <i style={{ width: `${it.progress || 0}%` }} />
      </div>
    </button>
  );
}

export function EmptyState({ title, text, action, onClick }) {
  return (
    <div className="emptyState">
      <h3>{title}</h3>
      <p className="muted">{text}</p>
      {action ? (
        <button className="primary focusable" onClick={onClick}>
          {action}
        </button>
      ) : null}
    </div>
  );
}

export function ProgramRow({ it, active, onClick, onPlay, onDelete }) {
  return (
    <div className={`programRow focusable ${active ? "programActive" : ""}`} tabIndex="0" onClick={onClick}>
      <img src={it.cover} onError={(event) => { event.currentTarget.style.display = "none"; }} />
      <div className="programInfo">
        <b>{it.title}</b>
        <small>
          {it.category} - {it.source || "app"} - {it.duration || it.section}
        </small>
      </div>
      <button className="primary focusable" onClick={(event) => { event.stopPropagation(); onPlay(); }}>
        Play
      </button>
      <button className="danger focusable" onClick={(event) => { event.stopPropagation(); onDelete(); }}>
        Loeschen
      </button>
    </div>
  );
}

export function ProgramGuide({ items, selectedId, onSelect, onPlay, onDelete, tvMode }) {
  const current = items.find((entry) => entry.id === selectedId) || items[0];
  const groups = Array.from(new Set(items.map((entry) => entry.group || entry.category || "Sonstige")));

  return (
    <div className={`programGuide ${tvMode ? "programGuideTv" : ""}`}>
      <aside className="programSidebar">
        <h3>Senderliste</h3>
        <small className="muted">{items.length} sichtbar</small>
        <div className="programMiniGroups">{groups.slice(0, 12).map((group) => <span key={group}>{group}</span>)}</div>
      </aside>
      <section className="programList">
        {items.length ? items.map((item) => <ProgramRow key={item.id} it={item} active={item.id === selectedId} onClick={() => onSelect(item.id)} onPlay={() => onPlay(item.id)} onDelete={() => onDelete(item.id)} />) : <EmptyState title="Keine Programme" text="Passe Filter oder Kategorien an." />}
      </section>
      <aside className="programPreview">
        {current ? (
          <>
            <img src={current.cover} />
            <h2>{current.title}</h2>
            <p className="muted">{current.description}</p>
            <button className="primary focusable" onClick={() => onPlay(current.id)}>
              Abspielen
            </button>
          </>
        ) : null}
      </aside>
    </div>
  );
}

export function SmartRail({ title, items, onOpen, tvMode, empty }) {
  return (
    <section className="smartRail">
      <div className="sectionTitle">
        <h3>{title}</h3>
        <span className="muted">{items.length}</span>
      </div>
      {items.length ? (
        <div className={`railScroller ${tvMode ? "railTv" : ""}`}>
          {items.map((item) => (
            <button className="railCard focusable" key={item.id} onClick={() => onOpen(item.id)}>
              <img src={item.cover} onError={(event) => { event.currentTarget.style.display = "none"; }} />
              <b>{item.title}</b>
              <small>{item.category}</small>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title="Noch leer" text={empty || "Keine passenden Inhalte gefunden."} />
      )}
    </section>
  );
}

export function AutoZapPanel({ enabled, seconds, setSeconds, onStart, onStop, current }) {
  return (
    <section className={`autoZapPanel ${enabled ? "zapActivePanel" : ""}`}>
      <div>
        <h3>Auto-Zapping</h3>
        <p className="muted">{enabled ? `laeuft gerade: ${current?.title || "Live"}` : "Springt automatisch durch Live-Sender. Ideal zum schnellen Durchstoebern."}</p>
      </div>
      <div className="zapControls">
        <label>
          <span>Sekunden</span>
          <input className="focusable zapInput" type="number" min="3" max="60" value={seconds} onChange={(event) => setSeconds(event.target.value)} />
        </label>
        {enabled ? (
          <button className="danger focusable" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button className="primary focusable" onClick={onStart}>
            Zappen starten
          </button>
        )}
      </div>
    </section>
  );
}

export function CommandBar({ search, setSearch, tab, setTab, group, setGroup, groups, programView, setProgramView, total }) {
  return (
    <section className="commandBar">
      <div className="commandTop">
        <b>Programmauswahl</b>
        <span className="muted">{total} sichtbar</span>
      </div>
      <input className="focusable commandSearch" placeholder="Sender, Film, Serie oder Kategorie suchen ..." value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="commandChips">
        {["live", "movie", "series", "all"].map((entry) => (
          <button key={entry} className={`chip focusable ${tab === entry ? "active" : ""}`} onClick={() => { setTab(entry); setGroup("Alle"); }}>
            {entry === "live" ? "Live" : entry === "movie" ? "Filme" : entry === "series" ? "Serien" : "Alle"}
          </button>
        ))}
      </div>
      <select className="focusable" value={group} onChange={(event) => setGroup(event.target.value)}>
        {groups.map((entry) => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
      </select>
      <div className="viewSwitch">
        {["guide", "cards", "list"].map((view) => (
          <button key={view} className={`chip focusable ${programView === view ? "active" : ""}`} onClick={() => setProgramView(view)}>
            {view === "guide" ? "Guide" : view === "cards" ? "Karten" : "Liste"}
          </button>
        ))}
      </div>
    </section>
  );
}

export function MiniStatus({ busy, autoZap, tvMode, hidden, recordings }) {
  return (
    <div className="miniStatus">
      <span className={busy ? "dot busy" : "dot"} />
      <b>{busy ? "Laedt" : "Bereit"}</b>
      <small>TV: {tvMode ? "An" : "Aus"}</small>
      <small>Zap: {autoZap ? "An" : "Aus"}</small>
      <small>Ausgeblendet: {hidden}</small>
      <small>REC: {recordings}</small>
    </div>
  );
}

export function EpgTimeline({ events, onOpen, onRecord, minutesOf }) {
  const startBase = 18 * 60;
  const endBase = 24 * 60;
  const total = endBase - startBase;

  return (
    <div className="timelineWrap">
      <div className="timelineHeader">
        <span>18:00</span>
        <span>20:00</span>
        <span>22:00</span>
        <span>00:00</span>
      </div>
      {events.map((event) => {
        let start = minutesOf(event.start);
        let end = minutesOf(event.end);
        if (end < start) {
          end += 1440;
        }
        const left = Math.max(0, ((start - startBase) / total) * 100);
        const width = Math.max(8, ((end - start) / total) * 100);

        return (
          <div className="timelineRow focusable" tabIndex="0" key={event.id}>
            <b>{event.channel}</b>
            <button className="timelineBlock" style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} onClick={() => onOpen(event)}>
              <span>{event.title}</span>
              <small>
                {event.start}-{event.end}
              </small>
            </button>
            <button className="recordMini focusable" onClick={() => onRecord(event)}>
              REC
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function FinalAuditPanel() {
  const points = ["Smart View Engine", "Import", "EPG", "Auto-Zapping", "Kategorie Manager", "Backend vorbereitet", "TV/Fire-TV UI"];
  return (
    <section className="finalAuditPanel">
      <div className="badge">Final Audit</div>
      <h3>Systemstatus</h3>
      <div className="auditGrid">{points.map((point) => <span key={point}>OK {point}</span>)}</div>
    </section>
  );
}

export function StatusPanel({ status, importStep, importError }) {
  return (
    <div className="statusPanel">
      <b>Status</b>
      <span>{status}</span>
      {importStep ? <div className="infoBox">{importStep}</div> : null}
      {importError ? <div className="errorBox">{importError}</div> : null}
    </div>
  );
}

export function FeatureOverview() {
  const features = [
    ["Mediathek", "Live, Filme und Serien in einem klaren Bereich"],
    ["EPG", "Programm und Aufnahmen zusammen"],
    ["Verwalten", "Import, Kategorien und Einstellungen gesammelt"],
    ["TV-Modus", "Fernbedienung und grosse Darstellung"],
  ];

  return <div className="featureGrid">{features.map(([title, text]) => <div className="featureBox focusable" tabIndex="0" key={title}><b>{title}</b><small>{text}</small></div>)}</div>;
}

export function EpgCard({ event, onOpen, onRecord, tvMode }) {
  return (
    <div className={`epgProCard focusable ${tvMode ? "epgTv" : ""}`} tabIndex="0">
      <div className="epgTime">
        <b>{event.start}</b>
        <span>{event.end}</span>
      </div>
      <div className="epgMain">
        <div className="chips">
          <span className="chip active">{event.genre}</span>
          <span className="chip">{epgDuration(event)}</span>
          <span className="chip">{epgNowLabel(event)}</span>
        </div>
        <h3>{event.title}</h3>
        <p className="muted">
          {event.channel} - {event.description}
        </p>
        <div>
          <button className="primary focusable" onClick={() => onOpen(event)}>
            Details
          </button>
          <button className="secondary focusable" onClick={() => onRecord(event)}>
            Aufnehmen?
          </button>
        </div>
      </div>
    </div>
  );
}

export function RecordingCard({ rec, onRemove }) {
  return (
    <div className="recordingCard focusable" tabIndex="0">
      <div>
        <b>{rec.title}</b>
        <small>
          {rec.channel} - {rec.start} - {rec.end} - {rec.status}
        </small>
      </div>
      <button className="danger focusable" onClick={() => onRemove(rec.id)}>
        Entfernen
      </button>
    </div>
  );
}

export function SourceProfilesPanel({ profiles, profileName, setProfileName, onSave, onApply, onRemove }) {
  return (
    <section className="card">
      <h3>Quellprofile</h3>
      <p className="muted">Speichere Xtream- oder M3U-Quellen, damit du schnell zwischen Anbietern wechseln kannst.</p>
      <input className="focusable" placeholder="Profilname" value={profileName} onChange={(event) => setProfileName(event.target.value)} />
      <button className="secondary focusable" onClick={onSave}>
        Aktuelle Quelle speichern
      </button>
      <div className="recordingList">
        {profiles.length ? profiles.map((profile) => (
          <div className="recordingCard focusable" key={profile.id} tabIndex="0">
            <div>
              <b>{profile.name}</b>
              <small>
                {profile.type === "m3u" ? "M3U" : "Xtream"} - {profile.updatedAt}
              </small>
            </div>
            <div className="quickMenu">
              <button className="primary focusable" onClick={() => onApply(profile)}>
                Laden
              </button>
              <button className="danger focusable" onClick={() => onRemove(profile.id)}>
                Entfernen
              </button>
            </div>
          </div>
        )) : <EmptyState title="Noch keine Profile" text="Speichere eine Quelle, damit sie hier wieder auftaucht." />}
      </div>
    </section>
  );
}

export function StreamDiagnosticsPanel({ diagnostics, currentTitle }) {
  const updatedLabel = diagnostics.updatedAt ? new Date(diagnostics.updatedAt).toLocaleTimeString("de-DE") : "noch nie";

  return (
    <section className="card">
      <h3>Stream-Diagnose</h3>
      <div className="healthGrid">
        <div className="stat focusable">
          <small>Aktueller Titel</small>
          <b>{currentTitle || "Kein Stream"}</b>
        </div>
        <div className="stat focusable">
          <small>Status</small>
          <b>{diagnostics.state || "idle"}</b>
        </div>
        <div className="stat focusable">
          <small>Letztes Update</small>
          <b>{updatedLabel}</b>
        </div>
        <div className="stat focusable">
          <small>Fehler</small>
          <b>{diagnostics.lastError || "Keiner"}</b>
        </div>
      </div>
      {diagnostics.lastUrl ? <div className="infoBox">Quelle: {diagnostics.lastUrl}</div> : null}
    </section>
  );
}

export { EPG_EVENTS };
