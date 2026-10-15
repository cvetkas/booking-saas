'use client';
import {useCallback,useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import type {User} from '@supabase/supabase-js';
import {ArrowRight,CalendarCheck2,CheckCircle2,ShieldCheck} from 'lucide-react';
import {getSupabase} from '../lib/supabase';
import AdminWorkspace from './admin-workspace';

export type Company={id:string;name:string;slug:string;timezone:string;booking_enabled:boolean};
function errorText(error:unknown){return error instanceof Error?error.message:String(error)}

export default function Home(){
 const [user,setUser]=useState<User|null>(null);
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [mode,setMode]=useState<'login'|'signup'>('login');
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [companies,setCompanies]=useState<Company[]>([]);
 const [companyId,setCompanyId]=useState('');
 const [companyName,setCompanyName]=useState(''),[companySlug,setCompanySlug]=useState('');
 const loadCompanies=useCallback(async()=>{
  const db=getSupabase();
  const {data:members,error:membershipError}=await db.from('company_members').select('company_id');
  if(membershipError)throw membershipError;
  if(!members?.length){setCompanies([]);setCompanyId('');return}
  const {data,error:companyError}=await db.from('companies')
   .select('id,name,slug,timezone,booking_enabled')
   .in('id',members.map(member=>member.company_id)).order('name');
  if(companyError)throw companyError;
  const list=(data||[]) as Company[];
  setCompanies(list);setCompanyId(old=>list.some(c=>c.id===old)?old:list[0]?.id||'');
 },[]);
 useEffect(()=>{
  let mounted=true;let unsubscribe:undefined|(()=>void);
  try{
   const client=getSupabase();
   client.auth.getUser().then(({data,error:e})=>{
    if(!mounted)return;
    if(e)setError(e.message);setUser(data.user);setReady(true);
   }).catch(e=>{if(mounted){setError(errorText(e));setReady(true)}});
   const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{
    if(mounted){setUser(session?.user??null);if(!session){setCompanies([]);setCompanyId('')}}
   });
   unsubscribe=()=>subscription.unsubscribe();
  }catch(e){if(mounted){setError(errorText(e));setReady(true)}}
  return()=>{mounted=false;unsubscribe?.()}
 },[]);
 useEffect(()=>{if(user)loadCompanies().catch(e=>setError(errorText(e)))},[user,loadCompanies]);
 async function authenticate(event:FormEvent){
  event.preventDefault();setBusy(true);setError('');setNotice('');
  try{
   const db=getSupabase();
   if(mode==='signup'){
    const {data,error:e}=await db.auth.signUp({email,password});if(e)throw e;
    setNotice(data.session?'Račun je ustvarjen.':'Preveri e-pošto, potrdi račun in se prijavi.');
   }else{
    const {error:e}=await db.auth.signInWithPassword({email,password});if(e)throw e;
   }
  }catch(e){setError(errorText(e))}finally{setBusy(false)}
 }
 async function createCompany(event:FormEvent){
  event.preventDefault();setBusy(true);setError('');setNotice('');
  try{
   const {error:e}=await getSupabase().rpc('create_company_with_owner',{
    p_name:companyName.trim(),p_slug:companySlug.trim().toLowerCase()
   });
   if(e)throw e;
   await loadCompanies();setNotice('Podjetje je ustvarjeno.');
  }catch(e){setError(errorText(e))}finally{setBusy(false)}
 }
 if(!ready)return <main className="auth-screen"><div className="auth-panel"><p>Odpiram delovni prostor …</p></div></main>;
 const selected=companies.find(c=>c.id===companyId);
 if(user&&selected)return <AdminWorkspace company={selected} companies={companies} onCompanyChange={setCompanyId}
  userEmail={user.email||''} onLogout={()=>getSupabase().auth.signOut()}
  onCompanyUpdate={async()=>{await loadCompanies()}}/>;
 return <main className="auth-screen">
  <section className="auth-shell">
   <div className="auth-intro"><div className="auth-logo"><CalendarCheck2 size={27}/></div>
    <div className="auth-eyebrow">BOOKING PLATFORM</div><h1>Več časa za stranke. Manj dela z rezervacijami.</h1>
    <p>En delovni prostor za termine, ekipo, storitve in rezervacijske strani.</p>
    <div className="auth-benefit"><CheckCircle2 size={18}/> Pregleden koledar in razpoložljivost</div>
    <div className="auth-benefit"><CheckCircle2 size={18}/> Lastna spletna stran za naročanje</div>
    <div className="auth-benefit"><ShieldCheck size={18}/> Ločen in varen prostor vsakega podjetja</div>
   </div>
   <div className="auth-panel">
    <div className="auth-mobile-logo"><CalendarCheck2 size={22}/> Booking Platform</div>
    {error&&<div className="alert error" role="alert">{error}</div>}
    {notice&&<div className="alert good" role="status">{notice}</div>}
    {!user?<><div className="eyebrow">DOBRODOŠLI</div><h2>{mode==='login'?'Prijava':'Ustvari račun'}</h2>
     <p>Prijavi se in nadaljuj z upravljanjem rezervacij.</p>
     <form className="form-stack" onSubmit={authenticate}>
      <label>E-poštni naslov<input autoComplete="email" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label>Geslo<input autoComplete={mode==='login'?'current-password':'new-password'} minLength={6} type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <button className="btn btn-primary full" disabled={busy}>{busy?'Počakaj …':mode==='login'?'Prijava':'Registracija'} <ArrowRight size={16}/></button>
     </form>
     <button type="button" className="text-link" onClick={()=>{setMode(mode==='login'?'signup':'login');setError('');setNotice('')}}>{mode==='login'?'Še nimaš računa? Registriraj se':'Že imaš račun? Prijavi se'}</button>
    </>:<><div className="eyebrow">PRVI KORAK</div><h2>Ustvari podjetje</h2>
     <p>Začni z imenom podjetja. Zaposlene in storitve lahko dodaš pozneje.</p>
     <form className="form-stack" onSubmit={createCompany}>
      <label>Ime podjetja<input required maxLength={120} value={companyName} onChange={e=>{
       setCompanyName(e.target.value);setCompanySlug(e.target.value.toLowerCase().normalize('NFD')
       .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''));
      }}/></label>
      <label>Oznaka v povezavi<input required value={companySlug} pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={e=>setCompanySlug(e.target.value)} placeholder="ime-podjetja"/></label>
      <button className="btn btn-primary full" disabled={busy||!companyName.trim()||!companySlug}>Ustvari podjetje <ArrowRight size={16}/></button>
     </form>
    </>}
   </div>
  </section>
 </main>;
}
