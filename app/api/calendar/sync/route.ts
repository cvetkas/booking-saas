import {NextRequest,NextResponse} from 'next/server';
import {db} from '../../../../lib/booking-server';
import {tokenFor} from '../../../../lib/calendar-freebusy';
export const runtime='nodejs';
export const maxDuration=60;
type Job={booking_id:string;company_id:string;revision:number;attempts:number};
const googleEventId=(uuid:string)=>'b'+uuid.replace(/-/g,'');
async function processJob(job:Job){
 const client=db();
 const {data:booking,error:be}=await client.from('bookings')
  .select('id,company_id,employee_id,service_id,customer_name,starts_at,ends_at,status')
  .eq('id',job.booking_id).eq('company_id',job.company_id).single();
 if(be||!booking)throw Error('Booking not found');
 const {data:credentials,error:ce}=await client.from('calendar_oauth_credentials')
  .select('id,provider,access_token_ciphertext,refresh_token_ciphertext,expires_at')
  .eq('company_id',job.company_id).eq('employee_id',booking.employee_id).eq('provider','google').maybeSingle();
 if(ce)throw Error('Google credential lookup failed');
 if(!credentials)throw Error('Google calendar connection missing for employee');
 const token=await tokenFor(credentials);
 const eventId=googleEventId(booking.id);
 const endpoint='https://www.googleapis.com/calendar/v3/calendars/primary/events/'+eventId;
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 if(booking.status==='cancelled'){
  const response=await fetch(endpoint,{method:'DELETE',headers,signal:AbortSignal.timeout(10000)});
  if(!response.ok&&response.status!==404&&response.status!==410)throw Error('Google cancellation failed: '+response.status);
  return;
 }
 const [sr,cr]=await Promise.all([
  client.from('services').select('name').eq('id',booking.service_id).single(),
  client.from('companies').select('name').eq('id',job.company_id).single()
 ]);
 if(sr.error||cr.error||!sr.data||!cr.data)throw Error('Booking metadata unavailable');
 const body={id:eventId,summary:sr.data.name+' – '+cr.data.name,
  description:'Bookiry rezervacija\nStranka: '+booking.customer_name,
  start:{dateTime:booking.starts_at},end:{dateTime:booking.ends_at}};
 const response=await fetch(endpoint,{method:'PUT',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 if(response.ok)return;
 if(response.status===404){
  const created=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events',
   {method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(created.ok||created.status===409)return;
  throw Error('Google event insertion failed: '+created.status);
 }
 throw Error('Google event update failed: '+response.status);
}
export async function POST(req:NextRequest){
 const key=process.env.CALENDAR_WORKER_SECRET;
 if(!key||req.headers.get('authorization')!=='Bearer '+key)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(process.env.CALENDAR_EVENT_WRITE_ENABLED!=='true')return NextResponse.json({disabled:true});
 const client=db();
 const {data,error}=await client.rpc('claim_booking_calendar_jobs',{p_limit:8});
 if(error)return NextResponse.json({error:'Queue not configured'},{status:503});
 let processed=0,failed=0;
 for(const job of (data||[]) as Job[]){
  try{
   await processJob(job);
   const {error:ack}=await client.from('booking_calendar_jobs').update({
    processed_revision:job.revision,locked_until:null,last_error:null,updated_at:new Date().toISOString()
   }).eq('booking_id',job.booking_id).eq('revision',job.revision);
   if(ack)throw Error('Queue acknowledgment failed');
   processed++;
  }catch(e){
   failed++;
   const reason=e instanceof Error?e.message:'Unknown error';
   const retryMinutes=Math.min(360,Math.pow(2,Math.min(8,job.attempts)));
   await client.from('booking_calendar_jobs').update({
    locked_until:null,attempts:job.attempts+1,last_error:reason.slice(0,400),
    next_attempt_at:new Date(Date.now()+retryMinutes*60000).toISOString(),updated_at:new Date().toISOString()
   }).eq('booking_id',job.booking_id).eq('revision',job.revision);
  }
 }
 return NextResponse.json({processed,failed});
}
