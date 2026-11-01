/* Calculs et validation — V0.3 étape 1. Aucune dépendance au navigateur. */
(function(root, factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.ChaudiereCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const RATE=4.2, FACTOR=20;
  const isNum=x=>typeof x==='number'&&Number.isFinite(x);
  const parseNum=x=>{const s=String(x??'').trim().replace(/\s/g,'').replace(',','.');return s===''?NaN:Number(s)};
  const dateOk=s=>{
    if(typeof s!=='string'|| !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s))return false;
    const d=new Date(s);
    if(!Number.isFinite(d.getTime()))return false;
    const p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`===s;
  };
  const localNow=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`};
  const future=s=>!dateOk(s)||new Date(s).getTime()>Date.now();
  const initial=()=>({version:3,baseDate:'2026-10-27T20:00',baseMeter:794,baseStock:920,baseSetpoint:19,readings:[],deliveries:[],anchors:[],weather:{},initialStockProvisional:true});
  const sortByDate=xs=>[...xs].sort((a,b)=>a.when.localeCompare(b.when)||String(a.id).localeCompare(String(b.id)));
  const readings=d=>sortByDate(d.readings);
  const events=d=>[...d.readings.map(x=>({...x,type:'reading'})),...d.deliveries.map(x=>({...x,type:'delivery'})),...d.anchors.map(x=>({...x,type:'anchor'}))]
    .sort((a,b)=>a.when.localeCompare(b.when)||({delivery:0,anchor:1,reading:2}[a.type]-{delivery:0,anchor:1,reading:2}[b.type])||String(a.id).localeCompare(String(b.id)));
  const checkpoints=d=>sortByDate([{when:d.baseDate,meter:d.baseMeter,id:'__base__'},
    ...d.readings.map(r=>({when:r.when,meter:r.meter,id:r.id})),
    ...d.anchors.filter(a=>isNum(a.meter)).map(a=>({when:a.when,meter:a.meter,id:a.id}))]);
  // Compteur estimé à un instant de correction sans relevé associé.
  // Si deux compteurs encadrent la date, interpolation TEMPORELLE (approximation).
  // Sinon dernier compteur connu (également approximatif).
  const meterAt=(d,when)=>{
    const cp=checkpoints(d);let before=cp[0],after=null;
    for(const x of cp){if(x.when<=when)before=x;else{after=x;break;}}
    if(before.when===when)return {value:before.meter,estimated:false};
    if(!after)return {value:before.meter,estimated:true};
    const a=new Date(before.when).getTime(),b=new Date(after.when).getTime(),t=new Date(when).getTime();
    return {value:before.meter+(after.meter-before.meter)*(t-a)/(b-a),estimated:true};
  };
  const meterLatestAt=(d,when)=>{
    const x=checkpoints(d).filter(r=>r.when<=when).at(-1);
    return x?x.meter:d.baseMeter;
  };
  const stockAt=(d,when)=>{
    const anchors=sortByDate(d.anchors.filter(a=>a.when<=when));
    const anchor=anchors.at(-1);
    const start=anchor?anchor.when:d.baseDate;
    const stock=anchor?anchor.liters:d.baseStock;
    const baselineMeter=anchor?(isNum(anchor.meter)?anchor.meter:meterAt(d,anchor.when).value):d.baseMeter;
    const lastMeter=meterLatestAt(d,when);
    // Ignore les livraisons antérieures au point de départ, et celles au même
    // instant qu'une correction (le stock corrigé les englobe).
    const delivered=d.deliveries.filter(x=>x.when>start&&x.when<=when).reduce((sum,x)=>sum+x.liters,0);
    // Une correction future par rapport au dernier compteur mesuré ne doit pas
    // provoquer de consommation négative fictive.
    const used=Math.max(0,lastMeter-baselineMeter)*RATE;
    return {liters:stock-used+delivered,estimated:Boolean(anchor&&!isNum(anchor.meter)&&meterAt(d,anchor.when).estimated),anchorId:anchor?.id||null,used,delivered};
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
    if(!Array.isArray(d.readings)||!Array.isArray(d.deliveries)||!Array.isArray(d.anchors))return 'Listes de données invalides.';
    if(!d.weather||typeof d.weather!=='object'||Array.isArray(d.weather))return 'Données météo invalides.';
    const ids=new Set();
    for(const [kind,items] of [['relevé',d.readings],['livraison',d.deliveries],['correction',d.anchors]]){
      for(const x of items){
        if(!x||typeof x!=='object'||typeof x.id!=='string'||!x.id.trim()||ids.has(x.id))return `Identifiant manquant ou répété (${kind}).`;
        ids.add(x.id);
        if(!dateOk(x.when)||future(x.when))return `Date invalide ou future (${kind}).`;
        if(kind!=='livraison'&&x.when<d.baseDate)return `${kind} antérieur au compteur initial.`;
        if(kind==='relevé'&&(!isNum(x.meter)||x.meter<d.baseMeter||!isNum(x.temp)||!(x.gauge==null||isNum(x.gauge)&&x.gauge>=0)))return 'Valeurs de relevé invalides.';
        if(kind!=='relevé'&&(!isNum(x.liters)||x.liters<0||(kind==='livraison'&&x.liters===0)))return `Valeur de ${kind} invalide.`;
        if(kind==='correction'&&x.meter!=null&&(!isNum(x.meter)||x.meter<d.baseMeter))return 'Compteur lors de la correction invalide.';
      }
    }
    const rs=readings(d);
    if(rs.some((r,i)=>i>0&&(r.when===rs[i-1].when||r.meter<rs[i-1].meter)))return 'Compteurs non chronologiques ou dates de relevés en double.';
    const a=sortByDate(d.anchors);
    if(a.some((r,i)=>i>0&&r.when===a[i-1].when))return 'Deux corrections de stock à la même date/heure.';
    const cp=checkpoints(d);
    if(cp.some((r,i)=>i>0&&r.meter<cp[i-1].meter-0.00000001))return 'Compteur de correction incohérent avec les relevés.';
    if(cp.some((r,i)=>i>0&&r.when===cp[i-1].when&&Math.abs(r.meter-cp[i-1].meter)>0.00000001))return 'Valeurs de compteur contradictoires à la même heure.';
    return null;
  };
  const clone=d=>JSON.parse(JSON.stringify(d));
  const normalize=d=>({...clone(d),version:3,anchors:d.anchors.map(a=>({...a,meter:isNum(a.meter)?a.meter:null}))});
  return {RATE,FACTOR,isNum,parseNum,dateOk,localNow,future,initial,readings,events,meterAt,meterLatestAt,stockAt,dayAvg,periodAvg,validate,clone,normalize};
});
