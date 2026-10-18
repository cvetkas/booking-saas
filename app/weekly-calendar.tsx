'use client';
import {useEffect,useMemo,useState} from 'react';
import {DateTime} from 'luxon';
import {CalendarDays,ChevronLeft,ChevronRight,Clock3,ExternalLink,Maximize2,Minimize2,RefreshCcw,Users,X} from 'lucide-react';
import {getSupabase} from '../lib/supabase';

type Company={id:string;slug:string;timezone:string};
type Employee={id:string;name:string;active:boolean};
type Service={id:string;name:string};
type Reservation={id:string;employee_id:string;service_id:string;starts_at:string;ends_at:string;customer_name:string;customer_email:string;customer_phone:string|null;status:string};
type Absence={id:string;employee_id:string;starts_at:string;ends_at:string;reason:string|null};
type Shift={id:string;employee_id:string;day_of_week:number;start_local:string;end_local:string};
type Override={id:string;employee_id:string;local_date:string;mode:string;note:string|null};
type SpecialShift={id:string;override_id:string;start_local:string;end_local:string};
type CalendarEvent={key:string;kind:'booking'|'absence';employee_id:string;starts_at:string;ends_at:string;booking?:Reservation;absence?:Absence;start:number;end:number;column?:number;columns?:number};
type Props={company:Company;employees:Employee[];services:Service[];onOpenBookings:()=>void};

