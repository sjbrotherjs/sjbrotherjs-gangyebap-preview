const Meal={
  groups:{
    burger:['햄버거','category-burger',/햄버거|버거|와퍼|빅맥/,'burger',['햄버거','치즈버거','새우버거','불고기버거']],
    chicken:['치킨','category-chicken',/치킨|닭튀김|닭강정/,'chicken',['프라이드치킨','양념치킨','치킨']],
    pizza:['피자','category-pizza',/피자/,'pizza',['피자','페퍼로니피자']],
    coffee:['커피','category-cafe',/커피|아메리카노|라떼|콜드브루/,'cafe',['아메리카노','카페라떼','바닐라라떼','콜드브루']],
    bibimbap:['비빔밥','category-korean',/비빔밥/,'korean',['비빔밥','산채비빔밥']],
    tteokbokki:['떡볶이','tteokbokki',/떡볶이/,'snack',['떡볶이','로제떡볶이','치즈떡볶이','짜장떡볶이']],
    kalguksu:['칼국수','kalguksu',/칼국수/,null,['칼국수','바지락칼국수','닭칼국수','들깨칼국수']],
    ramen:['라면','ramen',/라면|라멘/,null,['라면','김치라면']],
    sandwich:['샌드위치','category-quick',/샌드위치/,'quick',['샌드위치','햄치즈샌드위치']],
    kimchistew:['김치찌개','kimchistew',/김치찌개/,'korean',['김치찌개','참치김치찌개']],
    eggrice:['간계밥',null,/간계밥|간장계란밥/,'korean',['간장계란밥']],
    rice:['흰쌀밥',null,/^(쌀밥|흰쌀밥|흰밥|백미밥)/,null,['쌀밥','흰쌀밥']],
    friedrice:['볶음밥',null,/볶음밥/,null,['볶음밥','새우볶음밥']],
    gimbap:['김밥',null,/김밥/,'snack',['김밥','참치김밥']],
    ricebowl:['덮밥',null,/덮밥/,null,['덮밥','제육덮밥']],
    grainrice:['잡곡밥',null,/잡곡밥|혼합곡밥/,null,['잡곡밥','혼합곡밥']]
  },
  defaults:{
    아침:['eggrice','coffee','sandwich','kalguksu','gimbap'],
    점심:['burger','kalguksu','coffee','tteokbokki','bibimbap'],
    저녁:['bibimbap','kimchistew','burger','chicken','ramen']
  },
  weights:{frequency:.40,time:.25,recent:.20,initial:.10,favorite:.05},
  belongs(row,id){return this.groups[id]?.[2].test(row[1])||Recommend.group(row)===id},
  group(row){
    return Object.keys(this.groups).find(id=>this.belongs(row,id))||Recommend.group(row);
  },
  profiles(state,type,identify){
    const scores=new Map();
    const history=state.meals;
    history.forEach((meal,index)=>{
      const ids=new Set(meal.items.map(item=>identify(item.row)).filter(Boolean));
      for(const id of ids){
        const stat=scores.get(id)||{count:0,match:0,recent:0};
        stat.count++;
        if(meal.type===type)stat.match++;
        stat.recent=Math.max(stat.recent,1-(history.length-1-index)/Math.max(1,history.length));
        scores.set(id,stat);
      }
    });
    const max=[...scores.values()].reduce((highest,stat)=>Math.max(highest,stat.count),1);
    return (id,initial=0,favorite=false)=>{
      const stat=scores.get(id)||{count:0,match:0,recent:0};
      const w=this.weights;
      return w.frequency*stat.count/max+w.time*stat.match/max+w.recent*stat.recent+
        w.initial*initial+w.favorite*Number(favorite);
    };
  },
  initial(state,type){
    const defaults=this.defaults[type];
    const score=this.profiles(state,type,row=>this.group(row));
    const favorites=new Set(state.favorites.map(id=>{
      const row=state.settings.favoriteRows?.[id]||catalog.cards.find(card=>card.id===id)?.row;
      return row?this.group(row):null;
    }));
    const rank=id=>score(id,Math.max(0,5-defaults.indexOf(id))*Number(defaults.includes(id))/5,favorites.has(id));
    return Object.keys(this.groups).sort((a,b)=>rank(b)-rank(a)).slice(0,5);
  },
  related(state,type,items,brandRows=[]){
    const selected=new Set(items.map(item=>item.row[0]));
    const selectedGroups=new Set(items.map(item=>this.group(item.row)).filter(Boolean));
    const options=new Map();
    const add=(row,points)=>{
      if(selected.has(row[0])||selectedGroups.has(this.group(row))||FoodDB.isBelowThreshold(row))return;
      const entry=options.get(row[0])||{row,score:0};
      entry.score+=points;
      options.set(row[0],entry);
    };
    for(const item of items){
      Recommend.list(type,[item],state,8).forEach((card,index)=>add(card.row,8-index));
    }
    for(const row of brandRows)add(row,9);
    for(const meal of state.meals){
      const overlaps=meal.items.some(item=>selected.has(item.row[0])||selectedGroups.has(this.group(item.row)));
      if(overlaps)for(const {row} of meal.items)add(row,8+(items.some(item=>row[2]&&item.row[2]===row[2])?3:0));
    }
    const groups=new Set();
    return [...options.values()].sort((a,b)=>b.score-a.score).filter(({row})=>{
      const id=this.group(row)||row[1];
      if(groups.has(id))return false;
      groups.add(id);return true;
    }).slice(0,5).map(({row})=>row);
  },
  basicSets(){
    const sets=[
      ['햄버거 세트',['burger','fries','cola']],
      ['분식 한 끼',['tteokbokki','sundae','fishcake']],
      ['샌드위치와 우유',['sandwich','milk']],
      ['집밥 한 끼',['rice','kimchistew','eggs']]
    ];
    return sets.flatMap(([name,ids],index)=>{
      const cards=ids.map(id=>catalog.cards.find(card=>card.id===id));
      return cards.every(Boolean)?[{id:'basic-'+index,name,items:cards.map(({row,id})=>({row,group:id,qty:1}))}]:[];
    });
  },
  repeatedSet(state){
    const combinations=new Map();
    for(const {items} of state.meals){
      if(items.length<2)continue;
      const key=JSON.stringify(items.map(item=>[item.row[0],item.row[3],item.row[4],item.qty]).sort());
      const entry=combinations.get(key)||{count:0};
      combinations.set(key,{count:entry.count+1,items});
    }
    return [...combinations.values()].filter(entry=>entry.count>1).sort((a,b)=>b.count-a.count)[0];
  },
  uniqueRows(rows){
    const seen=new Set();
    return rows.filter(row=>{
      const key=JSON.stringify([row[1],row[2],row[3]].map(v=>String(v).normalize('NFKC').replace(/\s/g,'').toLowerCase()).concat(row[4]));
      if(seen.has(key))return false;
      seen.add(key);return true;
    });
  }
};
