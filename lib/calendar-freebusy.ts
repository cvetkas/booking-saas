import {createDecipheriv} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const db=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
type Credential={id:string;provider:'google'|'microsoft';access_token_ciphertext:string;refresh_token_ciphertext:string|null;expires_at:string|null};
type Busy=[number,number];
function decrypt(value:string):string{
 const hex=process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
 if(!hex||!/^[0-9a-f]{64}$/i.test(hex))throw Error('Encryption key unavailable');
 const data=Buffer.from(value,'base64');if(data.length<29)throw Error('Invalid encrypted token');
 const cipher=createDecipheriv('aes-256-gcm',Buffer.from(hex,'hex'),data.subarray(0,12));
 cipher.setAuthTag(data.subarray(12,28));
 return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8');
}
async function tokenFor(c:Credential):Promise<string>{
 if(c.expires_at&&new Date(c.expires_at).getTime()>Date.now()+120000)return decrypt(c.access_token_ciphertext);
 // Fail closed: token renewal with encrypted persistence is required before expiry.
 throw Error('Povezava s koledarjem je potekla; ponovno povezovanje oziroma osvežitev žetona še ni na voljo.');
}
async function jsonResponse(url:string,token:string,options?:RequestInit):Promise<any>{
 const controller=new AbortController();const t=setTimeout(()=>controller.abort(),7000);
 try{
  const r=await fetch(url,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...options?.headers},cache:'no-store',signal:controller.signal});
  if(!r.ok)throw Error('Provider calendar temporarily unavailable ('+r.status+')');
  return await r.json();
 }finally{clearTimeout(t)}
}
export async function externalBusy(companyId:string,employeeId:string,from:string,to:string):Promise<Busy[]>{
 const client=db();
 const {data,error}=await client.from('calendar_oauth_credentials')
  .select('id,provider,access_token_ciphertext,refresh_token_ciphertext,expires_at')
  .eq('company_id',companyId).eq('employee_id',employeeId);
 if(error)throw Error('Ni mogoče preveriti koledarskih povezav.');
 const combined:Busy[]=[];
 for(const c of (data||[]) as Credential[]){
  const token=await tokenFor(c);
  if(c.provider==='google'){
   const result=await jsonResponse('https://www.googleapis.com/calendar/v3/freeBusy',token,{
    method:'POST',body:JSON.stringify({timeMin:from,timeMax:to,items:[{id:'primary'}]})
   });
   const calendar=result?.calendars?.primary;
   if(!calendar||calendar.errors?.length||!Array.isArray(calendar.busy))throw Error('Google Calendar ne omogoča preverjanja zasedenosti.');
   for(const b of calendar.busy){
    const a=Date.parse(b.start),z=Date.parse(b.end);
    if(!Number.isFinite(a)||!Number.isFinite(z))throw Error('Neveljavni podatki Google Calendar.');
    combined.push([a,z]);
   }
  }else if(c.provider==='microsoft'){
   const u=new URL('https://graph.microsoft.com/v1.0/me/calendarView');
   u.searchParams.set('startDateTime',from);u.searchParams.set('endDateTime',to);
   u.searchParams.set('$select','start,end,showAs,isCancelled');
   u.searchParams.set('$top','1000');
   const result=await jsonResponse(u.toString(),token,{headers:{Prefer:'outlook.timezone="UTC"'}});
   if(!Array.isArray(result?.value)||result['@odata.nextLink'])throw Error('Microsoft koledar vsebuje preveč dogodkov; preverjanje ni dokončano.');
   for(const item of result.value){
    if(item.isCancelled||item.showAs==='free')continue;
    const a=Date.parse((item.start?.dateTime||'').replace(/(Z|[+-]\\d\\d:\\d\\d)?$/,(zone:string)=>zone||'Z'));
    const z=Date.parse((item.end?.dateTime||'').replace(/(Z|[+-]\\d\\d:\\d\\d)?$/,(zone:string)=>zone||'Z'));
    if(!Number.isFinite(a)||!Number.isFinite(z))throw Error('Neveljaven datum Microsoft Calendar.');
    combined.push([a,z]);
   }
  }
 }
 return combined;
}
