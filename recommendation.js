const Recommend={
  group(row){
    const named=catalog.cards.find(c=>row[0]===c.row[0]||row[1].includes(c.name));
    if(named)return named.id;
    for(const [pattern,id] of [[/버거|와퍼|빅맥/,'burger'],[/후라이|감자튀김|케이준감자/,'fries'],[/콜라/,'cola'],[/커피|아메리카노/,'coffee']])if(pattern.test(row[1]))return id;
    return null;
  },
  weights:{categoryStart:72,categoryStep:3,fallback:10,repeatPenalty:14,favorite:12,pairLimit:6},
  defaults:{아침:['eggrice','coffee','sandwich','eggs'],점심:['bibimbap','burger','tteokbokki','ramen'],저녁:['kimchistew','salad','chicken','omurice']},
  list(type,cart,state){
    const cards=[...catalog.cards], known=new Set(cards.map(c=>c.row[0]));
    const additional=[...state.personal,...state.meals.filter(m=>m.type===type).slice(-30).flatMap(m=>m.items.map(i=>i.row))];
    for(const row of additional){
      if(known.has(row[0])||FoodDB.isBelowThreshold(row))continue;
      known.add(row[0]);cards.push({id:row[0],name:row[1],row,base:Recommend.group(row),category:'내 음식'});
    }
    const weights=Recommend.weights;
    const lastItem=cart.at(-1);
    const last=cards.find(c=>c.id===lastItem?.group)||cards.find(c=>c.row[0]===lastItem?.row[0]);
    const root=cards.find(c=>c.id===last?.base)||last;
    const related=Object.fromEntries(catalog.rel[root?.id]||[]);
    const category=catalog.cat[root?.category]||[];
    const recent=state.meals.filter(m=>m.type===type).slice(-30);
    function score(c){
      if(last){
        const i=category.indexOf(c.id);
        const pairs=recent.filter(m=>m.items.some(x=>x.group===last.id)&&m.items.some(x=>x.group===c.id)).length;
        return (related[c.id]??(i<0?weights.fallback:weights.categoryStart-i*weights.categoryStep))+Math.min(weights.pairLimit,pairs)-(cart.some(x=>x.group===c.id)?weights.repeatPenalty:0);
      }
      const pos=Recommend.defaults[type].indexOf(c.id);
      return (pos<0?0:4-pos)+Number(state.favorites.includes(c.id))*weights.favorite+
        recent.reduce((v,m,i)=>v+(m.items.some(x=>x.group===c.id||x.row[0]===c.row[0])?1+i/30:0),0);
    }
    const key=row=>row[1].normalize('NFKC').replace(/\s/g,'').toLowerCase();
    const excluded=new Set(cart.map(item=>key(item.row)));
    const matches=cards.filter(c=>c!==last).map(c=>({card:c,score:score(c)})).sort((a,b)=>b.score-a.score);
    const result=[];
    for(const {card} of matches){
      const name=key(card.row);
      if(excluded.has(name))continue;
      excluded.add(name);result.push(card);
      if(result.length===4)break;
    }
    return result;
  }
};
