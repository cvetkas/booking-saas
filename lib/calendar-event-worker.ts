import {db} from './booking-server';
import {tokenFor} from './calendar-freebusy';
type Job={booking_id:string;company_id:string;revision:number;attempts:number};
const googleEventId=(uuid:string)=>'b'+uuid.replace(/-/g,'');
export async function processJob(job:Job){
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
