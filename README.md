# Booking SaaS v0.2 — lokalni razvojni prototip

## Nadgradnja brez izgube podatkov
Obstoječa baza Supabase v3 in `004_company_onboarding.sql` ostaneta nespremenjeni. Novih SQL migracij za to različico ni. Obstoječih tabel ne briši.

## Namestitev (Windows / VS Code)
1. Razširi ZIP v novo mapo. V novo mapo prenesi **samo** svojo obstoječo `.env.local` (datoteke ne deli z drugimi).
2. Dodaj v `.env.local` še `SUPABASE_SERVICE_ROLE_KEY=...`. Ta skrivni ključ dobiš v Supabase > Project Settings > API Keys, **service_role** (legacy) oziroma ustrezni secret key. Ključ ostane izključno v lokalni `.env.local`, nikoli ga ne objavi na GitHubu ali v spletni kodi.
3. Preveri tudi `NEXT_PUBLIC_SUPABASE_URL` in `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable ali anon ključ).
4. `npm install` in `npm run dev`, nato `http://localhost:3000`.
5. Prijavi se z obstoječim uporabnikom. Pod **Urniki** izberi zaposlenega, nastavi izmene in mu dodeli eno ali več storitev. 
6. Javno testno stran odpri na `http://localhost:3000/book/IME-SLUGA-PODJETJA` (pravo oznako vidiš pod Nastavitve).

## Varnost in omejitve
**To je razvojna različica, ne javno objavljiv produkcijski SaaS.** Javna API-pot trenutno uporablja server-side service role in še nima rate limitinga, CAPTCHA/anti-bot zaščite, sporočil strankam, privolitev in GDPR postopkov. Nikakor je ne objavi javno z realnimi strankami brez dodatne zaščite.

Rezervacija: preveri urnik, odsotnosti in obstoječe rezervacije, nato vstavi v `bookings`. PostgreSQL EXCLUDE omejitev v shemi v3 prepreči istočasne prekrivajoče se aktivne rezervacije. Če je za zaposlenega že vpisana aktivna zunanja koledarska povezava, strežnik **varno zavrne** rezervacije: preverjanje Google/Outlook free/busy v tej verziji še ni implementirano. Opomniki, potrditveni e-maili, odpovedi ter spremembe obstoječih rezervacij bodo dodani pozneje.

Časovni pas podjetja mora biti veljaven IANA niz (privzeto Europe/Ljubljana); sistem uporablja `luxon` za premike ure in izračune.
