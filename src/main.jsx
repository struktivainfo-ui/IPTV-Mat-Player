
import React,{useEffect,useMemo,useRef,useState}from"react";
import{createRoot}from"react-dom/client";
import Hls from"hls.js";
import"./styles.css";

const P="iptv_mat_v37_";
const load=(k,d)=>{try{let r=localStorage.getItem(P+k);return r?JSON.parse(r):d}catch{return d}};
const save=(k,v)=>localStorage.setItem(P+k,JSON.stringify(v));
const norm=s=>String(s||"").trim().replace(/\/+$/,"");
const api=(s,u,p,a)=>`${norm(s)}/player_api.php?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}&action=${a}`;
const streamUrl=(type,s,u,p,id,ext)=>`${norm(s)}/${type}/${encodeURIComponent(u)}/${encodeURIComponent(p)}/${id}.${String(ext||"mp4").replace(".","")}`;
const has=x=>x!==undefined&&x!==null&&String(x).trim()!=="";
const arr=x=>Array.isArray(x)?x:[];
const top=(x,n=120)=>arr(x).slice(0,n);
const safeText=(x,f)=>String(x||f||"").trim();
const DEMO=[
{id:"live-1",title:"Arena Sports HD",section:"live",category:"Sport",badge:"Live",year:"2026",duration:"Live",rating:"0+",progress:18,description:"Sportkanal als Demo mit Premium-Optik.",streamUrl:"https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",trailerUrl:"https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",cover:"https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&w=1200&q=80"},
{id:"live-2",title:"Blue Coast News",section:"live",category:"News",badge:"News",year:"2026",duration:"Live",rating:"0+",progress:8,description:"Nachrichtenkanal als Demo.",streamUrl:"https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",trailerUrl:"https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",cover:"https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1200&q=80"},
{id:"movie-1",title:"Neon Nights",section:"movie",category:"Sci-Fi",badge:"Trailer",year:"2026",duration:"2h 01m",rating:"16+",progress:62,description:"Atmosphärischer Sci-Fi Thriller mit Premium-Look.",streamUrl:"https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",trailerUrl:"https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",cover:"https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1200&q=80"},
{id:"movie-2",title:"Glass Horizon",section:"movie",category:"Drama",badge:"Top",year:"2025",duration:"1h 48m",rating:"12+",progress:88,description:"Premium Film-Demo mit hochwertiger Bildsprache.",streamUrl:"https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",trailerUrl:"https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",cover:"https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80"},
{id:"series-1",title:"Dark Signal",section:"series",category:"Thriller",badge:"Neu",year:"2026",duration:"8 Folgen",rating:"12+",progress:41,description:"Serien-Demo mit starkem Stil.",streamUrl:"https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",trailerUrl:"https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",cover:"https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=80"},
{id:"series-2",title:"Retro Circuit",section:"series",category:"Tech",badge:"Kult",year:"2024",duration:"12 Folgen",rating:"12+",progress:29,description:"Nostalgische Tech-Serie mit moderner App-Präsentation.",streamUrl:"https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",trailerUrl:"https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",cover:"https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80"}
];
const EPG=[["18:00","Arena Sports HD","Topspiel Live"],["20:15","Arena Sports HD","Analyse Extra"],["19:00","Blue Coast News","Abendnachrichten"],["20:00","Blue Coast News","Weltblick"]];
const fallbackCover=i=>DEMO[i%DEMO.length]?.cover||DEMO[0].cover;
const fallbackTrailer=()=>DEMO[0].trailerUrl;

async function fetchJson(url,timeoutMs=17000){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);
 try{
  const r=await fetch(url,{signal:c.signal,cache:"no-store"});
  if(!r.ok)throw Error(`HTTP ${r.status}`);
  const text=await r.text();
  if(!text)throw Error("Leere Antwort vom Server.");
  try{return JSON.parse(text)}catch{throw Error("Antwort ist kein gültiges JSON.")}
 }catch(e){
  if(e?.name==="AbortError")throw Error("Zeitüberschreitung beim Laden.");
  if(String(e?.message||"").includes("Failed to fetch"))throw Error("Verbindung blockiert oder CORS-Problem beim Anbieter.");
  throw e;
 }finally{clearTimeout(t)}
}

