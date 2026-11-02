/* Shared event filtering and custom ICS renderer for the website and optional edge Worker.
   Personal participation, HomeBoard schedules and Google tokens are intentionally absent. */
export const keys = ['search', 'host', 'org', 'group', 'scope', 'identity', 'tier', 'bucket', 'pathway', 'type', 'region', 'discipline', 'precision', 'time', 'registration'];
export const northeast = new Set(['NY', 'NJ', 'CT', 'PA']);
export const dateDigits = iso => String(iso || '').replace(/-/g, '');
export const dateAdd = (iso, n = 1) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export function todayNY() {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function dateValue(event) { return event.calendar_date || event.start_date || ''; }
export function precision(event) {
  return (event.date_precision === 'predicted_month' ? 'predicted_date' : event.date_precision) || (event.start_date && event.verified ? 'confirmed' : event.prediction?.date ? 'predicted_date' : 'unknown');
}
export function hostFamily(event) {
  const org=String(event.organization||'').trim().toUpperCase();
  return event.host_family || (['USATKD','AAU','CMA'].includes(org) ? org : 'ETC');
}
export function eventCardName(event) {
  const title=String(event.title||'').trim();
  const org=String(event.organization||'').trim();
  // Browser heading only; official ICS/SUMMARY and canonical UID are not changed.
  if (!['ATA','ITF','TA'].includes(org.toUpperCase())) return title;
  const m=title.match(/^(20\d{2})\s+(.+)$/);
  if (m && m[2].toUpperCase().startsWith(org.toUpperCase()+' ')) return org+' '+m[1]+' '+m[2].slice(org.length+1);
  return title;
}
export function normalizeFilters(raw={}) {
  const f = {};
  for (const key of keys) f[key] = String(raw[key] || '').slice(0, key === 'search' ? 96 : 25);
  if (f.precision === 'predicted_month') f.precision = 'predicted_date';
  if (!Object.prototype.hasOwnProperty.call(raw, 'tier')) f.tier='S,A,B';
  // This public directory is for competitions only; camps have no Class/Small feed.
  if (!Object.prototype.hasOwnProperty.call(raw, 'type')) f.type='competition';
  return f;
}
export function filterEvents(events, raw={}, now=todayNY()) {
  const f=normalizeFilters(raw);
  const q=f.search.trim().toLocaleLowerCase();
  return events.filter(event => {
    if (q && !`${event.title} ${event.organization} ${event.location} ${event.venue_address||''} ${event.organizer||''} ${event.sanctioning_body||''} ${event.event_description||''} ${event.type} ${(event.disciplines||[]).join(' ')}`.toLocaleLowerCase().includes(q)) return false;
    if (f.tier && !f.tier.split(',').includes(event.tier||'C')) return false;
    if (f.host && hostFamily(event) !== f.host) return false;
    if (f.bucket && event.calendar_bucket !== f.bucket) return false;
    if (f.group && event.group !== f.group) return false;
    if (f.scope === 'international' && !event.international_category) return false;
    if (f.scope === 'domestic' && event.international_category) return false;
    if (f.identity === 'attention' && !event.identity_attention) return false;
    if (f.identity === 'citizenship' && !event.identity_citizenship_required_some_divisions) return false;
    if (f.pathway === 'team' && !event.national_team_pathway) return false;
    if (f.pathway === 'nationals' && !event.national_championship_pathway) return false;
    if (f.pathway === 'ranking' && !/^yes(?:\b|\s)/i.test(String(event.ranking_applies||''))) return false;
    if (f.org && event.organization !== f.org) return false;
    if (f.type && event.type !== f.type) return false;
    if (f.region === 'korea' && event.country !== 'KR') return false;
    if (f.region === 'overseas' && (!event.country || event.country === 'US')) return false;
    if (f.region === 'usa' && event.country && event.country !== 'US') return false;
    if (f.region === 'northeast' && !northeast.has(event.state)) return false;
    if (f.region === 'other' && ((!event.state || northeast.has(event.state)) || (event.country && event.country !== 'US'))) return false;
    if (f.region && !['northeast','other','usa','overseas','korea'].includes(f.region) && event.state !== f.region) return false;
    if (f.discipline === 'unknown' && (event.disciplines||[]).length) return false;
    if (f.discipline && f.discipline !== 'unknown' && !(event.disciplines||[]).includes(f.discipline)) return false;
    if (f.precision && precision(event) !== f.precision) return false;
    if (f.time === 'tbd' && precision(event) !== 'unknown') return false;
    if (/^20\d\d$/.test(f.time) && Number(event.year) !== Number(f.time)) return false;
    if (f.time === 'upcoming') {
      if (event.archive_status === 'archive') return false;
      const last = precision(event) === 'confirmed' ? event.end_date : dateValue(event);
      if (last && last < now) return false;
      if (!last && Number(event.year) < Number(now.slice(0,4))) return false;
    }
    return true;
  }).sort((a,b) => {
    const da=dateValue(a), db=dateValue(b);
    return (da || '9999').localeCompare(db || '9999') || a.title.localeCompare(b.title);
  });
}
function escICS(s) { return String(s || '').replace(/\\/g,'\\\\').replace(/\r/g,'').replace(/\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,'); }
function fold(str) {
  const encoder=new TextEncoder();
  const chunks=[]; let chunk='',bytes=0;
  for (const c of str) {
    const cb=encoder.encode(c).length;
    if (chunk && bytes+cb>75) { chunks.push(chunk);chunk=' '+c;bytes=1+cb; }
    else {chunk+=c;bytes+=cb;}
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
function toStamp(s){
  const normalized=String(s || '2026-10-31T00:00:00Z').replace(/[^\d]/g,'');
  return normalized.slice(0,8)+'T'+normalized.slice(8,14).padEnd(6,'0')+'Z';
}
export function eventDetailsURL(event, siteBaseUrl='') {
  if (/^https:\/\//i.test(event.detail_url||'')) return event.detail_url;
  if (/^https:\/\//i.test(siteBaseUrl||'')) {
    try { return new URL(event.detail_path || `events/${event.id}.html`,siteBaseUrl).href; } catch(e) {}
  }
  return '';
}
const shortMemo = (value,max=115) => {
  const t=String(value ?? '').replace(/\s+/g,' ').trim();
  return t.length>max?'See full eligibility/rules on the event detail page':t;
};
export const forecastMarker = event => Number(event.prediction?.support||0) <= 1 ? '(예정·근거부족)' : '(예정)';
// W = verified International category. The editorial S/A/B rating is retained.
export const calendarDisplayGrade = event => event.international_category ? 'W' : (event.tier||'?');
export function dedicatedSystemTag(event) {
  // Only an explicitly independent competition ruleset; do not infer from
  // text mentions, an organizer's name or a joint-sanctioned event.
  if (String(event.group||'').toUpperCase()!=='INDEPENDENT') return '';
  const org=String(event.organization||'').trim().toUpperCase();
  const sanction=String(event.sanctioning_body||'');
  const expr={ATA:/\bATA\b/i,ITF:/\bITF\b/i,TA:/\bTaekwondo\s+America\b/i}[org];
  if (!expr||!expr.test(sanction))return '';
  if (/\b(?:USATKD|USA Taekwondo|AAU|WT|World Taekwondo|Kukkiwon)\b/i.test(sanction))return '';
  return org;
}
export function calendarDisplayName(event) {
  const tag=dedicatedSystemTag(event);
  const officialPrefix=tag==='TA'?'Taekwondo America':tag;
  const name=String(event.title||'').trim();
  // Preserve source records; remove duplicate organization only in the label.
  return officialPrefix ? name.replace(new RegExp('^(\\d{4})\\s+'+officialPrefix+'\\s+','i'),'$1 ') : name;
}
export function calendarDisplayTitle(event, predicted=false) {
  // Projected status stays in ICS DESCRIPTION, never in SUMMARY.
  const tag=dedicatedSystemTag(event);
  return `[TKD ${calendarDisplayGrade(event)}] ${tag?tag+' ':''}${calendarDisplayName(event)}`;
}

export function forecastWarning(event) {
  const p=event.prediction||{};
  const rank={high:'높음',medium:'보통',low:'낮음'}[String(p.confidence||'').toLowerCase()]||'미확인';
  const years=[...new Set((p.evidence||[]).map(e=>String(e.year||'')).filter(Boolean))].sort();
  return [ `⚠ 예상 날짜 — 공식 발표 아님 (신뢰도: ${rank})${Number(p.support||0)<=1?' · 근거부족: 1개 연도':''}`,
    `근거: ${years.length?years.join('·')+' 개최 시작일':'과거 개최 시작일 자료'} / 공식 발표 시 자동 수정됨` ];
}
export function compactCalendarMemo(event, {siteBaseUrl='',predicted=false,variant='event'}={}) {
  const memo=[...(predicted?forecastWarning(event):[]),predicted ? 'Status: [Projected] planning estimate — date/edition not confirmed' :
    event.status==='cancelled' ? 'Status: CANCELLED' : 'Status: Official event date confirmed',
    `TKD Hub importance: ${event.tier||'?'} (editorial, not federation grade)`];
  if(event.organizer||event.organization)memo.push('Organizer: '+shortMemo(event.organizer||event.organization,100));
  if(event.sanctioning_body)memo.push('Affiliation: '+shortMemo(event.sanctioning_body,90));
  if(event.age_eligibility||event.belt_eligibility)memo.push('Age / belt: '+[shortMemo(event.age_eligibility,90)||'check details',shortMemo(event.belt_eligibility,90)||'check details'].join(' / '));
  else if(event.eligibility||event.entry_access)memo.push('Eligibility: Check full entry conditions on detail page');
  if(event.international_category)memo.push('Category: International tournament');
  if(event.identity_summary)memo.push('Identity/entry: '+shortMemo(event.identity_summary,115));
  if(event.national_team_pathway||event.national_championship_pathway)memo.push('Advancement: '+(event.national_team_pathway?'Team pathway; ':'')+(event.national_championship_pathway?'Nationals pathway':''));
  if(String(event.ranking_applies||'').toLowerCase().startsWith('yes'))memo.push('Ranking: Listed for some divisions; check which organization/points on detail page');
  if(variant==='event'&&event.registration_deadline&&!predicted)memo.push('Registration deadline: '+event.registration_deadline);
  if(predicted){const p=event.prediction||{};memo.push(`Forecast basis: ${p.support||0} prior edition(s); confidence ${p.confidence||'unrated'}`)}
  if(event.venue_address)memo.push('Venue: Map/location field has the published address');
  else if(event.location)memo.push('Venue: City/state only; exact address unconfirmed');
  const url=eventDetailsURL(event,siteBaseUrl);
  memo.push(url?'FULL DETAILS / ENTRY / EVIDENCE: '+url:'FULL DETAILS: Site not deployed yet; see the bundled event page ('+(event.detail_path||`events/${event.id}.html`)+')');
  memo.push('Confirm official entry rules before booking travel.');
  return memo.join('\n');
}
function writeEvent(event, variant='event',options={}) {
  const preliminary=precision(event)==='predicted_date';
  if(variant!=='event'&&precision(event)!=='confirmed')return [];
  const d=variant==='event'?dateValue(event):event[variant];
  if(!d||(variant==='event'&&precision(event)==='unknown'))return [];
  const end=variant==='event'&&!preliminary?event.end_date||d:d;
  const uid=event.id+(variant==='event'?'':'.'+variant)+'@tkd-calendar.local';
  const stamp=toStamp(event.modified_at);
  const label={registration_open:'등록 시작',registration_deadline:'등록 마감',late_deadline:'추가/최종 마감'}[variant];
  const name=variant==='event'?calendarDisplayTitle(event,preliminary):`[TKD · ${label}] ${event.title}`;
  const lines=['BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${stamp}`,`LAST-MODIFIED:${stamp}`,`SEQUENCE:${Number(event.revision)||0}`,
    `DTSTART;VALUE=DATE:${dateDigits(d)}`,`DTEND;VALUE=DATE:${dateDigits(dateAdd(end))}`,
    `STATUS:${preliminary?'TENTATIVE':event.status==='cancelled'?'CANCELLED':'CONFIRMED'}`,'TRANSP:TRANSPARENT'];
  if(preliminary)lines.push('X-TKD-DATE-PRECISION:'+(event.prediction?.support===1?'ANNUAL_SERIES_ONE_YEAR':'EARLIEST_START_3Y_WEEKDAY_SAFE'),'X-TKD-NOT-A-REAL-DATE:TRUE');
  if(['S','A','B'].includes(event.tier))lines.push('X-TKD-EDITORIAL-GRADE:'+event.tier);
  lines.push('SUMMARY:'+escICS(name));
  if(event.calendar_bucket)lines.push('X-TKD-CALENDAR-BUCKET:'+event.calendar_bucket);
  if(event.international_category)lines.push('X-TKD-INTERNATIONAL:TRUE');
  const venueLocation=event.venue_address?[event.venue_name,event.venue_address].filter(Boolean).join(', '):(event.location||'');
  if(venueLocation)lines.push('LOCATION:'+escICS(venueLocation));
  lines.push('DESCRIPTION:'+escICS(compactCalendarMemo(event,{siteBaseUrl:options.siteBaseUrl||'',predicted:preliminary,variant})));
  const detail=eventDetailsURL(event,options.siteBaseUrl||'');
  const fallback=event.registration_url||event.source_url;
  if(detail)lines.push('URL:'+escICS(detail));
  else if(/^https:\/\//i.test(fallback||''))lines.push('URL:'+escICS(fallback));
  lines.push('X-TKD-DETAIL-PATH:'+escICS(event.detail_path||`events/${event.id}.html`));
  return [...lines,'END:VEVENT'];
}
export function renderCustomIcs(events, raw={}, name='TKD Custom Calendar', options={}) {
  const filters=normalizeFilters(raw);
  const selected=filterEvents(events, filters);
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//TKD Calendar Hub//Custom Filter Feed//KO',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:'+escICS(name),
    'X-WR-CALDESC:'+escICS('TKD filtered events. Historical start and weekday-adjusted markers are NOT confirmed tournament dates.')];
  for(const event of selected) {
    lines.push(...writeEvent(event,'event',options));
    if(filters.registration==='1' && precision(event)==='confirmed') {
      for(const key of ['registration_open','registration_deadline','late_deadline']) lines.push(...writeEvent(event,key,options));
    }
  }
  lines.push('END:VCALENDAR');
  return lines.flatMap(fold).join('\r\n')+'\r\n';
}
export function serializeFilters(raw={}) {
  const normalized=normalizeFilters(raw);
  const params=new URLSearchParams();
  for(const key of keys) if(normalized[key] && !(key === 'time' && normalized[key] === 'all')) params.set(key,normalized[key]);
  return params.toString();
}
