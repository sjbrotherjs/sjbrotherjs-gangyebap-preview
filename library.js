const LibraryCSV={
  encode(rows){
    return '\ufeff'+[catalog.fields,...rows].map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
  },
  decode(txt){
    const rows=[];let row=[],field='',quoted=false,closed=false;
    txt=txt.replace(/^\uFEFF/,'');
    for(let i=0;i<txt.length;i++){
      const c=txt[i];
      if(quoted){
        if(c!=='"')field+=c;
        else if(txt[i+1]==='"'){field+='"';i++}
        else{quoted=false;closed=true}
      }else if(c===','||c==='\n'||c==='\r'){
        row.push(field);field='';closed=false;
        if(c!==','){if(c==='\r'&&txt[i+1]==='\n')i++;rows.push(row);row=[]}
      }else if(c==='"'&&!field&&!closed)quoted=true;
      else if(closed||c==='"')throw Error('CSV 따옴표를 확인하세요.');
      else field+=c;
    }
    if(quoted)throw Error('CSV 마지막 따옴표가 없습니다.');
    if(row.length||field||closed){row.push(field);rows.push(row)}
    if(JSON.stringify(rows.shift())!==JSON.stringify(catalog.fields))throw Error('검수 시트의 CSV 열이 필요합니다.');
    const seen=new Set();
    return rows.map(r=>{
      if(r.length!==16||!r[0].startsWith('personal:')||seen.has(r[0]))throw Error('개인 음식 ID와 중복 행을 확인하세요.');
      seen.add(r[0]);for(let i=4;i<=10;i++)r[i]=r[i].trim()===''?null:Number(r[i]);
      r[13]='사용자 입력';return r;
    });
  }
};