function Player({src,autoplay,onProgress,onStatus,onEnded}){
 const ref=useRef(null),h=useRef(null);
 const[err,setErr]=useState(""),[buf,setBuf]=useState(false);
 useEffect(()=>{
  let v=ref.current;if(!v||!src)return;
  setErr("");setBuf(true);
  if(h.current){h.current.destroy();h.current=null}
  v.pause();v.removeAttribute("src");v.load();
  let onT=()=>{if(v.duration&&Number.isFinite(v.duration))onProgress?.(Math.round(v.currentTime/v.duration*100))};
  let ready=()=>{setBuf(false);onStatus?.("Player bereit.")};
  let fail=m=>{setBuf(false);setErr(m);onStatus?.(m)};
  let ended=()=>{onEnded?.();onStatus?.("Wiedergabe beendet.")};
  v.addEventListener("timeupdate",onT);
  v.addEventListener("canplay",ready);
  v.addEventListener("waiting",()=>setBuf(true));
  v.addEventListener("playing",()=>setBuf(false));
  v.addEventListener("ended",ended);
  v.addEventListener("error",()=>fail("Video-Element konnte den Stream nicht abspielen."));
  if(src.toLowerCase().includes(".m3u8")&&Hls.isSupported()){
   let x=new Hls({enableWorker:true,lowLatencyMode:true,backBufferLength:90,maxBufferLength:30,recoverMediaError:true});
   x.loadSource(src);x.attachMedia(v);h.current=x;
   x.on(Hls.Events.ERROR,(_,d)=>{if(d?.fatal){if(d.type===Hls.ErrorTypes.MEDIA_ERROR){x.recoverMediaError();return}fail("HLS-Stream konnte nicht geladen werden.")}});
   x.on(Hls.Events.MANIFEST_PARSED,()=>{ready();if(autoplay)v.play().catch(()=>{})});
  }else{v.src=src;if(autoplay)v.play().catch(()=>{})}
  return()=>{v.removeEventListener("timeupdate",onT);v.removeEventListener("ended",ended);if(h.current){h.current.destroy();h.current=null}}
 },[src,autoplay]);
 return <div className="playerWrap"><video ref={ref} controls playsInline className="player"/>{buf&&<div className="playerOverlay">Buffering …</div>}{err&&<div className="errorBox">{err}</div>}</div>
}
function Login({onLogin}){const[u,setU]=useState(""),[p,setP]=useState("");return <div className="login"><div className="loginCard"><div className="mark"/><div className="badge">v3.7 stable pro</div><h1>IPTV Mat Player</h1><p>Premium Stream Dashboard für eigene oder autorisierte Zugänge.</p><input placeholder="Benutzername" value={u} onChange={e=>setU(e.target.value)}/><input placeholder="Passwort" type="password" value={p} onChange={e=>setP(e.target.value)}/><button className="primary wide" onClick={()=>u.trim()&&p.trim()&&onLogin({user:u.trim(),time:Date.now()})}>Einloggen</button></div></div>}
function Stat({l,v,h}){return <div className="stat"><small>{l}</small><b>{v}</b>{h&&<small>{h}</small>}</div>}
function Card({it,onClick,compact}){return <button className={`poster ${compact?"compact":""}`} onClick={onClick}><img src={it.cover} onError={e=>{e.currentTarget.src=DEMO[0].cover}} loading="lazy"/><b className="pbadge">{it.badge}</b><div className="ptitle">{it.title}</div><div className="pmeta">{it.category} · {it.rating}</div><div className="bar"><i style={{width:`${it.progress||0}%`}}/></div></button>}

