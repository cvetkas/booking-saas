import {createHash,randomBytes} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {db} from '../../../../../lib/booking-server';
export const runtime='nodejs';
const respond=(error:string,status:number)=>NextResponse.json({error},{status});
export async function POST(req:NextRequest){
 try{
  const body=await req.json();
  const provider=body?.provider,companyId=body?.companyId,employeeId=body?.employeeId;
  if(!['google','microsoft'].includes(provider)||typeof companyId!=='string'||typeof employeeId!=='string')return respond('Neveljavni parametri',400);
  const base=process.env.APP_BASE_URL;
  if(!base||!/^https:\/\//.test(base)||new URL(base).pathname!=='/')return respond('Nastavi veljaven APP_BASE_URL (https://...).',503);
  const key=provider==='google'?process.env.GOOGLE_CALENDAR_CLIENT_ID:process.env.MICROSOFT_CALENDAR_CLIENT_ID;
  if(!key)return respond('OAuth prijava ponudnika še ni konfigurirana.',503);
  const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return respond('Prijava je potrebna.',401);
  const client=db();
  const {data:{user},error:au}=await client.auth.getUser(token);
  if(au||!user)return respond('Seja ni veljavna.',401);
  const [member,staff]=await Promise.all([
   client.from('company_members').select('role').eq('company_id',companyId).eq('user_id',user.id).maybeSingle(),
   client.from('employees').select('id').eq('company_id',companyId).eq('id',employeeId).maybeSingle()
  ]);
  if(member.error||!member.data||!['owner','admin'].includes(member.data.role))return respond('Nimaš dovoljenja.',403);
  if(staff.error||!staff.data)return respond('Zaposleni ne pripada podjetju.',404);
  const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
  const hashed=createHash('sha256').update(state).digest('hex');
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  const redirect=new URL('/api/calendar/oauth/callback',base).toString();
  const {error}=await client.from('calendar_oauth_states').insert({state_hash:hashed,company_id:companyId,employee_id:employeeId,user_id:user.id,provider,code_verifier:verifier,redirect_uri:redirect});
  if(error)return respond('Najprej uporabi SQL migracijo 007: '+error.message,503);
  const authUrl=new URL(provider==='google'?'https://accounts.google.com/o/oauth2/v2/auth':'https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  authUrl.searchParams.set('client_id',key);
  authUrl.searchParams.set('redirect_uri',redirect);
  authUrl.searchParams.set('response_type','code');
  authUrl.searchParams.set('state',state);
  authUrl.searchParams.set('code_challenge',challenge);
  authUrl.searchParams.set('code_challenge_method','S256');
  authUrl.searchParams.set('scope',provider==='google'?'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly':'offline_access User.Read Calendars.ReadWrite');
  if(provider==='google'){authUrl.searchParams.set('access_type','offline');authUrl.searchParams.set('prompt','consent')}
  else authUrl.searchParams.set('prompt','select_account');
  return NextResponse.json({url:authUrl.toString()},{headers:{'Cache-Control':'no-store'}});
 }catch{return respond('Povezave trenutno ni mogoče začeti.',500)}
}
