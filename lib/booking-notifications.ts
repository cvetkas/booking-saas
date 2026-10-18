import {DateTime} from 'luxon';
import {db} from './booking-server';

type EventAction='confirmed'|'rescheduled'|'cancelled';
type BookingRow={id:string;company_id:string;employee_id:string;service_id:string;customer_name:string;customer_email:string;starts_at:string;ends_at:string};
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
const esc=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/[,;]/g,c=>'\\'+c);
const stamp=(s:string)=>DateTime.fromISO(s,{setZone:true}).toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");
function calendarInvite(booking:BookingRow,service:string,company:string,action:EventAction):string{
 const method=action==='cancelled'?'CANCEL':'REQUEST';
 const rows=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Booking Platform//Appointments//SL','CALSCALE:GREGORIAN','METHOD:'+method,'BEGIN:VEVENT',
 'UID:'+booking.id+'@booking-platform','DTSTAMP:'+DateTime.utc().toFormat("yyyyLLdd'T'HHmmss'Z'"),
 'DTSTART:'+stamp(booking.starts_at),'DTEND:'+stamp(booking.ends_at),
 'SUMMARY:'+esc(service+' – '+company),'DESCRIPTION:'+esc('Rezervacija pri '+company),
 'STATUS:'+(action==='cancelled'?'CANCELLED':'CONFIRMED'),'SEQUENCE:'+(action==='confirmed'?'0':'1'),'END:VEVENT','END:VCALENDAR'];
 return rows.map(row=>row.match(/.{1,70}/gu)?.join('\r\n ')||row).join('\r\n')+'\r\n';
}
export async function notifyBooking(booking:BookingRow,action:EventAction):Promise<{sent:number;warning?:string}>{
 const apiKey=process.env.RESEND_API_KEY,from=process.env.BOOKING_FROM_EMAIL;
 if(!apiKey||!from)return {sent:0,warning:'E-pošta še ni nastavljena (RESEND_API_KEY, BOOKING_FROM_EMAIL).'};
 const client=db();
 const [cr,sr,er]=await Promise.all([
  client.from('companies').select('name,timezone').eq('id',booking.company_id).single(),
  client.from('services').select('name').eq('id',booking.service_id).single(),
  client.from('employees').select('name,email').eq('id',booking.employee_id).single()
 ]);
 if(cr.error||sr.error||er.error||!cr.data||!sr.data||!er.data)return {sent:0,warning:'Podatkov za obvestilo ni bilo mogoče pridobiti.'};
 const company=cr.data.name,service=sr.data.name,employee=er.data;
 const zone=cr.data.timezone||'Europe/Ljubljana';
 const start=DateTime.fromISO(booking.starts_at).setZone(zone).toFormat('dd. LL. yyyy HH:mm');
 const end=DateTime.fromISO(booking.ends_at).setZone(zone).toFormat('HH:mm');
 const topic=action==='cancelled'?'Odpoved rezervacije':action==='rescheduled'?'Spremenjen termin rezervacije':'Potrditev rezervacije';
 const ics=calendarInvite(booking,service,company,action);
 const recipients=[{to:booking.customer_email,salutation:booking.customer_name,kind:'customer'},...(employee.email?[{to:employee.email,salutation:employee.name,kind:'staff'}]:[])];
 let sent=0;const warnings:string[]=[];
 for(const recipient of recipients){
  const description=recipient.kind==='staff'?'Stranka: '+booking.customer_name+'.':'';
  const html='<div style="font-family:Arial,sans-serif;max-width:560px;padding:24px;color:#16253f"><h2>'+escapeHtml(topic)+'</h2><p>Pozdravljeni, '+escapeHtml(recipient.salutation)+'!</p><p>'+escapeHtml(action==='cancelled'?'Termin je bil odpovedan.':action==='rescheduled'?'Termin je bil prestavljen.':'Vaša rezervacija je potrjena.')+'</p><p><b>'+escapeHtml(service)+'</b><br/>'+escapeHtml(company)+'<br/>'+escapeHtml(start)+'–'+escapeHtml(end)+' ('+escapeHtml(zone)+')</p><p>'+escapeHtml(description)+'</p><p>Koledarsko vabilo je priloženo sporočilu.</p></div>';
  const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({from,to:[recipient.to],subject:topic+' – '+company,html,attachments:[{filename:'rezervacija.ics',content:Buffer.from(ics).toString('base64')}],headers:{'X-Entity-Ref-ID':booking.id}})});
  if(res.ok)sent++;else warnings.push('Pošiljanje na '+recipient.kind+' ni uspelo ('+res.status+').');
 }
 return {sent,warning:warnings.length?warnings.join(' '):undefined};
}