const FIRST_HOUR=7,LAST_HOUR=21,PIXELS_PER_HOUR=72;
const STATUS:Record<string,string>={confirmed:'Potrjeno',pending:'V čakanju',completed:'Opravljeno',cancelled:'Odpovedano',no_show:'Ni prišel'};
const weekdays=['PON','TOR','SRE','ČET','PET','SOB','NED'];
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
function weekMonday(day:string,timezone:string){
 const local=DateTime.fromISO(day,{zone:timezone});return local.minus({days:local.weekday-1}).toISODate()||day;
}
function timeOf(value:string,zone:string){
 return DateTime.fromISO(value).setZone(zone).toFormat('HH:mm');
}
function readableDate(value:string,zone:string){
 return DateTime.fromISO(value).setZone(zone).toFormat('dd. LL. yyyy, HH:mm');
}
function layout(events:CalendarEvent[]):CalendarEvent[]{
 const items=events.slice().sort((a,b)=>a.start-b.start||a.end-b.end);
 let group:CalendarEvent[]=[],groupEnd=-Infinity;
 const result:CalendarEvent[]=[];
 function flush(){
  if(!group.length)return;
  const columnEnds:number[]=[];
  for(const item of group){
   let column=columnEnds.findIndex(x=>x<=item.start);
   if(column===-1){column=columnEnds.length;columnEnds.push(item.end)}
   else columnEnds[column]=item.end;
   item.column=column;
  }
  for(const item of group){item.columns=columnEnds.length;result.push(item)}
  group=[];
 }
 for(const item of items){
  if(group.length&&item.start>=groupEnd){flush();groupEnd=-Infinity}
  group.push(item);groupEnd=Math.max(groupEnd,item.end);
 }
 flush();return result;
}
export default function WeeklyCalendar({company,employees,services,onOpenBookings}:Props){
 const zone=company.timezone||'Europe/Ljubljana';
 const [week,setWeek]=useState(()=>DateTime.now().setZone(zone).startOf('week').toISODate()||'2026-10-12');
 const [employeeFilter,setEmployeeFilter]=useState('all');
 const [expanded,setExpanded]=useState(false),[compact,setCompact]=useState(true);
 const [showCancelled,setShowCancelled]=useState(false);
 const [bookings,setBookings]=useState<Reservation[]>([]);
 const [absences,setAbsences]=useState<Absence[]>([]);
 const [shifts,setShifts]=useState<Shift[]>([]);
 const [overrides,setOverrides]=useState<Override[]>([]);
 const [specialShifts,setSpecialShifts]=useState<SpecialShift[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const [reload,setReload]=useState(0),[selected,setSelected]=useState<CalendarEvent|null>(null);
 const start=DateTime.fromISO(week,{zone}).startOf('day');
 const end=start.plus({days:7});
 const days=Array.from({length:7},(_,i)=>start.plus({days:i}));
 const today=DateTime.now().setZone(zone).toISODate();
 useEffect(()=>{
  let live=true;setLoading(true);setError('');
  const db=getSupabase();
  const beginning=start.toUTC().toISO()!,ending=end.toUTC().toISO()!;
  Promise.all([
   db.from('bookings').select('id,employee_id,service_id,starts_at,ends_at,customer_name,customer_email,customer_phone,status').eq('company_id',company.id).lt('starts_at',ending).gt('ends_at',beginning).order('starts_at'),
   db.from('availability_blocks').select('id,employee_id,starts_at,ends_at,reason').eq('company_id',company.id).lt('starts_at',ending).gt('ends_at',beginning),
   db.from('working_hours').select('id,employee_id,day_of_week,start_local,end_local').eq('company_id',company.id),
   db.from('employee_day_overrides').select('id,employee_id,local_date,mode,note').eq('company_id',company.id).gte('local_date',week).lt('local_date',end.toISODate()!),
   db.from('employee_day_override_shifts').select('id,override_id,start_local,end_local').eq('company_id',company.id)
  ]).then(results=>{
   if(!live)return;
   for(const result of results)if(result.error)throw result.error;
   setBookings((results[0].data||[]) as Reservation[]);
   setAbsences((results[1].data||[]) as Absence[]);
   setShifts((results[2].data||[]) as Shift[]);
   setOverrides((results[3].data||[]) as Override[]);
   setSpecialShifts((results[4].data||[]) as SpecialShift[]);
  }).catch(e=>{if(live)setError(errorText(e))}).finally(()=>{if(live)setLoading(false)});
  return()=>{live=false};
 },[company.id,week,reload,zone]);
 const activeStaff=employees.filter(e=>e.active||bookings.some(b=>b.employee_id===e.id));
 const visibleStaff=activeStaff.filter(e=>employeeFilter==='all'||e.id===employeeFilter).map(e=>e.id);
 const visibleBookings=bookings.filter(b=>(showCancelled||b.status!=='cancelled')&&visibleStaff.includes(b.employee_id));
 const visibleAbsences=absences.filter(a=>visibleStaff.includes(a.employee_id));
 const staffName=(id:string)=>employees.find(e=>e.id===id)?.name||'Neznan zaposleni';
 const serviceName=(id:string)=>services.find(s=>s.id===id)?.name||'Storitev';
 const timeTicks=Array.from({length:LAST_HOUR-FIRST_HOUR+1},(_,i)=>FIRST_HOUR+i);
 const hourHeight=expanded&&compact?48:PIXELS_PER_HOUR;
 const totalHeight=(LAST_HOUR-FIRST_HOUR)*hourHeight;
 const weekCaption=start.toFormat('dd. LL.')+' – '+end.minus({days:1}).toFormat('dd. LL. yyyy');
 const count=visibleBookings.filter(b=>b.status!=='cancelled').length;
 const eventForDay=(date:DateTime)=>{
  const base=date.startOf('day'),dateStart=base.toMillis(),dateEnd=base.plus({days:1}).toMillis();
  const make=(kind:'booking'|'absence',item:Reservation|Absence):CalendarEvent|null=>{
   const a=DateTime.fromISO(item.starts_at).toMillis(),b=DateTime.fromISO(item.ends_at).toMillis();
   if(!(a<dateEnd&&b>dateStart))return null;
   const startMinute=Math.max(FIRST_HOUR*60,DateTime.fromMillis(a).setZone(zone).diff(base,'minutes').minutes);
   const endMinute=Math.min(LAST_HOUR*60,DateTime.fromMillis(b).setZone(zone).diff(base,'minutes').minutes);
   if(endMinute<=startMinute)return null;
   return {key:kind+':'+item.id+':'+date.toISODate(),kind,employee_id:item.employee_id,starts_at:item.starts_at,ends_at:item.ends_at,booking:kind==='booking'?item as Reservation:undefined,absence:kind==='absence'?item as Absence:undefined,start:startMinute,end:endMinute};
  };
  const items:CalendarEvent[]=[];
  for(const b of visibleBookings){const event=make('booking',b);if(event)items.push(event)}
  for(const a of visibleAbsences){const event=make('absence',a);if(event)items.push(event)}
  return layout(items);
 };
 const intervalsForDay=(day:DateTime)=>{
  if(employeeFilter==='all')return [] as {start:number;end:number}[];
  const iso=day.toISODate()!,dayNumber=day.weekday%7;
  const override=overrides.find(o=>o.employee_id===employeeFilter&&o.local_date===iso);
  const intervals=override?override.mode==='closed'?[]:specialShifts.filter(s=>s.override_id===override.id):shifts.filter(s=>s.employee_id===employeeFilter&&s.day_of_week===dayNumber);
  return intervals.map(x=>{
   const [sH,sM]=x.start_local.split(':').map(Number),[eH,eM]=x.end_local.split(':').map(Number);
   return {start:Math.max(FIRST_HOUR*60,sH*60+sM),end:Math.min(LAST_HOUR*60,eH*60+eM)};
  }).filter(x=>x.end>x.start);
 };
 const isTodayInWeek=days.some(d=>d.toISODate()===today);
 return <div className={"week-calendar "+(expanded?"week-expanded":"")}>
  <div className="week-toolbar">
   <div className="week-toolbar-left"><div className="week-controls">
    <button aria-label="Prejšnji teden" title="Prejšnji teden" onClick={()=>setWeek(start.minus({days:7}).toISODate()!)}><ChevronLeft size={18}/></button>
    <button onClick={()=>setWeek(weekMonday(DateTime.now().setZone(zone).toISODate()!,zone))}>Danes</button>
    <button aria-label="Naslednji teden" title="Naslednji teden" onClick={()=>setWeek(start.plus({days:7}).toISODate()!)}><ChevronRight size={18}/></button>
   </div><strong>{weekCaption}</strong></div>
   <div className="week-toolbar-right">
    <label className="week-select"><Users size={16}/><select aria-label="Prikaz zaposlenega" value={employeeFilter} onChange={e=>setEmployeeFilter(e.target.value)}><option value="all">Vsi zaposleni</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}{e.active?'':' (neaktiven)'}</option>)}</select></label>
    <input className="week-date-picker" aria-label="Pojdi na datum" type="date" value={week} onChange={e=>{if(e.target.value)setWeek(weekMonday(e.target.value,zone))}}/>
    <button className="week-icon-button" type="button" title={expanded?"Zapri celozaslonski pogled":"Razširi koledar čez celoten zaslon"} aria-label={expanded?"Zapri celozaslonski pogled":"Celozaslonski koledar"} onClick={()=>setExpanded(v=>!v)}>{expanded?<Minimize2 size={17}/>:<Maximize2 size={17}/>}</button>
    <button className="week-icon-button" title="Osveži podatke" aria-label="Osveži" onClick={()=>setReload(i=>i+1)}><RefreshCcw size={17}/></button>
   </div>
  </div>
  <div className="week-summary">
   <span><CalendarDays size={15}/> {loading?'Nalagam …':count+' rezervacij v tednu'}</span>
   <span><span className="week-legend-dot is-confirmed"/> Potrjeno</span>
   <span><span className="week-legend-dot is-pending"/> V čakanju</span>
   <span><span className="week-legend-dot is-absence"/> Odsotnost</span>
   {employeeFilter!=='all'&&<span><span className="week-legend-dot is-working"/> Delovni čas</span>}
   {expanded&&<label className="week-cancel-checkbox"><input type="checkbox" checked={compact} onChange={e=>setCompact(e.target.checked)}/> Strnjen pogled (vse ure)</label>}
   <label className="week-cancel-checkbox"><input type="checkbox" checked={showCancelled} onChange={e=>setShowCancelled(e.target.checked)}/> Prikaži odpovedane</label>
  </div>
  {error&&<div className="alert error" role="alert">{error}</div>}
  {!activeStaff.length?<div className="empty-state">Najprej dodaj zaposlenega, da se prikaže tedenski koledar.</div>:
  <div className="week-scroll" aria-label="Tedenski koledar">
   <div className="week-grid-header"><div className="week-hour-head"><Clock3 size={15}/></div>{days.map((day,i)=><div key={i} className={'week-day-head '+(day.toISODate()===today?'is-today':'')}><small>{weekdays[i]}</small><strong>{day.toFormat('dd. LL.')}</strong><span>{day.toISODate()===today?'Danes':''}</span></div>)}</div>
   <div className="week-grid-content">
    <div className="week-time-axis" style={{height:totalHeight}}>{timeTicks.map(hour=><div className="week-time-label" key={hour} style={{top:(hour-FIRST_HOUR)*hourHeight}}>{String(hour).padStart(2,'0')}:00</div>)}</div>
    {days.map((date,i)=><div className={'week-day-lane '+(date.toISODate()===today?'is-today':'')} style={{height:totalHeight}} key={date.toISODate()}>
     {intervalsForDay(date).map((period,n)=><div className="week-working-band" key={n} title="Redni ali posebni delovni čas" style={{top:(period.start-FIRST_HOUR*60)*hourHeight/60,height:(period.end-period.start)*hourHeight/60}}/>)}
     {employeeFilter!=='all'&&overrides.some(o=>o.employee_id===employeeFilter&&o.local_date===date.toISODate()&&o.mode==='closed')&&<div className="week-closed-day">Zaprt dan</div>}
     {eventForDay(date).map(e=><button
      type="button" key={e.key} onClick={()=>setSelected(e)}
      className={'week-event '+(e.kind==='absence'?'is-absence':'is-'+(e.booking?.status||'confirmed'))}
      title={e.kind==='booking'?serviceName(e.booking!.service_id)+' – '+e.booking!.customer_name:'Odsotnost – '+staffName(e.employee_id)}
      style={{top:(e.start-FIRST_HOUR*60)*hourHeight/60+2,height:Math.max(20,(e.end-e.start)*hourHeight/60-4),left:`calc(${(e.column||0)*100/(e.columns||1)}% + 3px)`,width:`calc(${100/(e.columns||1)}% - 6px)`}}>
      <strong>{timeOf(e.starts_at,zone)} {e.kind==='absence'?'Odsotnost':serviceName(e.booking!.service_id)}</strong>
      <small>{e.kind==='booking'?e.booking!.customer_name:e.absence?.reason||'Blokirano'}</small>
      {employeeFilter==='all'&&<span>{staffName(e.employee_id)}</span>}
     </button>)}
    </div>)}
   </div>
  </div>}
  <div className="week-footer">
   <span>{isTodayInWeek?'Današnji dan je označen. ':''}Razpoložljivost upošteva interne urnike, rezervacije in odsotnosti. Google/Outlook še nista povezana.</span>
   <a href={'/book/'+encodeURIComponent(company.slug)} target="_blank" rel="noopener noreferrer" className="btn btn-primary">Nova rezervacija <ExternalLink size={15}/></a>
  </div>
  {selected&&<div className="week-modal-backdrop" onMouseDown={()=>setSelected(null)}><div className="week-modal" role="dialog" aria-modal="true" aria-label="Podrobnosti termina" onMouseDown={e=>e.stopPropagation()}>
   <div className="week-modal-top"><span className="week-modal-icon"><CalendarDays size={20}/></span><button type="button" title="Zapri" onClick={()=>setSelected(null)}><X size={19}/></button></div>
   {selected.kind==='booking'&&selected.booking?<><h2>{serviceName(selected.booking.service_id)}</h2><span className={'status-tag '+selected.booking.status}>{STATUS[selected.booking.status]||selected.booking.status}</span>
    <dl><dt>Stranka</dt><dd>{selected.booking.customer_name}</dd><dt>E-pošta</dt><dd>{selected.booking.customer_email}</dd>{selected.booking.customer_phone&&<><dt>Telefon</dt><dd>{selected.booking.customer_phone}</dd></>}<dt>Zaposleni</dt><dd>{staffName(selected.booking.employee_id)}</dd><dt>Začetek</dt><dd>{readableDate(selected.booking.starts_at,zone)}</dd><dt>Konec</dt><dd>{readableDate(selected.booking.ends_at,zone)}</dd></dl>
    <button className="btn btn-quiet" onClick={()=>{setSelected(null);onOpenBookings()}}>Odpri seznam rezervacij <ChevronRight size={15}/></button>
   </>:<><h2>Odsotnost zaposlenega</h2><dl><dt>Zaposleni</dt><dd>{staffName(selected.employee_id)}</dd><dt>Razlog</dt><dd>{selected.absence?.reason||'Blokiran termin'}</dd><dt>Začetek</dt><dd>{readableDate(selected.starts_at,zone)}</dd><dt>Konec</dt><dd>{readableDate(selected.ends_at,zone)}</dd></dl></>}
  </div></div>}
 </div>;
}