function mapLive(list,auth){return top(list).filter(x=>has(x.stream_id)).map((x,i)=>({id:`live-${x.stream_id}`,title:safeText(x.name,`Live ${x.stream_id}`),section:"live",category:safeText(x.category_name||x.category_id,"Live TV"),badge:"Live",year:"2026",duration:"Live",rating:"0+",progress:0,description:"Importierter Live-Eintrag.",cover:x.stream_icon||fallbackCover(i),trailerUrl:fallbackTrailer(),streamUrl:streamUrl("live",auth.server,auth.username,auth.password,x.stream_id,String(x.container_extension||"m3u8").replace(".",""))}))}
function mapVod(list,auth){return top(list).filter(x=>has(x.stream_id)).map((x,i)=>({id:`movie-${x.stream_id}`,title:safeText(x.name,`Film ${x.stream_id}`),section:"movie",category:safeText(x.category_name||x.category_id,"Filme"),badge:"Movie",year:safeText(x.year,"2026"),duration:safeText(x.duration,"Film"),rating:"12+",progress:0,description:safeText(x.plot,"Importierter Film-Eintrag."),cover:x.stream_icon||x.cover||fallbackCover(i+2),trailerUrl:fallbackTrailer(),streamUrl:streamUrl("movie",auth.server,auth.username,auth.password,x.stream_id,String(x.container_extension||"mp4").replace(".",""))}))}
function mapSeries(list){return top(list).filter(x=>has(x.series_id)||has(x.stream_id)).map((x,i)=>{const id=x.series_id||x.stream_id||i;return {id:`series-${id}`,title:safeText(x.name,`Serie ${i+1}`),section:"series",category:safeText(x.category_name||x.category_id,"Serien"),badge:"Serie",year:safeText(x.year,"2026"),duration:"Serie",rating:"12+",progress:0,description:safeText(x.plot,"Importierter Serien-Eintrag."),cover:x.cover||x.stream_icon||fallbackCover(i+4),trailerUrl:fallbackTrailer(),streamUrl:DEMO[4].streamUrl}})}

