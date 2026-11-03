import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from '../.dev/node_modules/playwright/index.mjs';
import { PDFDocument, rgb, degrees } from '../.dev/node_modules/pdf-lib/cjs/index.js';
import { unzipSync } from '../.dev/node_modules/fflate/esm/index.mjs';
import PDFKit from '../.dev/node_modules/pdfkit/js/pdfkit.js';

test('PDF editing and exported JPEGs work locally end to end', {timeout:120000}, async t=>{
  const server=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','server.ps1','-Port','18766','-NoBrowser']);
  let browser;
  try {
    for(let i=0;i<60;i++){try{await fetch('http://127.0.0.1:18766');break;}catch{await new Promise(r=>setTimeout(r,100));}}
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    const external=[],requests=[],errors=[];
    await context.route('**/*',route=>{
      const req=route.request();requests.push({url:req.url(),method:req.method()});
      if(new URL(req.url()).hostname!=='127.0.0.1'){external.push(req.url());return route.abort();}
      return route.continue();
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:18766');
    assert.equal(await page.locator('#dpi').inputValue(),'200');
    await mkdir('tests/artifacts',{recursive:true});
    await page.screenshot({path:'tests/artifacts/welcome.png',fullPage:true});
    // Observable behavior: opening the picker control must be wired before loading any document.
    const chooser=page.waitForEvent('filechooser',{timeout:3000});await page.locator('#open').click();
    let picker;try{picker=await chooser;}catch{assert.fail('PDF open button must open file picker');}
    const pdf=await PDFDocument.create();
    for(let i=0;i<3;i++){
      const p=pdf.addPage(i===1?[480,360]:i===2?[300,300]:[360,480]);
      p.drawRectangle({x:0,y:0,width:p.getWidth(),height:p.getHeight(),color:rgb(0.2,0.3,0.4)});
      p.drawText('LOCAL PDF TEST '+(i+1),{x:20,y:250,size:18,color:rgb(1,1,1)});
      if(i===1)p.setRotation(degrees(90));
    }
    const field=pdf.getForm().createTextField('original-form');field.setText('Keep me');
    field.addToPage(pdf.getPages()[2],{x:170,y:30,width:110,height:40,backgroundColor:rgb(1,1,1)});
    const input={name:'sample.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())};
    await picker.setFiles(input);
    await page.waitForFunction(()=>!document.querySelector('#draw').disabled && document.querySelector('#page-total').textContent==='/ 3');
    const drag=async(x1,y1,x2,y2)=>{
      const b=await page.locator('#overlay').boundingBox();
      await page.mouse.move(b.x+x1*b.width/360,b.y+y1*b.height/480);await page.mouse.down();
      await page.mouse.move(b.x+x2*b.width/360,b.y+y2*b.height/480,{steps:8});await page.mouse.up();
    };
    await t.test('draw, undo, redo, move, resize and zoom preserve rectangles',async()=>{
      await drag(30,30,120,80);assert.equal(await page.locator('#count').textContent(),'1');
      await drag(160,100,240,140);assert.equal(await page.locator('#count').textContent(),'2');
      await page.locator('#undo').click();assert.equal(await page.locator('#count').textContent(),'1');
      await page.locator('#redo').click();assert.equal(await page.locator('#count').textContent(),'2');
      await page.locator('#select').click();await drag(180,120,200,150);
      await drag(260,170,290,190);
      await page.locator('#zoom-in').click();await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
      assert.equal(await page.locator('#count').textContent(),'2');
      await page.locator('#next').click();await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
      await page.locator('#draw').click();await drag(30,30,100,70);
      await page.locator('#prev').click();await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
      assert.equal(await page.locator('#count').textContent(),'2');
    });
    await t.test('invalid PDF leaves previous document editable',async()=>{
      page.once('dialog',d=>d.accept());
      await page.locator('#file').setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a pdf')});
      await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('열 수 없'));
      assert.equal(await page.locator('#filename').textContent(),'sample.pdf');
      assert.equal(await page.locator('#count').textContent(),'2');
    });
    await t.test('export includes masks, rotated page and untouched page',async()=>{
      await page.locator('#dpi').selectOption('150');
      const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();
      const download=await downloadPromise;const zip=unzipSync(await readFile(await download.path()));
      assert.deepEqual(Object.keys(zip),['page-001.jpg','page-002.jpg','page-003.jpg']);
      const pixels=await page.evaluate(async encoded=>{
        const out=[];for(const src of encoded){const img=new Image();img.src='data:image/jpeg;base64,'+src;await img.decode();
          const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
          const pixel=(x,y)=>Array.from(ctx.getImageData(Math.floor(x*150/72),Math.floor(y*150/72),1,1).data);
          out.push({width:img.width,height:img.height,inside:pixel(60,50),border:pixel(30,50),outside:pixel(20,20),moved:pixel(280,180),old:pixel(170,110),form:pixel(270,250)});
        }return out;
      },Object.values(zip).map(x=>Buffer.from(x).toString('base64')));
      for(const p of pixels.slice(0,2)){assert.equal(p.width,750);assert.equal(p.height,1000);}
      assert.equal(pixels[2].width,625);assert.equal(pixels[2].height,625);
      assert.ok(pixels[0].inside.slice(0,3).every(x=>x>245));
      assert.ok(pixels[0].border.slice(0,3).every(x=>x<60));
      assert.ok(pixels[0].moved.slice(0,3).every(x=>x>245));
      assert.ok(pixels[0].old[0]<100);
      assert.ok(pixels[1].inside.slice(0,3).every(x=>x>245));
      assert.ok(pixels[2].inside[0]<100);
      assert.ok(pixels[2].form.slice(0,3).every(x=>x>245),'original PDF form appearance must be preserved');
    });
    await t.test('export cancellation unlocks editing',async()=>{
      await page.locator('#dpi').selectOption('300');await page.locator('#export').click();await page.locator('#cancel').click();
      await page.waitForFunction(()=>!document.querySelector('#export').disabled);
      assert.match(await page.locator('#status').textContent(),/취소/);
    });
    await t.test('cancelling while a page loads must not start its renderer',async()=>{
      const result=await page.evaluate(async bytes=>{
        const lib=await import('./web/vendor/pdfjs/pdf.mjs');const {exportPages}=await import('./web/export.mjs');
        const loading=lib.getDocument({data:new Uint8Array(bytes)}),doc=await loading.promise;
        const original=doc.getPage.bind(doc),controller=new AbortController();let renders=0;
        doc.getPage=async n=>{
          const p=await original(n),render=p.render.bind(p);p.render=opts=>{renders++;return render(opts);};
          controller.abort();await new Promise(r=>setTimeout(r,20));return p;
        };
        let outcome;try{await exportPages(doc,new Map(),{dpi:150,signal:controller.signal,onProgress:()=>{}});outcome='completed';}
        catch(e){outcome=e.name;}finally{await loading.destroy();}
        return {renders,outcome};
      },Array.from(input.buffer));
      assert.deepEqual(result,{renders:0,outcome:'AbortError'});
    });
    await t.test('deleting and undo restore the selected rectangle',async()=>{
      await page.locator('#select').click();await drag(60,50,60,50);await page.locator('#delete').click();
      assert.equal(await page.locator('#count').textContent(),'1');await page.locator('#undo').click();
      assert.equal(await page.locator('#count').textContent(),'2');
    });
    await t.test('rapid page input leaves latest page and its history visible',async()=>{
      await page.evaluate(()=>{
        const input=document.querySelector('#page-number');
        for(const n of [3,2,1]){input.value=n;input.dispatchEvent(new Event('change'));}
      });
      await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
      assert.equal(await page.locator('#page-number').inputValue(),'1');assert.equal(await page.locator('#count').textContent(),'2');
    });
    await page.screenshot({path:'tests/artifacts/editor.png',fullPage:true});
    await t.test('password cancel preserves old PDF and wrong password can be retried',async()=>{
      const protectedBytes=await new Promise(resolve=>{
        const doc=new PDFKit({userPassword:'test-secret',pdfVersion:'1.7',size:[360,480]});
        const chunks=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));
        doc.text('PASSWORD TEST');doc.end();
      });
      const encrypted={name:'protected.pdf',mimeType:'application/pdf',buffer:protectedBytes};
      page.once('dialog',d=>d.accept());
      await page.locator('#file').setInputFiles(encrypted);
      await page.locator('#password-cancel').click();
      await page.waitForFunction(()=>!document.querySelector('#open').disabled,{},{timeout:5000});
      assert.equal(await page.locator('#filename').textContent(),'sample.pdf');
      page.once('dialog',d=>d.accept());
      await page.locator('#file').setInputFiles(encrypted);
      await page.locator('#password').fill('wrong');await page.locator('#password-form button[type=submit]').click();
      await page.waitForFunction(()=>document.querySelector('#password-message').textContent.includes('올바르지'));
      await page.locator('#password').fill('test-secret');await page.locator('#password-form button[type=submit]').click();
      await page.waitForFunction(()=>document.querySelector('#filename').textContent==='protected.pdf');
      assert.equal(await page.locator('#password').inputValue(),'');
    });
    await t.test('only loopback GET resources are requested',async()=>{
      assert.deepEqual(external,[]);assert.ok(requests.every(r=>r.method==='GET'));assert.deepEqual(errors,[]);
    });
    await page.screenshot({path:'tests/artifacts/password-opened.png',fullPage:true});
  }finally{await browser?.close();server.kill();}
});




