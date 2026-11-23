const Store=(()=>{
  const uid=()=>crypto.randomUUID();
  const blank=()=>({schema:2,owner:uid(),meals:[],personal:[],favorites:[],settings:{goal:2000,activity:{},lunch:11,dinner:17}});
  const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  const str=(s,max=2000)=>typeof s==='string'&&s.length<=max;
  function row(r){
    return Array.isArray(r)&&r.length===16&&[0,1,2,3,11,12,13,14,15].every(i=>str(r[i]??''))&&
      [0,1,3].every(i=>typeof r[i]==='string'&&r[i].trim())&&r.slice(4,11).every(n=>n===null||finite(n));
  }
  function unique(list){return new Set(list).size===list.length}
  function optionalMap(value, validateValue){
    return value===undefined||Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([key,item])=>str(key,100)&&validateValue(item)));
  }
  function validPlace(place){
    return Boolean(place&&str(place.category,20)&&str(place.image,120000)&&
      (place.image===''||/^data:image\/webp;base64,[a-z0-9+/=]+$/i.test(place.image)));
  }
  function validate(s){
    const settings=s?.settings;
    if(s?.schema!==2||!str(s.owner,100)||!s.owner||!settings||!finite(settings.goal)||settings.goal<=0||
      !Number.isInteger(settings.lunch)||!Number.isInteger(settings.dinner)||settings.lunch<1||settings.dinner>23||settings.lunch>=settings.dinner||
      !settings.activity||Array.isArray(settings.activity)||typeof settings.activity!=='object'||!Object.entries(settings.activity).every(([k,v])=>/^\d{4}-\d\d-\d\d$/.test(k)&&finite(v))||
      !optionalMap(settings.places,validPlace)||!optionalMap(settings.favoriteRows,row)||
      (settings.recentPlaces!==undefined&&(!Array.isArray(settings.recentPlaces)||!settings.recentPlaces.every(name=>str(name,100))))||
      !Array.isArray(s.favorites)||!s.favorites.every(f=>str(f,100))||!Array.isArray(s.personal)||!s.personal.every(r=>row(r)&&r[0].startsWith('personal:'))||
      !unique(s.personal.map(r=>r[0]))||!Array.isArray(s.meals)||!s.meals.every(m=>m&&str(m.id,100)&&m.id&&Number.isFinite(Date.parse(m.at))&&
        ['아침','점심','저녁'].includes(m.type)&&str(m.version,100)&&Array.isArray(m.items)&&m.items.length&&
        m.items.every(i=>row(i.row)&&str(i.group??'',100)&&finite(i.qty)&&i.qty>0&&i.qty<=100))||!unique(s.meals.map(m=>m.id)))throw Error('백업 형식이나 영양값을 확인해 주세요.');
    return s;
  }
  function migrate(s){
    if(s.schema===1)s={...s,schema:2,favorites:s.favorites??[],settings:{activity:{},lunch:11,dinner:17,...s.settings}};
    return validate(s);
  }
  let db;
  async function open(){
    if(db)return db;
    db=await new Promise((ok,no)=>{const r=indexedDB.open('gangyebap',1);
      r.onupgradeneeded=()=>r.result.createObjectStore('profile');
      r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
    return db;
  }
  async function update(change){
    const conn=await open();
    return new Promise((ok,no)=>{
      const tx=conn.transaction('profile','readwrite'),table=tx.objectStore('profile'),req=table.get('active');let next,error;
      req.onsuccess=()=>{try{
        const old=req.result?migrate(req.result):blank();
        next=change(old)||old;validate(next);table.put(next,'active');
        if(next!==old)table.put(old,'beforeRestore');
      }catch(e){error=e;tx.abort()}};
      tx.oncomplete=()=>ok(next);tx.onabort=()=>no(error||tx.error||Error('저장하지 못했습니다.'));
    });
  }
  async function previous(){const conn=await open();return new Promise((ok,no)=>{const r=conn.transaction('profile').objectStore('profile').get('beforeRestore');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
  return {uid,blank,update,migrate,validate,previous};
})();
