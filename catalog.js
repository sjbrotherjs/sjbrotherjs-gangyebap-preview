const FoodDB = (() => {
  const norm = s => s.normalize('NFKC').replace(/\s/g,'').toLowerCase();
  function script(path) {
    return new Promise((resolve,reject) => {
      const el = document.createElement('script');
      el.src = path;
      el.onload = () => {el.remove();resolve()};
      el.onerror = () => {el.remove();reject(Error('로컬 DB 파일을 읽을 수 없습니다. 압축을 모두 풀고 다시 열어 주세요.'))};
      document.head.append(el);
    });
  }
  // Serialise classic-script loads so file:// also works without a server.
  let queue = Promise.resolve(), last = -1, block;
  function records(indices) {
    const job = queue.then(async () => {
      const result=[];
      for (const i of indices) {
        const n=Math.floor(i/128);
        if(last!==n){await script('db/'+n+'.js');block=window.foodBlock;last=n}
        result.push(block[i%128]);
      }
      return result;
    });
    queue=job.catch(()=>{});return job;
  }
  async function search(q,limit=40) {
    if(!norm(q))return [];
    if(!window.nameIndex)await script('db/index.js');
    const names=Object.keys(nameIndex).filter(n=>norm(n).includes(norm(q)));
    names.sort((a,b)=>Number(norm(b)===norm(q))-Number(norm(a)===norm(q)));
    const ids=[];
    for(const name of names){ids.push(...nameIndex[name].slice(0,limit-ids.length));if(ids.length===limit)break}
    return records(ids);
  }
  const isBelowThreshold = row => Number.isFinite(row[4]) && row[4] < 50;
  return {search, records, isBelowThreshold};
})();
