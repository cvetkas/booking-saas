import {NextRequest,NextResponse} from 'next/server';
import {db} from '../../../../lib/booking-server';
import {processJob} from '../sync/route';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(req:NextRequest){
 if(process.env.CALENDAR_EVENT_WRITE_ENABLED!=='true')return NextResponse.json({error:'Zapisovanje koledarskih dogodkov ni vključeno.'},{status:409});
 const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return NextResponse.json({error:'Prijava je potrebna.'},{status:401});
 const client=db();
 const {data:{user},error:authError}=await client.auth.getUser(token);
 if(authError||!user)return NextResponse.json({error:'Neveljavna seja.'},{status:401});
 let body:{companyId?:string}={};try{body=await req.json()}catch{}
 if(typeof body.companyId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.companyId))return NextResponse.json({error:'Neveljavno podjetje.'},{status:400});
 const {data:member,error:me}=await client.from('company_members').select('role').eq('company_id',body.companyId).eq('user_id',user.id).maybeSingle();
 if(me||!member||!['owner','admin'].includes(member.role))return NextResponse.json({error:'Ni dovoljenja.'},{status:403});
 const {data:jobs,error}=await client.rpc('claim_company_calendar_jobs',{p_company_id:body.companyId,p_limit:5});
 if(error)return NextResponse.json({error:'Najprej izvedi SQL migracijo 010.'},{status:503});
 let processed=0,failed=0;
 for(const job of jobs||[]){
  try{
   await processJob(job);
   const {error:ack}=await client.from('booking_calendar_jobs').update({processed_revision:job.revision,locked_until:null,last_error:null,updated_at:new Date().toISOString()}).eq('booking_id',job.booking_id).eq('revision',job.revision);
   if(ack)throw Error('Failed to mark calendar task complete');
   processed++;
  }catch(e){
   failed++;
   const reason=e instanceof Error?e.message:'Napaka pri sinhronizaciji';
   await client.from('booking_calendar_jobs').update({locked_until:null,attempts:job.attempts+1,last_error:reason.slice(0,400),next_attempt_at:new Date(Date.now()+60000).toISOString(),updated_at:new Date().toISOString()}).eq('booking_id',job.booking_id).eq('revision',job.revision);
  }
 }
 return NextResponse.json({processed,failed,remainingMayExist:jobs.length===5},{headers:{'Cache-Control':'no-store'}});
}
