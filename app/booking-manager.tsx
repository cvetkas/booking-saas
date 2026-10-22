'use client';
import {useState} from 'react';
import {DateTime} from 'luxon';
import {getSupabase} from '../lib/supabase';
import {Plus,CalendarClock,CalendarX,RefreshCcw} from 'lucide-react';
type Employee={id:string;name:string;active:boolean};
type Service={id:string;name:string;duration_minutes:number;active:boolean};
type Booking={id:string;employee_id:string;service_id:string;starts_at:string;customer_name:string;customer_email:string;status:string};
export default function BookingManager({company,employees,services,bookings,onRefresh}:{company:{id:string;slug:string;timezone:string};employees:Employee[];services:Service[];bookings:Booking[];onRefresh:()=>Promise<void>}){
 const [action,setAction]=useState<'create'|'reschedule'|'cancel'>('create');
 const [selected,setSelected]=useState(''),[employee,setEmployee]=useState(''),[service,setService]=useState(''),[name,setName]=useState(''),[email,setEmail]=useState(''),[date,setDate]=useState(''),[slot,setSlot]=useState('');
 const [slots,setSlots]=useState<string[]>([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const existing=bookings.find(b=>b.id===selected);
 const staff=action==='reschedule'?existing?.employee_id:employee;
 const serviceId=action==='reschedule'?existing?.service_id:service;
 async function loadSlots(){
  setError('');setNotice('');setSlots([]);setSlot('');
  if(!staff||!serviceId||!date)return;
  setLoading(true);
  try{
   const query=new URLSearchParams({slug:company.slug,employee:staff,service:serviceId,date});
   // The public endpoint excludes the existing booking only for creation. For rescheduling,
   // use a dedicated authenticated availability request to exclude its current interval.
   if(action==='reschedule'){
    const {data:{session}}=await getSupabase().auth.getSession();
    if(!session)throw Error('Prijavi se ponovno.');
    const r=await fetch('/api/admin/availability?'+new URLSearchParams({companyId:company.id,employee:staff,service:serviceId,date,bookingId:selected}),{headers:{Authorization:'Bearer '+session.access_token}});
    const v=await r.json();if(!r.ok)throw Error(v.error||'Napaka');setSlots(v.slots||[]);
   }else{
    const r=await fetch('/api/public/availability?'+query);const v=await r.json();if(!r.ok)throw Error(v.error||'Napaka');setSlots(v.slots||[]);
   }
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}
 }
 async function submit(){
  setBusy(true);setError('');setNotice('');
  try{
   if(action!=='create'&&!selected)throw Error('Izberi rezervacijo.');
   if(action!=='cancel'&&!slot)throw Error('Izberi prost termin.');
   const {data:{session}}=await getSupabase().auth.getSession();if(!session)throw Error('Prijavi se ponovno.');
   const r=await fetch('/api/admin/bookings',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({action,companyId:company.id,bookingId:selected,employeeId:employee,serviceId:service,start:slot,name,email})});
   const v=await r.json();if(!r.ok)throw Error(v.error||'Shranjevanje ni uspelo.');
   setNotice(action==='create'?'Rezervacija ustvarjena.':action==='cancel'?'Rezervacija odpovedana.':'Termin uspešno prestavljen.');
   setSelected('');setSlot('');setSlots([]);setName('');setEmail('');await onRefresh();
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 return <div className="panel manager-panel">
  <div className="panel-heading"><div><h2>Upravljanje rezervacij</h2><p>Dodaj termin, prestavi obstoječega ali ga odpovej</p></div><RefreshCcw size={17}/></div>
  <div className="manager-tabs">
   <button className={action==='create'?'active':''} onClick={()=>{setAction('create');setSlots([]);setSlot('')}}><Plus size={15}/> Nova rezervacija</button>
   <button className={action==='reschedule'?'active':''} onClick={()=>{setAction('reschedule');setSlots([]);setSlot('')}}><CalendarClock size={15}/> Prestavi</button>
   <button className={action==='cancel'?'active':''} onClick={()=>{setAction('cancel');setSlots([]);setSlot('')}}><CalendarX size={15}/> Odpovej</button>
  </div>
  {action!=='create'&&<label>Izberi obstoječo rezervacijo<select value={selected} onChange={e=>{setSelected(e.target.value);setSlots([]);setSlot('')}}><option value="">Izberi rezervacijo</option>{bookings.filter(b=>b.status!=='cancelled').map(b=><option key={b.id} value={b.id}>{DateTime.fromISO(b.starts_at).setZone(company.timezone).toFormat('dd. LL. HH:mm')} · {b.customer_name}</option>)}</select></label>}
  {action==='create'&&<div className="manager-columns"><label>Zaposleni<select value={employee} onChange={e=>{setEmployee(e.target.value);setSlots([]);setSlot('')}}><option value="">Izberi zaposlenega</option>{employees.filter(x=>x.active).map(e=><option value={e.id} key={e.id}>{e.name}</option>)}</select></label><label>Storitev<select value={service} onChange={e=>{setService(e.target.value);setSlots([]);setSlot('')}}><option value="">Izberi storitev</option>{services.filter(s=>s.active).map(s=><option value={s.id} key={s.id}>{s.name} ({s.duration_minutes} min)</option>)}</select></label><label>Ime stranke<input value={name} onChange={e=>setName(e.target.value)}/></label><label>E-pošta stranke<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label></div>}
  {action!=='cancel'&&<><div className="manager-date"><label>Datum<input type="date" value={date} onChange={e=>{setDate(e.target.value);setSlots([]);setSlot('')}}/></label><button className="btn btn-quiet" type="button" disabled={!staff||!serviceId||!date||loading} onClick={loadSlots}>{loading?'Preverjam …':'Pokaži proste termine'}</button></div><div className="manager-slots">{slots.map(s=><button type="button" className={slot===s?'chosen':''} key={s} onClick={()=>setSlot(s)}>{DateTime.fromISO(s).setZone(company.timezone).toFormat('HH:mm')}</button>)}</div>{date&&!slots.length&&!loading&&<p className="hint">Izberi datum in klikni »Pokaži proste termine«.</p>}</>}
  {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert good">{notice}</div>}
  <button className="btn btn-primary" type="button" disabled={busy||(action!=='create'&&!selected)||(action!=='cancel'&&!slot)||(action==='create'&&(!name.trim()||!email.includes('@')))} onClick={submit}>{busy?'Shranjujem …':action==='create'?'Potrdi novo rezervacijo':action==='reschedule'?'Shrani nov termin':'Potrdi odpoved'}</button>
  <p className="hint">Spremembe so preverjene na strežniku. E-poštno obvestilo o spremembi termina še ni vključeno.</p>
 </div>;
}
