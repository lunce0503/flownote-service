import assert from 'node:assert/strict';
export function readerPdf() {
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for(let i=0;i<3;i++){const text=`BT /F1 24 Tf 60 720 Td (Page ${i+1} derivative) Tj ET`;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`,`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);}
  let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((value,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${value}\nendobj\n`;});const xref=Buffer.byteLength(pdf);
  return Buffer.from(pdf+`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
async function until(check,message){for(let i=0;i<100;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,300));}throw Error(message);}
export async function verifyReader(page,{touch=false}={}) {
  const prior=page.url(),title='Synthetic native reader '+Date.now();
  await page.goto('https://flownote-react-staging.vercel.app/library');
  await page.getByRole('button',{name:'책 추가',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'책장에 책 꽂기'});
  await dialog.getByLabel('PDF 파일').setInputFiles({name:'reader-smoke.pdf',mimeType:'application/pdf',buffer:readerPdf()});
  await dialog.getByLabel('책 제목').fill(title);await dialog.getByRole('button',{name:'책장에 추가',exact:true}).click();
  await page.getByRole('button',{name:'책 읽기',exact:true}).click();
  const numbers=()=>page.getByTestId('library-pdf-page').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-page')));
  const tools=async()=>{const toggle=page.getByRole('button',{name:'읽기 도구 표시',exact:true});if(await toggle.isVisible())await toggle.click();};
  await until(async()=>JSON.stringify(await numbers())==='["1"]','First native reader page');
  const viewport=page.getByTestId('library-reader-viewport');await viewport.evaluate(n=>{n.scrollTop=n.scrollHeight;});await viewport.hover();await page.mouse.wheel(0,110);
  await until(async()=>JSON.stringify(await numbers())==='["2"]','Native wheel paging');
  await viewport.focus();await page.keyboard.press('Shift+Space');await until(async()=>JSON.stringify(await numbers())==='["1"]','Native Space paging');
  if(touch){
    const cdp=await page.context().newCDPSession(page),b=await viewport.boundingBox();assert(b);
    const x=b.x+b.width*.75,y=b.y+200;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await new Promise(resolve=>setTimeout(resolve,50));
    for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-b.width*.5*i/6,y:y+3}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    await until(async()=>JSON.stringify(await numbers())==='["2"]','Native touch paging');await viewport.focus();await page.keyboard.press('Shift+Space');await until(async()=>JSON.stringify(await numbers())==='["1"]','Native touch return');
  }
  await tools();await page.getByRole('button',{name:'두 쪽 보기',exact:true}).click();await until(async()=>JSON.stringify(await numbers())==='["1","2"]','Native two-page rendering');
  await tools();const text=page.locator('[data-testid="library-pdf-text"][data-page="2"]');
  const box=await text.evaluate(layer=>{const node=Array.from(layer.querySelectorAll('span')).find(n=>n.textContent?.includes('derivative'))?.firstChild;if(!node)throw Error('Native PDF glyphs missing');const index=node.textContent.indexOf('derivative'),range=document.createRange();range.setStart(node,index);range.setEnd(node,index+10);const r=range.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};});
  await page.mouse.move(box.x+.3,box.y+box.h/2);await page.mouse.down();await page.mouse.move(box.x+box.w-.3,box.y+box.h/2,{steps:12});await page.mouse.up();
  assert.equal(await page.evaluate(()=>getSelection()?.toString().trim()),'derivative');
  const action=page.getByRole('button',{name:/derivative.*사전 검색/});await action.waitFor();const a=await action.boundingBox(),b=await page.locator('.reader-floating-toolbar').boundingBox();assert(a&&b&&a.y+a.height<=b.y-8,'Native selection action overlaps toolbar');
  await action.click();const result=page.getByRole('region',{name:'사전 검색 결과'});await result.locator('.dictionary-senses li').first().waitFor({timeout:45000});
  assert(await result.locator('.dictionary-senses li').count()>1);assert(await result.locator('p[lang=ko]').evaluateAll(nodes=>nodes.length>1&&nodes.every(n=>/[가-힣]/.test(n.textContent||''))));
  assert((await page.getByRole('region',{name:'저장한 단어장'}).textContent()).includes('2쪽'));
  await page.getByRole('dialog',{name:'사전과 단어장'}).getByRole('button',{name:'대화상자 닫기',exact:true}).click();
  await page.getByRole('button',{name:'읽기 메뉴',exact:true}).click();await page.getByRole('menuitem',{name:'표지로 돌아가기'}).click();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'책장에서 삭제',exact:true}).click();
  console.log('PASS native reader: wheel/Space, two-page PDF glyph drag, non-overlapping controls, Korean multiple meanings and page-two vocabulary');
  await page.goto(prior);
}
