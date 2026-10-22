import {createCipheriv,createHash,randomBytes} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {db} from '../../../../../lib/booking-server';
export const runtime='nodejs';
function encrypt(value:string){
 const key=process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
 if(!key||!/^([a-f0-9]{64})$/i.test(key))throw Error('Missing encryption key');
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),nonce);
 const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return Buffer.concat([nonce,cipher.getAuthTag(),ciphertext]).toString('base64');
}
export async function GET(req:NextRequest){
 const base=process.env.APP_BASE_URL;
 const home=base&&base.startsWith('https://')?new URL(base):new URL('/',req.url);
 const redirect=(status:string)=>NextResponse.redirect(new URL('/?calendar_status='+encodeURIComponent(status),home));
 const code=req.nextUrl.searchParams.get('code'),state=req.nextUrl.searchParams.get('state');
 if(req.nextUrl.searchParams.get('error'))return redirect('provider_denied');
 if(!code||!state||state.length>256)return redirect('invalid_callback');
 try{
  const client=db(),hash=createHash('sha256').update(state).digest('hex');
  const {data:s,error}=await client.from('calendar_oauth_states').select('*').eq('state_hash',hash).maybeSingle();
  if(error||!s||s.consumed_at||new Date(s.expires_at).getTime()<Date.now())return redirect('expired');
  const {data:marked,error:up}=await client.from('calendar_oauth_states').update({consumed_at:new Date().toISOString()}).eq('state_hash',hash).is('consumed_at',null).select('state_hash').maybeSingle();
  if(up||!marked)return redirect('expired');
  if(new URL(req.url).origin!==new URL(s.redirect_uri).origin)return redirect('invalid_callback');
  const google=s.provider==='google';
  const clientId=google?process.env.GOOGLE_CALENDAR_CLIENT_ID:process.env.MICROSOFT_CALENDAR_CLIENT_ID;
  const secret=google?process.env.GOOGLE_CALENDAR_CLIENT_SECRET:process.env.MICROSOFT_CALENDAR_CLIENT_SECRET;
  if(!clientId||!secret)return redirect('not_configured');
  const tokenUrl=google?'https://oauth2.googleapis.com/token':'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const payload=new URLSearchParams({client_id:clientId,client_secret:secret,code,grant_type:'authorization_code',redirect_uri:s.redirect_uri,code_verifier:s.code_verifier});
  if(!google)payload.set('scope','offline_access User.Read Calendars.ReadWrite');
  const reply=await fetch(tokenUrl,{method:'POST',body:payload,headers:{'Content-Type':'application/x-www-form-urlencoded'},cache:'no-store'});
  if(!reply.ok)return redirect('token_exchange_failed');
  const token=await reply.json();
  if(typeof token.access_token!=='string'||!token.access_token)return redirect('token_exchange_failed');
  const current=await client.from('calendar_oauth_credentials').select('id,refresh_token_ciphertext').eq('company_id',s.company_id).eq('employee_id',s.employee_id).eq('provider',s.provider).maybeSingle();
  if(current.error)return redirect('storage_unavailable');
  const record={company_id:s.company_id,employee_id:s.employee_id,provider:s.provider,
   access_token_ciphertext:encrypt(token.access_token),
   refresh_token_ciphertext:typeof token.refresh_token==='string'?encrypt(token.refresh_token):(current.data?.refresh_token_ciphertext||null),
   expires_at:new Date(Date.now()+Math.max(60,Number(token.expires_in)||3600)*1000).toISOString(),
   connected_at:new Date().toISOString()
  };
  const {error:save}=await client.from('calendar_oauth_credentials').upsert(record,{onConflict:'company_id,employee_id,provider'});
  if(save)return redirect('storage_unavailable');
  // No check_busy toggle: provider free/busy queries and event writing must be implemented first.
  return redirect('authorized_pending_sync');
 }catch{return redirect('connection_failed')}
}
