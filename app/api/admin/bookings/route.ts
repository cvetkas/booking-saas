import {NextRequest,NextResponse} from 'next/server';
import {DateTime} from 'luxon';
import {availability,context,db} from '../../../../lib/booking-server';
export const runtime='nodejs';
const fail=(error:string,status:number)=>NextResponse.json({error},{status,headers:{'Cache-Control':'no-store'}});
async function authorize(req:NextRequest,companyId:string){
 const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)throw Error('Prijava je potrebna.');
 const client=db();
 const {data:{user},error}=await client.auth.getUser(token);
 if(error||!user)throw Error('Prijava je potekla. Prijavi se ponovno.');
 const {data:membership,error:me}=await client.from('company_members').select('role').eq('company_id',companyId).eq('user_id',user.id).maybeSingle();
 if(me||!membership||!['owner','admin'].includes(membership.role))throw Error('Za spremembe rezervacij nimaš dovoljenja.');
 return client;
}
export async function POST(req:NextRequest){
 try{
  const body=await req.json();
  const {action,companyId,bookingId,employeeId,serviceId,start,name,email}=body||{};
  if(typeof companyId!=='string'||!(/^[a-f0-9-]{36}$/i.test(companyId)))return fail('Neveljavno podjetje.',400);
  if(!['create','reschedule','cancel'].includes(action))return fail('Neveljavna operacija.',400);
  const client=await authorize(req,companyId);
  let existing:{id:string;employee_id:string;service_id:string;status:string}|null=null;
  if(action!=='create'){
   if(typeof bookingId!=='string')return fail('Izberi rezervacijo.',400);
   const {data,error}=await client.from('bookings').select('id,employee_id,service_id,status').eq('id',bookingId).eq('company_id',companyId).maybeSingle();
   if(error||!data)return fail('Rezervacije ni mogoče najti.',404);
   existing=data;
   if(existing.status==='cancelled')return fail('Rezervacija je že odpovedana.',409);
   if(action==='cancel'){
    const {data:updated,error:ce}=await client.from('bookings').update({status:'cancelled'}).eq('id',bookingId).eq('company_id',companyId).neq('status','cancelled').select('id').maybeSingle();
    if(ce)throw ce;
    if(!updated)return fail('Rezervacija je bila medtem spremenjena.',409);
    return NextResponse.json({ok:true});
   }
  }
  const employee=action==='reschedule'?existing!.employee_id:employeeId;
  const service=action==='reschedule'?existing!.service_id:serviceId;
  if(typeof employee!=='string'||typeof service!=='string'||typeof start!=='string')return fail('Manjkajo podatki o terminu.',400);
  if(action==='create'&&(typeof name!=='string'||name.trim().length<2||name.length>120||typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email)))return fail('Vnesi veljavne podatke stranke.',400);
  const {data:company,error:co}=await client.from('companies').select('slug').eq('id',companyId).single();
  if(co||!company)return fail('Podjetja ni mogoče najti.',404);
  const ctx=await context(company.slug);
  const when=DateTime.fromISO(start,{setZone:true});
  if(!when.isValid)return fail('Neveljaven termin.',400);
  const localDate=when.setZone(ctx.company.timezone).toISODate();
  if(!localDate)return fail('Neveljaven datum.',400);
  const slots=await availability(ctx,employee,service,localDate,action==='reschedule'?bookingId:undefined);
  if(!slots.includes(when.toUTC().toISO()!))return fail('Termin ni prost ali ni znotraj delovnega časa.',409);
  const svc=ctx.services.find(x=>x.id===service);
  if(!svc)return fail('Storitev ni aktivna.',400);
  const starts_at=when.toUTC().toISO();
  const ends_at=when.plus({minutes:svc.duration_minutes}).toUTC().toISO();
  const occupied_starts_at=when.minus({minutes:svc.buffer_before_minutes}).toUTC().toISO();
  const occupied_ends_at=when.plus({minutes:svc.duration_minutes+svc.buffer_after_minutes}).toUTC().toISO();
  const payload={starts_at,ends_at,occupied_starts_at,occupied_ends_at};
  if(action==='reschedule'){
   const {error}=await client.from('bookings').update(payload).eq('company_id',companyId).eq('id',bookingId);
   if(error){if(error.code==='23P01')return fail('Termin je medtem nekdo zasedel.',409);throw error}
  }else{
   const {error}=await client.from('bookings').insert({...payload,company_id:companyId,employee_id:employee,service_id:service,customer_name:name.trim(),customer_email:email.trim(),status:'confirmed',customer_timezone:ctx.company.timezone});
   if(error){if(error.code==='23P01')return fail('Termin je medtem nekdo zasedel.',409);throw error}
  }
  return NextResponse.json({ok:true});
 }catch(e){
  const message=e instanceof Error?e.message:'Napaka pri upravljanju rezervacije.';
  const status=/dovoljenja|Prijava|prijavi se/i.test(message)?403:/ni prost|zasedel/i.test(message)?409:400;
  return fail(message,status);
 }
}
