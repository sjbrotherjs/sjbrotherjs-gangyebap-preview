const Nutrition={
  totals(items){
    const values=Array(7).fill(0),missing=Array(7).fill(0);
    for(const {row,qty} of items)for(let i=0;i<7;i++){
      const value=row[4+i];
      if(value==null || value==='')missing[i]++;
      else values[i]+=value*qty;
    }
    return {values,missing};
  },
  remaining(goal,extra,items){return goal+extra-this.totals(items).values[0]}
};
