import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from '../.dev/node_modules/playwright/index.mjs';
import {PDFDocument,rgb} from '../.dev/node_modules/pdf-lib/cjs/index.js';
import {unzipSync} from '../.dev/node_modules/fflate/esm/index.mjs';

test('styled blanks and separate editing files', {timeout:120000},async t=>{
  const server=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','server.ps1','-Port','18769','-NoBrowser']);
  let browser;
  try{
    for(let i=0;i<60;i++){try{await fetch('http://127.0.0.1:18769');break;}catch{await new Promise(r=>setTimeout(r,100));}}
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
    const requests=[],errors=[];
    await context.route('**/*',r=>{requests.push(r.request());return new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort();});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
    await page.goto('http://127.0.0.1:18769');
    // bootstrap loads app.mjs dynamically: wait for its input handlers before uploading.
    await page.waitForFunction(()=>!document.querySelector('#open').disabled);
    assert.equal(await page.locator('#border-visible').count(),1,'border settings must exist');
    const doc=await PDFDocument.create();for(let i=0;i<2;i++)doc.addPage([360,480]).drawRectangle({x:0,y:0,width:360,height:480,color:rgb(.2,.3,.4)});
    const input={name:'원본.pdf',mimeType:'application/pdf',buffer:Buffer.from(await doc.save())};
    const open=async file=>{await page.locator('#file').setInputFiles(file);await page.waitForFunction(()=>!document.querySelector('#draw').disabled);};
    await open(input);
    const drag=async(x1,y1,x2,y2)=>{
      const b=await page.locator('#overlay').boundingBox();await page.mouse.move(b.x+x1*b.width/360,b.y+y1*b.height/480);
      await page.mouse.down();await page.mouse.move(b.x+x2*b.width/360,b.y+y2*b.height/480,{steps:6});await page.mouse.up();
    };
    const select=async(x,y)=>{await page.locator('#select').click();await drag(x,y,x,y);};
    const download=async id=>{const promise=page.waitForEvent('download');await page.locator(id).click();return readFile(await (await promise).path());};
    const setColor=async color=>page.locator('#border-color').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},color);
    let saved;
    await t.test('many explicit text lines fit inside a shallow blank',async()=>{
      const centers=await page.evaluate(async()=>{
        const {paintRects}=await import('./web/export.mjs');const c=document.createElement('canvas');c.width=140;c.height=40;
        const ctx=c.getContext('2d'),original=ctx.fillText.bind(ctx),positions=[];
        ctx.fillText=(text,x,y)=>{const m=ctx.getTransform();positions.push(m.b*x+m.d*y+m.f);original(text,x,y);};
        paintRects(ctx,[{x:10,y:10,w:100,h:10,text:'1\n2\n3\n4\n5\n6\n7\n8\n9\n10',fontSize:16}],1);
        return positions;
      });
      assert.equal(centers.length,10);assert.ok(centers.every(y=>y>=11.25&&y<=18.75),'all ten lines must remain inside the text area');
    });
    await t.test('border color, visibility and Korean text survive resize and export',async()=>{
      await drag(30,30,150,100);await select(60,50);await setColor('#ff0000');await page.locator('#blank-text').fill('한글 ABC');
      await page.locator('#font-size').fill('20');await page.locator('#font-size').dispatchEvent('change');
      await drag(150,100,170,120);
      assert.equal(await page.locator('#blank-text').inputValue(),'한글 ABC');assert.equal(await page.locator('#border-color').inputValue(),'#ff0000');
      await page.locator('#draw').click();await drag(190,40,310,110);await select(220,70);await page.locator('#border-visible').uncheck();
      await page.locator('#blank-text').fill('두 번째');
      await page.locator('#next').click();await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
      await page.locator('#draw').click();await drag(40,40,140,90);
      saved=await download('#save-project');const data=JSON.parse(saved);
      assert.equal(data.pages.length,2);assert.equal(data.pages[0].rects[0].text,'한글 ABC');assert.equal(data.pages[0].rects[0].borderColor,'#ff0000');
      assert.equal(data.pages[0].rects[0].w,140);assert.equal(data.pages[0].rects[1].border,false);assert.equal(data.document.name,'원본.pdf');
      await page.locator('#dpi').selectOption('150');const zip=unzipSync(await download('#export'));
      const pixels=await page.evaluate(async b64=>{
        const img=new Image();img.src='data:image/jpeg;base64,'+b64;await img.decode();
        const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
        const at=(x,y)=>Array.from(ctx.getImageData(Math.floor(x*150/72),Math.floor(y*150/72),1,1).data);
        const area=ctx.getImageData(90,90,230,140).data;let dark=0;for(let i=0;i<area.length;i+=4)if(area[i]<80&&area[i+1]<80&&area[i+2]<80)dark++;
        return {red:at(30,60),none:at(190.5,60),dark};
      },Buffer.from(zip['page-001.jpg']).toString('base64'));
      assert.ok(pixels.red[0]>180&&pixels.red[1]<90&&pixels.red[2]<90);assert.ok(pixels.none.slice(0,3).every(n=>n>240));
      assert.ok(pixels.dark>40,'text must be painted into JPEG');
    });
    await t.test('property changes undo and redo with their rectangle',async()=>{
      await page.locator('#prev').click();await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
      await select(60,50);await page.locator('#blank-text').fill('수정한 내용');
      await page.locator('#undo').click();await select(60,50);assert.equal(await page.locator('#blank-text').inputValue(),'한글 ABC');
      await page.locator('#redo').click();await select(60,50);assert.equal(await page.locator('#blank-text').inputValue(),'수정한 내용');
      await page.locator('#undo').click();
    });
    await t.test('same PDF with new filename restores all edits after fresh open',async()=>{
      await open({...input,name:'이름변경.pdf'});assert.equal(await page.locator('#count').textContent(),'0');
      await page.locator('#project-file').setInputFiles({name:'saved.blank.json',mimeType:'application/json',buffer:saved});
      await page.waitForFunction(()=>document.querySelector('#count').textContent==='2');
      await select(60,50);assert.equal(await page.locator('#blank-text').inputValue(),'한글 ABC');assert.equal(await page.locator('#border-color').inputValue(),'#ff0000');
      await select(220,70);assert.equal(await page.locator('#border-visible').isChecked(),false);
      await page.locator('#next').click();await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
      assert.equal(await page.locator('#count').textContent(),'1');
    });
    await t.test('bad project and out-of-page geometry do not replace edits',async()=>{
      for(const bad of [Buffer.from('{'),Buffer.from(JSON.stringify({...JSON.parse(saved),pages:[{number:1,rects:[{...JSON.parse(saved).pages[0].rects[0],x:1000}]}]}))]){
        await page.locator('#project-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:bad});
        await page.waitForFunction(()=>document.querySelector('#status').classList.contains('error'));
        assert.equal(await page.locator('#count').textContent(),'1');
      }
    });
    await t.test('JPEG export does not mark edit project saved; overwrite cancel preserves text',async()=>{
      await select(80,60);await page.locator('#blank-text').fill('미저장');await download('#export');
      let confirms=0;page.once('dialog',async d=>{confirms++;await d.dismiss();});
      await page.locator('#project-file').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:saved});
      await page.waitForFunction(()=>!document.querySelector('#save-project').disabled);
      assert.equal(confirms,1);assert.equal(await page.locator('#blank-text').inputValue(),'미저장');
      page.once('dialog',d=>d.dismiss());await page.locator('#file').setInputFiles(input);
      assert.equal(await page.locator('#blank-text').inputValue(),'미저장');
      await download('#save-project');
    });
    await t.test('different PDF is rejected despite same name and page count',async()=>{
      const other=await PDFDocument.create();other.addPage([360,480]);other.addPage([360,480]);
      await open({...input,buffer:Buffer.from(await other.save())});
      await page.locator('#project-file').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:saved});
      await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('일치하지'));
      assert.equal(await page.locator('#count').textContent(),'0');
    });
    assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method()==='GET'&&new URL(r.url()).hostname==='127.0.0.1'));
    await open(input);await page.locator('#project-file').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:saved});
    await page.waitForFunction(()=>document.querySelector('#count').textContent==='2');await select(60,50);
    await mkdir('tests/artifacts',{recursive:true});await page.screenshot({path:'tests/artifacts/styles.png',fullPage:true});
  }finally{await browser?.close();server.kill();}
});

