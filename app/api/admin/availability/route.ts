import {NextRequest,NextResponse} from 'next/server';
import {availability,context,db,validDate} from '../../../../lib/booking-server';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 try{
  const p=req.nextUrl.searchParams;
  const companyId=p.get('companyId')||'',employee=p.get('employee')||'',service=p.get('service')||'',date=p.get('date')||'',bookingId=p.get('bookingId')||'';
  if(!validDate(date)||!companyId||!bookingId)return NextResponse.json({error:'Neveljavni parametri'},{status:400});
  const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return NextResponse.json({error:'Prijava je potrebna'},{status:401});
  const client=db();
  const {data:{user},error:authError}=await client.auth.getUser(token);
  if(authError||!user)return NextResponse.json({error:'Prijava ni veljavna'},{status:401});
  const [member,company,booking]=await Promise.all([
   client.from('company_members').select('role').eq('company_id',companyId).eq('user_id',user.id).maybeSingle(),
   client.from('companies').select('slug').eq('id',companyId).maybeSingle(),
   client.from('bookings').select('employee_id,service_id,status').eq('company_id',companyId).eq('id',bookingId).maybeSingle()
  ]);
  if(member.error||!member.data||!['owner','admin'].includes(member.data.role))return NextResponse.json({error:'Ni dovoljenja'},{status:403});
  if(company.error||!company.data||booking.error||!booking.data)return NextResponse.json({error:'Rezervacija ne obstaja'},{status:404});
  if(booking.data.employee_id!==employee||booking.data.service_id!==service||booking.data.status==='cancelled')return NextResponse.json({error:'Izbran termin ni veljaven'},{status:400});
  const ctx=await context(company.data.slug);
  const slots=await availability(ctx,employee,service,date,bookingId);
  return NextResponse.json({slots},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Napaka pri preverjanju'},{status:400})}
}
