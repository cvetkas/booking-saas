'use client';
import {useEffect,useState} from 'react';
import {CalendarSync,ExternalLink,RefreshCw,ShieldCheck} from 'lucide-react';
import {getSupabase} from '../lib/supabase';
type Employee={id:string;name:string;active:boolean};
type Connection={id:string;employee_id:string;provider:string;connected_at:string};
export default function CalendarConnections({companyId,employees}:{companyId:string;employees:Employee[]}){
 const [employee,setEmployee]=useState(employees[0]?.id||'');
 const [connections,setConnections]=useState<Connection[]>([]);
 const [syncing,setSyncing]=useState(false);
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function token(){const {data:{session}}=await getSupabase().auth.getSession();if(!session)throw Error('Prijavi se ponovno.');return session.access_token}
 async function refresh(){
  setLoading(true);setError('');
  try{const t=await token();const r=await fetch('/api/calendar/connections?companyId='+encodeURIComponent(companyId),{headers:{Authorization:'Bearer '+t},cache:'no-store'});const v=await r.json();if(!r.ok)throw Error(v.error||'Povezav ni mogoče prebrati.');setConnections(v.connections||[])}
  catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}
 }
 useEffect(()=>{void refresh()},[companyId]);
 useEffect(()=>{
  const p=new URLSearchParams(window.location.search);const status=p.get('calendar_status');
  if(status){setNotice(status==='authorized_pending_sync'?'Račun je avtoriziran. Samodejna sinhronizacija še ni vključena.':'Povezovanje ni uspelo ('+status+').');history.replaceState(null,'',window.location.pathname);void refresh()}
 },[companyId]);
 async function syncNow(){
  setSyncing(true);setError('');setNotice('');
  try{
   const t=await token();
   const r=await fetch('/api/calendar/run-sync',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({companyId})});
   const v=await r.json();
   if(!r.ok)throw Error(v.error||'Sinhronizacija ni uspela.');
   setNotice('Obdelano: '+v.processed+' · napake: '+v.failed+(v.remainingMayExist?' · Preostala opravila lahko preveriš s ponovnim klikom.':''));
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setSyncing(false)}
 }
 async function connect(provider:'google'|'microsoft'){
  if(!employee)return;setBusy(true);setError('');setNotice('');
  try{
   const t=await token();const r=await fetch('/api/calendar/oauth/start',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({provider,companyId,employeeId:employee})});
   const v=await r.json();if(!r.ok)throw Error(v.error||'Začetek povezovanja ni uspel.');
   if(typeof v.url!=='string')throw Error('Ni povezave za avtorizacijo.');window.location.assign(v.url);
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 return <div className="panel integration-card">
  <div className="panel-heading"><div><h2>Koledarske povezave</h2><p>Google Calendar in Microsoft 365 · razvojna različica</p></div><CalendarSync size={23}/></div>
  <label>Zaposleni<select value={employee} onChange={e=>setEmployee(e.target.value)}><option value="">Izberi zaposlenega</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
  <div className="calendar-connect-actions">
   <button className="btn btn-primary" disabled={busy||!employee} onClick={()=>connect('google')}>Poveži Google Calendar <ExternalLink size={14}/></button>
   <button className="btn btn-quiet" disabled={busy||!employee} onClick={()=>connect('microsoft')}>Poveži Microsoft 365 <ExternalLink size={14}/></button>
  </div>
  <p className="hint"><ShieldCheck size={14}/> Povezovanje zahteva konfiguracijo OAuth in zaščitene SQL migracije 007 in 008. Prijavni podatki se ne shranjujejo v brskalniku.</p>
  <div className="panel-heading"><h3>Povezani računi</h3><button className="icon-button" aria-label="Osveži povezave" onClick={()=>void refresh()}><RefreshCw size={16}/></button></div>
  {loading?<p>Nalaganje povezav …</p>:connections.filter(c=>c.employee_id===employee).length?connections.filter(c=>c.employee_id===employee).map(c=><div key={c.id} className="list-row"><CalendarSync size={17}/><div className="row-main"><strong>{c.provider==='google'?'Google Calendar':'Microsoft 365'}</strong><small>Avtorizirano: {new Date(c.connected_at).toLocaleDateString('sl-SI')}</small></div><span className="status-tag pending">Sinhronizacija ni aktivna</span></div>):<div className="empty-state">Za izbranega zaposlenega še ni avtoriziranih koledarjev.</div>}
  <button className="btn btn-quiet" disabled={syncing||loading} onClick={()=>void syncNow()}>{syncing?'Sinhroniziram …':'Test: prenesi rezervacije v Google Calendar'} <RefreshCw size={14}/></button>
  {notice&&<p className="hint">{notice}</p>}{error&&<div className="alert error">{error}</div>}
 </div>;
}
