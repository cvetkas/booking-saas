import {NextRequest,NextResponse} from 'next/server';
import {db} from '../../../../lib/booking-server';
export const runtime='nodejs';
export const maxDuration=60;
import {processJob} from '../../../../lib/calendar-event-worker';
type Job={booking_id:string;company_id:string;revision:number;attempts:number};
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
