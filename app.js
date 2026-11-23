'use strict';
const $=id=>document.getElementById(id), dialog=document.querySelector('dialog');
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('ko-KR',{maximumFractionDigits:1});
const today=(d=new Date())=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const kcal=(row,qty=1)=>row[4]==null?'열량 미확인':fmt(row[4]*qty)+' kcal';
const norm=s=>String(s??'').normalize('NFKC').replace(/\s/g,'').toLowerCase();
const cardsById=new Map(catalog.cards.map(card=>[card.id,card]));
const categories=[
  ['korean','한식','🍚','bibimbap'],['burger','패스트푸드','🍔','burger'],['pizza','피자','🍕'],
  ['chicken','치킨','🍗','chicken'],['cafe','카페','☕','coffee'],['chinese','중식','🥡','mala'],
  ['japanese','일식','🍣','sushi'],['quick','간편식','🥪'],['sweet','디저트','🍰','cake'],['all','더보기','＋'],
  ['snack','분식','🍢','tteokbokki'],['other','기타','🍽️']
].map(([id,label,emoji,card])=>({id,label,emoji,card}));
const brandGroups={
  burger:['맥도날드','버거킹','맘스터치','롯데리아','쉐이크쉑','파이브가이즈'],
  pizza:['도미노피자','피자헛','미스터피자','파파존스','청년피자','반올림피자'],
  chicken:['KFC','BBQ','교촌치킨','BHC','굽네치킨','처갓집양념치킨'],
  cafe:['스타벅스','투썸플레이스','메가MGC커피','컴포즈커피','이디야커피','빽다방'],
  korean:['한솥도시락','본죽','명륜진사갈비'],japanese:['쿠우쿠우'],quick:['서브웨이','한솥도시락'],
  sweet:['배스킨라빈스','던킨','투썸플레이스'],snack:['김밥천국'],other:['애슐리퀸즈']
};
let state, timer, searchToken=0, libraryMode='often', libraryLimit=8;
let selectedCategory=null, categoriesExpanded=false;

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
async function add(row, group=Recommend.group(row), qty=1, options={}){
  const at=new Date(),id=Store.uid();
  state=await Store.update(s=>{
    if(options.keep)s.personal.push(row);
    if(options.place){
      s.settings.places??={};
      s.settings.places={...s.settings.places,[row[2]]:options.place};
    }
    s.meals.push({id,at:at.toISOString(),type:options.type||mealType(s.settings,at.getHours()),version:catalog.version,
      items:[{row,qty,group}]});
  });
  render();
  notify(row[1]+' 기록 완료');
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
async function updateItem(meal,index,item){
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
}
function nutrition(row){
  const fields=[['열량',4,'kcal'],['탄수화물',5,'g'],['단백질',6,'g'],['지방',7,'g'],['당류',8,'g'],['나트륨',9,'mg']];
  const source=String(row[11]??'').trim();
  const link=/^https?:\/\//i.test(source)?'<a target="_blank" rel="noopener noreferrer" href="'+escapeHTML(source)+'">출처 열기</a>':escapeHTML(source||'출처 미확인');
  return '<small>'+escapeHTML([row[2],row[3],row[13]].filter(Boolean).join(' · '))+'</small>'+
    '<dl class="nutrients">'+fields.map(([label,i,unit])=>'<dt>'+label+'</dt><dd>'+(row[i]==null?'미확인':fmt(row[i])+' '+unit)+'</dd>').join('')+
    '</dl><p>출처 '+link+'</p><small>'+escapeHTML([row[14],row[12],row[15]].filter(Boolean).join(' · '))+'</small>';
}
function results(el,rows,{choose=add,illustration=false,showFavorite=true}={}){
  el.replaceChildren();
  for(const row of rows){
    const wrap=document.createElement('div');wrap.className='resultWrap';
    const card=cardsById.get(Recommend.group(row));
    const origin=row[0].startsWith('mfds:')?row[15]:'';
    const variant=[row[2],row[3],kcal(row)].filter(Boolean).join(' · ');
    wrap.innerHTML='<button class="result">'+visual(card)+'<span><strong>'+escapeHTML(row[1])+'</strong><small>'+
      escapeHTML(variant)+'</small>'+(origin?'<small>'+escapeHTML(origin)+'</small>':'')+
      (illustration?'<small>분류 예시 이미지</small>':'')+'</span></button>'+
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
function recordMenuItem(row,back,backLabel='메뉴판'){
  modal(row[1],'<button id="sheetBack" class="sheetBack">‹ '+escapeHTML(backLabel)+'</button><form id="menuEntry">'+numberInput(row)+
    '<button class="primary wide">기록에 추가</button></form><details><summary>영양정보</summary>'+nutrition(row)+'</details>');
  $('sheetBack').onclick=back;
  bindQty(row,1);
  $('menuEntry').onsubmit=async e=>{
    e.preventDefault();
    const button=e.currentTarget.querySelector('button.primary');button.disabled=true;
    try{await add(row,Recommend.group(row),Number($('qty').value));back()}
    catch(error){notify(error.message)}
    finally{button.disabled=false}
  };
}
function editItem(meal,index,back){
  const item=meal.items[index],row=item.row;
  modal('음식 기록 수정','<form id="editEntry"><label>음식명<input name="name" required maxlength="80" value="'+escapeHTML(row[1])+'"></label>'+
    '<label>기준 열량 (kcal)<input name="energy" type="number" min="0" step="any" value="'+escapeHTML(row[4])+'"></label>'+
    numberInput(row)+'<button class="primary wide">변경 저장</button></form><details><summary>영양정보</summary>'+nutrition(row)+'</details>');
  const preview=[...row], refresh=bindQty(preview,item.qty);
  if(item.qty%0.5!==0)$('qty').step='any'; // Older backups can contain fractional quantities.
  const form=$('editEntry');
  form.elements.energy.oninput=()=>{preview[4]=form.elements.energy.value===''?null:form.elements.energy.valueAsNumber;refresh()};
  form.onsubmit=async e=>{
    e.preventDefault();
    const name=form.elements.name.value.trim();
    if(!name){notify('음식명을 입력해 주세요.');return}
    const updated=[...preview];updated[1]=name;
    if(updated[4]!==row[4]){
      updated[11]='직접 수정';updated[12]=today();updated[13]='사용자 입력';updated[14]='';
    }
    const button=form.querySelector('.primary');button.disabled=true;
    try{
      await updateItem(meal,index,{...item,row:updated,qty:Number($('qty').value)});
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
function categoryFor(card){
  if(card.id==='pizza')return 'pizza';
  if(card.category==='패스트푸드')return /chicken/.test(card.id)?'chicken':'burger';
  if(card.category==='음료')return 'cafe';
  if(card.category==='중식·아시아')return 'chinese';
  if(card.category==='양식·일식')return 'japanese';
  if(card.category==='간식·디저트')return 'sweet';
  if(card.category==='분식·면')return 'snack';
  if(card.category==='한식')return 'korean';
  return 'quick';
}
function tile(category){
  const button=document.createElement('button');
  button.className='categoryTile';
  button.dataset.category=category.id;
  button.innerHTML=visual(cardsById.get(category.card),category.emoji)+'<span>'+escapeHTML(category.label)+'</span>';
  if(category.id==='all'){
    button.setAttribute('aria-expanded','false');
    button.onclick=()=>{
      categoriesExpanded=!categoriesExpanded;
      button.setAttribute('aria-expanded',String(categoriesExpanded));
      $('categories').querySelectorAll('[data-extra-category]').forEach(tile=>{tile.hidden=!categoriesExpanded});
      if(!categoriesExpanded&&categories.slice(10).includes(selectedCategory))selectCategory(null);
    };
  }else{
    button.setAttribute('aria-pressed','false');
    button.onclick=()=>selectCategory(selectedCategory===category?null:category);
  }
  return button;
}
function selectCategory(category){
  selectedCategory=category;
  $('categories').querySelectorAll('[aria-pressed]').forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.category===category?.id));
  });
  const rows=category?catalog.cards.filter(card=>categoryFor(card)===category.id).map(card=>card.row):[];
  results($('categoryOptions'),rows,{choose:row=>recordMenuItem(row,()=>dialog.close(),'음식 종류')});
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
    results($('menu'),matched,{illustration:true,choose:row=>recordMenuItem(row,
      ()=>menu(name,back,{query:field.value,group:group.value},rows).catch(error=>notify(error.message)))});
  }
  field.oninput=group.onchange=show;show();
}
async function searchHome(){
  const token=++searchToken,query=norm($('query').value);
  $('matches').replaceChildren();
  $('count').textContent=query?'검색 중…':'';
  if(!query)return;
  try{
    const personal=state.personal.filter(r=>!FoodDB.isBelowThreshold(r)&&norm(r[1]+' '+r[2]).includes(query));
    const brands=Object.keys(brandIndex).filter(n=>norm(n).includes(query));
    const indices=brands.flatMap(n=>brandIndex[n].map(e=>e[0])).slice(0,40);
    const rows=[...personal,...await FoodDB.records(indices),...await FoodDB.search(query)];
    if(token!==searchToken)return;
    const distinct=[...new Map(rows.map(r=>[r[0],r])).values()].slice(0,40);
    $('count').textContent=distinct.length?'검색 결과 '+distinct.length+'건':'검색 결과 없음';
    results($('matches'),distinct,{illustration:true});
  }catch(error){
    if(token===searchToken){$('count').textContent='검색을 완료하지 못했습니다.';notify(error.message)}
  }
}
function manual(){
  modal('음식 직접 입력','<form id="entry"><label>음식명<input name="name" required maxlength="80"></label>'+
    '<label>기준 분량<input name="basis" required maxlength="60" placeholder="예: 한 그릇 250g"></label>'+
    ['열량 (kcal)','탄수화물 (g)','단백질 (g)','지방 (g)'].map((label,i)=>
      '<label>'+label+'<input name="n'+i+'" type="number" step="any" min="0" '+(!i?'required':'')+'></label>').join('')+
    '<details><summary>장소 연결</summary><label>장소 이름<input name="place" maxlength="80"></label>'+
    '<label>음식 종류<select name="category"><option value="">기타</option>'+
    categories.filter(c=>!['all','other'].includes(c.id)).map(c=>'<option value="'+c.id+'">'+c.label+'</option>').join('')+
    '</select></label><label>장소 사진 (선택)<input name="photo" type="file" accept="image/png,image/jpeg,image/webp"></label></details>'+
    '<label><input name="keep" type="checkbox" checked> 개인 라이브러리에 저장</label><button class="primary wide">기록에 추가</button></form>');
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
function dinner(){
  const items=dayMeals().flatMap(m=>m.items);
  const left=Nutrition.remaining(state.settings.goal,state.settings.activity[today()]||0,items);
  modal('저녁 추천','<p>남은 열량 '+fmt(left)+' kcal</p><div id="dinnerRows" class="foodGrid"></div>');
  const distance=card=>card.row[4]==null?Infinity:Math.abs(card.row[4]-left);
  const rows=Recommend.list('저녁',items,state).sort((a,b)=>distance(a)-distance(b)).map(c=>c.row);
  results($('dinnerRows'),rows,{choose:async row=>{await add(row,Recommend.group(row),1,{type:'저녁'});dialog.close()}});
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
    const place=fields.get('place').trim(),keep=Boolean(fields.get('keep'));
    const row=['personal:'+Store.uid(),fields.get('name').trim(),place,fields.get('basis').trim(),n(0),n(1),n(2),n(3),null,null,null,'직접 입력',today(),'사용자 입력','',''];
    const selected=fields.get('category');
    const existing=placeMeta(place);
    const metadata=place&&keep?{category:selected||existing.category||'other',image:await placePhoto(fields.get('photo'))||existing.image||''}:null;
    await add(row,Recommend.group(row),1,{keep,place:metadata});
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
    else if(b.id==='dinner')dinner();
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
  $('categories').append(...categories.slice(0,10).map(tile));
  $('categories').append(...categories.slice(10).map(category=>{
    const button=tile(category);
    button.dataset.extraCategory='';
    button.hidden=true;
    return button;
  }));
  $('brandBrowse').onclick=()=>browse(selectedCategory||categories.find(category=>category.id==='all'));
  $('query').addEventListener('input',searchHome);
  render();
}).catch(()=>notify('로컬 저장소를 열 수 없습니다. 브라우저 저장 권한을 확인해 주세요.'));
dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;
  const rect=dialog.getBoundingClientRect();
  if(event.clientY<rect.top||event.clientY>rect.bottom||event.clientX<rect.left||event.clientX>rect.right)dialog.close();
});
let touchY;
dialog.querySelector('.dialogHead').addEventListener('touchstart',e=>{touchY=e.touches[0].clientY},{passive:true});
dialog.querySelector('.dialogHead').addEventListener('touchend',e=>{if(e.changedTouches[0].clientY-touchY>70)dialog.close()},{passive:true});
