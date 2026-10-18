'use client';
import {useEffect,useState} from 'react';
import {getSupabase} from '../lib/supabase';
import {Users,CheckCircle2} from 'lucide-react';
type Employee={id:string;name:string;active:boolean};
export default function ServiceStaff({companyId,serviceId,employees}:{companyId:string;serviceId:string;employees:Employee[]}){
 const [ids,setIds]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{let active=true;setReady(false);setError('');getSupabase().from('employee_services').select('employee_id').eq('company_id',companyId).eq('service_id',serviceId).then(({data,error})=>{if(!active)return;if(error)setError(error.message);else setIds((data||[]).map(x=>x.employee_id));setReady(true)});return()=>{active=false}},[companyId,serviceId]);
 async function toggle(employeeId:string,enabled:boolean){
  setBusy(true);setError('');setNotice('');
  try{
   const q=enabled?getSupabase().from('employee_services').insert({company_id:companyId,service_id:serviceId,employee_id:employeeId}):getSupabase().from('employee_services').delete().eq('company_id',companyId).eq('service_id',serviceId).eq('employee_id',employeeId);
   const {error}=await q;if(error)throw error;
   setIds(old=>enabled?[...old,employeeId]:old.filter(id=>id!==employeeId));setNotice('Dodelitev shranjena.');
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 return <div className="service-team"><div className="row" style={{display:'flex',alignItems:'center',gap:8}}><Users size={18}/><strong>Izvajalci storitve</strong></div><p>Izberi zaposlene, ki lahko izvajajo to storitev. Spremembe se shranijo takoj.</p>{!ready?<p>Nalaganje izvajalcev …</p>:employees.map(e=><label className="assignment-row" key={e.id}><input type="checkbox" disabled={busy} checked={ids.includes(e.id)} onChange={event=>toggle(e.id,event.target.checked)}/><span>{e.name}<small>{e.active?'Aktiven':'Neaktiven'}</small></span></label>)}{notice&&<p className="service-success"><CheckCircle2 size={15}/> {notice}</p>}{error&&<div className="alert error">{error}</div>}</div>;
}
