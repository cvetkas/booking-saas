'use client';
import {useCallback,useEffect,useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {getSupabase} from '../lib/supabase';
import {CalendarDays,Users,BriefcaseBusiness,LayoutDashboard,LogOut,Plus,Building2,ArrowRight,RefreshCw,ShieldCheck} from 'lucide-react';

type Company = {id:string;name:string;slug:string;timezone:string};
type Employee = {id:string;name:string;email:string|null;active:boolean};
type Service = {id:string;name:string;description:string|null;duration_minutes:number;active:boolean};
type Booking = {id:string;starts_at:string;customer_name:string;status:string};
type Section = 'overview'|'employees'|'services'|'schedule'|'bookings'|'settings';
const menu: {id:Section;name:string;Icon:typeof LayoutDashboard}[]=[{id:'overview',name:'Pregled',Icon:LayoutDashboard},{id:'employees',name:'Zaposleni',Icon:Users},{id:'services',name:'Storitve',Icon:BriefcaseBusiness},{id:'schedule',name:'Urniki',Icon:CalendarDays},{id:'bookings',name:'Rezervacije',Icon:CalendarDays},{id:'settings',name:'Nastavitve',Icon:Building2}];
function message(e:unknown){return e instanceof Error?e.message:String(e)}
export default function Home(){
 const [user,setUser]=useState<User|null>(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [mode,setMode]=useState<'login'|'signup'>('signup'),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [companies,setCompanies]=useState<Company[]>([]),[companyId,setCompanyId]=useState(''),[section,setSection]=useState<Section>('overview');
 const [companyName,setCompanyName]=useState(''),[companySlug,setCompanySlug]=useState('');
 const [employees,setEmployees]=useState<Employee[]>([]),[services,setServices]=useState<Service[]>([]),[bookings,setBookings]=useState<Booking[]>([]);
 const [employeeName,setEmployeeName]=useState(''),[employeeEmail,setEmployeeEmail]=useState(''),[serviceName,setServiceName]=useState(''),[duration,setDuration]=useState('30');
 const [editingEmployee,setEditingEmployee]=useState<string|null>(null),[editEmployeeName,setEditEmployeeName]=useState(''),[editEmployeeEmail,setEditEmployeeEmail]=useState('');
 const [editingService,setEditingService]=useState<string|null>(null),[editServiceName,setEditServiceName]=useState(''),[editServiceDuration,setEditServiceDuration]=useState('30');
 const [selectedEmployee,setSelectedEmployee]=useState(''),[selectedService,setSelectedService]=useState(''),[hours,setHours]=useState<{id:string;employee_id:string;day_of_week:number;start_local:string;end_local:string}[]>([]),[links,setLinks]=useState<{employee_id:string;service_id:string}[]>([]),[day,setDay]=useState('1'),[fromTime,setFromTime]=useState('08:00'),[toTime,setToTime]=useState('16:00');
 const current=companies.find(c=>c.id===companyId);
 const loadCompanies=useCallback(async()=>{
  const supabase=getSupabase();
  const {data:members,error:e1}=await supabase.from('company_members').select('company_id'); if(e1)throw e1;
  if(!members?.length){setCompanies([]);setCompanyId('');return;}
  const {data,error:e2}=await supabase.from('companies').select('id,name,slug,timezone').in('id',members.map(m=>m.company_id)).order('name');if(e2)throw e2;
  const list=(data||[]) as Company[];setCompanies(list);setCompanyId(prev=>list.some(x=>x.id===prev)?prev:list[0]?.id||'');
 },[]);
 const loadData=useCallback(async(id:string)=>{
  if(!id)return;
  const supabase=getSupabase();
  const [er,sr,br,hr,lr]=await Promise.all([
   supabase.from('employees').select('id,name,email,active').eq('company_id',id).order('name'),
   supabase.from('services').select('id,name,description,duration_minutes,active').eq('company_id',id).order('name'),
   supabase.from('bookings').select('id,starts_at,customer_name,status').eq('company_id',id).order('starts_at',{ascending:false}).limit(30),
   supabase.from('working_hours').select('id,employee_id,day_of_week,start_local,end_local').eq('company_id',id),
   supabase.from('employee_services').select('employee_id,service_id').eq('company_id',id)
  ]);
  if(er.error)throw er.error;if(sr.error)throw sr.error;if(br.error)throw br.error;if(hr.error)throw hr.error;if(lr.error)throw lr.error;
  setEmployees((er.data||[]) as Employee[]);setServices((sr.data||[]) as Service[]);setBookings((br.data||[]) as Booking[]);setHours(hr.data||[]);setLinks(lr.data||[]);
 },[]);
 useEffect(()=>{
  let alive=true;
  try{const s=getSupabase();s.auth.getUser().then(({data})=>{if(alive){setUser(data.user);setReady(true)}}).catch(e=>{if(alive){setError(message(e));setReady(true)}});
  const {data:{subscription}}=s.auth.onAuthStateChange((_event,session)=>{if(alive){setUser(session?.user??null);if(!session){setCompanies([]);setCompanyId('')}}});return()=>{alive=false;subscription.unsubscribe()};
  }catch(e){setError(message(e));setReady(true)}
 },[]);
 useEffect(()=>{if(user)loadCompanies().catch(e=>setError(message(e)))},[user,loadCompanies]);
 useEffect(()=>{if(companyId)loadData(companyId).catch(e=>setError(message(e)))},[companyId,loadData]);
 async function act(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn()}catch(e){setError(message(e))}finally{setBusy(false)}}
 const s=()=>getSupabase();
 const auth=async(e:React.FormEvent)=>{e.preventDefault();await act(async()=>{
  if(mode==='signup'){const {data,error}=await s().auth.signUp({email,password});if(error)throw error;setNotice(data.session?'Račun ustvarjen.':'Preveri e-pošto in potrdi registracijo, nato se prijavi.');}
  else{const {error}=await s().auth.signInWithPassword({email,password});if(error)throw error;}
 })};
 const makeCompany=async(e:React.FormEvent)=>{e.preventDefault();await act(async()=>{
  const {error}=await s().rpc('create_company_with_owner',{p_name:companyName.trim(),p_slug:companySlug.trim().toLowerCase()});if(error)throw error;
  setCompanyName('');setCompanySlug('');await loadCompanies();setNotice('Podjetje ustvarjeno.');
 })};
 const addEmployee=async(e:React.FormEvent)=>{e.preventDefault();if(!companyId)return;await act(async()=>{
  const {error}=await s().from('employees').insert({company_id:companyId,name:employeeName.trim(),email:employeeEmail.trim()||null});if(error)throw error;
  setEmployeeName('');setEmployeeEmail('');await loadData(companyId);
 })};
 const addService=async(e:React.FormEvent)=>{e.preventDefault();if(!companyId)return;await act(async()=>{
  const {error}=await s().from('services').insert({company_id:companyId,name:serviceName.trim(),duration_minutes:Number(duration)});if(error)throw error;
  setServiceName('');await loadData(companyId);
 })};
 async function saveEmployee(e:React.FormEvent){e.preventDefault();if(!editingEmployee||!companyId)return;await act(async()=>{const {error}=await s().from('employees').update({name:editEmployeeName.trim(),email:editEmployeeEmail.trim()||null}).eq('id',editingEmployee).eq('company_id',companyId);if(error)throw error;setEditingEmployee(null);await loadData(companyId);setNotice('Zaposleni posodobljen.')})}
 async function toggleEmployee(x:Employee){if(!companyId)return;await act(async()=>{const {error}=await s().from('employees').update({active:!x.active}).eq('id',x.id).eq('company_id',companyId);if(error)throw error;await loadData(companyId);setNotice(x.active?'Zaposleni deaktiviran.':'Zaposleni aktiviran.')})}
 async function saveService(e:React.FormEvent){e.preventDefault();if(!editingService||!companyId)return;await act(async()=>{const {error}=await s().from('services').update({name:editServiceName.trim(),duration_minutes:Number(editServiceDuration)}).eq('id',editingService).eq('company_id',companyId);if(error)throw error;setEditingService(null);await loadData(companyId);setNotice('Storitev posodobljena.')})}
 async function toggleService(x:Service){if(!companyId)return;await act(async()=>{const {error}=await s().from('services').update({active:!x.active}).eq('id',x.id).eq('company_id',companyId);if(error)throw error;await loadData(companyId);setNotice(x.active?'Storitev deaktivirana.':'Storitev aktivirana.')})}
 async function addHours(e:React.FormEvent){e.preventDefault();if(!companyId||!selectedEmployee)return;await act(async()=>{const {error}=await s().from('working_hours').insert({company_id:companyId,employee_id:selectedEmployee,day_of_week:Number(day),start_local:fromTime,end_local:toTime});if(error)throw error;await loadData(companyId)})}
 async function removeHours(id:string){await act(async()=>{const {error}=await s().from('working_hours').delete().eq('id',id);if(error)throw error;await loadData(companyId)})}
 async function assignService(){if(!selectedEmployee||!selectedService||!companyId)return;await act(async()=>{const {error}=await s().from('employee_services').insert({company_id:companyId,employee_id:selectedEmployee,service_id:selectedService});if(error)throw error;await loadData(companyId)})}
 async function unassignService(employee_id:string,service_id:string){await act(async()=>{const {error}=await s().from('employee_services').delete().eq('employee_id',employee_id).eq('service_id',service_id);if(error)throw error;await loadData(companyId)})}
 if(!ready)return <main className="center"><div className="card">Odpiram aplikacijo …</div></main>;
 return <main className="page">
 <header className="top"><div className="brand"><span className="brandIcon"><CalendarDays size={22}/></span><div><b>Booking Platform</b><small>SaaS administracija · MVP</small></div></div>{user&&<button className="light" onClick={()=>s().auth.signOut()}><LogOut size={16}/> Odjava</button>}</header>
 {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert good">{notice}</div>}
 {!user?<section className="auth card"><div className="eyebrow">Dobrodošli</div><h1>{mode==='signup'?'Ustvari svoj račun':'Prijava'}</h1><p>Začni upravljati rezervacije v svojem podjetju.</p><form onSubmit={auth}><label>E-pošta<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Geslo<input type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{mode==='signup'?'Registracija':'Prijava'} <ArrowRight size={17}/></button></form><button className="link" onClick={()=>setMode(mode==='signup'?'login':'signup')}>{mode==='signup'?'Že imaš račun? Prijava':'Še nimaš računa? Registracija'}</button></section>
 :companies.length===0?<section className="auth card"><div className="eyebrow">Prvi korak</div><h1>Ustvari podjetje</h1><p>Vsako podjetje ima svoje zaposlene in storitve.</p><form onSubmit={makeCompany}><label>Ime podjetja<input required maxLength={120} value={companyName} onChange={e=>{setCompanyName(e.target.value);setCompanySlug(e.target.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''))}} placeholder="Primer: ABC Svetovanje"/></label><label>Kratka oznaka (slug)<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={companySlug} onChange={e=>setCompanySlug(e.target.value)} placeholder="abc-svetovanje"/></label><button className="primary" disabled={busy||!companyName||!companySlug}>Ustvari podjetje <Plus size={17}/></button></form></section>
 :<div className="layout"><aside className="sidebar"><div className="eyebrow">Delovni prostor</div><select value={companyId} onChange={e=>{setCompanyId(e.target.value);setSection('overview')}}>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><nav>{menu.map(({id,name,Icon})=><button key={id} className={section===id?'active':''} onClick={()=>setSection(id)}><Icon size={18}/>{name}</button>)}</nav><div className="bottom"><ShieldCheck size={16}/> Podatki ločeni po podjetjih</div></aside><article className="content">
 <div className="heading"><div><div className="eyebrow">{current?.name}</div><h1>{menu.find(x=>x.id===section)?.name}</h1></div><button className="light" onClick={()=>act(()=>loadData(companyId))}><RefreshCw size={16}/> Osveži</button></div>
 {section==='overview'&&<><div className="stats"><div className="card stat"><small>Zaposleni</small><strong>{employees.length}</strong></div><div className="card stat"><small>Storitve</small><strong>{services.length}</strong></div><div className="card stat"><small>Rezervacije</small><strong>{bookings.length}</strong></div></div><div className="card"><h2>Prvi koraki</h2><p>Dodaj zaposlene in storitve. Nato v zavihku Urniki poveži zaposlene s storitvami in določi delovni čas.</p><div className="note">Testna rezervacijska stran: /book/{current?.slug} — Google/Outlook integracija in obvestila še niso vključeni.</div></div></>}
 {section==='employees'&&<><div className="card"><h2>Dodaj zaposlenega</h2><form className="inlineform" onSubmit={addEmployee}><label>Ime in priimek<input required value={employeeName} onChange={e=>setEmployeeName(e.target.value)}/></label><label>E-pošta (neobvezno)<input type="email" value={employeeEmail} onChange={e=>setEmployeeEmail(e.target.value)}/></label><button className="primary" disabled={busy||!employeeName.trim()}><Plus size={16}/> Dodaj</button></form></div><div className="card"><h2>Zaposleni ({employees.length})</h2>{employees.length?employees.map(x=><div className="entry" key={x.id} style={{flexWrap:'wrap'}}><div className="avatar">{x.name.charAt(0)}</div><div style={{flex:1}}><b>{x.name}</b><small>{x.email||'Brez e-pošte'}</small></div><span className="tag">{x.active?'Aktiven':'Neaktiven'}</span><button className="light" disabled={busy} onClick={()=>{setEditingEmployee(x.id);setEditEmployeeName(x.name);setEditEmployeeEmail(x.email||'')}}>Uredi</button><button className="light" disabled={busy} onClick={()=>toggleEmployee(x)}>{x.active?'Deaktiviraj':'Aktiviraj'}</button>{editingEmployee===x.id&&<form style={{width:'100%',display:'flex',gap:10,flexWrap:'wrap'}} onSubmit={saveEmployee}><label>Ime<input required value={editEmployeeName} onChange={e=>setEditEmployeeName(e.target.value)}/></label><label>E-pošta<input type="email" value={editEmployeeEmail} onChange={e=>setEditEmployeeEmail(e.target.value)}/></label><button className="primary" disabled={busy||!editEmployeeName.trim()}>Shrani</button><button className="light" type="button" onClick={()=>setEditingEmployee(null)}>Prekliči</button></form>}</div>):<p>Ni še dodanih zaposlenih.</p>}</div></>}
 {section==='services'&&<><div className="card"><h2>Dodaj storitev</h2><form className="inlineform" onSubmit={addService}><label>Naziv storitve<input required value={serviceName} onChange={e=>setServiceName(e.target.value)}/></label><label>Trajanje<select value={duration} onChange={e=>setDuration(e.target.value)}>{[15,30,45,60,90,120].map(n=><option value={n} key={n}>{n} minut</option>)}</select></label><button className="primary" disabled={busy||!serviceName.trim()}><Plus size={16}/> Dodaj</button></form></div><div className="card"><h2>Storitve ({services.length})</h2>{services.length?services.map(x=><div className="entry" key={x.id} style={{flexWrap:'wrap'}}><div className="avatar"><BriefcaseBusiness size={16}/></div><div style={{flex:1}}><b>{x.name}</b><small>{x.duration_minutes} minut</small></div><span className="tag">{x.active?'Aktivna':'Neaktivna'}</span><button className="light" disabled={busy} onClick={()=>{setEditingService(x.id);setEditServiceName(x.name);setEditServiceDuration(String(x.duration_minutes))}}>Uredi</button><button className="light" disabled={busy} onClick={()=>toggleService(x)}>{x.active?'Deaktiviraj':'Aktiviraj'}</button>{editingService===x.id&&<form style={{width:'100%',display:'flex',gap:10,flexWrap:'wrap'}} onSubmit={saveService}><label>Naziv<input required value={editServiceName} onChange={e=>setEditServiceName(e.target.value)}/></label><label>Trajanje (min)<input type="number" min={5} max={480} required value={editServiceDuration} onChange={e=>setEditServiceDuration(e.target.value)}/></label><button className="primary" disabled={busy||!editServiceName.trim()}>Shrani</button><button className="light" type="button" onClick={()=>setEditingService(null)}>Prekliči</button></form>}</div>):<p>Ni še dodanih storitev.</p>}</div></>}
 {section==='schedule'&&<><div className="card"><h2>Delovni čas zaposlenih</h2><form onSubmit={addHours}><label>Zaposleni<select value={selectedEmployee} onChange={e=>setSelectedEmployee(e.target.value)}><option value="">Izberi zaposlenega</option>{employees.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Dan<select value={day} onChange={e=>setDay(e.target.value)}>{['Nedelja','Ponedeljek','Torek','Sreda','Četrtek','Petek','Sobota'].map((x,i)=><option key={i} value={i}>{x}</option>)}</select></label><label>Od<input type="time" value={fromTime} onChange={e=>setFromTime(e.target.value)} required/></label><label>Do<input type="time" value={toTime} onChange={e=>setToTime(e.target.value)} required/></label><button className="primary" disabled={busy||!selectedEmployee||fromTime>=toTime}>Dodaj izmeno</button></form>{hours.filter(x=>x.employee_id===selectedEmployee).map(h=><div className="entry" key={h.id}><div><b>{['Ned','Pon','Tor','Sre','Čet','Pet','Sob'][h.day_of_week]}</b><small>{h.start_local.slice(0,5)}–{h.end_local.slice(0,5)}</small></div><button className="light" onClick={()=>removeHours(h.id)}>Odstrani</button></div>)}</div><div className="card"><h2>Dodelitev storitev zaposlenim</h2><label>Storitev<select value={selectedService} onChange={e=>setSelectedService(e.target.value)}><option value="">Izberi storitev</option>{services.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><button className="primary" onClick={assignService} disabled={!selectedEmployee||!selectedService||busy}>Dodeli izbranemu zaposlenemu</button>{links.filter(x=>x.employee_id===selectedEmployee).map(x=><div className="entry" key={x.employee_id+x.service_id}><div><b>{services.find(s=>s.id===x.service_id)?.name}</b></div><button className="light" onClick={()=>unassignService(x.employee_id,x.service_id)}>Odstrani</button></div>)}</div></>}
 {section==='bookings'&&<div className="card"><h2>Rezervacije</h2>{bookings.length?bookings.map(b=><div className="entry" key={b.id}><div><b>{b.customer_name}</b><small>{new Date(b.starts_at).toLocaleString('sl-SI',{timeZone:current?.timezone||'Europe/Ljubljana'})}</small></div><span className="tag">{b.status}</span></div>):<p>Rezervacij še ni. Javno naročanje bo dodano v naslednji razvojni fazi.</p>}</div>}
 {section==='settings'&&<div className="card"><h2>Podjetje</h2><p><b>Ime:</b> {current?.name}</p><p><b>Oznaka:</b> {current?.slug}</p><p><b>Časovni pas:</b> {current?.timezone}</p><div className="note">Javna rezervacijska stran: {typeof window!=='undefined'?window.location.origin:''}/book/{current?.slug} (razvojna verzija). Zunanji koledarji in e-poštna obvestila še ne delujejo.</div></div>}
 </article></div>}
 </main>;
}
