/* Ma Chaudière — moteur de calcul V0.3 / Étape 1 (compatible avec JSON V0.2). */
(function(root, factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.ChaudiereCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const RATE=4.2, FACTOR=20; // Valeurs par défaut, jamais appliquées rétroactivement aux changements.
  const isNum=x=>typeof x==='number'&&Number.isFinite(x);
  const parseNum=x=>{const s=String(x??'').trim().replace(/\s/g,'').replace(',','.');return s===''?NaN:Number(s)};
  const dateOk=s=>{
    if(typeof s!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(s))return false;
    const d=new Date(s);if(!Number.isFinite(d.getTime()))return false;
    const p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`===s;
  };
  const localNow=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`};
  const future=s=>!dateOk(s)||new Date(s).getTime()>Date.now();
  const initial=()=>({version:3,baseDate:'2026-10-27T20:00',baseMeter:794,baseStock:920,baseSetpoint:19,
    baseRate:RATE,rateChanges:[],readings:[],deliveries:[],anchors:[],weather:{},initialStockProvisional:true});
  const clone=d=>JSON.parse(JSON.stringify(d));
  const normalize=d=>({...clone(d),version:3,baseRate:d.baseRate??RATE,
    rateChanges:(d.rateChanges??[]).map(r=>({...r,meter:isNum(r.meter)?r.meter:null})),
    anchors:d.anchors.map(a=>({...a,meter:isNum(a.meter)?a.meter:null}))});
  const sortByDate=xs=>[...xs].sort((a,b)=>a.when.localeCompare(b.when)||String(a.id).localeCompare(String(b.id)));
  const readings=d=>sortByDate(d.readings);
  const rateChanges=d=>sortByDate(d.rateChanges??[]);
  const events=d=>[
    ...d.readings.map(x=>({...x,type:'reading'})),
    ...d.deliveries.map(x=>({...x,type:'delivery'})),
    ...d.anchors.map(x=>({...x,type:'anchor'})),
    ...rateChanges(d).map(x=>({...x,type:'rate'}))
  ].sort((a,b)=>a.when.localeCompare(b.when)||({delivery:0,anchor:1,rate:2,reading:3}[a.type]-{delivery:0,anchor:1,rate:2,reading:3}[b.type])||String(a.id).localeCompare(String(b.id)));
  const checkpoints=d=>sortByDate([
    {when:d.baseDate,meter:d.baseMeter,id:'__base__'},
    ...d.readings.map(r=>({when:r.when,meter:r.meter,id:r.id})),
    ...d.anchors.filter(a=>isNum(a.meter)).map(a=>({when:a.when,meter:a.meter,id:a.id})),
    ...rateChanges(d).filter(a=>isNum(a.meter)).map(a=>({when:a.when,meter:a.meter,id:a.id}))
  ]);
  // Estimateur : interpolation sur le TEMPS et non mesure du brûleur.
  const meterAt=(d,when)=>{
    const cp=checkpoints(d);let before=cp[0],after=null;
    for(const x of cp){if(x.when<=when)before=x;else{after=x;break}}
    if(before.when===when)return {value:before.meter,estimated:false};
    if(!after)return {value:before.meter,estimated:true};
    const a=new Date(before.when).getTime(),b=new Date(after.when).getTime(),t=new Date(when).getTime();
    return {value:before.meter+(after.meter-before.meter)*(t-a)/(b-a),estimated:true};
  };
  const meterLatestAt=(d,when)=>{
    const r=checkpoints(d).filter(x=>x.when<=when).at(-1);
    return r?r.meter:d.baseMeter;
  };
  const rateAt=(d,when)=>rateChanges(d).filter(r=>r.when<=when).at(-1)?.rate??(d.baseRate??RATE);
  /* Consommation sur une période du compteur : en intégrant chaque changement
     de débit à son compteur exact, ou à un compteur explicitement ESTIMÉ. */
  const fuelBetween=(d,startWhen,startMeter,endWhen,endMeter)=>{
    let cursor=startMeter,rate=rateAt(d,startWhen),liters=0,estimated=false;
    for(const change of rateChanges(d).filter(r=>r.when>startWhen&&r.when<=endWhen)){
      const inferred=isNum(change.meter)?{value:change.meter,estimated:false}:meterAt(d,change.when);
      const cut=Math.max(cursor,Math.min(endMeter,inferred.value));
      liters+=Math.max(0,cut-cursor)*rate;cursor=cut;rate=change.rate;
      if(!isNum(change.meter)&&inferred.estimated)estimated=true;
    }
    liters+=Math.max(0,endMeter-cursor)*rate;
    return {liters,estimated};
  };
  const cumulative=(d,when)=>fuelBetween(d,d.baseDate,d.baseMeter,when,meterLatestAt(d,when));
  const stockAt=(d,when)=>{
    const anchor=sortByDate(d.anchors.filter(a=>a.when<=when)).at(-1);
    const start=anchor?.when??d.baseDate,stock=anchor?.liters??d.baseStock;
    const marker=anchor?(isNum(anchor.meter)?{value:anchor.meter,estimated:false}:meterAt(d,anchor.when)):{value:d.baseMeter,estimated:false};
    const used=fuelBetween(d,start,marker.value,when,meterLatestAt(d,when));
    const delivered=d.deliveries.filter(x=>x.when>start&&x.when<=when).reduce((n,x)=>n+x.liters,0);
    return {liters:stock-used.liters+delivered,estimated:marker.estimated||used.estimated,anchorId:anchor?.id||null,used:used.liters,delivered};
  };
  const dayAvg=(d,when)=>d.weather[when.slice(0,10)];
  const periodAvg=(d,a,b)=>{
    if(!a)return null;
    const day=new Date(a.slice(0,10)+'T12:00:00Z'),end=new Date(b.slice(0,10)+'T12:00:00Z'),vals=[];
    for(let i=0;day<=end&&i<3650;i++,day.setUTCDate(day.getUTCDate()+1)){
      const v=d.weather[day.toISOString().slice(0,10)];if(!isNum(v))return null;vals.push(v);
    }
    return vals.length?vals.reduce((s,x)=>s+x,0)/vals.length:null;
  };
  const validate=d=>{
    if(!d||typeof d!=='object'||(d.version!==2&&d.version!==3))return 'Format JSON incompatible (version 2 ou 3 attendue).';
    if(!dateOk(d.baseDate)||future(d.baseDate))return 'Date de référence invalide ou future.';
    if(!isNum(d.baseMeter)||d.baseMeter<0||!isNum(d.baseStock)||d.baseStock<0||!isNum(d.baseSetpoint))return 'Paramètres de référence invalides.';
    if(d.baseRate!==undefined&&(!isNum(d.baseRate)||d.baseRate<=0||d.baseRate>100))return 'Débit initial invalide.';
    if(!Array.isArray(d.readings)||!Array.isArray(d.deliveries)||!Array.isArray(d.anchors)||
       (d.rateChanges!==undefined&&!Array.isArray(d.rateChanges)))return 'Listes de données invalides.';
    if(!d.weather||typeof d.weather!=='object'||Array.isArray(d.weather))return 'Données météo invalides.';
    const ids=new Set();
    for(const [kind,items] of [['relevé',d.readings],['livraison',d.deliveries],['correction',d.anchors],['débit',d.rateChanges??[]]]){
      for(const x of items){
        if(!x||typeof x!=='object'||typeof x.id!=='string'||!x.id.trim()||ids.has(x.id))return `Identifiant manquant ou répété (${kind}).`;
        ids.add(x.id);
        if(!dateOk(x.when)||future(x.when))return `Date invalide ou future (${kind}).`;
        if(kind!=='livraison'&&x.when<d.baseDate)return `${kind} antérieur au compteur initial.`;
        if(kind==='relevé'&&(!isNum(x.meter)||x.meter<d.baseMeter||!isNum(x.temp)||!(x.gauge==null||(isNum(x.gauge)&&x.gauge>=0))))return 'Valeurs de relevé invalides.';
        if((kind==='correction'||kind==='livraison')&&(!isNum(x.liters)||x.liters<0||(kind==='livraison'&&x.liters===0)))return `Valeur de ${kind} invalide.`;
        if((kind==='correction'||kind==='débit')&&x.meter!=null&&(!isNum(x.meter)||x.meter<d.baseMeter))return `Compteur lors du ${kind} invalide.`;
        if(kind==='débit'&&(!isNum(x.rate)||x.rate<=0||x.rate>100))return 'Nouveau débit invalide (strictement positif).';
      }
    }
    const rs=readings(d);
    if(rs.some((r,i)=>i>0&&(r.when===rs[i-1].when||r.meter<rs[i-1].meter)))return 'Compteurs non chronologiques ou dates de relevés en double.';
    for(const [kind,items] of [['corrections',sortByDate(d.anchors)],['changements de débit',rateChanges(d)]]){
      if(items.some((r,i)=>i>0&&r.when===items[i-1].when))return `Deux ${kind} à la même date/heure.`;
    }
    const cp=checkpoints(d);
    if(cp.some((r,i)=>i>0&&r.meter<cp[i-1].meter-1e-8))return 'Compteur de correction/débit incohérent avec les relevés.';
    if(cp.some((r,i)=>i>0&&r.when===cp[i-1].when&&Math.abs(r.meter-cp[i-1].meter)>1e-8))return 'Valeurs de compteur contradictoires à la même heure.';
    return null;
  };
  return {RATE,FACTOR,isNum,parseNum,dateOk,localNow,future,initial,normalize,clone,readings,events,rateChanges,rateAt,meterAt,meterLatestAt,stockAt,cumulative,fuelBetween,dayAvg,periodAvg,validate};
});
