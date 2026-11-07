/* Ma Chaudière — V0.3 étape 1 (bêta indépendante de la V0.2 publiée) */
'use strict';
const C=globalThis.ChaudiereCore;
const KEY='chaudiere-hornu-v03-test-etape1',PREVIOUS=KEY+'-avant-derniere-modification';
const $=id=>document.getElementById(id),fmt=(x,n=1)=>C.isNum(x)?x.toLocaleString('fr-BE',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
const uid=()=>globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2);
let data=C.initial();
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
  const approximate=data.anchors.some(a=>a.meter==null&&C.meterAt(data,a.when).estimated)||C.rateChanges(data).some(a=>a.meter==null&&C.meterAt(data,a.when).estimated);
  $('calcNotice').textContent=approximate?'⚠ Un compteur manque lors d’une correction ou d’un changement de débit : les calculs concernés sont approximatifs.':'Consommations calculées selon l’historique des débits et les compteurs renseignés.';
  $('calcNotice').className='muted tiny'+(approximate?' status-warning':'');
  const list=$('history');list.replaceChildren();const es=C.events(data).reverse();
  if(!es.length){const p=document.createElement('p');p.className='muted';p.textContent='Aucun événement enregistré.';list.append(p)}
  for(const e of es){
    const item=document.createElement('div');item.className='event'+((e.type==='anchor'||e.type==='rate')&&e.meter==null?' event-uncertain':'');
    const head=document.createElement('div');head.className='event-head';const strong=document.createElement('strong');
    strong.textContent=({reading:'Relevé',delivery:'Livraison',anchor:'Correction du stock',rate:'Changement de débit'})[e.type]+' · '+e.when.replace('T',' ');
    head.append(strong);item.append(head);const grid=document.createElement('div');grid.className='data';
    if(e.type==='reading'){
      const prev=rs.filter(r=>r.when<e.when).at(-1),diff=e.meter-(prev?.meter??data.baseMeter),s=C.stockAt(data,e.when);
      const portion=C.fuelBetween(data,prev?.when??data.baseDate,prev?.meter??data.baseMeter,e.when,e.meter);
      add(grid,'Compteur',fmt(e.meter)+' h');add(grid,'Depuis relevé précédent',fmt(diff)+' h');
      add(grid,'Consommation',fmt(portion.liters,2)+' L'+(portion.estimated?' (estimée)':''));add(grid,'Stock théorique à la date',fmt(s.liters,1)+' L'+(s.estimated?' (estimé)':''));
      add(grid,'Consigne',fmt(e.temp)+' °C');
      if(C.isNum(e.gauge)){
        add(grid,'Jauge',fmt(e.gauge)+' cm / ≈ '+fmt(e.gauge*C.FACTOR,0)+' L');
        add(grid,'Écart jauge – calcul',fmt(e.gauge*C.FACTOR-s.liters,1)+' L');
      }
      const day=C.dayAvg(data,e.when),avg=C.periodAvg(data,prev?.when,e.when);
      add(grid,'Température extérieure du jour',C.isNum(day)?fmt(day)+' °C':'—');
      add(grid,'Moyenne météo entre relevés',C.isNum(avg)?fmt(avg)+' °C':'—');
    }else if(e.type==='delivery'){
      add(grid,'Quantité livrée','+'+fmt(e.liters,0)+' L');
      if(e.when<=data.baseDate)add(grid,'Prise en compte','Avant le stock initial : non ajoutée une seconde fois');
      else add(grid,'Stock après livraison',fmt(C.stockAt(data,e.when).liters,1)+' L');
    }else if(e.type==='rate'){
      add(grid,'Nouveau débit',fmt(e.rate,2)+' L/h');
      add(grid,'Ancien débit',fmt(C.rateChanges(data).filter(r=>r.when<e.when).at(-1)?.rate??(data.baseRate??C.RATE),2)+' L/h');
      add(grid,'Compteur au réglage',C.isNum(e.meter)?fmt(e.meter)+' h (mesuré)':'Non relevé : estimation de consommation');
    }else{
      add(grid,'Nouveau stock de référence',fmt(e.liters,1)+' L');
      if(C.isNum(e.meter))add(grid,'Compteur à la correction',fmt(e.meter)+' h (mesuré)');
      else add(grid,'Compteur à la correction','Non relevé : estimation nécessaire');
    }
    if(e.note)add(grid,'Remarque',e.note);
    item.append(grid);
    const actions=document.createElement('div');actions.className='actions';actions.style.marginTop='12px';
    const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='Modifier';edit.onclick=()=>editEvent(e);
    const del=document.createElement('button');del.type='button';del.className='danger';del.textContent='Supprimer';
    del.onclick=()=>{if(confirm('Supprimer cet événement ? Les calculs seront recalculés.')){
      const arr=e.type==='reading'?'readings':e.type==='delivery'?'deliveries':e.type==='rate'?'rateChanges':'anchors',next=C.clone(data);
      next[arr]=next[arr].filter(x=>x.id!==e.id);commit(next,'Événement supprimé (état précédent conservé localement).');
    }};
    actions.append(edit,del);item.append(actions);list.append(item);
  }
}
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
  commit(next,'Événement corrigé.');
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
$('readingForm').onsubmit=e=>{
  e.preventDefault();const when=$('readingDate').value;if(!dateFieldValid(when))return;
  const meter=numberValid($('readingMeter').value,'Compteur'),temp=C.parseNum($('readingTemp').value);
  const raw=$('readingGauge').value.trim(),gauge=raw===''?null:C.parseNum(raw);
  if(meter===null||!C.isNum(temp)||(gauge!==null&&(!C.isNum(gauge)||gauge<0))){message('Vérifie le compteur, la consigne et la jauge.',true);return}
  const next=C.clone(data);next.readings.push({id:uid(),when,meter,temp,gauge,note:$('readingNote').value.trim()});
  if(commit(next,'Relevé enregistré.')){$('readingMeter').value=$('readingGauge').value=$('readingNote').value='';setNow('readingDate')}
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
function download(name,content,type){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
const cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
$('csvBtn').onclick=()=>{
  const rs=C.readings(data);let prev=null;
  const table=[['Type','Date','Compteur h','Fonctionnement h','Consommation L','Stock théorique L','Jauge cm','Jauge L','Consigne °C','Température du jour °C','Moyenne période °C','Livraison L','Correction stock L','Remarque','Débit actif L/h','Débit modifié L/h','Compteur au changement h']];
  for(const e of C.events(data)){
    if(e.type==='reading'){
      const diff=e.meter-(prev?.meter??data.baseMeter),avg=C.periodAvg(data,prev?.when,e.when),s=C.stockAt(data,e.when);
      const fuel=C.fuelBetween(data,prev?.when??data.baseDate,prev?.meter??data.baseMeter,e.when,e.meter);
      table.push(['Relevé',e.when,fmt(e.meter),fmt(diff),fmt(fuel.liters,2),fmt(s.liters,2),C.isNum(e.gauge)?fmt(e.gauge):'',C.isNum(e.gauge)?fmt(e.gauge*C.FACTOR):'',fmt(e.temp),C.isNum(C.dayAvg(data,e.when))?fmt(C.dayAvg(data,e.when)):'',C.isNum(avg)?fmt(avg):'','','',e.note||'',fmt(C.rateAt(data,e.when),2),'','']);prev=e;
    }else table.push([e.type==='delivery'?'Livraison':e.type==='rate'?'Changement débit':'Correction',e.when,'','','',e.when<data.baseDate?'':fmt(C.stockAt(data,e.when).liters,2),'','','','','',e.type==='delivery'?fmt(e.liters):'',e.type==='anchor'?fmt(e.liters):'',e.note||'',fmt(C.rateAt(data,e.when),2),e.type==='rate'?fmt(e.rate,2):'',e.type==='rate'&&C.isNum(e.meter)?fmt(e.meter):'']);
  }
  download('ma-chaudiere-V03-etape1-TEST.csv','\ufeff'+table.map(r=>r.map(cell).join(';')).join('\r\n'),'text/csv;charset=utf-8');
  message('Export de test CSV demandé. Le nommage horodaté complet sera intégré à l’étape 3.');
};
$('backupBtn').onclick=()=>{download('ma-chaudiere-V03-etape1-TEST.json',JSON.stringify(data,null,2),'application/json');message('Sauvegarde JSON de test téléchargée.')};
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
    commit(C.normalize(candidate),'Sauvegarde importée dans la V0.3 de test. Copie de sécurité précédente créée.',true);
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
// Restaurer le précédent état V0.3 de test si une action a été faite par erreur.
const rollback=document.createElement('button');rollback.type='button';rollback.className='secondary';rollback.textContent='Annuler la dernière modification (test)';
rollback.onclick=()=>{
  try{
    const raw=localStorage.getItem(PREVIOUS);if(!raw){message('Aucun état précédent à restaurer.',true);return}
    const candidate=JSON.parse(raw),reason=C.validate(candidate);if(reason)throw Error(reason);
    if(!confirm('Revenir à l’état avant la dernière modification enregistrée dans la V0.3 de test ?'))return;
    // Faire l'échange des deux copies pour permettre un second retour arrière.
    const current=localStorage.getItem(KEY);
    localStorage.setItem(KEY,raw);
    if(current)localStorage.setItem(PREVIOUS,current);
    data=C.normalize(candidate);render();message('État précédent restauré (V0.3 de test uniquement).');
  }catch(err){message('Impossible de rétablir l’état précédent : '+err.message,true)}
};
$('restoreBtn').insertAdjacentElement('afterend',rollback);
render();
if(!storageReady)message('Attention : anciennes données de test illisibles ou stockage indisponible. Ne modifie rien avant une vérification.',true);
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
