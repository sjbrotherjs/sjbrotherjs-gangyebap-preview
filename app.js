'use strict';
const $=id=>document.getElementById(id), dialog=document.querySelector('dialog');
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('ko-KR',{maximumFractionDigits:1});
const today=(d=new Date())=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const kcal=(row,qty=1)=>row[4]==null?'열량 미확인':fmt(row[4]*qty)+' kcal';
const norm=s=>String(s??'').normalize('NFKC').replace(/\s/g,'').toLowerCase();
const cardsById=new Map(catalog.cards.map(card=>[card.id,card]));
const categories=[
  ['korean','한식','🍚','category-korean'],['burger','패스트푸드','🍔','category-burger'],['pizza','피자','🍕','category-pizza'],
  ['chicken','치킨','🍗','category-chicken'],['cafe','카페','☕','category-cafe'],['chinese','중식','🥡','category-chinese'],
  ['japanese','일식','🍣','category-japanese'],['quick','간편식','🥪','category-quick'],['sweet','디저트','🍰','category-sweet'],['all','더보기','＋'],
  ['snack','분식','🍢','tteokbokki'],['other','기타','🍽️']
].map(([id,label,emoji,image])=>({id,label,emoji,image}));
const brandGroups={
  burger:['맥도날드','버거킹','맘스터치','롯데리아','쉐이크쉑','파이브가이즈'],
  pizza:['도미노피자','피자헛','미스터피자','파파존스','청년피자','반올림피자'],
  chicken:['KFC','BBQ','교촌치킨','BHC','굽네치킨','처갓집양념치킨'],
  cafe:['스타벅스','투썸플레이스','메가MGC커피','컴포즈커피','이디야커피','빽다방'],
  korean:['한솥도시락','본죽','명륜진사갈비'],japanese:['쿠우쿠우'],quick:['서브웨이','한솥도시락'],
  sweet:['배스킨라빈스','던킨','투썸플레이스'],snack:['김밥천국'],other:['애슐리퀸즈']
};
let state, timer, searchToken=0, libraryMode='often', libraryLimit=8;
let categoriesExpanded=false;
let draft={id:Store.uid(),items:[]}, savingMeal=false, draftCollapsed=false;
const draftKey='gangyebap.mealDraft';
const sideCache=new Map();
let relatedVersion=0;