function App(){
 const[session,setSession]=useState(()=>load("session",null));
 const[items,setItems]=useState(()=>load("items",DEMO));
 const[selected,setSelected]=useState(()=>load("selected",DEMO[0].id));
 const[watch,setWatch]=useState(()=>load("watch",["movie-1"]));
 const[settings,setSettings]=useState(()=>load("settings",{autoplay:true,autosave:true,compact:false,adult:false,trailer:true,motion:true,sort:"name"}));
 const[page,setPage]=useState("home"),[tab,setTab]=useState("live"),[search,setSearch]=useState(""),[status,setStatus]=useState("Bereit.");
 const[auth,setAuth]=useState(()=>load("auth",{server:"",username:"",password:""}));
 const[busy,setBusy]=useState(false),[importCount,setImportCount]=useState(()=>load("importCount",0)),[stamp,setStamp]=useState(()=>load("stamp",""));
 const[importStep,setImportStep]=useState(""),[importError,setImportError]=useState("");
 const sel=items.find(x=>x.id===selected)||items[0];
 const filtered=useMemo(()=>{
  let out=items.filter(i=>(tab==="all"||i.section===tab)&&(!search||`${i.title} ${i.category} ${i.description}`.toLowerCase().includes(search.toLowerCase()))&&(!settings.adult||i.rating!=="16+"));
  if(settings.sort==="progress")out.sort((a,b)=>(b.progress||0)-(a.progress||0));else out.sort((a,b)=>String(a.title).localeCompare(String(b.title),"de"));
  return out;
 },[items,tab,search,settings.adult,settings.sort]);
 const live=items.filter(i=>i.section==="live").length,mov=items.filter(i=>i.section==="movie").length,ser=items.filter(i=>i.section==="series").length;
 const cont=[...items].filter(i=>i.progress>0).sort((a,b)=>b.progress-a.progress).slice(0,8),wl=items.filter(i=>watch.includes(i.id));
 function persist(k,v,s){save(k,v);s(v)}
 function setSelectedPersist(id){persist("selected",id,setSelected);setPage("details")}
 function prog(p){if(!settings.autosave||!sel)return;persist("items",items.map(i=>i.id===sel.id?{...i,progress:Math.max(i.progress||0,p)}:i),setItems)}
 function ended(){persist("items",items.map(i=>i.id===sel.id?{...i,progress:100}:i),setItems)}
 function toggle(id){let n=watch.includes(id)?watch.filter(x=>x!==id):[...watch,id];persist("watch",n,setWatch)}
 function resetApp(){persist("items",DEMO,setItems);persist("selected",DEMO[0].id,setSelected);persist("watch",["movie-1"],setWatch);setStatus("Demo-Daten und Listen zurückgesetzt.");setImportStep("");setImportError("")}
 async function testConn(){if(!auth.server||!auth.username||!auth.password){setStatus("Bitte Zugangsdaten ausfüllen.");return}try{setBusy(true);setImportError("");setImportStep("Verbindung wird geprüft ...");let info=await fetchJson(api(auth.server,auth.username,auth.password,"get_live_categories"));setStatus(`Verbindung OK. Kategorien: ${arr(info).length}`);setImportStep("Verbindung OK.")}catch(e){setImportError(e.message);setStatus(e.message)}finally{setBusy(false)}}
 async function imp(){
  if(!auth.server||!auth.username||!auth.password){setStatus("Bitte Server, Benutzername und Passwort ausfüllen.");return}
  try{setBusy(true);setImportError("");setImportStep("1/3 Live TV wird geladen ...");setStatus("Import läuft ...");
   let liveData=[],vodData=[],seriesData=[],errors=[];
   try{liveData=await fetchJson(api(auth.server,auth.username,auth.password,"get_live_streams"));}catch(e){errors.push(`Live: ${e.message}`)}
   setImportStep("2/3 Filme werden geladen ...");
   try{vodData=await fetchJson(api(auth.server,auth.username,auth.password,"get_vod_streams"));}catch(e){errors.push(`Filme: ${e.message}`)}
   setImportStep("3/3 Serien werden geladen ...");
   try{seriesData=await fetchJson(api(auth.server,auth.username,auth.password,"get_series"));}catch(e){errors.push(`Serien: ${e.message}`)}
   const mapped=[...mapLive(liveData,auth),...mapVod(vodData,auth),...mapSeries(seriesData)];
   if(errors.length)setImportError(errors.join(" | "));
   if(!mapped.length)throw Error("Keine importierbaren Einträge gefunden. Prüfe Zugangsdaten, URL oder Anbieter-CORS.");
   persist("items",mapped,setItems);persist("selected",mapped[0].id,setSelected);persist("importCount",mapped.length,setImportCount);
   const st=new Date().toLocaleString("de-DE");persist("stamp",st,setStamp);setImportStep("Import abgeschlossen.");setStatus(`${mapped.length} Einträge importiert.`);
  }catch(e){setImportError(e.message);setStatus(e.message)}finally{setBusy(false)}
 }
 if(!session)return <Login onLogin={d=>{save("session",d);setSession(d)}}/>;
 return <div className={`app ${settings.motion?"motion":""}`}><header className="top"><div><div className="badge">v3.7 stable pro</div><h1>IPTV Mat Player</h1><p>{new Date().toLocaleDateString("de-DE",{weekday:"long",day:"2-digit",month:"long"})}</p></div><button className="secondary" onClick={()=>{save("session",null);setSession(null)}}>Logout</button></header>
 {page==="home"&&<><section className="stats"><Stat l="Live TV" v={live} h="Kanäle"/><Stat l="Filme" v={mov} h="VOD"/><Stat l="Serien" v={ser} h="Library"/><Stat l="Importiert" v={importCount} h={stamp||"noch kein Import"}/></section><section className="hero" style={{backgroundImage:`linear-gradient(180deg,rgba(7,10,18,.10),rgba(7,10,18,.95)),url(${sel.cover})`}}><div className="chips">{["live","movie","series","all"].map(x=><button key={x} className={`chip ${tab===x?"active":""}`} onClick={()=>setTab(x)}>{x}</button>)}</div><h2>{sel.title}</h2><p>{sel.description}</p><div><button className="primary" onClick={()=>setPage("details")}>Abspielen / Details</button><button className="secondary" onClick={()=>toggle(sel.id)}>{watch.includes(sel.id)?"Aus Watchlist":"Zur Watchlist"}</button></div>{settings.trailer&&sel.trailerUrl&&<video className="trailer" src={sel.trailerUrl} muted autoPlay playsInline loop/>}<Player src={sel.streamUrl} autoplay={settings.autoplay} onProgress={prog} onEnded={ended} onStatus={setStatus}/></section><section className="card"><h3>Suche & Sortierung</h3><input placeholder="Titel, Kategorie oder Beschreibung suchen ..." value={search} onChange={e=>setSearch(e.target.value)}/><button className={`chip ${settings.sort==="name"?"active":""}`} onClick={()=>persist("settings",{...settings,sort:"name"},setSettings)}>A–Z</button><button className={`chip ${settings.sort==="progress"?"active":""}`} onClick={()=>persist("settings",{...settings,sort:"progress"},setSettings)}>Fortschritt</button></section><section className="card"><h3>Kategorie-Startseite</h3><div className="grid">{filtered.map(it=><Card key={it.id} it={it} compact={settings.compact} onClick={()=>setSelectedPersist(it.id)}/>)}</div></section><section className="card"><h3>EPG Demo</h3><div className="epg">{EPG.map((r,i)=><div key={i}><b>{r[0]}</b><span>{r[1]}</span><small>{r[2]}</small></div>)}</div></section></>}
 {page==="details"&&<section className="card"><img className="detailImg" src={sel.cover}/><div className="chips"><span className="chip active">{sel.badge}</span><span className="chip">{sel.year}</span><span className="chip">{sel.duration}</span><span className="chip">{sel.rating}</span></div><h2>{sel.title}</h2><p>{sel.description}</p><button className="primary" onClick={()=>toggle(sel.id)}>{watch.includes(sel.id)?"Aus Watchlist":"Zur Watchlist"}</button><button className="secondary" onClick={()=>navigator.clipboard?.writeText(sel.streamUrl).then(()=>setStatus("Stream-URL kopiert."))}>Stream kopieren</button><Player src={sel.streamUrl} autoplay={false} onProgress={prog} onEnded={ended} onStatus={setStatus}/></section>}
 {page==="watch"&&<><section className="card"><h3>Weiter ansehen</h3><div className="grid">{cont.map(it=><Card key={it.id} it={it} onClick={()=>setSelectedPersist(it.id)}/>)}</div></section><section className="card"><h3>Watchlist</h3><div className="grid">{wl.map(it=><Card key={it.id} it={it} onClick={()=>setSelectedPersist(it.id)}/>)}</div></section></>}
 {page==="account"&&<><section className="card"><h3>Import Dashboard</h3><input placeholder="Server-URL, z.B. https://example.com:8080" value={auth.server} onChange={e=>persist("auth",{...auth,server:e.target.value},setAuth)}/><input placeholder="Benutzername" value={auth.username} onChange={e=>persist("auth",{...auth,username:e.target.value},setAuth)}/><input placeholder="Passwort" type="password" value={auth.password} onChange={e=>persist("auth",{...auth,password:e.target.value},setAuth)}/>{importStep&&<div className="infoBox">{importStep}</div>}{importError&&<div className="errorBox">{importError}</div>}<button className="secondary" disabled={busy} onClick={testConn}>Verbindung testen</button><button className="primary" disabled={busy} onClick={imp}>{busy?"Bitte warten ...":"Xtream stabil importieren"}</button><button className="secondary" onClick={resetApp}>Demo / App zurücksetzen</button></section><section className="card"><h3>Settings</h3>{[["autoplay","Trailer-Autoplay"],["autosave","Auto-Fortschritt"],["compact","Compact Mode"],["adult","16+ ausblenden"],["trailer","Auto-Trailer"],["motion","Premium Motion"]].map(([k,l])=><button key={k} className={`chip ${settings[k]?"active":""}`} onClick={()=>persist("settings",{...settings,[k]:!settings[k]},setSettings)}>{l}</button>)}<p className="muted">{status}</p></section></>}
 <nav>{[["home","Home"],["details","Details"],["watch","Liste"],["account","Konto"]].map(([k,l])=><button key={k} className={page===k?"navActive":"navBtn"} onClick={()=>setPage(k)}>{l}</button>)}</nav></div>
}
createRoot(document.getElementById("root")).render(<App/>);
