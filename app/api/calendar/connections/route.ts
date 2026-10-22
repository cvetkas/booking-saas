import {NextRequest,NextResponse} from 'next/server';
import {db} from '../../../../lib/booking-server';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const companyId=req.nextUrl.searchParams.get('companyId');
 if(!companyId)return NextResponse.json({error:'Manjka podjetje.'},{status:400});
 const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return NextResponse.json({error:'Prijava je potrebna.'},{status:401});
 try{
  const client=db();
  const {data:{user},error:ae}=await client.auth.getUser(token);
  if(ae||!user)return NextResponse.json({error:'Neveljavna seja.'},{status:401});
  const {data:member,error:me}=await client.from('company_members').select('role').eq('company_id',companyId).eq('user_id',user.id).maybeSingle();
  if(me||!member||!['owner','admin'].includes(member.role))return NextResponse.json({error:'Ni dovoljenja.'},{status:403});
  const {data,error}=await client.from('calendar_oauth_credentials').select('id,employee_id,provider,connected_at').eq('company_id',companyId).order('connected_at',{ascending:false});
  if(error)return NextResponse.json({error:'Tabela povezav še ni pripravljena. Najprej uporabi migracijo 008.'},{status:503});
  return NextResponse.json({connections:data||[]},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Napaka pri nalaganju povezav.'},{status:500})}
}