function notify(message){
  (dialog.open?dialog:document.body).append($('status'));
  $('status').textContent=message;
  clearTimeout(timer);
  timer=setTimeout(()=>$('status').textContent='',3500);
}
function modal(title,body){
  $('dialogTitle').textContent=title;
  $('panel').innerHTML=body;
  if(!dialog.open)dialog.showModal();
  dialog.scrollTop=0;
}
dialog.addEventListener('close',()=>document.body.append($('status')));
const mealType=(settings,hour=new Date().getHours())=>hour<settings.lunch?'아침':hour<settings.dinner?'점심':'저녁';
const dayMeals=(date=today())=>state.meals.filter(m=>today(new Date(m.at))===date);
function total(items){
  const {values,missing}=Nutrition.totals(items);
  return fmt(values[0])+' kcal'+(missing[0]?' + 미확인 '+missing[0]+'건':'');
}
function visual(card,fallback='🍽️'){
  return '<span class="visual" aria-hidden="true">'+(card?.image
    ? '<img src="assets/'+encodeURIComponent(card.image)+'.webp" alt="">'
    : escapeHTML(card?.emoji||fallback))+'</span>';
}
function updateDraft(){
  try{sessionStorage.setItem(draftKey,JSON.stringify(draft))}catch{/* The current page retains the draft. */}
  renderDraft();
}
function addItems(items){
  if(savingMeal)return;
  for(const item of items){
    const same=draft.items.find(existing=>JSON.stringify(existing.row)===JSON.stringify(item.row)&&existing.qty+item.qty<=100);
    if(same)same.qty+=item.qty;
    else draft.items.push({...item});
  }
  draftCollapsed=false;
  updateDraft();
}
async function add(row,group=Meal.group(row),qty=1,options={}){
  const item={row,qty,group};
  if(!Store.mealItem(item))throw Error('음식명, 기준량과 수량을 확인해 주세요.');
  if(options.keep)await registerFood(row,options.place);
  addItems([item]);
  if(dialog.open)dialog.close();
}
async function registerFood(row,place){
  state=await Store.update(s=>{
    s.personal.push(row);
    if(place)s.settings.places={...s.settings.places,[row[2]]:place};
  });
  renderLibrary();
}
async function finishMeal(){
  if(savingMeal||!draft.items.length)return;
  savingMeal=true;
  $('finishMeal').disabled=true;
  const at=new Date(),{id,items}=structuredClone(draft);
  try{
    state=await Store.update(s=>{
      if(!s.meals.some(meal=>meal.id===id)){
        s.meals.push({id,at:at.toISOString(),type:mealType(s.settings,at.getHours()),version:catalog.version,items});
      }
    });
    draft={id:Store.uid(),items:[]};
    updateDraft();
    render();
    notify('식사를 기록했습니다.');
  }finally{
    savingMeal=false;
    $('finishMeal').disabled=false;
  }
}
function renderDraft(){
  const version=++relatedVersion;
  const {items}=draft;
  $('calculator').hidden=!items.length;
  $('draftRows').hidden=draftCollapsed;
  $('saveSet').hidden=draftCollapsed;
  $('related').hidden=!items.length||draftCollapsed;
  $('toggleDraft').setAttribute('aria-expanded',String(!draftCollapsed));
  $('toggleDraft').textContent=draftCollapsed?'⌃ 담은 음식 '+items.length+'종':'⌄ 식사 계산기';
  $('draftTotal').textContent=total(items);
  const rows=$('draftRows');
  rows.replaceChildren();
  items.forEach((item,index)=>{
    const {row,qty}=item;
    const line=document.createElement('div');
    line.className='draftRow';
    line.innerHTML='<span><strong>'+escapeHTML(row[1])+'</strong><small>'+escapeHTML(row[3])+'</small></span>'+
      '<button type="button" aria-label="수량 줄이기">−</button><span>'+fmt(qty)+'</span><button type="button" aria-label="수량 늘리기">＋</button>'+
      '<b>'+kcal(row,qty)+'</b><button type="button" aria-label="빼기">×</button>';
    const [minus,plus,remove]=line.querySelectorAll('button');
    minus.disabled=qty<=.5;plus.disabled=qty>=100;
    const change=delta=>{if(!savingMeal){item.qty=Math.min(100,Math.max(.5,item.qty+delta));updateDraft()}};
    minus.onclick=()=>change(-.5);plus.onclick=()=>change(.5);
    remove.onclick=()=>{if(!savingMeal){items.splice(index,1);updateDraft()}};
    rows.append(line);
  });
  const related=$('relatedFoods');
  related.replaceChildren();
  if(draftCollapsed||!items.length)return;
  function show(brandRows){
    if(version!==relatedVersion)return;
    const choices=Meal.related(state,mealType(state.settings),items,brandRows);
    $('related').hidden=!choices.length;
    related.replaceChildren();
    for(const row of choices){
      const button=document.createElement('button');
      button.className='relatedCard';
      const image=cardsById.get(Recommend.group(row));
      const foodGroup=Meal.group(row);
      const generic=row[0].startsWith('demo:')&&Meal.groups[foodGroup]?.[0]===row[1];
      button.innerHTML=(image?.row[0]===row[0]?visual(image):'')+'<strong>'+escapeHTML(row[1])+'</strong><small>'+
        (generic?'세부 메뉴':kcal(row))+'</small><span aria-hidden="true">'+(generic?'›':'＋')+'</span>';
      button.onclick=()=> (generic?showFoodGroup(foodGroup):add(row)).catch(error=>notify(error.message));
      related.append(button);
    }
  }
  show([]);
  const brands=[...new Set(items.map(item=>item.row[2]).filter(name=>Object.hasOwn(brandIndex,name)))];
  if(brands.length)Promise.all(brands.map(name=>{
    if(!sideCache.has(name)){
      const ids=brandIndex[name].filter(([,group])=>/사이드|음료/.test(group)).map(([id])=>id);
      sideCache.set(name,FoodDB.records(ids).catch(()=>{sideCache.delete(name);return []}));
    }
    return sideCache.get(name);
  })).then(rows=>show(rows.flat()));
}
function rowList(el,meals,onChange){
  el.replaceChildren();
  if(!meals.length){el.innerHTML='<p class="empty">기록된 음식이 여기에 차례대로 쌓입니다.</p>';return}
  for(const meal of meals)for(const [index,item] of meal.items.entries()){
    const row=document.createElement('div');
    row.className='logRow';
    row.innerHTML='<div><strong>'+escapeHTML(item.row[1])+'</strong><small>'+fmt(item.qty)+' × '+escapeHTML(item.row[3])+'</small></div>'+
      '<b class="rowEnergy">'+kcal(item.row,item.qty)+'</b><button class="editRow">수정</button><button class="deleteRow">삭제</button>';
    row.querySelector('.editRow').onclick=()=>editItem(meal,index,onChange);
    row.querySelector('.deleteRow').onclick=async()=>{
      if(!confirm(item.row[1]+' 기록을 삭제할까요?'))return;
      try{await updateItem(meal,index,null);onChange?.()}
      catch(error){notify(error.message)}
    };
    el.append(row);
  }
}
async function updateItem(meal,index,item,personal){
  const original=JSON.stringify(meal);
  state=await Store.update(s=>{
    const position=s.meals.findIndex(m=>m.id===meal.id);
    const current=s.meals[position];
    if(!current||JSON.stringify(current)!==original)throw Error('기록이 변경되었습니다. 화면을 다시 열어 주세요.');
    if(item)current.items[index]=item;
    else{
      current.items.splice(index,1);
      if(!current.items.length)s.meals.splice(position,1);
    }
    if(personal)s.personal=[...s.personal.filter(row=>row[0]!==personal[0]),personal];
  });
  render();
}
let featuredId, featuredCandidates;
const featuredKey='gangyebap.featuredFood';

