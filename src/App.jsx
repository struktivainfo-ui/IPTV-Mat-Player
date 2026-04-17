import React,{useMemo,useState} from "react";
import Login from "./components/Login.jsx";
import Player from "./components/Player.jsx";
import PosterCard from "./components/PosterCard.jsx";
import StatCard from "./components/StatCard.jsx";
import BottomNav from "./components/BottomNav.jsx";
import {load,save} from "./lib/storage.js";
import {DEMO_ITEMS,DEFAULT_PROFILES,DEFAULT_SETTINGS,DEMO_EPG} from "./lib/demoData.js";
import {buildApiUrl,buildLiveUrl,buildMovieUrl,buildSeriesUrl,fetchJsonWithTimeout,safeTop} from "./lib/helpers.js";

export default function App(){
const [session,setSession]=useState(()=>load("session",null));
const [profiles,setProfiles]=useState(()=>load("profiles",DEFAULT_PROFILES));
const [activeProfile,setActiveProfile]=useState(()=>load("activeProfile","Sven"));
const [settings,setSettings]=useState(()=>load("settings",DEFAULT_SETTINGS));
const [items,setItems]=useState(()=>load("items",DEMO_ITEMS));
const [watchlist,setWatchlist]=useState(()=>load("watchlist",["movie-1"]));
const [selectedId,setSelectedId]=useState(()=>load("selectedId",DEMO_ITEMS[0].id));
const [search,setSearch]=useState("");
const [contentTab,setContentTab]=useState("live");
const [status,setStatus]=useState("Bereit.");
const [auth,setAuth]=useState(()=>load("auth",{server:"",username:"",password:""}));
const [importCount,setImportCount]=useState(()=>load("importCount",0));
const [lastImportAt,setLastImportAt]=useState(()=>load("lastImportAt",""));
const [newProfile,setNewProfile]=useState("");
const [page,setPage]=useState("home");

function persist(key,value,setter){save(key,value);setter(value)}
const selected=items.find(i=>i.id===selectedId)||items[0];
const filtered=useMemo(()=>items.filter(i=>{const okTab=contentTab==="all"||i.section===contentTab;const q=search.toLowerCase();const okSearch=!q||i.title.toLowerCase().includes(q)||i.category.toLowerCase().includes(q)||i.description.toLowerCase().includes(q);const okAdult=settings.adultFilter?i.rating!=="16+":true;return okTab&&okSearch&&okAdult;}),[items,contentTab,search,settings.adultFilter]);
const liveItems=items.filter(i=>i.section==="live");
const movieItems=items.filter(i=>i.section==="movie");
const seriesItems=items.filter(i=>i.section==="series");
const continueWatching=[...items].filter(i=>(i.progress||0)>0).sort((a,b)=>(b.progress||0)-(a.progress||0)).slice(0,6);
const watchlistItems=items.filter(i=>watchlist.includes(i.id));

async function handleImport(){
 if(!auth.server||!auth.username||!auth.password){setStatus("Bitte Server, Benutzername und Passwort ausfüllen.");return;}
 try{
  setStatus("Xtream-Daten werden geladen ...");
  const [live,vod,series]=await Promise.all([
    fetchJsonWithTimeout(buildApiUrl(auth.server,auth.username,auth.password,"get_live_streams")),
    fetchJsonWithTimeout(buildApiUrl(auth.server,auth.username,auth.password,"get_vod_streams")),
    fetchJsonWithTimeout(buildApiUrl(auth.server,auth.username,auth.password,"get_series"))
  ]);
  const mapped=[
    ...safeTop(live).map((x,i)=>({id:`live-${x.stream_id}`,title:x.name||`Live ${x.stream_id}`,category:x.category_name||"Live TV",section:"live",badge:"Live",year:"2026",duration:"Live",rating:"0+",progress:(i*7)%100,description:"Importierter Live-Eintrag.",cover:DEMO_ITEMS[0].cover,streamUrl:buildLiveUrl(auth.server,auth.username,auth.password,x.stream_id,x.container_extension||"m3u8")})),
    ...safeTop(vod).map((x,i)=>({id:`movie-${x.stream_id}`,title:x.name||`Film ${x.stream_id}`,category:x.category_name||"Filme",section:"movie",badge:"Movie",year:"2026",duration:"Film",rating:"12+",progress:(i*9)%100,description:"Importierter Film-Eintrag.",cover:DEMO_ITEMS[2].cover,streamUrl:buildMovieUrl(auth.server,auth.username,auth.password,x.stream_id,x.container_extension||"mp4")})),
    ...safeTop(series).map((x,i)=>({id:`series-${x.series_id||x.stream_id||i}`,title:x.name||`Serie ${i+1}`,category:x.category_name||"Serien",section:"series",badge:"Serie",year:"2026",duration:"Serie",rating:"12+",progress:(i*11)%100,description:"Importierter Serien-Eintrag.",cover:DEMO_ITEMS[4].cover,streamUrl:x.stream_id?buildSeriesUrl(auth.server,auth.username,auth.password,x.stream_id,x.container_extension||"mp4"):DEMO_ITEMS[4].streamUrl}))
  ];
  if(!mapped.length) throw new Error("Keine Einträge gefunden.");
  persist("items",mapped,setItems);persist("selectedId",mapped[0].id,setSelectedId);persist("importCount",mapped.length,setImportCount);
  const stamp=new Date().toLocaleString("de-DE");persist("lastImportAt",stamp,setLastImportAt);
  setStatus(`${mapped.length} Einträge importiert.`);
 }catch(e){setStatus(e.message||"Import fehlgeschlagen.");}
}

function toggleWatchlist(id){const next=watchlist.includes(id)?watchlist.filter(x=>x!==id):[...watchlist,id];persist("watchlist",next,setWatchlist)}
function updateProgress(percent){if(!settings.autosave||!selected)return;const nextItems=items.map(i=>i.id===selected.id?{...i,progress:Math.max(i.progress||0,percent)}:i);persist("items",nextItems,setItems)}
function addProfile(){const name=newProfile.trim();if(!name)return;const next=[...profiles,{id:`p-${Date.now()}`,name,emoji:"🎬"}];persist("profiles",next,setProfiles);setNewProfile("");setStatus(`Profil erstellt: ${name}`)}

if(!session){return <Login onLogin={(data)=>{save("session",data);setSession(data);}} />}

return <div className={`app ${settings.compactMode?"compactMode":""}`}>
<header className="topbar"><div><div className="badge">v3.4</div><h1>IPTV Mobile · {activeProfile}</h1></div><button className="secondary" onClick={()=>{save("session",null);setSession(null)}}>Logout</button></header>

{page==="home" && <>
<section className="dashboardGrid">
<StatCard label="Live TV" value={liveItems.length} hint="Kanäle" />
<StatCard label="Filme" value={movieItems.length} hint="VOD" />
<StatCard label="Serien" value={seriesItems.length} hint="Library" />
<StatCard label="Importiert" value={importCount} hint={lastImportAt||"noch kein Import"} />
</section>

<section className="hero">
<div className="heroLeft">
<div className="chips">
<button className={`chip ${contentTab==="live"?"chipActive":""}`} onClick={()=>setContentTab("live")}>Live</button>
<button className={`chip ${contentTab==="movie"?"chipActive":""}`} onClick={()=>setContentTab("movie")}>Filme</button>
<button className={`chip ${contentTab==="series"?"chipActive":""}`} onClick={()=>setContentTab("series")}>Serien</button>
<button className={`chip ${contentTab==="all"?"chipActive":""}`} onClick={()=>setContentTab("all")}>Alle</button>
</div>
<h2>{selected.title}</h2>
<p className="muted">{selected.description}</p>
<div className="actions"><button className="primary" onClick={()=>toggleWatchlist(selected.id)}>{watchlist.includes(selected.id)?"Aus Watchlist":"Zur Watchlist"}</button></div>
</div>
<Player url={selected.streamUrl} autoplay={settings.autoplay} onProgress={updateProgress} onStatus={setStatus} />
</section>

<section className="card"><div className="sectionHead"><h3>Suche</h3><span className="muted">{filtered.length}</span></div><input placeholder="Titel, Kategorie oder Beschreibung suchen ..." value={search} onChange={e=>setSearch(e.target.value)} /></section>
<section className="card"><div className="sectionHead"><h3>Inhalte</h3><span className="muted">{filtered.length}</span></div><div className="posterGrid">{filtered.map(item=><PosterCard key={item.id} item={item} compact={settings.compactMode} onClick={()=>{persist("selectedId",item.id,setSelectedId);setPage("details")}} />)}</div></section>
<section className="card"><div className="sectionHead"><h3>EPG Demo</h3><span className="muted">{DEMO_EPG.length}</span></div><div className="epgList">{DEMO_EPG.map(row=><div key={row.id} className="epgRow"><strong>{row.time}</strong><span>{row.channel}</span><span className="muted">{row.title}</span></div>)}</div></section>
</>}

{page==="details" && <section className="card">
<div className="sectionHead"><h3>Details</h3><span className="muted">{selected.category}</span></div>
<div className="detailsHero"><img src={selected.cover} alt={selected.title} className="detailsImage" /><div className="detailsBody"><div className="chips"><span className="chip chipActive">{selected.badge}</span><span className="chip">{selected.year}</span><span className="chip">{selected.duration}</span><span className="chip">{selected.rating}</span></div><h2>{selected.title}</h2><p className="muted">{selected.description}</p><div className="actions"><button className="primary" onClick={()=>toggleWatchlist(selected.id)}>{watchlist.includes(selected.id)?"Aus Watchlist":"Zur Watchlist"}</button><button className="secondary" onClick={()=>setPage("home")}>Zurück</button></div></div></div>
<Player url={selected.streamUrl} autoplay={false} onProgress={updateProgress} onStatus={setStatus} />
</section>}

{page==="watchlist" && <>
<section className="card"><div className="sectionHead"><h3>Weiter ansehen</h3><span className="muted">{continueWatching.length}</span></div><div className="posterGrid">{continueWatching.map(item=><PosterCard key={item.id} item={item} compact={settings.compactMode} onClick={()=>{persist("selectedId",item.id,setSelectedId);setPage("details")}} />)}</div></section>
<section className="card"><div className="sectionHead"><h3>Watchlist</h3><span className="muted">{watchlistItems.length}</span></div><div className="posterGrid">{watchlistItems.map(item=><PosterCard key={item.id} item={item} compact={settings.compactMode} onClick={()=>{persist("selectedId",item.id,setSelectedId);setPage("details")}} />)}</div></section>
</>}

{page==="account" && <>
<section className="card"><div className="sectionHead"><h3>Import Dashboard</h3><span className="muted">autorisierte Zugänge</span></div>
<input placeholder="Server-URL" value={auth.server} onChange={e=>{const n={...auth,server:e.target.value};persist("auth",n,setAuth)}} />
<input placeholder="Benutzername" value={auth.username} onChange={e=>{const n={...auth,username:e.target.value};persist("auth",n,setAuth)}} />
<input placeholder="Passwort" type="password" value={auth.password} onChange={e=>{const n={...auth,password:e.target.value};persist("auth",n,setAuth)}} />
<div className="actions"><button className="primary" onClick={handleImport}>Xtream importieren</button><button className="secondary" onClick={()=>{persist("items",DEMO_ITEMS,setItems);persist("selectedId",DEMO_ITEMS[0].id,setSelectedId);setStatus("Demo geladen.");}}>Demo laden</button></div>
</section>

<section className="card"><div className="sectionHead"><h3>Profile & Settings</h3><span className="muted">{session.user}</span></div>
<div className="settingsRow">
<button className={`chip ${settings.autoplay?"chipActive":""}`} onClick={()=>{const n={...settings,autoplay:!settings.autoplay};persist("settings",n,setSettings)}}>Trailer-Autoplay</button>
<button className={`chip ${settings.autosave?"chipActive":""}`} onClick={()=>{const n={...settings,autosave:!settings.autosave};persist("settings",n,setSettings)}}>Auto-Fortschritt</button>
<button className={`chip ${settings.compactMode?"chipActive":""}`} onClick={()=>{const n={...settings,compactMode:!settings.compactMode};persist("settings",n,setSettings)}}>Compact Mode</button>
<button className={`chip ${settings.adultFilter?"chipActive":""}`} onClick={()=>{const n={...settings,adultFilter:!settings.adultFilter};persist("settings",n,setSettings)}}>16+ ausblenden</button>
</div>
<div className="profileRow">{profiles.map(p=><button key={p.id} className={`chip ${activeProfile===p.name?"chipActive":""}`} onClick={()=>{persist("activeProfile",p.name,setActiveProfile)}}>{p.emoji} {p.name}</button>)}</div>
<div className="profileCreate"><input placeholder="Neues Profil" value={newProfile} onChange={e=>setNewProfile(e.target.value)} /><button className="primary" onClick={addProfile}>Profil anlegen</button></div>
</section>

<section className="card"><div className="sectionHead"><h3>Status</h3><span className="muted">Live</span></div><div className="muted">{status}</div></section>
</>}

<BottomNav page={page} setPage={setPage} />
</div>}
