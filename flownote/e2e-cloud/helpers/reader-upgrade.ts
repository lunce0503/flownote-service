import { expect, test, type Page } from '@playwright/test';
import { createCloudActor, stagingApi as api, stagingWeb as web } from './accounts';
import { showReaderTools } from './reader';
function textbook() {
 const pages=5, objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${Array.from({length:pages},(_,i)=>`${4+i*2} 0 R`).join(' ')}] /Count ${pages} >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 for(let i=0;i<pages;i++){
  const text=`BT /F1 24 Tf 60 720 Td (Page ${i+1} derivative) Tj 0 -40 Td (A synthetic textbook for reader verification.) Tj ET`;
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`,`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
 }
 let data='%PDF-1.4\n';const offsets=[0];objects.forEach((value,i)=>{offsets.push(Buffer.byteLength(data));data+=`${i+1} 0 obj\n${value}\nendobj\n`;});const xref=Buffer.byteLength(data);
 data+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(data);
}
async function openReader(page:Page,actor:{token:string;user:{id:string}}){
 await page.context().addCookies([{name:'__Host-flownote_session',value:actor.token,url:web,secure:true,httpOnly:true,sameSite:'Strict'}]);
 await page.addInitScript(user=>localStorage.setItem('flownote_auth_user',JSON.stringify(user)),actor.user);
 await page.goto(`${web}/library`);await page.getByRole('button',{name:'책 추가',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'책장에 책 꽂기'});await dialog.getByLabel('PDF 파일').setInputFiles({name:'synthetic-reader.pdf',mimeType:'application/pdf',buffer:textbook()});
 await dialog.getByLabel('책 제목').fill('Synthetic reader upgrade');await dialog.getByRole('button',{name:'책장에 추가',exact:true}).click();
 await page.getByRole('button',{name:'책 읽기',exact:true}).click();await expect(page.getByTestId('library-pdf-page')).toHaveAttribute('data-page','1');
}
async function pageNumbers(page:Page){return page.getByTestId('library-pdf-page').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-page')));}
async function swipe(page:Page,engine:string,left=true,multi=false){
 const host=page.getByTestId('library-reader-viewport');const b=await host.boundingBox();expect(b).not.toBeNull();const start={x:b!.x+b!.width*(left?.75:.25),y:b!.y+200},end={x:b!.x+b!.width*(left?.25:.75),y:start.y+3};
 if(engine==='chromium'){
  const cdp=await page.context().newCDPSession(page);const second={x:start.x+12,y:start.y+70};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:multi?[start,second]:[start]});await page.waitForTimeout(50);
  for(let i=1;i<=6;i++){const p={x:start.x+(end.x-start.x)*i/6,y:end.y};await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:multi?[p,{x:p.x+12,y:second.y}]:[p]});}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 }else{
  await host.dispatchEvent('pointerdown',{pointerId:41,pointerType:'touch',clientX:start.x,clientY:start.y,buttons:1});
  if(multi)await host.dispatchEvent('pointerdown',{pointerId:42,pointerType:'touch',clientX:start.x+12,clientY:start.y+70,buttons:1});
  await page.waitForTimeout(50);await host.dispatchEvent('pointerup',{pointerId:41,pointerType:'touch',clientX:end.x,clientY:end.y,buttons:0});
  if(multi)await host.dispatchEvent('pointerup',{pointerId:42,pointerType:'touch',clientX:end.x+12,clientY:end.y+70,buttons:0});
 }
}
export function registerReaderUpgrade(engine:'chromium'|'webkit',width:number){
 test.describe(`reader navigation and Korean dictionary ${engine} ${width}px`,()=>{
  test.use({viewport:{width,height:1000},hasTouch:true,...(engine==='chromium'&&width<600?{isMobile:true,userAgent:'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/132.0 Mobile Safari/537.36 FlownoteAndroid/1.3.0'}:{})});
  test('wheel, Space and spread layout preserve pages, odd end, progress, selection and remembered settings',async({page,request})=>{
   const actor=await createCloudActor(request);await openReader(page,actor);const viewport=page.getByTestId('library-reader-viewport');
   await showReaderTools(page);
   const controls=await page.locator('.reader-floating-header button:visible,.reader-floating-toolbar button:visible,.reader-progress-dock button:visible').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));
   for(const box of controls){expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);}
   for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];expect(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>1).toBe(false);}
   await page.screenshot({path:test.info().outputPath('reader-single-controls.png'),fullPage:true});
   await viewport.evaluate(node=>{node.scrollTop=node.scrollHeight;});await viewport.hover();
   // Playwright does not provide native wheel input in mobile WebKit.
   if(engine==='webkit')await viewport.dispatchEvent('wheel',{deltaY:110});else await page.mouse.wheel(0,110);
   await expect(page.getByTestId('library-pdf-page')).toHaveAttribute('data-page','2');
   await viewport.focus();await page.keyboard.press('Space');await expect(page.getByTestId('library-pdf-page')).toHaveAttribute('data-page','3');
   await page.keyboard.press('Shift+Space');await expect(page.getByTestId('library-pdf-page')).toHaveAttribute('data-page','2');
   await showReaderTools(page);const jump=page.getByLabel('이동할 페이지');await jump.focus();await page.keyboard.press('Space');await expect(page.getByTestId('library-pdf-page')).toHaveAttribute('data-page','2');
   await page.getByRole('button',{name:'두 쪽 보기',exact:true}).click();await expect.poll(()=>pageNumbers(page)).toEqual(['1','2']);
   await viewport.focus();await page.keyboard.press('Space');await expect.poll(()=>pageNumbers(page)).toEqual(['3','4']);
   await page.keyboard.press('Space');await expect.poll(()=>pageNumbers(page)).toEqual(['5']);await showReaderTools(page);await expect(page.getByRole('button',{name:'다음 페이지',exact:true})).toBeDisabled();
   await jump.fill('4');await page.getByRole('button',{name:'이동',exact:true}).click();await expect.poll(()=>pageNumbers(page)).toEqual(['3','4']);
   await expect(page.getByRole('status',{name:'현재 읽기 위치'})).toContainText('저장됨');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   await page.reload();await page.getByRole('button',{name:'Synthetic reader upgrade 표지 보기'}).click();await page.getByRole('button',{name:'4쪽부터 이어 읽기'}).click();
   await expect.poll(()=>pageNumbers(page)).toEqual(['3','4']);
   await showReaderTools(page);
   await page.screenshot({path:test.info().outputPath('reader-spread.png'),fullPage:true});
  });
  test('the second PDF page selects real text and displays multiple Korean meanings saved on page two',async({page,request})=>{
   test.setTimeout(150000);const actor=await createCloudActor(request);await openReader(page,actor);await showReaderTools(page);await page.getByRole('button',{name:'두 쪽 보기',exact:true}).click();await expect.poll(()=>pageNumbers(page)).toEqual(['1','2']);
   await showReaderTools(page);
   const text=page.locator('[data-testid="library-pdf-text"][data-page="2"]');await expect(text).toContainText('derivative');
   const b=await text.evaluate(layer=>{const node=Array.from(layer.querySelectorAll('span')).find(n=>n.textContent?.includes('derivative'))?.firstChild;if(!node)throw Error('PDF glyphs missing');const i=node.textContent!.indexOf('derivative'),r=document.createRange();r.setStart(node,i);r.setEnd(node,i+10);const box=r.getBoundingClientRect();return{x:box.x,y:box.y,w:box.width,h:box.height};});
   await page.mouse.move(b.x+.3,b.y+b.h/2);await page.mouse.down();await page.mouse.move(b.x+b.w-.3,b.y+b.h/2,{steps:12});await page.mouse.up();
   await expect.poll(()=>page.evaluate(()=>getSelection()?.toString().trim())).toBe('derivative');
   await expect(page.locator('.reader-floating-toolbar')).toBeVisible();
   const action=page.getByRole('button',{name:/derivative.*사전 검색/});await expect(action).toBeVisible();
   const actionBox=await action.boundingBox(),toolbarBox=await page.locator('.reader-floating-toolbar').boundingBox();expect(actionBox).not.toBeNull();expect(toolbarBox).not.toBeNull();expect(actionBox!.y+actionBox!.height).toBeLessThanOrEqual(toolbarBox!.y-8);
   await page.screenshot({path:test.info().outputPath('reader-selection-controls.png'),fullPage:true});
   await page.getByRole('button',{name:/derivative.*사전 검색/}).click();const dictionary=page.getByRole('dialog',{name:'사전과 단어장'});const result=dictionary.getByRole('region',{name:'사전 검색 결과'});
   await expect(result.locator('.dictionary-senses li').first()).toBeVisible({timeout:40000});expect(await result.locator('.dictionary-senses li').count()).toBeGreaterThan(1);
   expect(await result.locator('p[lang=ko]').evaluateAll(nodes=>nodes.every(node=>/[가-힣]/.test(node.textContent||'')))).toBe(true);
   await expect(result.locator('details p').first()).toBeHidden();await expect(dictionary.getByRole('region',{name:'저장한 단어장'})).toContainText('2쪽');
   const books=await(await request.get(`${api}/api/library/books`,{headers:{Authorization:`Bearer ${actor.token}`}})).json();const terms=await(await request.get(`${api}/api/library/books/${books.books[0].id}/terms`,{headers:{Authorization:`Bearer ${actor.token}`}})).json();
   expect(terms.terms[0].page).toBe(2);expect(terms.terms[0].definition).toMatch(/[가-힣]/);
  });
  test('finger swipes turn pages while zooming and multiple contacts preserve the current page',async({page,request})=>{
   const actor=await createCloudActor(request);await openReader(page,actor);await swipe(page,engine);await expect(page.getByTestId('library-pdf-page')).toHaveAttribute('data-page','2');
   await swipe(page,engine,false);await expect(page.getByTestId('library-pdf-page')).toHaveAttribute('data-page','1');
   await swipe(page,engine,true,true);await expect(page.getByTestId('library-pdf-page')).toHaveAttribute('data-page','1');
   await showReaderTools(page);await page.getByRole('button',{name:'확대',exact:true}).click();await expect(page.getByTestId('library-pdf-page')).toHaveAttribute('data-page','1');await swipe(page,engine);
   await expect(page.getByTestId('library-pdf-page')).toHaveAttribute('data-page','1');
  });
 });
}
