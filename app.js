/* Browser-only TKD public event explorer; local ICS download and optional Worker feed. */
import {filterEvents, normalizeFilters, renderCustomIcs, serializeFilters, todayNY, dateValue, precision, calendarDisplayTitle, calendarDisplayGrade, eventCardName, hostFamily} from './calendar-core.mjs';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL = value => /^https:\/\//i.test(value||'') ? value : '';
const feeds = {
  all:['TKD','International + S/A/B + ETC (union)'],
  s:['TKD S','USATKD / AAU / CMA only; international excluded'],
  's-confirmed':['TKD / S · Confirmed','Officially dated S only'],
  a:['TKD A','USATKD / AAU / CMA domestic majors'],
  'a-confirmed':['TKD / A · Confirmed','Officially dated A only'],
  b:['TKD B','USATKD / AAU / CMA selected domestic events'],
  etc:['TKD ETC','ATA / ITF / TA / other domestic competitions'],
  small:['TKD Small Events','Verified minor C-grade competitions only'],
  historical:['TKD / Archive','Completed tournament results / past dates'],
  international:['TKD International','International only, excluded from S/A/B/ETC'],
  usatkd:['TKD USATKD','USA Taekwondo'],aau:['TKD AAU','AAU Taekwondo'],
  korea:['TKD Korea-Linked','Kukkiwon and Korean official ties'],
  independent:['TKD Independent','Domestic ETC events only'],
  northeast:['TKD Northeast','NY / NJ / CT / PA'],
  registration:['TKD Registration','Verified registration deadlines']
};
const groupNames={USATKD:'USATKD',AAU:'AAU',CMA:'CMA',KOREA:'한국 연계',INDEPENDENT:'기타 / 독립'};
const hostNames={USATKD:'USATKD',AAU:'AAU',CMA:'CMA',ETC:'기타 / 독립'};
const yesno={yes:'\uC801\uC6A9',no:'\uBBF8\uC801\uC6A9',unknown:'\uBBF8\uD655\uC778'};
const mapURL=e=>{
  const query=e.venue_address||e.location;
  return query?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query):'';
};
const categories={competition:'대회',camp:'캠프·세미나',club:'도장 행사',other:'기타'};
const defaults={search:'',host:'',org:'',group:'',scope:'',identity:'',tier:'S,A,B',bucket:'',pathway:'',type:'competition',region:'',discipline:'',precision:'',time:'upcoming',registration:''};
const state={events:[],meta:{sources:{}},filters:{...defaults},view:'list',month:null};
const detailHref=e=>(window.TKD_EVENT_PAGE_PREFIX||'./events/')+encodeURIComponent(e.id)+'.html';
const siteURL=()=>location.protocol==='https:' ? new URL('./',location.href).href : (location.protocol==='http:' ? new URL('./',location.href).href : '');
const dateParts=value=>{const p=String(value||'').split('-');return p.length===3 ? {y:+p[0],m:+p[1],d:+p[2]}:null};
const addDays=(iso,n)=>{const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const fmt=iso=>iso?iso.replace(/-/g,'.'):'날짜 미정';
const fmtRange=(a,b)=>!a?'날짜 미정':a===b?fmt(a):`${fmt(a)} – ${fmt(b)}`;
const eventsOnScreen=()=>filterEvents(state.events,state.filters);
const isPrediction=e=>precision(e)==='predicted_date';
const predictionText=e=>`${fmt(e.prediction?.date || dateValue(e))} (\uc608\uc0c1 \uc77c\uc815)`;

function evidenceDetails(event){
  const p=event.prediction;
  if(!p || !isPrediction(event))return '';
  const proofs=(p.evidence||[]).map(e=>`<a href="${esc(safeURL(e.source_url)||'#')}" target="_blank" rel="noopener noreferrer">${esc(e.year)}년 ${esc(fmtRange(e.start_date,e.end_date))} ↗</a>`).join('');
  const caveat=p.occurrence_status==='inferred'?'이 연도의 대회 개최 여부도 아직 발표되지 않았습니다.':'대회는 안내되었지만 종목의 실제 개최 날짜가 발표되지 않았습니다.';
  const confidenceLabel={high:'\ub192\uc74c',medium:'\ubcf4\ud1b5',low:'\ub0ae\uc74c'}[p.confidence]||'\ubbf8\ud655\uc778';
  return `<details class="prediction-details"><summary>과거 개최 기록 ${esc(p.support||'')}개 연도 · 근거 보기</summary><div class="evidence-links">${proofs}</div><p>\ucd5c\uadfc 3\ub144 \uc911 ${esc(p.support)}\uac1c \uc5f0\ub3c4 \ud655\uc778 \u00b7 \uc2dc\uae30 \ud3b8\ucc28 ${esc(p.spread_days)}\uc77c \u00b7 \uc608\uce21 \uc2e0\ub8b0\ub3c4 ${esc(confidenceLabel)}</p><p>${esc(caveat)} \ucd94\uc815\uc77c\uc740 \uc2e4\uc81c \uac1c\ucd5c\uc77c\uc774 \uc544\ub2d9\ub2c8\ub2e4. ${esc(p.note||'')}</p><p>요일 분석: ${esc(p.weekday_explanation||"대형대회 요일 보정 없음")} · 기준 ${esc(p.base_earliest_date||p.date)}</p></details>`;
}
function eventCard(event){
  const predicted=isPrediction(event), date=dateParts(dateValue(event));
  const month=date?new Date(Date.UTC(date.y,date.m-1,1)).toLocaleDateString('en-US',{month:'short',timeZone:'UTC'}):'';
  const tier=String(calendarDisplayGrade(event)).toUpperCase();
  const dateLabel=predicted?`${predictionText(event)} / \uC2E4\uC81C \uAC1C\uCD5C\uC77C \uBBF8\uD655\uC815`:
    date?fmtRange(event.start_date,event.end_date):event.announced_month?`${event.announced_month} / \uB0A0\uC9DC \uBBF8\uC815`:'\uB0A0\uC9DC \uBBF8\uC815';
  const host=hostFamily(event);
  const hostLabel=hostNames[host]||'기타 / 독립';
  const org=String(event.organization||'').trim();
  const familyLabel=host==='ETC' ? `${org || '독립'} · ${hostLabel}` : hostLabel;
  const summary=[];
  const region=[event.state,event.country&&event.country!=='US'?event.country:'US'].filter(Boolean).join(' / ');
  if(region)summary.push(`<span class="fact-chip">📍 ${esc(region)}</span>`);
  if(event.identity_citizenship_required_some_divisions)summary.push('<span class="fact-chip citizenship">Citizen: US 시민권 필수 부문 있음</span>');
  else if(event.identity_attention)summary.push('<span class="fact-chip citizenship">참가 신분·선발 조건 확인</span>');
  if(event.age_eligibility && !/^(unknown|not confirmed|미확인)$/i.test(String(event.age_eligibility)))summary.push(`<span class="fact-chip">연령 ${esc(event.age_eligibility)}</span>`);
  if(event.belt_eligibility && !/^(unknown|not confirmed|미확인)$/i.test(String(event.belt_eligibility)))summary.push(`<span class="fact-chip">급수 ${esc(event.belt_eligibility)}</span>`);
  const disciplines=(event.disciplines||[]).map(v=>({kyorugi:'겨루기',poomsae:'품새'})[v]||v);
  if(disciplines.length)summary.push(`<span class="fact-chip">${esc(disciplines.join(' · '))}</span>`);
  if(event.national_team_pathway)summary.push('<span class="fact-chip">국가대표 선발</span>');
  else if(event.national_championship_pathway)summary.push('<span class="fact-chip">전국대회 진출</span>');
  if(/^yes/i.test(String(event.ranking_applies||'')))summary.push('<span class="fact-chip">랭킹 적용</span>');
  const badges=[`<span class="tier-badge tier-${esc(tier)}">[TKD ${esc(tier)}]</span>`,
    `<span class="host-line">${esc(familyLabel)}</span>`];
  if(event.international_category)badges.push('<span class="status-chip international-tag">International</span>');
  if(predicted)badges.push('<span class="status-chip forecast">예상</span>');
  if(!date)badges.push('<span class="status-chip tbd">날짜 미정</span>');
  const venue=event.venue_name||event.location||'\uC7A5\uC18C \uBBF8\uC815';
  const deadline=event.registration_deadline?`<span class="deadline">\uC811\uC218 \uB9C8\uAC10 ${esc(fmt(event.registration_deadline))}</span>`:'';
  const links=[deadline];
  if(mapURL(event))links.push(`<a href="${esc(mapURL(event))}" target="_blank" rel="noopener noreferrer">${event.venue_address?'\uB300\uD68C\uC7A5 \uC9C0\uB3C4':'\uC9C0\uC5ED \uC9C0\uB3C4'} &#8599;</a>`);
  if(safeURL(event.source_url))links.push(`<a href="${esc(event.source_url)}" target="_blank" rel="noopener noreferrer">\uACF5\uC2DD \uC6D0\uBB38 &#8599;</a>`);
  if(safeURL(event.registration_url))links.push(`<a href="${esc(event.registration_url)}" target="_blank" rel="noopener noreferrer">\uC811\uC218 &#8599;</a>`);
  links.push(`<a class="detail-open" href="${esc(detailHref(event))}">\uB300\uD68C \uC0C1\uC138\uC815\uBCF4 &#8594;</a>`);
  const eventTitle=eventCardName(event);
  return `<article class="event-card ${predicted?'forecast-event':''}"><div class="event-date ${date?'':'tbd'} ${predicted?'predicted':''}"><span class="mon">${date?month:'DATE'}</span><span class="day">${date?String(date.d).padStart(2,'0'):'TBD'}</span><span class="year">${date?date.y:event.year}</span>${predicted?'<span class="date-micro">예정일</span>':''}</div><div class="event-content"><div class="event-meta">${badges.join('')}</div><h3 class="event-title">${esc(eventTitle)}</h3><div class="event-summary">${summary.join('')}</div><div class="event-sub"><span>&#9719; ${esc(dateLabel)}</span><span>&#9906; ${esc(venue)}</span></div><div class="event-extra">${links.join('')}</div>${evidenceDetails(event)}</div></article>`;
}
function bindDetailButtons(parent){
  parent.querySelectorAll('[data-detail]').forEach(btn=>btn.addEventListener('click',()=>{
    const event=state.events.find(e=>e.id===btn.dataset.detail);if(event)openDetail(event);
  }));
}
function renderList(events){$('eventList').innerHTML=events.map(eventCard).join('');bindDetailButtons($('eventList'))}

function identityDetails(event){
  const rules=event.identity_requirements||[];
  if(!rules.length&&!event.international_category)return '';
  const intro=event.international_category?`<p class="identity-dialog-intro"><b>INTERNATIONAL</b> · ${esc(event.international_kind||'국제대회')}<br>${esc(event.international_note||'')}</p>`:'';
  const blocks=rules.map(r=>{
    const docs=(r.sources||[]).filter(s=>safeURL(s.url)).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a>`).join(' ');
    return `<div class="identity-dialog-rule"><b>${esc(r.division)}</b><small>${esc(r.short_summary)}</small><p>${esc(r.detail)}</p><span>근거: ${esc(r.source_season)} · ${esc(r.reference_checked_on)}</span><div>${docs}</div></div>`;
  }).join('');
  return `<section class="identity-dialog"><h3>국적 · 신분 · 국제대회 참가 기준</h3>${intro}${blocks}<small>각 부문별 공식 요강이 우선합니다. 시민권 조건이 없는 것으로 확정된 경기와, 공통 안내에 미기재된 경기는 다릅니다.</small></section>`;
}
function renderDetailBody(event){
  const date=dateValue(event);
  const predicted=isPrediction(event);
  const label=(v, missing='\uBBF8\uD655\uC778') => v===null||v===undefined||v===''?missing:String(v);
  const displayDate=predicted?fmt(date)+' (\uC608\uC815)':date?fmtRange(event.start_date,event.end_date):
      event.announced_month?event.announced_month+' / \uC138\uBD80 \uB0A0\uC9DC \uBBF8\uC815':'\uB0A0\uC9DC \uBBF8\uC815';
  const row=(term,value)=>`<dt>${esc(term)}</dt><dd>${esc(label(value))}</dd>`;
  const evidence=(event.prediction?.evidence||[]).map(v=>`${v.year}: ${v.start_date}~${v.end_date}`).join(' / ');
  const participant=event.prior_participants?`${Number(event.prior_participants).toLocaleString('en-US')} (${event.prior_participants_year}\uB144)`:'';
  const lines=[
    row('캘린더 기본 분류',event.calendar_bucket||'미분류'),
    row('Host / 경기계열',hostNames[hostFamily(event)]||'기타 / 독립'),
    row('\uC8FC\uC694 \uACC4\uC5F4',groupNames[event.group]||event.group),
    row('\uB300\uD68C \uC2DC\uB9AC\uC988',event.series_name||'\uBBF8\uB4F1\uB85D'),
    row('\uC2DC\uB9AC\uC988 \uAE30\uBCF8 \uC815\uBCF4',event.series_note),
    row('\uC120\uBCC4 \uB4F1\uAE09',`${event.tier||'?'} / ${event.tier_basis||''}`),
    row('\uACF5\uC778 \uAE30\uAD00',event.sanctioning_body),
    row('\uACF5\uC778 \uC0C1\uD0DC',event.sanction_status==='official_event'?'\uACF5\uC2DD \uD589\uC0AC \uAC1C\uCD5C \uD655\uC778':event.sanction_status==='independent'?'\uB3C5\uB9BD \uC8FC\uCD5C':event.sanction_status),
    row('\uC2E4\uC81C \uC8FC\uCD5C',event.organizer||event.organization),
    row('\uAD6D\uAC00',event.country||'US'),
    row('\uCC38\uAC00 \uBC29\uBC95',event.entry_access),
    row('\uB0A0\uC9DC \uC99D\uAC70 \uAD6C\uBD84',event.date_evidence),
    row('\uAC1C\uCD5C\uC77C',displayDate),
    row('\uB300\uD68C\uC7A5',event.venue_name||event.location),
    row('\uC815\uD655\uD55C \uC8FC\uC18C',event.venue_address||'\uC544\uC9C1 \uBBF8\uACF5\uAC1C'),
    row('\uAD6D\uAC00\uB300\uD45C \uC120\uBC1C',event.national_team_pathway),
    row('\uC804\uAD6D\uB300\uD68C \uC9C4\uCD9C',event.national_championship_pathway),
    row('\uC120\uBC1C\uC804 \uC790\uACA9',event.qualifier_conditions),
    row('\uB7AD\uD0B9 \uC801\uC6A9',yesno[event.ranking_applies]||event.ranking_applies||'\uBBF8\uD655\uC778'),
    row('\uB7AD\uD0B9 \uCCB4\uACC4',event.ranking_system),
    row('\uACF5\uC2DD \uD3EC\uC778\uD2B8',event.ranking_points),
    row('\uC5F0\uB839 \uC870\uAC74',event.age_eligibility),
    row('\uB760 \uBC0F \uD488\u00B7\uB2E8',event.belt_eligibility),
    row('\uC885\uBAA9',(event.disciplines||[]).join(', ')),
    row('\uC77C\uBC18 \uCC38\uAC00 \uC870\uAC74',event.eligibility),
    row('\uC9C0\uB09C \uB300\uD68C \uCC38\uAC00\uC790',participant||'\uAC80\uC99D\uB41C \uC218\uCE58 \uC5C6\uC74C'),
    row('\uCC38\uAC00\uADDC\uBAA8 \uD574\uC124',event.prior_participants_note),
    row('\uC811\uC218 \uC2DC\uC791',event.registration_open),
    row('\uC811\uC218 \uB9C8\uAC10',event.registration_deadline),
    row('\uCD94\uAC00 \uC811\uC218 \uB9C8\uAC10',event.late_deadline),
    row('\uB4F1\uB85D\uBE44',event.fee),
    row('\uC811\uC218 \uC548\uB0B4',event.registration_notes),
    row('\uC815\uBCF4 \uD655\uC778\uC77C',event.source_checked_on)
  ];
  const links=[['\uACF5\uC2DD \uC6D0\uBB38',event.source_url],['\uB300\uD68C \uC0C1\uC138',event.event_source_details],
    ['\uCC38\uAC00 \uC2E0\uCCAD',event.registration_url],['\uACBD\uAE30 \uADDC\uC815',event.rules_url],
    ['\uC9C0\uB3C4 \uBCF4\uAE30',mapURL(event)],['\uB300\uD68C\uC7A5 \uC8FC\uC18C \uADFC\uAC70',event.venue_source],
    ['\uC774\uC804 \uCC38\uAC00 \uADDC\uBAA8 \uADFC\uAC70',event.prior_participants_source],
    ['\uC2DC\uB9AC\uC988 \uACF5\uC2DD \uC6D0\uBB38',event.series_url]]
    .filter(x=>safeURL(x[1])).map(x=>`<a href="${esc(x[1])}" target="_blank" rel="noopener noreferrer">${x[0]} &#8599;</a>`).join('');
  const note=predicted?`<div class="detail-warning">\uC608\uCE21\uC77C\uC740 \uCD5C\uB300 3\uB144\uC758 \uACFC\uAC70 \uAC1C\uCD5C\uC77C\uACFC \uC694\uC77C\uC744 \uBC18\uC601\uD55C \uCD94\uC815\uC785\uB2C8\uB2E4. \uD55C \uD574\uB9CC \uD655\uC778\uB41C S/A\uAE09 \uB300\uD68C\uB294 \uC2E0\uB8B0\uB3C4\uAC00 \uB0AE\uC73C\uBA70 \uB2E4\uC74C \uD574 \uAC1C\uCD5C \uC790\uCCB4\uB3C4 \uBBF8\uD655\uC778\uC785\uB2C8\uB2E4. \uC2E4\uC81C \uAC1C\uCD5C\uC77C \uC544\uB2D8.<br>${esc(evidence)}</div>`:
    !date?`<div class="detail-warning">\uC138\uBD80 \uB0A0\uC9DC \uBBF8\uACF5\uAC1C. \uD655\uC815 \uD6C4 \uCE98\uB9B0\uB354\uC5D0 \uC790\uB3D9 \uBC18\uC601\uB429\uB2C8\uB2E4.</div>`:'';
  const downloadable=Boolean(date);
  return `<div class="detail-heading"><span class="tier-badge tier-${esc(event.tier||'C')}">${esc(event.tier||'C')}</span><span class="org-label">${esc(event.organization)}</span></div>
    <h2>${esc(eventCardName(event))}</h2>
    <p class="detail-lead">${esc(event.event_description||event.tier_basis||'')}</p>${note}${identityDetails(event)}
    <div class="detail-links">${links||'<span>\uC6D0\uBB38 \uB9C1\uD06C \uBBF8\uD655\uC778</span>'}</div>
    <h3>\uB300\uD68C \uC0C1\uC138 \uC815\uBCF4</h3><dl class="detail-grid">${lines.join('')}</dl>
    <div class="detail-actions"><button type="button" id="singleIcs" ${downloadable?'':'disabled'}>\uC774 \uB300\uD68C \uCE98\uB9B0\uB354(ICS) \uC800\uC7A5</button>
    <a class="detail-page-link" href="${esc(detailHref(event))}">웹에서 전체 상세정보 보기 ↗</a><small>ICS 메모에는 요약 정보와 상세정보 링크만 담깁니다. 공식·예상 날짜를 구분해 확인하세요.</small></div>`;
}
function downloadOne(event){
  const ics=renderCustomIcs([event],{tier:event.tier||'S,A,B',time:'all'},'TKD Event',{siteBaseUrl:siteURL()});
  const url=URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='tkd-'+(event.year||'event')+'-'+(event.id||'event')+'.ics';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function openDetail(event){
  const body=$('eventDialogBody'),dlg=$('eventDialog');
  body.innerHTML=renderDetailBody(event);
  const one=$('singleIcs');if(one)one.onclick=()=>downloadOne(event);
  if(!dlg.open){if(typeof dlg.showModal==='function')dlg.showModal();else dlg.setAttribute('open','');}
}

function renderMonth(events){
  if(!state.month){const t=dateParts(todayNY());state.month={y:t.y,m:t.m}}
  const {y,m}=state.month, first=`${y}-${String(m).padStart(2,'0')}-01`;
  const offset=new Date(first+'T12:00:00Z').getUTCDay();
  const days=new Date(Date.UTC(y,m,0)).getUTCDate(), weeks=Math.ceil((days+offset)/7), initial=addDays(first,-offset);
  let body='<div class="month-calendar">'+['일','월','화','수','목','금','토'].map(w=>`<div class="week-head">${w}</div>`).join('');
  for(let i=0;i<weeks*7;i++){
    const day=addDays(initial,i), part=dateParts(day), outside=part.m!==m;
    const matching=events.filter(e=>{const start=dateValue(e);const end=isPrediction(e)?start:e.end_date||start;return start&&start<=day&&end>=day});
    const cards=matching.slice(0,3).map(e=>`<div class="month-chip ${isPrediction(e)?'tbd':e.type==='camp'?'camp':''}" title="${esc(calendarDisplayTitle(e,isPrediction(e)))}" data-event="${esc(e.id)}">${esc(calendarDisplayTitle(e,isPrediction(e)))}</div>`).join('');
    body+=`<div class="month-cell ${outside?'outside':''} ${day===todayNY()?'today':''}"><div class="month-day">${part.d}</div>${cards}${matching.length>3?`<small>+${matching.length-3}</small>`:''}</div>`;
  }
  const undated=events.filter(e=>!dateValue(e));
  $('monthLabel').textContent=`${y}년 ${m}월`;
  $('monthView').innerHTML=body+'</div>'+`<div class="month-bottom"><p class="calendar-guidance">\ub178\ub780\uc0c9 (\uc608\uc815)\uc740 \uacfc\uac70 \ucd5c\ub300 3\ub144\uc758 \uac1c\ucd5c\uc77c\uacfc \uc694\uc77c\uc744 \ubc18\uc601\ud55c \ucd94\uc815\uc785\ub2c8\ub2e4. S/A\uae09\uc740 1\uac1c \uc5f0\ub3c4\ub9cc \ud655\uc778\ub418\uc5b4\ub3c4 \ub0ae\uc740 \uc2e0\ub8b0\ub3c4\ub85c \uc608\uc815\uc77c\uc744 \ud45c\uc2dc\ud558\uba70, \uc774\ub294 \uacf5\uc2dd \uc77c\uc815\uc774 \uc544\ub2d9\ub2c8\ub2e4.</p>${undated.length?`<h3>예측 근거 부족 · ${undated.length}건</h3>${undated.map(eventCard).join('')}`:''}</div>`;
  $('monthView').querySelectorAll('[data-event]').forEach(node=>node.addEventListener('click',()=>{const event=events.find(e=>e.id===node.dataset.event);if(event)openDetail(event)}));
  bindDetailButtons($('monthView'));
}
let toastTimeout;
function toast(message){let node=$('toast');if(!node){node=document.createElement('div');node.id='toast';document.body.appendChild(node)}node.textContent=message;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>node.remove(),3900)}
function render(){
  const filtered=eventsOnScreen();
  $('viewList').classList.toggle('active',state.view==='list');$('viewMonth').classList.toggle('active',state.view==='month');
  $('viewList').setAttribute('aria-pressed',String(state.view==='list'));$('viewMonth').setAttribute('aria-pressed',String(state.view==='month'));
  $('eventList').hidden=state.view!=='list';$('monthView').hidden=state.view!=='month';$('monthControls').hidden=state.view!=='month';
  $('resultCount').textContent=`${filtered.length}건`;$('emptyState').hidden=filtered.length!==0;
  $('customCount').textContent=`${filtered.filter(e=>precision(e)!=='unknown').length}건`;
  if(state.view==='list')renderList(filtered);else renderMonth(filtered);
}
function setView(view){state.view=view;render()}
function nextMonth(offset){const d=new Date(Date.UTC(state.month.y,state.month.m-1+offset,1));state.month={y:d.getUTCFullYear(),m:d.getUTCMonth()+1};render()}
function feedCount(feed){
  const match=e=>['S','A','B','C'].includes(e.tier)&&e.type==='competition';
  const cutoff=addDays(todayNY(),-90);
  return state.events.filter(e=>{
    if(!match(e))return false;
    const when=(precision(e)==='confirmed'?e.end_date:dateValue(e))||'';
    if(feed==='historical')return Boolean(when&&when<cutoff);
    if(!when||when<cutoff)return false;
    if(feed==='registration')return precision(e)==='confirmed'&&['registration_open','registration_deadline','late_deadline'].some(k=>e[k]&&e[k]>=cutoff);
    const bucket=e.calendar_bucket||'';
    if(feed==='all')return bucket!=='SMALL';
    if(['s','a','b','etc','international','small'].includes(feed))return bucket===feed.toUpperCase();
    if(feed==='s-confirmed'||feed==='a-confirmed')return precision(e)==='confirmed'&&bucket===feed[0].toUpperCase();
    if(bucket==='INTERNATIONAL'||bucket==='SMALL')return false; // exclusive primary feeds.
    if(feed==='northeast')return ['NY','NJ','CT','PA'].includes(e.state);
    if(feed==='korea')return e.group==='KOREA';
    if(feed==='independent')return bucket==='ETC';
    return e.organization?.toLowerCase()===feed;
  }).length;
}
function renderFeeds(){
  $('feedList').innerHTML=Object.entries(feeds).map(([id,[name,detail]])=>`<div class="feed-item"><div class="feed-top"><b>${esc(name)}</b><small>${feedCount(id)}건</small></div><div class="feed-sub">${esc(detail)}</div><div class="feed-actions"><button class="primary" type="button" data-copy="${id}">구독 URL 복사</button><a href="./feeds/${id}.ics" download="${id}.ics">ICS 저장</a></div></div>`).join('');
  $('feedList').querySelectorAll('[data-copy]').forEach(button=>button.onclick=()=>copyText(new URL('./feeds/'+button.dataset.copy+'.ics',location.href).href));
}
async function renderPublicGoogleCalendars(){
  const el=$('googleCalendarList');
  if(!el)return;
  let data=null;
  try{const response=await fetch('./google-calendars.json',{cache:'no-store'});if(response.ok)data=await response.json()}catch(e){}
  if(!data?.calendars?.length){el.innerHTML='<p class="worker-help">운영자 Google 계정에 공개 캘린더를 생성·연결하면 S/A/B 구독 링크가 여기에 자동 표시됩니다. 현재는 아래 ICS 구독을 사용하세요.</p>';return;}
  el.innerHTML=data.calendars.map(cal=>{
    // cid expects a Google calendar ID, not an external ICS URL.
    // Google often uses base64 in its official 'Get shareable link'.
    // Do not force /u/0: subscribers may use a different Google account.
    const cid=btoa(cal.calendar_id).replace(/=+$/,'');
    const url='https://calendar.google.com/calendar?cid='+encodeURIComponent(cid);
    return `<div class="feed-item"><div class="feed-top"><b>${esc(cal.name)}</b></div><div class="feed-sub">${esc(cal.tier)} 전용 · 공개 일정/예정일 포함 · 대회 메모에서 상세 링크 열기</div><div class="feed-actions"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Google Calendar에 추가 ↗</a></div></div>`;
  }).join('')+'<p class="worker-help">International/S/A/B/ETC/Small은 상호 배타적입니다. All은 Small을 제외한 주요대회 통합 피드입니다.</p>';
}
function renderSources(){
  const statuses=state.meta.sources||{};
  const sources=state.meta.source_registry||[
    {id:'usatkd_season',name:'USATKD / Main'},{id:'usatkd_calendar',name:'USATKD / Calendar'},
    {id:'aau_future',name:'AAU / Nationals'},{id:'ata_schedule',name:'ATA / Nationals'}
  ];
  const names={ok:'확인 완료',not_modified:'변경 없음',no_structured_events:'구조화된 일정 없음',needs_review:'파서 검토',blocked:'접근 제한',error:'접속 오류',seed:'초기 자료'};
  $('sourceMonitor').innerHTML=sources.map(src=>{
    const st=statuses[src.id], status=st?.status||'seed';
    const kind=src.mode==='discovery'?' · 후보 발견':' · 공식 정보';
    const when=st?.last_checked?' · '+st.last_checked.slice(0,10):' · 온라인 미실행';
    return `<div class="health-item"><span title="${esc(src.name||src.id)}">${esc(src.name||src.id)}<small class="source-mode">${esc(kind)}</small></span><small class="${['ok','not_modified'].includes(status)?'state':'warn'}" title="${esc(st?.message||'')}">${esc(names[status]||'확인 필요')}${esc(when)}</small></div>`;
  }).join('');
}
async function renderDiscovery(){
  let info=null;
  const embedded=$('initialDiscovery');
  if(embedded){try{info=JSON.parse(embedded.textContent)}catch(e){}}
  try{const response=await fetch('./discovery.json',{cache:'no-store'});if(response.ok)info=await response.json()}catch(e){}
  const candidates=info?.candidates||[];
  $('pendingCount').textContent=(info?.counts?.pending??candidates.length)+'건';
  $('discoveryPreview').innerHTML=candidates.slice(0,10).map(c=>{
    const url=/^https:\/\//i.test(c.source_url||'')?c.source_url:'';
    return `<div class="candidate-item"><b>${esc(c.title)}</b><small>${esc(c.start_date||'날짜 미정')} · ${esc(c.affiliation_claim||'관련 기관 미확인')}</small>${url?`<a target="_blank" rel="noopener noreferrer" href="${esc(url)}">원문 확인 ↗</a>`:''}</div>`;
  }).join('')+(candidates.length>10?`<p>외 ${candidates.length-10}건은 배포된 discovery.json에서 확인할 수 있습니다.</p>`:'');
}
async function copyText(value){try{await navigator.clipboard.writeText(value);toast('구독 URL을 복사했습니다.')}catch(e){window.prompt('아래 URL을 복사하세요',value)}}
function selectedExportFilters(){return normalizeFilters({...state.filters,registration:$('includeRegistration').checked?'1':''})}
function downloadCustom(){
  const data=renderCustomIcs(state.events,selectedExportFilters(),'TKD Custom Calendar',{siteBaseUrl:siteURL()});
  const blob=new Blob([data],{type:'text/calendar;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='tkd-custom-calendar.ics';link.click();setTimeout(()=>URL.revokeObjectURL(url),1200);
  toast('선택한 조건으로 ICS 파일을 생성했습니다. 파일 가져오기는 자동 갱신되지 않습니다.');
}
function customSubscription(){
  const base=String(window.TKD_CUSTOM_FEED_BASE||'').trim();
  if(!base || !/^https:\/\//.test(base)){toast('맞춤 자동 구독은 Worker 배포 후 사용 가능합니다.');return}
  const filters=selectedExportFilters();
  if(filters.time==='upcoming')filters.time='all';
  const url=new URL(base),paramString=serializeFilters(filters);
  url.search=paramString;
  copyText(url.toString());
}
function setup(){
  for(const [id,key,eventName] of [['searchInput','search','input'],['hostSelect','host','change'],['orgSelect','org','change'],['scopeSelect','scope','change'],['identitySelect','identity','change'],['tierSelect','tier','change'],['pathwaySelect','pathway','change'],['regionSelect','region','change'],['disciplineSelect','discipline','change'],['precisionSelect','precision','change'],['timeSelect','time','change']]){
    $(id).addEventListener(eventName,e=>{state.filters[key]=e.target.value;render()});
  }
  $('resetFilters').onclick=()=>{
    state.filters={...defaults};
    for(const [id,key] of [['searchInput','search'],['hostSelect','host'],['orgSelect','org'],['scopeSelect','scope'],['identitySelect','identity'],['tierSelect','tier'],['pathwaySelect','pathway'],['regionSelect','region'],['disciplineSelect','discipline'],['precisionSelect','precision'],['timeSelect','time']])$(id).value=defaults[key];
    $('includeRegistration').checked=false;render();
  };
  $('closeEventDialog').onclick=()=>$('eventDialog').close();
  $('eventDialog').addEventListener('click',e=>{if(e.target===$('eventDialog'))$('eventDialog').close()});
  $('viewList').onclick=()=>setView('list');$('viewMonth').onclick=()=>setView('month');
  $('prevMonth').onclick=()=>nextMonth(-1);$('nextMonth').onclick=()=>nextMonth(1);
  $('includeRegistration').onchange=render;
  $('downloadCustom').onclick=downloadCustom;
  $('copyCustomFeed').onclick=customSubscription;
  const worker=String(window.TKD_CUSTOM_FEED_BASE||'').trim();
  $('copyCustomFeed').disabled=!/^https:\/\//.test(worker);
  $('workerHelp').textContent=worker?'자동 구독: 공개 데이터가 바뀌면 구독 URL도 반영합니다. 지난 행사를 보존하도록 「향후」 필터는 구독에서 전체 기간으로 바뀝니다.':'자동 갱신용 맞춤 구독은 Worker 주소 설정 후 활성화됩니다. ICS 다운로드는 즉시 이용 가능합니다.';
}
async function main(){
  setup();let payload=null;
  const embedded=$('initialData');if(embedded){try{payload=JSON.parse(embedded.textContent)}catch(e){}}
  try{const response=await fetch('./events.json',{cache:'no-store'});if(response.ok)payload=await response.json()}catch(e){}
  if(!payload || !Array.isArray(payload.events)){$('notice').hidden=false;$('notice').textContent='공개 행사 데이터를 가져오지 못했습니다. HTTP 서버 또는 배포된 웹페이지에서 실행하세요.';return}
  state.events=payload.events;state.meta=payload;
  const orgSelect=$('orgSelect');
  const known=new Set(Array.from(orgSelect.options).map(o=>o.value));
  for(const org of [...new Set(payload.events.map(e=>e.organization).filter(Boolean))].sort()){if(!known.has(org)){const o=document.createElement('option');o.value=org;o.textContent=org;orgSelect.append(o);known.add(org)}}
  $('metricTotal').textContent=payload.counts.master;$('metricDated').textContent=payload.counts.dated;
  $('metricPredicted').textContent=payload.counts.predicted||0;$('metricTbd').textContent=payload.counts.tbd||0;
  $('refreshedLabel').textContent='파일 생성 '+payload.updated_at.slice(0,10);
  render();renderFeeds();renderSources();await renderPublicGoogleCalendars();await renderDiscovery();
  if(payload.conflicts){$('notice').hidden=false;$('notice').textContent=`서로 다른 공식 출처의 날짜·정보 충돌 ${payload.conflicts}건이 있어 확인이 필요합니다.`}
}
main();
