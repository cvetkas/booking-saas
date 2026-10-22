import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
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
export async function tokenFor(c:Credential):Promise<string>{
 if(c.expires_at&&new Date(c.expires_at).getTime()>Date.now()+120000)return decrypt(c.access_token_ciphertext);
 if(!c.refresh_token_ciphertext)throw Error('Povezavo s koledarjem je treba ponovno avtorizirati.');
 const refresh=decrypt(c.refresh_token_ciphertext);
 const google=c.provider==='google';
 const clientId=google?process.env.GOOGLE_CALENDAR_CLIENT_ID:process.env.MICROSOFT_CALENDAR_CLIENT_ID;
 const secret=google?process.env.GOOGLE_CALENDAR_CLIENT_SECRET:process.env.MICROSOFT_CALENDAR_CLIENT_SECRET;
 if(!clientId||!secret)throw Error('OAuth nastavitve za osvežitev žetona manjkajo.');
 const url=google?'https://oauth2.googleapis.com/token':'https://login.microsoftonline.com/common/oauth2/v2.0/token';
 const payload=new URLSearchParams({client_id:clientId,client_secret:secret,grant_type:'refresh_token',refresh_token:refresh});
 const reply=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:payload,cache:'no-store'});
 if(!reply.ok)throw Error('Koledarski račun potrebuje ponovno povezavo (osvežitev ni uspela).');
 const result=await reply.json();
 if(typeof result.access_token!=='string'||!result.access_token)throw Error('Ponudnik ni vrnil dostopnega žetona.');
 const key=process.env.CALENDAR_TOKEN_ENCRYPTION_KEY!;
 const encrypt=(value:string)=>{
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),nonce);
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return Buffer.concat([nonce,cipher.getAuthTag(),encrypted]).toString('base64');
 };
 const update:{access_token_ciphertext:string;expires_at:string;refresh_token_ciphertext?:string}={
  access_token_ciphertext:encrypt(result.access_token),
  expires_at:new Date(Date.now()+Math.max(60,Number(result.expires_in)||3600)*1000).toISOString()
 };
 if(typeof result.refresh_token==='string'&&result.refresh_token)update.refresh_token_ciphertext=encrypt(result.refresh_token);
 const client=db();
 const {error}=await client.from('calendar_oauth_credentials').update(update).eq('id',c.id);
 if(error)throw Error('Osveženega žetona ni mogoče shraniti.');
 return result.access_token;
}
async function jsonResponse(url:string,token:string,options?:RequestInit):Promise<any>{
 const controller=new AbortController();const t=setTimeout(()=>controller.abort(),7000);
 try{
  const r=await fetch(url,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...options?.headers},cache:'no-store',signal:controller.signal});
  if(!r.ok)throw Error('Provider calendar temporarily unavailable ('+r.status+')');
  return await r.json();
 }finally{clearTimeout(t)}
}
export async function externalBusy(companyId:string,employeeId:string,from:string,to:string,excludeBookingId?:string):Promise<Busy[]>{
 const client=db();
 const {data,error}=await client.from('calendar_oauth_credentials')
  .select('id,provider,access_token_ciphertext,refresh_token_ciphertext,expires_at')
  .eq('company_id',companyId).eq('employee_id',employeeId);
 if(error)throw Error('Ni mogoče preveriti koledarskih povezav.');
 const combined:Busy[]=[];
 for(const c of (data||[]) as Credential[]){
  const token=await tokenFor(c);
  if(c.provider==='google'){
   if(excludeBookingId){
   const url=new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
   url.searchParams.set('timeMin',from);url.searchParams.set('timeMax',to);url.searchParams.set('singleEvents','true');url.searchParams.set('maxResults','2500');
   const result=await jsonResponse(url.toString(),token);
   if(!Array.isArray(result.items)||result.nextPageToken)throw Error('Preveč Google dogodkov za varno preverjanje terminov.');
   const ownId='b'+excludeBookingId.replace(/-/g,'');
   for(const event of result.items){
    if(event.id===ownId||event.status==='cancelled'||event.transparency==='transparent')continue;
    const a=Date.parse(event.start?.dateTime||event.start?.date||'');
    const z=Date.parse(event.end?.dateTime||event.end?.date||'');
    if(!Number.isFinite(a)||!Number.isFinite(z))throw Error('Neveljavni podatki Google koledarja.');
    combined.push([a,z]);
   }
   continue;
  }
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
