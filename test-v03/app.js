/* Ma Chaudière — V0.3 étape 2 TEST — stockage compatible étape 1B. */
'use strict';
const C=globalThis.ChaudiereCore;
const KEY='chaudiere-hornu-v03-test-etape1',PREVIOUS=KEY+'-avant-derniere-modification';
const $=id=>document.getElementById(id),fmt=(x,n=1)=>C.isNum(x)?x.toLocaleString('fr-BE',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
const uid=()=>globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2);
let data=C.initial();
let historyShowAll=false, lastSavedReadingId=null;
let storageReady=true;
try{const raw=localStorage.getItem(KEY);if(raw){const parsed=JSON.parse(raw);const reason=C.validate(parsed);if(reason)throw Error(reason);data=C.normalize(parsed)}}catch(err){storageReady=false;console.error('Données locales non chargées :',err)}
function message(s,error=false){$('status').textContent=s;$('status').className='notice'+(error?' error':'')}
function commit(next,success='Modification enregistrée.',allowRecovery=false){
  if(!storageReady&&!allowRecovery){message('Stockage de test illisible : aucune écriture autorisée. Restaure une sauvegarde JSON valide avant de poursuivre.',true);return false}
  const reason=C.validate(next);
  if(reason){message('Enregistrement refusé : '+reason,true);return false}
  try{
    // Conserver aussi le tout premier état en l’absence de sauvegarde précédente.
    const previous=localStorage.getItem(KEY);
    localStorage.setItem(PREVIOUS,previous??JSON.stringify(data));
    localStorage.setItem(KEY,JSON.stringify({...next,version:3}));
    data=C.normalize(next);storageReady=true;render();message(success);return true;
  }catch(err){message('Stockage local indisponible : rien n’a été modifié. Exporte ta sauvegarde JSON. '+err.message,true);return false}
}
function add(grid,label,value){
  const a=document.createElement('span'),b=document.createElement('span');
  a.textContent=label;b.textContent=value;grid.append(a,b);
}
const eventKind={reading:['Relevé','kind-reading'],delivery:['Livraison','kind-delivery'],anchor:['Correction','kind-anchor'],rate:['Débit','kind-rate']};
const dateText=when=>{
  const [d,t]=when.split('T'),[y,m,j]=d.split('-');return j+'/'+m+'/'+y+' '+t;
};
function showPage(name){
  for(const el of document.querySelectorAll('.page'))el.hidden=el.id!=='page-'+name;
  for(const b of document.querySelectorAll('[data-page]'))b.setAttribute('aria-current',b.dataset.page===name?'page':'false');
  if(name==='historique')renderHistory();
  window.scrollTo({top:0,behavior:'instant'});
}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
function render(){
  const rs=C.readings(data),last=rs.at(-1),current=C.meterLatestAt(data,C.localNow()),lastTemp=last?.temp??data.baseSetpoint;
  const stock=C.stockAt(data,C.localNow());
  $('stock').textContent=fmt(stock.liters)+' L'+(data.initialStockProvisional&&!data.anchors.length?' *':'')+(stock.estimated?' ≈':'');
  $('meterNow').textContent=fmt(current)+' h';
  const total=C.cumulative(data,C.localNow());
  $('used').textContent=fmt(total.liters,2)+' L'+(total.estimated?' ≈':'');
  $('rateNow').textContent=fmt(C.rateAt(data,C.localNow()),2)+' L/h';
  $('usedLabel').textContent='Consommation depuis le '+new Date(data.baseDate).toLocaleDateString('fr-BE');
  $('readingDate').min=$('anchorDate').min=$('rateDate').min=data.baseDate;
  $('setpoint').textContent=fmt(lastTemp)+' °C';
  if(document.activeElement!==$('readingTemp'))$('readingTemp').value=fmt(lastTemp);
  const cap=data.tank?.capacity;
  if(C.isNum(cap)&&cap>0){
    const percentage=100*stock.liters/cap;
    $('tankPct').textContent=fmt(percentage,0)+' %';
    $('tankHelp').textContent='Capacité : '+fmt(cap,0)+' L'+(percentage>100?' (stock au-dessus de la capacité)':'');
    $('tankFill').style.height=Math.max(0,Math.min(100,percentage))+'%';
  }else{
    $('tankPct').textContent='— %';$('tankHelp').textContent='Capacité à renseigner dans Réglages';$('tankFill').style.height='0%';
  }
  const approximate=data.anchors.some(a=>a.meter==null&&C.meterAt(data,a.when).estimated)||C.rateChanges(data).some(a=>a.meter==null&&C.meterAt(data,a.when).estimated);
  $('calcNotice').textContent=approximate?'⚠ Un compteur manque lors d’une correction ou d’un changement de débit : les calculs concernés sont approximatifs.':'Consommations calculées selon l’historique des débits et les compteurs renseignés.';
  $('calcNotice').className='hint'+(approximate?' status-warning':'');
  renderHistory();
}
function eventDetails(e,prev){
  const details=[];
  const add=(label,value)=>details.push([label,value]);
  if(e.type==='reading'){
    const diff=e.meter-(prev?.meter??data.baseMeter),s=C.stockAt(data,e.when);
    const fuel=C.fuelBetween(data,prev?.when??data.baseDate,prev?.meter??data.baseMeter,e.when,e.meter);
    add('Compteur',fmt(e.meter)+' h');add('Depuis le relevé précédent',fmt(diff)+' h');
    add('Consommation',fmt(fuel.liters,2)+' L'+(fuel.estimated?' (estimée)':''));
    add('Stock théorique',fmt(s.liters)+' L'+(s.estimated?' ≈':''));add('Consigne',fmt(e.temp)+' °C');
    add('Jauge',C.isNum(e.gauge)?fmt(e.gauge)+' cm / ≈ '+fmt(e.gauge*C.litersPerCm(data),0)+' L':'—');
    if(C.isNum(e.gauge))add('Écart jauge – calcul',fmt(e.gauge*C.litersPerCm(data)-s.liters,1)+' L');
    add('Chauffage complémentaire',C.heatLabel(e));
    const day=C.dayAvg(data,e.when),avg=C.periodAvg(data,prev?.when,e.when);
    add('Température extérieure du jour',C.isNum(day)?fmt(day)+' °C':'—');
    add('Moyenne météo entre relevés',C.isNum(avg)?fmt(avg)+' °C':'—');
  }else if(e.type==='delivery'){
    add('Quantité livrée','+'+fmt(e.liters,0)+' L');
    if(e.when<=data.baseDate)add('Prise en compte','Avant stock initial : non ajoutée une seconde fois');
    else add('Stock après livraison',fmt(C.stockAt(data,e.when).liters)+' L');
  }else if(e.type==='rate'){
    add('Nouveau débit',fmt(e.rate,2)+' L/h');
    add('Ancien débit',fmt(C.rateChanges(data).filter(r=>r.when<e.when).at(-1)?.rate??(data.baseRate??C.RATE),2)+' L/h');
    add('Compteur au réglage',C.isNum(e.meter)?fmt(e.meter)+' h (mesuré)':'Non relevé : estimation');
  }else{
    add('Nouveau stock de référence',fmt(e.liters)+' L');
    add('Compteur à la correction',C.isNum(e.meter)?fmt(e.meter)+' h (mesuré)':'Non relevé : estimation');
  }
  add('Remarque',e.note||'—');return details;
}
function renderHistory(){
  const list=$('history'),es=$('historyOrder').value==='asc'?C.events(data):C.events(data).reverse(),rs=C.readings(data);
  const filter=$('historyFilter').value,search=$('historySearch').value.trim().toLowerCase();
  const found=es.filter(e=>{
    if(filter!=='all'&&e.type!==filter)return false;
    return !search||[e.when,dateText(e.when),eventKind[e.type][0],e.note||'',e.meter,e.liters,e.rate,e.gauge,fmt(e.meter),fmt(e.liters),fmt(e.rate),fmt(e.gauge)].join(' ').toLowerCase().includes(search);
  });
  const shown=historyShowAll?found:found.slice(0,20);
  $('historyCount').textContent=found.length+' événement(s) trouvé(s)'+(shown.length<found.length?' — '+shown.length+' affiché(s)':'');
  $('historyMoreBtn').hidden=shown.length>=found.length;
  list.replaceChildren();
  if(!found.length){const p=document.createElement('p');p.className='history-empty muted';p.textContent='Aucun événement pour ce filtre.';list.append(p);return}
  const table=document.createElement('table');table.className='history-table';
  const th=document.createElement('thead'),tr=document.createElement('tr');
  for(const [name,cls] of [['Date','datecol'],['Type',''],['Compteur','numeric mobile-optional'],['Variation','numeric'],['Stock','numeric'],['Jauge','numeric optional'],['','']]){
    const cell=document.createElement('th');cell.textContent=name;cell.className=cls;tr.append(cell);
  }
  th.append(tr);table.append(th);const body=document.createElement('tbody');
  function textCell(row,value,css=''){
    const cell=document.createElement('td');cell.className=css;cell.textContent=value;row.append(cell);return cell;
  }
  for(const e of shown){
    const prev=e.type==='reading'?rs.filter(r=>r.when<e.when).at(-1):null;
    const row=document.createElement('tr');row.className='kind-'+e.type+'-row';
    textCell(row,dateText(e.when).replace('/2026','/26'),'datecol');
    const kind=document.createElement('td'),pill=document.createElement('span');pill.className='pill '+eventKind[e.type][1];pill.textContent=eventKind[e.type][0];kind.append(pill);row.append(kind);
    textCell(row,e.type==='reading'?fmt(e.meter)+' h':e.type==='rate'?fmt(e.meter)+' h':'—','numeric mobile-optional');
    const fuel=e.type==='reading'?C.fuelBetween(data,prev?.when??data.baseDate,prev?.meter??data.baseMeter,e.when,e.meter):null;
    textCell(row,e.type==='reading'?fmt(fuel.liters,2)+' L':e.type==='delivery'?'+'+fmt(e.liters,0)+' L':e.type==='anchor'?fmt(e.liters)+' L':fmt(e.rate,2)+' L/h','numeric');
    textCell(row,e.when<data.baseDate?'—':fmt(C.stockAt(data,e.when).liters)+' L','numeric');
    textCell(row,C.isNum(e.gauge)?fmt(e.gauge)+' cm':'—','numeric optional');
    const control=document.createElement('td');const toggle=document.createElement('button');toggle.className='secondary small';toggle.textContent='Détails';toggle.type='button';toggle.setAttribute('aria-expanded','false');control.append(toggle);row.append(control);body.append(row);
    const detailRow=document.createElement('tr');detailRow.className='history-details';detailRow.hidden=true;
    const detailCell=document.createElement('td');detailCell.colSpan=7;
    const area=document.createElement('div');area.className='detailgrid';
    for(const [label,value] of eventDetails(e,prev)){
      const box=document.createElement('div');box.className='detail';const a=document.createElement('span'),b=document.createElement('strong');a.textContent=label;b.textContent=value;box.append(a,b);area.append(box);
    }
    detailCell.append(area);const actions=document.createElement('div');actions.className='actions';
    const edit=document.createElement('button');edit.className='secondary small';edit.textContent='Modifier';edit.type='button';edit.onclick=()=>editEvent(e);
    const del=document.createElement('button');del.className='danger small';del.textContent='Supprimer';del.type='button';
    del.onclick=()=>{if(confirm('Supprimer cet événement du tableau ET des données ? Les calculs seront recalculés.')){
      const arr=e.type==='reading'?'readings':e.type==='delivery'?'deliveries':e.type==='rate'?'rateChanges':'anchors',next=C.clone(data);
      next[arr]=next[arr].filter(x=>x.id!==e.id);
      if(commit(next,'Événement supprimé de l’historique. Calculs actualisés.')){
        if(lastSavedReadingId===e.id){lastSavedReadingId=null;$('readingConfirmation').hidden=true;}
      }
    }};
    actions.append(edit,del);detailCell.append(actions);detailRow.append(detailCell);body.append(detailRow);
    toggle.onclick=()=>{detailRow.hidden=!detailRow.hidden;row.classList.toggle('expanded',!detailRow.hidden);toggle.textContent=detailRow.hidden?'Détails':'Fermer';toggle.setAttribute('aria-expanded',String(!detailRow.hidden))};
  }
  table.append(body);list.append(table);
}
$('historyFilter').addEventListener('change',()=>{historyShowAll=false;renderHistory()});
$('historyOrder').addEventListener('change',()=>{historyShowAll=false;renderHistory()});
$('historySearch').addEventListener('input',()=>{historyShowAll=false;renderHistory()});
$('historyMoreBtn').addEventListener('click',()=>{historyShowAll=true;renderHistory()});
function showReadingConfirmation(id){
  const r=data.readings.find(x=>x.id===id);if(!r)return;
  lastSavedReadingId=id;
  const rs=C.readings(data),prev=rs.filter(x=>x.when<r.when).at(-1);
  const stock=C.stockAt(data,r.when),fuel=C.fuelBetween(data,prev?.when??data.baseDate,prev?.meter??data.baseMeter,r.when,r.meter);
  const rows=[['Date',dateText(r.when)],['Compteur',fmt(r.meter)+' h'],['Jauge',C.isNum(r.gauge)?fmt(r.gauge)+' cm':'—'],['Consigne',fmt(r.temp)+' °C'],['Chauffage complémentaire',C.heatLabel(r)],['Consommation sur la période',fmt(fuel.liters,2)+' L'],['Stock théorique',fmt(stock.liters)+' L'],['Remarque',r.note||'—']];
  const recap=$('readingRecap');recap.replaceChildren();
  for(const [label,value] of rows){const a=document.createElement('span'),b=document.createElement('b');a.textContent=label;b.textContent=value;recap.append(a,b)}
  $('readingConfirmation').hidden=false;
  $('readingConfirmation').scrollIntoView({block:'nearest',behavior:'smooth'});
}
$('confirmationEdit').addEventListener('click',()=>{
  const e=C.events(data).find(x=>x.id===lastSavedReadingId);if(e)editEvent(e);
});
$('confirmationClose').addEventListener('click',()=>{lastSavedReadingId=null;$('readingConfirmation').hidden=true});
$('confirmationHistory').addEventListener('click',()=>{
  $('historyFilter').value='reading';$('historySearch').value='';historyShowAll=false;showPage('historique');
});
function dateFieldValid(when){if(!C.dateOk(when)){message('Date/heure impossible ou incomplète.',true);return false}if(C.future(when)){message('Les dates ou heures futures sont interdites.',true);return false}return true}
function numberValid(value,label,{min=0,strict=false}={}){
  const n=C.parseNum(value);
  if(!C.isNum(n)||(strict?n<=min:n<min)){message(label+' : nombre invalide.',true);return null}
  return n;
}
function editEvent(e){
  const arr=e.type==='reading'?'readings':e.type==='delivery'?'deliveries':e.type==='rate'?'rateChanges':'anchors';
  const date=prompt('Date et heure (AAAA-MM-JJTHH:MM)',e.when);if(date===null)return;
  if(!dateFieldValid(date))return;
  const v=prompt(e.type==='reading'?'Compteur (heures)':e.type==='delivery'?'Livraison (litres)':e.type==='rate'?'Nouveau débit (L/h)':'Stock corrigé (litres)',String(e.type==='reading'?e.meter:e.type==='rate'?e.rate:e.liters));if(v===null)return;
  const value=numberValid(v,'Valeur',{strict:e.type==='delivery'||e.type==='rate'});if(value===null)return;
  if(e.type==='rate'&&value>100){message('Débit supérieur à 100 L/h refusé.',true);return}
  const note=prompt('Remarque (facultative)',e.note||'');if(note===null)return;
  const updated={...e,when:date,note:note.trim()};delete updated.type;
  if(e.type==='reading'){
    updated.meter=value;
    const t=prompt('Consigne (°C)',String(e.temp));if(t===null)return;
    const temp=C.parseNum(t);if(!C.isNum(temp)){message('Consigne invalide.',true);return}updated.temp=temp;
    // Permettre la correction, l'ajout ou l'effacement de la jauge d'un relevé existant.
    // Une jauge absente reste null ; elle ne doit jamais corriger le stock théorique.
    const g=prompt('Jauge (cm, facultatif ; laisser vide si aucune mesure)',C.isNum(e.gauge)?String(e.gauge):'');
    if(g===null)return;
    const gr=g.trim();
    if(gr==='')updated.gauge=null;
    else{
      const gauge=C.parseNum(gr);
      if(!C.isNum(gauge)||gauge<0){message('Jauge invalide : indique une valeur positive ou laisse le champ vide.',true);return}
      updated.gauge=gauge;
    }
    const mode=prompt('Chauffage complémentaire : unknown (non renseigné) / none (aucun) / used (utilisé)',e.heatUse??'unknown');
    if(mode===null)return;
    const code=mode.trim().toLowerCase();
    if(!['unknown','none','used'].includes(code)){message('Chauffage complémentaire : indique unknown, none ou used.',true);return}
    updated.heatUse=code;updated.pellet=false;updated.wood=false;
    if(code==='used'){
      updated.pellet=confirm('Poêle à pellets utilisé pendant la période ?');
      updated.wood=confirm('Feu ouvert utilisé pendant la période ?');
      if(!updated.pellet&&!updated.wood){message('Indique au moins un chauffage complémentaire, ou sélectionne « aucun ».',true);return}
    }
  }else if(e.type==='rate'){
    updated.rate=value;
    const meter=prompt('Compteur lors du changement de débit (vide = estimation)',C.isNum(e.meter)?String(e.meter):'');if(meter===null)return;
    updated.meter=meter.trim()===''?null:numberValid(meter,'Compteur au changement de débit');
    if(updated.meter===null&&meter.trim()!=='')return;
    if(updated.meter===null&&!confirm('Sans compteur au changement de débit, la répartition de consommation est estimée. Continuer ?'))return;
  }else{
    updated.liters=value;
    if(e.type==='anchor'){
      const meter=prompt('Compteur à la correction (facultatif ; vide = estimation)',C.isNum(e.meter)?String(e.meter):'');if(meter===null)return;
      updated.meter=meter.trim()===''?null:numberValid(meter,'Compteur à la correction');
      if(updated.meter===null&&meter.trim()!=='')return;
    }
  }
  const next=C.clone(data);next[arr]=next[arr].map(x=>x.id===e.id?updated:x);
  if(commit(next,'Événement corrigé.')&&lastSavedReadingId===e.id)showReadingConfirmation(e.id);
}
// Champs date/heure : valeur réellement à jour à chaque nouvelle saisie,
// mais jamais remplacée automatiquement si l'utilisateur a choisi le passé.
const lastAutomatic={};
function setNow(id){const current=C.localNow(),el=$(id);el.value=current;el.max=current;lastAutomatic[id]=current}
function refreshMax(id){$(id).max=C.localNow()}
for(const id of ['readingDate','anchorDate','deliveryDate','rateDate']){
  setNow(id);
  const el=$(id);el.addEventListener('focus',()=>{
    if(el.value===lastAutomatic[id])setNow(id);else refreshMax(id);
  });
  el.addEventListener('click',()=>refreshMax(id));
  if(id!=='deliveryDate')el.min=data.baseDate;
  const form=el.closest('form');
  form.addEventListener('focusin',()=>{
    if(el.value===lastAutomatic[id])setNow(id);else refreshMax(id);
  });
}
document.querySelectorAll('[data-date]').forEach(b=>b.addEventListener('click',()=>setNow(b.dataset.date)));
function currentHeatUse(){return document.querySelector('input[name="heatUse"]:checked')?.value??'unknown'}
function updateHeatTypes(){
  const used=currentHeatUse()==='used';$('heatTypes').hidden=!used;
  if(!used){$('heatPellet').checked=false;$('heatWood').checked=false}
}
document.querySelectorAll('input[name="heatUse"]').forEach(x=>x.addEventListener('change',updateHeatTypes));
$('readingForm').onsubmit=e=>{
  e.preventDefault();const when=$('readingDate').value;if(!dateFieldValid(when))return;
  const meter=numberValid($('readingMeter').value,'Compteur'),temp=C.parseNum($('readingTemp').value);
  const raw=$('readingGauge').value.trim(),gauge=raw===''?null:C.parseNum(raw);
  if(meter===null||!C.isNum(temp)||(gauge!==null&&(!C.isNum(gauge)||gauge<0))){message('Vérifie le compteur, la consigne et la jauge.',true);return}
  const heatUse=currentHeatUse(),pellet=$('heatPellet').checked,wood=$('heatWood').checked;
  if(heatUse==='used'&&!pellet&&!wood){message('Coche le poêle à pellets et/ou le feu ouvert, ou choisis « aucun ».',true);return}
  const reading={id:uid(),when,meter,temp,gauge,heatUse,pellet:heatUse==='used'&&pellet,wood:heatUse==='used'&&wood,note:$('readingNote').value.trim()};
  const next=C.clone(data);next.readings.push(reading);
  if(commit(next,'Relevé enregistré.')){
    $('readingMeter').value=$('readingGauge').value=$('readingNote').value='';setNow('readingDate');
    $('heatUnknown').checked=true;updateHeatTypes();showReadingConfirmation(reading.id);
  }
};
$('deliveryForm').onsubmit=e=>{
  e.preventDefault();const when=$('deliveryDate').value;if(!dateFieldValid(when))return;
  const liters=numberValid($('deliveryLiters').value,'Livraison',{strict:true});if(liters===null)return;
  const next=C.clone(data);next.deliveries.push({id:uid(),when,liters,note:$('deliveryNote').value.trim()});
  if(commit(next,'Livraison enregistrée.')){$('deliveryLiters').value=$('deliveryNote').value='';setNow('deliveryDate')}
};
$('rateForm').onsubmit=e=>{
  e.preventDefault();const when=$('rateDate').value;if(!dateFieldValid(when))return;
  const rate=numberValid($('rateLiters').value,'Nouveau débit (L/h)',{strict:true});
  if(rate===null)return;
  if(rate>100){message('Débit supérieur à 100 L/h refusé.',true);return}
  const raw=$('rateMeter').value.trim(),meter=raw===''?null:numberValid(raw,'Compteur lors du changement');
  if(raw!==''&&meter===null)return;
  if(meter===null&&!confirm('Aucun compteur renseigné lors du changement de débit : la consommation sur cette période sera estimée. Continuer ?'))return;
  const next=C.clone(data);next.rateChanges.push({id:uid(),when,rate,meter,note:$('rateNote').value.trim()});
  if(commit(next,'Changement de débit enregistré. Les consommations antérieures sont conservées.')){
    $('rateLiters').value=$('rateMeter').value=$('rateNote').value='';setNow('rateDate');
  }
};
$('anchorForm').onsubmit=e=>{
  e.preventDefault();const when=$('anchorDate').value;if(!dateFieldValid(when))return;
  const liters=numberValid($('anchorLiters').value,'Stock de référence');if(liters===null)return;
  const raw=$('anchorMeter').value.trim(),meter=raw===''?null:numberValid(raw,'Compteur à la correction');
  if(raw!==''&&meter===null)return;
  if(raw===''&&!confirm('Aucun compteur à l’instant de la correction : la consommation après cette date sera estimée. Continuer ?'))return;
  const next=C.clone(data);next.anchors.push({id:uid(),when,liters,meter,note:$('anchorNote').value.trim()});next.initialStockProvisional=false;
  if(commit(next,'Stock de référence corrigé.')){$('anchorLiters').value=$('anchorMeter').value=$('anchorNote').value='';setNow('anchorDate')}
};
function tankValue(id,required=false){
  const raw=$(id).value.trim();if(!raw&&!required)return null;
  const n=C.parseNum(raw);if(!C.isNum(n)||n<=0)return NaN;return n;
}
function populateTankForm(){
  const t=data.tank??{};
  for(const [key,id] of [['capacity','tankCapacity'],['length','tankLength'],['width','tankWidth'],['height','tankHeight'],['diameter','tankDiameter']])
    $(id).value=C.isNum(t[key])?String(t[key]):'';
  $('tankShape').value=t.shape??'unknown';
  $('tankFactor').value=String(t.litersPerCm??C.FACTOR);
}
$('tankForm').onsubmit=e=>{
  e.preventDefault();
  const tank={shape:$('tankShape').value};
  for(const [key,id] of [['capacity','tankCapacity'],['length','tankLength'],['width','tankWidth'],['height','tankHeight'],['diameter','tankDiameter']]){
    tank[key]=tankValue(id);
    if(Number.isNaN(tank[key])){message('Dimensions : indique une valeur strictement positive ou laisse le champ vide.',true);return}
  }
  tank.litersPerCm=tankValue('tankFactor',true);
  if(Number.isNaN(tank.litersPerCm)){message('Conversion de jauge : indique un nombre strictement positif.',true);return}
  const next=C.clone(data);next.tank=tank;
  if(commit(next,'Paramètres de cuve enregistrés. Aucune modification du stock théorique.'))populateTankForm();
};
const THEMEKEY=KEY+'-theme';
try{const choice=localStorage.getItem(THEMEKEY);if(['clair','sombre','bronze','technique'].includes(choice))$('themeSelect').value=choice;}catch(_){}
document.body.dataset.theme=$('themeSelect').value;
$('themeSelect').addEventListener('change',()=>{
  document.body.dataset.theme=$('themeSelect').value;
  try{localStorage.setItem(THEMEKEY,$('themeSelect').value)}catch(_){}
  message('Thème modifié sur cet appareil.');
});
function download(name,content,type){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
const cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
$('csvBtn').onclick=()=>{
  const rs=C.readings(data);let prev=null;
  const table=[['Type','Date','Compteur h','Fonctionnement h','Consommation L','Stock théorique L','Jauge cm','Jauge L','Consigne °C','Température du jour °C','Moyenne période °C','Livraison L','Correction stock L','Remarque','Débit actif L/h','Débit modifié L/h','Compteur au changement h','Chauffage complémentaire','Poêle à pellets','Feu ouvert']];
  for(const e of C.events(data)){
    if(e.type==='reading'){
      const diff=e.meter-(prev?.meter??data.baseMeter),avg=C.periodAvg(data,prev?.when,e.when),s=C.stockAt(data,e.when);
      const fuel=C.fuelBetween(data,prev?.when??data.baseDate,prev?.meter??data.baseMeter,e.when,e.meter);
      table.push(['Relevé',e.when,fmt(e.meter),fmt(diff),fmt(fuel.liters,2),fmt(s.liters,2),C.isNum(e.gauge)?fmt(e.gauge):'',C.isNum(e.gauge)?fmt(e.gauge*C.FACTOR):'',fmt(e.temp),C.isNum(C.dayAvg(data,e.when))?fmt(C.dayAvg(data,e.when)):'',C.isNum(avg)?fmt(avg):'','','',e.note||'',fmt(C.rateAt(data,e.when),2),'','',C.heatLabel(e),e.heatUse==='used'&&e.pellet?'Oui':e.heatUse==='unknown'?'':'Non',e.heatUse==='used'&&e.wood?'Oui':e.heatUse==='unknown'?'':'Non']);prev=e;
    }else table.push([e.type==='delivery'?'Livraison':e.type==='rate'?'Changement débit':'Correction',e.when,'','','',e.when<data.baseDate?'':fmt(C.stockAt(data,e.when).liters,2),'','','','','',e.type==='delivery'?fmt(e.liters):'',e.type==='anchor'?fmt(e.liters):'',e.note||'',fmt(C.rateAt(data,e.when),2),e.type==='rate'?fmt(e.rate,2):'',e.type==='rate'&&C.isNum(e.meter)?fmt(e.meter):'','','','']);
  }
  download('ma-chaudiere-V03-etape2-TEST.csv','\ufeff'+table.map(r=>r.map(cell).join(';')).join('\r\n'),'text/csv;charset=utf-8');
  message('Export de test CSV demandé. Le nommage horodaté complet sera intégré à l’étape 3.');
};
$('backupBtn').onclick=()=>{download('ma-chaudiere-V03-etape2-TEST.json',JSON.stringify(data,null,2),'application/json');message('Sauvegarde JSON de test téléchargée.')};
$('restoreBtn').onclick=()=>$('restoreFile').click();
$('restoreFile').onchange=async e=>{
  try{
    const f=e.target.files[0];if(!f)return;
    const candidate=JSON.parse(await f.text()),reason=C.validate(candidate);
    if(reason)throw Error(reason);
    if(!confirm('Importer cette sauvegarde dans la V0.3 DE TEST ? Le contenu actuel de la V0.3 de test sera remplacé. La V0.2 ne sera pas modifiée.'))return;
    // Sauvegarde supplémentaire téléchargeable avant toute restauration ;
    // une copie est également conservée dans le navigateur.
    download('ma-chaudiere-etat-avant-restauration-V03-TEST.json',JSON.stringify(data,null,2),'application/json');
    if(commit(C.normalize(candidate),'Sauvegarde importée dans la V0.3 de test. Copie de sécurité précédente créée.',true)){
      populateTankForm();lastSavedReadingId=null;$('readingConfirmation').hidden=true;
    }
  }catch(err){message('Restauration refusée, aucune donnée modifiée : '+err.message,true)}
  finally{e.target.value=''}
};
$('weatherBtn').onclick=async()=>{
  const rs=C.readings(data);if(!rs.length){message('Ajoute un relevé avant de demander la météo.',true);return}
  const first=rs[0].when.slice(0,10),limit=new Date();limit.setDate(limit.getDate()-2);
  const end=rs.at(-1).when.slice(0,10)<limit.toISOString().slice(0,10)?rs.at(-1).when.slice(0,10):limit.toISOString().slice(0,10);
  if(first>end){$('weatherStatus').textContent='Les données historiques ne sont pas encore disponibles pour ces dates.';return}
  try{
    $('weatherStatus').textContent='Téléchargement météo…';
    const url=`https://archive-api.open-meteo.com/v1/archive?latitude=50.43&longitude=3.83&start_date=${first}&end_date=${end}&daily=temperature_2m_mean&timezone=Europe%2FBrussels`;
    const res=await fetch(url);if(!res.ok)throw Error('HTTP '+res.status);const json=await res.json();
    if(!Array.isArray(json.daily?.time)||!Array.isArray(json.daily?.temperature_2m_mean))throw Error('Réponse incomplète');
    const next=C.clone(data);
    json.daily.time.forEach((day,i)=>{const t=json.daily.temperature_2m_mean[i];if(C.isNum(t))next.weather[day]=t});
    if(commit(next,'Météo mise à jour.'))$('weatherStatus').textContent='Météo historique mise à jour.';
  }catch(err){$('weatherStatus').textContent='Météo indisponible : '+err.message}
};
// La suppression d'un événement s'effectue désormais depuis l'Historique.
// Le bouton global d'annulation a été retiré pour éviter le rétablissement involontaire d'une opération.
populateTankForm();updateHeatTypes();render();
if(!storageReady)message('Attention : données de test illisibles ou stockage indisponible. Ne modifie rien avant une vérification.',true);
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