function renderFeatured(items,rotate=false){
  const cards=Recommend.list(mealType(state.settings),items,state);
  const signature=JSON.stringify(cards.map(card=>card.id));
  let index=cards.findIndex(card=>card.id===featuredId);
  if(featuredCandidates===undefined){
    try{index=cards.findIndex(card=>card.id===sessionStorage.getItem(featuredKey))}
    catch{index=-1}
    rotate=true;
  }
  if(rotate)index=(index+1)%Math.max(1,cards.length);
  else if(featuredCandidates!==signature||index<0)index=0;
  const card=cards[index];
  featuredCandidates=signature;
  featuredId=card?.id;
  const container=$('cards');
  container.replaceChildren();
  $('refreshCard').disabled=cards.length<2;
  $('refreshCard').onclick=()=>renderFeatured(items,true);
  if(!card){
    container.textContent='추천 음식 없음';
    return;
  }
  try{sessionStorage.setItem(featuredKey,card.id)}catch{/* The recommendation still works without storage. */}
  const button=document.createElement('button');
  button.className='card';
  button.dataset.food=card.id;
  button.innerHTML=visual(card)+'<span><strong>'+escapeHTML(card.name)+'</strong><small>'+kcal(card.row)+(card.row[13]==='실험 예시'?' · 예시':'')+'</small></span>';
  button.onclick=()=>add(card.row,card.id).catch(error=>notify(error.message));
  container.append(button);
}
function render(){
  const meals=dayMeals(),items=meals.flatMap(m=>m.items);
  const extra=state.settings.activity[today()]||0;
  const date=new Date();
  const monthDay=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric'}).format(date);
  const weekday=new Intl.DateTimeFormat('ko-KR',{weekday:'short'}).format(date);
  $('date').textContent=monthDay+' ('+weekday+')';
  const nutrients=Nutrition.totals(items);
  const estimated=nutrients.missing[0]>0;
  $('balanceValue').textContent=fmt(Nutrition.remaining(state.settings.goal,extra,items));
  $('summary').textContent='섭취 '+fmt(nutrients.values[0])+' · 목표 '+fmt(state.settings.goal);
  $('activity').textContent=' · 활동 '+fmt(extra)+' kcal'+(estimated?' · 미확인 열량 제외':'');
  $('intake').textContent=total(items);
  const focused=document.activeElement;
  const logHasFocus=$('cart').contains(focused);
  const logRowIndex=logHasFocus?[...$('cart').children].indexOf(focused.closest('.logRow')):-1;
  rowList($('cart'),meals);
  if(logRowIndex>=0)$('cart').children[logRowIndex]?.querySelector('.editRow').focus({preventScroll:true});
  renderFeatured(items);
  renderQuickGroups();
  renderLibrary();
}
function history(){
  modal('지난 기록','<label>날짜<input id="historyDate" type="date" value="'+today()+'"></label><p id="historyTotal"></p><div id="historyRows"></div>');
  const input=$('historyDate');
  const refresh=()=>{
    const entries=dayMeals(input.value);
    $('historyTotal').textContent=total(entries.flatMap(m=>m.items));
    rowList($('historyRows'),entries,()=>historyFor(input.value));
  };
  input.onchange=refresh;refresh();
}
function historyFor(date){
  history();
  $('historyDate').value=date;
  $('historyDate').onchange();
}
function favoriteKey(row){return catalog.cards.find(c=>c.row[0]===row[0])?.id||row[0]}
function personalRows(){
  return [...new Map([...state.meals.flatMap(meal=>meal.items.map(item=>item.row)),...Object.values(state.settings.favoriteRows||{}),...state.personal]
    .map(row=>[row[0],row])).values()];
}
function foodGroupButton(id){
  const [name,image]=Meal.groups[id];
  const button=document.createElement('button');
  button.type='button';button.className='categoryTile';
  button.innerHTML=visual({image},'🍚')+'<span>'+escapeHTML(name)+'</span>';
  button.onclick=()=>showFoodGroup(id).catch(error=>notify(error.message));
  return button;
}
function renderQuickGroups(){
  $('quickGroups').replaceChildren(...Meal.initial(state,mealType(state.settings)).map(foodGroupButton));
}
async function showFoodGroup(id){
  const [name,image,,category,queries]=Meal.groups[id];
  modal(name,
    '<section id="groupPersonal" hidden><h3>내 라이브러리</h3><div class="resultList"></div></section>'+
    '<section><h3>일반 메뉴</h3><div id="groupGeneral" class="resultList">메뉴를 불러오는 중…</div></section>'+
    '<section id="groupBrand" hidden><h3>브랜드로 선택하기</h3><div id="groupBrandButtons" class="brandChips"></div><div id="groupBrandMenu" class="resultList"></div></section>');
  if(image)$('dialogTitle').insertAdjacentHTML('afterbegin',visual({image}));
  const general=$('groupGeneral'),personal=$('groupPersonal'),brand=$('groupBrand');
  const score=Meal.profiles(state,mealType(state.settings),row=>row[0]);
  const rank=row=>score(row[0],0,state.favorites.includes(favoriteKey(row)));
  const own=personalRows().filter(row=>Meal.belongs(row,id)).sort((a,b)=>rank(b)-rank(a));
  if(own.length){
    personal.hidden=false;
    results(personal.querySelector('.resultList'),Meal.uniqueRows(own).slice(0,8));
  }
  const brandNames=Object.keys(brandIndex).filter(name=>
    (brandGroups[category]||[]).includes(name)||(id==='burger'&&name==='KFC'));
  const brandRows=await FoodDB.records(brandNames.flatMap(name=>brandIndex[name].map(entry=>entry[0])));
  if(!general.isConnected||!dialog.open)return;
  const available=brandNames.map(brandName=>[brandName,brandRows.filter(row=>row[2]===brandName&&Meal.belongs(row,id))])
    .filter(([,rows])=>rows.length);
  if(available.length){
    brand.hidden=false;
    const buttons=$('groupBrandButtons'),list=$('groupBrandMenu');
    for(const [brandName,rows] of available){
      const button=document.createElement('button');
      button.textContent=brandName;
      button.setAttribute('aria-pressed','false');
      button.onclick=()=>{
        for(const entry of buttons.children)entry.setAttribute('aria-pressed',String(entry===button));
        results(list,Meal.uniqueRows(rows));
      };
      buttons.append(button);
    }
  }
  const source=[];
  for(const query of queries)source.push(...await FoodDB.search(query,40));
  if(!general.isConnected||!dialog.open)return;
  const known=new Set(own.map(row=>row[0]));
  const demo=catalog.cards.find(card=>card.id===id)?.row;
  const rows=Meal.uniqueRows([...source.filter(row=>row[0].startsWith('mfds:')&&!row[2]&&Meal.belongs(row,id)),
    ...(demo?[demo]:[])].filter(row=>!known.has(row[0])));
  function show(limit){
    results(general,rows.slice(0,limit));
    if(!rows.length)general.textContent='확인된 일반 메뉴가 없습니다.';
    if(rows.length>limit){
      const more=document.createElement('button');more.textContent='메뉴 더보기';more.onclick=()=>show(limit+8);general.append(more);
    }
  }
  show(4);
}
function renderSets(container){
  container.className='resultList';container.replaceChildren();
  const repeated=Meal.repeatedSet(state);
  if(repeated){
    const hint=document.createElement('button');
    hint.textContent='자주 함께 먹은 조합 저장';
    hint.onclick=()=>editSet(null,repeated.items);
    container.append(hint);
  }
  for(const [title,sets,custom] of [['내 세트',state.sets||[],true],['기본 세트',Meal.basicSets(),false]]){
    if(!sets.length)continue;
    const heading=document.createElement('h3');heading.textContent=title;container.append(heading);
    for(const set of sets){
      const wrap=document.createElement('div');wrap.className='resultWrap';
      const button=document.createElement('button');button.className='result';
      button.innerHTML='<span><strong>'+escapeHTML(set.name)+'</strong><small>'+escapeHTML(set.items.map(item=>item.row[1]).join(' + '))+
        '</small></span><b>'+total(set.items)+'</b>';
      button.onclick=()=>addItems(set.items);
      wrap.append(button);
      if(custom){
        const edit=document.createElement('button');edit.className='quiet';edit.textContent='수정';edit.onclick=()=>editSet(set);
        const remove=document.createElement('button');remove.className='quiet';remove.textContent='삭제';
        remove.onclick=async()=>{if(confirm(set.name+' 세트를 삭제할까요?')){
          try{state=await Store.update(s=>{s.sets=s.sets.filter(entry=>entry.id!==set.id)});renderLibrary()}
          catch(error){notify(error.message)}
        }};
        wrap.append(edit,remove);
      }
      container.append(wrap);
    }
  }
}
function editSet(existing,source=draft.items){
  const id=existing?.id||Store.uid();
  const items=structuredClone(existing?.items||source);
  if(!items.length)return;
  modal(existing?'세트 수정':'세트 저장','<form id="setForm"><label>세트 이름<input name="setName" required maxlength="80" value="'+
    escapeHTML(existing?.name||'')+'"></label><div id="setRows" class="resultList"></div><button class="primary wide">세트 저장</button></form>');
  function draw(){
    $('setRows').replaceChildren(...items.map((item,index)=>{
      const line=document.createElement('div');line.className='setEditRow';
      line.innerHTML='<strong>'+escapeHTML(item.row[1])+'</strong><input type="number" aria-label="수량" min="0.5" max="100" step="0.5" value="'+item.qty+'" required>'+
        '<button type="button" aria-label="빼기">×</button>';
      line.querySelector('input').oninput=e=>{item.qty=e.target.valueAsNumber};
      line.querySelector('button').onclick=()=>{if(items.length>1){items.splice(index,1);draw()}};
      line.querySelector('button').disabled=items.length===1;
      return line;
    }));
  }
  draw();
  $('setForm').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,name=new FormData(form).get('setName').trim(),submit=form.querySelector('.primary');
    submit.disabled=true;
    try{
      state=await Store.update(s=>{s.sets=[...(s.sets||[]).filter(set=>set.id!==id),{id,name,items}]});
      dialog.close();libraryMode='sets';renderLibrary();notify('세트를 저장했습니다.');
    }catch(error){notify(error.message)}
    finally{submit.disabled=false}
  };
}
async function toggleFavorite(row){
  const id=favoriteKey(row);
  state=await Store.update(s=>{
    if(s.favorites.includes(id))s.favorites=s.favorites.filter(key=>key!==id);
    else s.favorites.push(id);
    s.settings.favoriteRows??={};
    if(s.favorites.includes(id))s.settings.favoriteRows[id]=row;
    else delete s.settings.favoriteRows[id];
  });
  render();
}
function renderLibrary(){
  const items=state.meals.flatMap(m=>m.items);
  const byId=new Map();
  for(const item of [...items].reverse())if(!byId.has(item.row[0]))byId.set(item.row[0],item.row);
  const stats=new Map();
  for(const item of items)stats.set(item.row[0],(stats.get(item.row[0])||0)+1);
  const library=$('library');
  const options={
    often:()=>[...byId.values()].filter(r=>stats.get(r[0])>1).sort((a,b)=>stats.get(b[0])-stats.get(a[0])),
    favorite:()=>state.favorites.map(id=>cardsById.get(id)?.row||state.personal.find(r=>r[0]===id)||byId.get(id)||state.settings.favoriteRows?.[id]).filter(Boolean),
    recent:()=>[...byId.values()],
    own:()=>state.personal
  };
  document.querySelectorAll('[data-library]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.library===libraryMode)));
  if(libraryMode==='sets'){renderSets(library);return}
  const rows=options[libraryMode]();
  library.className=rows.length?'foodGrid':'';
  if(rows.length){
    results(library,rows.slice(0,libraryLimit));
    if(rows.length>libraryLimit){
      const more=document.createElement('button');more.className='quiet libraryMore';more.textContent='음식 더보기';
      more.onclick=()=>{libraryLimit+=8;renderLibrary()};
      library.append(more);
    }
  }
  else library.innerHTML='<p class="empty">'+({often:'두 번 이상 기록한 음식이 표시됩니다.',favorite:'음식의 ☆ 버튼을 눌러 담아 보세요.',recent:'최근 음식이 없습니다.',own:'직접 입력한 음식을 보관할 수 있습니다.'})[libraryMode]+'</p>';
  if(libraryMode==='own'){
    const register=document.createElement('button');
    register.className='quiet libraryMore';register.type='button';register.textContent='＋ 내 음식 등록';
    register.onclick=()=>manual(true);library.append(register);
  }
}
function nutrition(row){
  const fields=[['열량',4,'kcal'],['탄수화물',5,'g'],['단백질',6,'g'],['지방',7,'g'],['당류',8,'g'],['나트륨',9,'mg']];
  const source=String(row[11]??'').trim();
  const link=/^https?:\/\//i.test(source)?'<a target="_blank" rel="noopener noreferrer" href="'+escapeHTML(source)+'">출처 열기</a>':escapeHTML(source||'출처 미확인');
  return '<small>'+escapeHTML([row[2],row[3],row[13]].filter(Boolean).join(' · '))+'</small>'+
    '<dl class="nutrients">'+fields.map(([label,i,unit])=>'<dt>'+label+'</dt><dd>'+(row[i]==null?'미확인':fmt(row[i])+' '+unit)+'</dd>').join('')+
    '</dl><p>출처 '+link+'</p><small>'+escapeHTML([row[14],row[12],row[15]].filter(Boolean).join(' · '))+'</small>';
}
function results(el,rows,{choose=add,images=true,showFavorite=true}={}){
  el.replaceChildren();
  for(const row of rows){
    const wrap=document.createElement('div');wrap.className='resultWrap';
    const card=cardsById.get(Recommend.group(row));
    const variant=[row[2],row[3],kcal(row)].filter(Boolean).join(' · ');
    wrap.innerHTML='<button class="result">'+(images&&card?.image&&card.row[0]===row[0]?visual(card):'')+
      '<span><strong>'+escapeHTML(row[1])+'</strong><small>'+escapeHTML(variant)+'</small></span><span class="resultAdd" aria-hidden="true">＋</span></button>'+
      (showFavorite?'<button class="star" aria-pressed="'+state.favorites.includes(favoriteKey(row))+'" aria-label="'+escapeHTML(row[1])+' 즐겨찾기">'+(state.favorites.includes(favoriteKey(row))?'★':'☆')+'</button>':'');
    const button=wrap.querySelector('.result');
    button.onclick=async()=>{
      button.disabled=true;
      try{await choose(row)}
      catch(error){notify(error.message)}
      finally{button.disabled=false}
    };
    const star=wrap.querySelector('.star');
    if(star)star.onclick=async()=>{
      try{
        await toggleFavorite(row);
        const picked=state.favorites.includes(favoriteKey(row));
        star.setAttribute('aria-pressed',String(picked));star.textContent=picked?'★':'☆';
      }catch(error){notify(error.message)}
    };
    el.append(wrap);
  }
}
function numberInput(row){
  return '<label>수량 · '+escapeHTML(row[3])+' 기준</label><div class="quantity">'+
    '<button id="qtyMinus" type="button" aria-label="수량 반 단위 줄이기">−</button>'+
    '<input id="qty" type="number" inputmode="decimal" min="0.5" max="100" step="0.5" value="1" aria-label="수량" required>'+
    '<button id="qtyPlus" type="button" aria-label="수량 반 단위 늘리기">＋</button><strong id="qtyEnergy"></strong></div>';
}
function bindQty(row,value){
  const input=$('qty');
  input.value=value;
  const refresh=()=>$('qtyEnergy').textContent=kcal(row,Number(input.value));
  input.oninput=refresh;
  $('qtyMinus').onclick=()=>{input.value=Math.max(.5,Number(input.value)-.5);refresh()};
  $('qtyPlus').onclick=()=>{input.value=Math.min(100,Number(input.value)+.5);refresh()};
  refresh();
  return refresh;
}
function editItem(meal,index,back){
  const item=meal.items[index],row=item.row;
  modal('음식 기록 수정','<form id="editEntry"><label>음식명<input name="name" required maxlength="80" value="'+escapeHTML(row[1])+'"></label>'+
    '<label>기준 분량<input name="basis" required maxlength="60" value="'+escapeHTML(row[3])+'"></label>'+
    '<label>기준 열량 (kcal)<input name="energy" type="number" min="0" step="any" value="'+escapeHTML(row[4])+'"></label>'+
    numberInput(row)+'<label><input type="checkbox" name="keepEdit"> 개인 라이브러리에 등록</label><button class="primary wide">변경 저장</button></form><details><summary>영양정보</summary>'+nutrition(row)+'</details>');
  const preview=[...row], refresh=bindQty(preview,item.qty);
  if(item.qty%0.5!==0)$('qty').step='any'; // Older backups can contain fractional quantities.
  const form=$('editEntry');
  form.elements.energy.oninput=()=>{preview[4]=form.elements.energy.value===''?null:form.elements.energy.valueAsNumber;refresh()};
  form.onsubmit=async e=>{
    e.preventDefault();
    const name=form.elements.name.value.trim();
    if(!name){notify('음식명을 입력해 주세요.');return}
    const updated=[...preview];updated[1]=name;updated[3]=form.elements.basis.value.trim();
    if(updated[4]!==row[4]||updated[3]!==row[3]||updated[1]!==row[1]){
      updated[11]='직접 수정';updated[12]=today();updated[13]='사용자 입력';updated[14]='';
    }
    const button=form.querySelector('.primary');button.disabled=true;
    try{
      const personal=form.elements.keepEdit.checked?[row[0].startsWith('personal:')?row[0]:'personal:'+Store.uid(),...updated.slice(1)]:null;
      await updateItem(meal,index,{...item,row:updated,group:Meal.group(updated),qty:Number($('qty').value)},personal);
      dialog.close();
      if(back){await new Promise(resolve=>requestAnimationFrame(resolve));back()}
      notify('기록을 수정했습니다.');
    }catch(error){notify(error.message)}
    finally{button.disabled=false}
  };
}
function registeredPlaces(){
  return [...new Set(state.personal.map(r=>r[2]).filter(Boolean))];
}
function placeMeta(name){
  const metadata=state.settings.places?.[name];
  return metadata&&typeof metadata==='object'?metadata:{};
}
function tile(category){
  const button=document.createElement('button');
  button.className='categoryTile';
  button.dataset.category=category.id;
  button.innerHTML=visual(category,category.emoji)+'<span>'+escapeHTML(category.label)+'</span>';
  if(category.id==='all'){
    button.setAttribute('aria-expanded','false');
    button.onclick=()=>{
      categoriesExpanded=!categoriesExpanded;
      button.setAttribute('aria-expanded',String(categoriesExpanded));
      $('categories').querySelectorAll('[data-extra-category]').forEach(tile=>{tile.hidden=!categoriesExpanded});
    };
  }else{
    button.setAttribute('aria-haspopup','dialog');
    button.onclick=()=>browse(category);
  }
  return button;
}
function browse(category,query=''){
  const own=registeredPlaces();
  const places=category.id==='all'
    ? [...new Set([...Object.keys(brandIndex),...own])]
    : [...new Set([...(brandGroups[category.id]||[]).filter(name=>Object.hasOwn(brandIndex,name)),...own.filter(name=>(placeMeta(name).category||'other')===category.id)])];
  modal(category.id==='all'?'브랜드·장소':category.label+' · 브랜드·장소',
    '<label>브랜드·장소 검색<input type="search" id="brandSearch" placeholder="브랜드 또는 장소 이름"></label>'+
    '<div id="placeList" class="placeGrid"></div>');
  const search=$('brandSearch');
  search.value=query;
  const recent=state.settings.recentPlaces||[];
  const ordered=places.sort((a,b)=>{
    const rank=n=>recent.includes(n)?recent.indexOf(n):recent.length;
    return rank(a)-rank(b)||a.localeCompare(b,'ko');
  });
  function show(){
    const list=$('placeList');
    list.replaceChildren();
    for(const name of ordered.filter(n=>norm(n).includes(norm(search.value)))){
      const button=document.createElement('button');
      button.className='placeTile';
      const image=placeMeta(name).image;
      const photo=typeof image==='string'&&/^data:image\/webp;base64,[a-z0-9+/=]+$/i.test(image);
      button.innerHTML=(photo?'<span class="visual"><img src="'+escapeHTML(image)+'" alt=""></span>':visual(null,'▤'))+
        '<span>'+escapeHTML(name)+'</span>'+(recent.includes(name)?'<small>최근 선택</small>':'');
      button.onclick=async()=>{
        const back=()=>browse(category,search.value);
        try{
          state=await Store.update(s=>{s.settings.recentPlaces=[name,...(s.settings.recentPlaces||[]).filter(n=>n!==name)].slice(0,8)});
          await menu(name,back);
        }catch(error){notify(error.message)}
      };
      list.append(button);
    }
    if(!list.children.length)list.innerHTML='<p class="empty">일치하는 브랜드·장소가 없습니다.</p>';
  }
  search.oninput=show;show();
}
async function menu(name,back,criteria={query:'',group:'전체'},loaded=null){
  modal(name,'<button id="sheetBack" class="sheetBack">‹ 브랜드·장소</button>'+
    '<label>메뉴 검색<input id="menuSearch" type="search" placeholder="메뉴 이름"></label>'+
    '<label>메뉴 분류<select id="menuGroup"></select></label><p id="menuStatus">메뉴를 불러오는 중…</p><div id="menu" class="foodGrid"></div>');
  $('sheetBack').onclick=back;
  const field=$('menuSearch'),group=$('menuGroup');
  field.value=criteria.query;
  const entries=Object.hasOwn(brandIndex,name)?brandIndex[name]:[];
  const own=state.personal.filter(r=>r[2]===name&&!FoodDB.isBelowThreshold(r));
  const rows=loaded||[...(await FoodDB.records(entries.map(e=>e[0]))),...own];
  if(!field.isConnected||!dialog.open)return;
  const groups=entries.map(e=>e[1]).concat(own.map(()=>'내 음식'));
  group.append(...['전체',...new Set(groups)].map(g=>new Option(g,g)));
  group.value=criteria.group;
  function show(){
    const matched=rows.filter((row,i)=>(group.value==='전체'||group.value===groups[i])&&norm(row[1]).includes(norm(field.value)));
    $('menuStatus').textContent=matched.length?'': '일치하는 메뉴가 없습니다.';
    results($('menu'),Meal.uniqueRows(matched));
  }
  field.oninput=group.onchange=show;show();
}
async function searchHome(){
  const token=++searchToken,query=norm($('query').value);
  $('matches').replaceChildren();
  $('clearSearch').hidden=!query;
  $('count').textContent=query?'검색 중…':'';
  if(!query)return;
  try{
    const personal=personalRows().filter(r=>!FoodDB.isBelowThreshold(r)&&norm(r[1]+' '+r[2]).includes(query));
    const brands=Object.keys(brandIndex).filter(n=>norm(n).includes(query));
    const indices=brands.flatMap(n=>brandIndex[n].map(e=>e[0])).slice(0,40);
    const source=[...await FoodDB.records(indices),...await FoodDB.search(query,80)];
    const exact=row=>Number(norm(row[1])===query);
    const rows=[...personal,...source].sort((a,b)=>exact(b)-exact(a));
    if(token!==searchToken)return;
    const broad=query==='밥'?['rice','friedrice','ricebowl','bibimbap','gimbap','grainrice']:
      Object.keys(Meal.groups).filter(id=>norm(Meal.groups[id][0])===query);
    const distinct=Meal.uniqueRows(rows);
    function draw(limit){
      const list=$('matches');
      results(list,distinct.slice(0,Math.max(0,limit-broad.length)),{images:false});
      const groupButtons=broad.map(id=>{
        const button=document.createElement('button');
        button.className='searchGroup';button.textContent=Meal.groups[id][0]+' · 세부 메뉴 보기 ›';
        button.onclick=()=>showFoodGroup(id).catch(error=>notify(error.message));
        return button;
      });
      list.prepend(...groupButtons);
      if(distinct.length+broad.length>limit){
        const more=document.createElement('button');more.textContent='검색 더보기';more.onclick=()=>draw(limit+8);list.append(more);
      }
      $('count').textContent=list.children.length?'검색 결과':'검색 결과 없음';
    }
    draw(8);
  }catch(error){
    if(token===searchToken){$('count').textContent='검색을 완료하지 못했습니다.';notify(error.message)}
  }
}
function manual(registerOnly=false){
  modal(registerOnly?'내 음식 등록':'음식 직접 입력','<form id="entry"><label>음식명<input name="name" required maxlength="80"></label>'+
    '<label>기준 분량<input name="basis" required maxlength="60" placeholder="예: 한 그릇 250g"></label>'+
    (registerOnly?'<input name="registerOnly" type="hidden" value="1">':'<label>수량<input name="entryQty" type="number" min="0.5" max="100" step="0.5" value="1" required></label>')+
    ['열량 (kcal)','탄수화물 (g)','단백질 (g)','지방 (g)'].map((label,i)=>
      '<label>'+label+'<input name="n'+i+'" type="number" step="any" min="0" '+(!i?'required':'')+'></label>').join('')+
    '<details><summary>장소 연결</summary><label>장소 이름<input name="place" maxlength="80"></label>'+
    '<label>음식 종류<select name="category"><option value="">기타</option>'+
    categories.filter(c=>!['all','other'].includes(c.id)).map(c=>'<option value="'+c.id+'">'+c.label+'</option>').join('')+
    '</select></label><label>장소 사진 (선택)<input name="photo" type="file" accept="image/png,image/jpeg,image/webp"></label></details>'+
    (registerOnly?'<button class="primary wide">내 음식 저장</button>':
      '<label><input name="keep" type="checkbox"> 개인 라이브러리에 등록</label><button class="primary wide">계산기에 추가</button>')+'</form>');
}
async function placePhoto(file){
  if(!file?.size)return '';
  if(file.size>12_000_000||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('12 MB 이하의 JPG, PNG, WebP를 선택해 주세요.');
  const source=await createImageBitmap(file);
  const canvas=document.createElement('canvas'),ratio=Math.min(1,240/Math.max(source.width,source.height));
  canvas.width=Math.max(1,Math.round(source.width*ratio));canvas.height=Math.max(1,Math.round(source.height*ratio));
  canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);source.close();
  return canvas.toDataURL('image/webp',.8);
}
function settings(){
  const s=state.settings;
  modal('설정 및 백업','<form id="prefs"><label>하루 목표 (kcal)<input type="number" name="goal" required min="1" value="'+s.goal+'"></label><label>목표에 포함되지 않은 오늘 추가 활동 (kcal)<input type="number" required name="activity" min="0" value="'+(s.activity[today()]||0)+'"></label><small>건강 앱 미연동 · 수동 입력</small>'+['lunch','dinner'].map((k,i)=>'<label>'+['점심','저녁'][i]+' 시작 시각<input type="number" min="1" max="23" name="'+k+'" value="'+s[k]+'" required></label>').join('')+'<button>설정 저장</button></form><hr><button id="offline">오프라인 파일 저장</button><button id="export">JSON 백업</button><label>백업 복원<input id="restore" type="file" accept=".json"></label><button id="csvExport">내 음식 CSV 백업</button><label>개인 음식 CSV 추가<input type="file" id="csvImport" accept=".csv"></label><button id="undoRestore">복원 전 상태로 돌아가기</button><p class="muted">제품, 조리법과 분량에 따라 영양값이 달라집니다. 미확인 항목이 있는 날에는 확인된 열량만 합산합니다.</p>');
}
document.addEventListener('submit',async e=>{
  const form=e.target;
  if(!['entry','prefs'].includes(form.id))return;
  e.preventDefault();
  const fields=new FormData(form),submit=form.querySelector('button');
  submit.disabled=true;
  try{
    if(form.id==='prefs'){
      state=await Store.update(s=>{
        for(const k of ['goal','lunch','dinner'])s.settings[k]=Number(fields.get(k));
        s.settings.activity[today()]=Number(fields.get('activity'));
      });
      dialog.close();render();return;
    }
    const n=i=>fields.get('n'+i)===''?null:Number(fields.get('n'+i));
    const place=fields.get('place').trim(),registerOnly=Boolean(fields.get('registerOnly')),keep=registerOnly||Boolean(fields.get('keep'));
    const row=['personal:'+Store.uid(),fields.get('name').trim(),place,fields.get('basis').trim(),n(0),n(1),n(2),n(3),null,null,null,'직접 입력',today(),'사용자 입력','',''];
    const selected=fields.get('category');
    const existing=placeMeta(place);
    const metadata=place&&keep?{category:selected||existing.category||'other',image:await placePhoto(fields.get('photo'))||existing.image||''}:null;
    if(registerOnly){
      await registerFood(row,metadata);notify('내 음식에 등록했습니다.');
    }else await add(row,Meal.group(row),Number(fields.get('entryQty')),{keep,place:metadata});
    dialog.close();
  }catch(error){notify(error.message)}
  finally{submit.disabled=false}
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');
  if(!b||!state)return;
  try{
    if(b.dataset.library){libraryMode=b.dataset.library;libraryLimit=8;renderLibrary()}
    else if(b.id==='manual')manual();
    else if(b.id==='settings')settings();
    else if(b.id==='history')history();
    else if(b.id==='finishMeal')await finishMeal();
    else if(b.id==='toggleDraft'){draftCollapsed=!draftCollapsed;renderDraft()}
    else if(b.id==='saveSet')editSet();
    else if(b.id==='clearSearch'){$('query').value='';await searchHome()}
    else if(b.id==='close')dialog.close();
    else if(b.id==='offline'){
      if(location.protocol==='file:'){notify('이 폴더의 음식 파일을 오프라인에서 사용합니다.');return}
      if(!navigator.serviceWorker)throw Error('HTTPS 또는 localhost에서 오프라인 저장을 사용할 수 있습니다.');
      b.disabled=true;
      try{
        const reg=await navigator.serviceWorker.register('./sw.js');
        const worker=reg.installing;
        if(worker)await new Promise((ok,no)=>{const check=()=>{if(['installed','activated'].includes(worker.state))ok();if(worker.state==='redundant')no(Error('오프라인 저장 실패. 연결과 여유 공간을 확인하세요.'))};worker.addEventListener('statechange',check);check()});
        notify('오프라인 파일 저장 완료. 다음 실행부터 사용할 수 있습니다.');
      }finally{b.disabled=false}
    }else if(b.id==='export'||b.id==='csvExport'){
      state=await Store.update(()=>{});const url=URL.createObjectURL(new Blob([b.id==='export'?JSON.stringify(state):LibraryCSV.encode(state.personal)],{type:b.id==='export'?'application/json':'text/csv;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download='간계밥-'+today()+(b.id==='export'?'.json':'.csv');a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
    }else if(b.id==='undoRestore'){
      const old=await Store.previous();if(!old)throw Error('복원 전 사본이 없습니다.');
      if(confirm('복원 전 상태로 교체할까요?'))await replace(old);
    }
  }catch(err){notify(err.message)}
});
async function replace(profile){state=await Store.update(()=>Store.migrate(profile));dialog.close();render();notify('복원했습니다.')}
document.addEventListener('change',async e=>{
  if(!['restore','csvImport'].includes(e.target.id))return;
  try{
    const file=e.target.files[0];if(!file)return;
    if(e.target.id==='csvImport'){
      const rows=LibraryCSV.decode(await file.text());
      state=await Store.update(s=>{
        const byId=new Map(s.personal.map(r=>[r[0],r]));
        for(const r of rows)byId.set(r[0],r);
        s.personal=Array.from(byId.values());
      });notify('개인 음식 '+rows.length+'건 반영');render();return;
    }
    const profile=Store.migrate(JSON.parse(await file.text()));
    if(confirm('식사 '+profile.meals.length+'건으로 현재 기록과 설정을 교체할까요? 이전 상태는 기기에 보관됩니다.'))await replace(profile);
  }catch(err){notify(err.message)}finally{e.target.value=''}
});
Store.update(()=>{}).then(profile=>{
  state=profile;
  try{
    const saved=JSON.parse(sessionStorage.getItem(draftKey));
    if(saved&&typeof saved.id==='string'&&saved.id.length<=100&&Array.isArray(saved.items)&&
       saved.items.every(Store.mealItem)&&!state.meals.some(meal=>meal.id===saved.id))draft=saved;
  }catch{/* Ignore invalid session data. */}
  $('categories').append(...categories.slice(0,10).map(tile));
  $('categories').append(...categories.slice(10).map(category=>{
    const button=tile(category);
    button.dataset.extraCategory='';
    button.hidden=true;
    return button;
  }));
  $('brandBrowse').onclick=()=>browse(categories.find(category=>category.id==='all'));
  $('query').addEventListener('input',searchHome);
  if(typeof ResizeObserver==='function'){
    new ResizeObserver(()=>{
      document.querySelector('main').style.setProperty('--calculator-height',$('calculator').offsetHeight+'px');
    }).observe($('calculator'));
  }
  render();
  renderDraft();
}).catch(()=>notify('로컬 저장소를 열 수 없습니다. 브라우저 저장 권한을 확인해 주세요.'));
dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;
  const rect=dialog.getBoundingClientRect();
  if(event.clientY<rect.top||event.clientY>rect.bottom||event.clientX<rect.left||event.clientX>rect.right)dialog.close();
});
let touchY;
dialog.querySelector('.dialogHead').addEventListener('touchstart',e=>{touchY=e.touches[0].clientY},{passive:true});
dialog.querySelector('.dialogHead').addEventListener('touchend',e=>{if(e.changedTouches[0].clientY-touchY>70)dialog.close()},{passive:true});
