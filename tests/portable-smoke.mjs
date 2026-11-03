import {spawn} from 'node:child_process';
import {chromium} from '../.dev/node_modules/playwright/index.mjs';
import {PDFDocument} from '../.dev/node_modules/pdf-lib/cjs/index.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const server=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','.dev/portable root check/PDF-Blank-Editor/server.ps1','-Port','18768','-NoBrowser']);
let browser;
try{
  for(let i=0;i<50;i++){try{await fetch('http://127.0.0.1:18768');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:18768');assert.equal(await page.locator('#dpi').inputValue(),'200');
  await page.waitForFunction(()=>!document.querySelector('#open').disabled);
  const pdf=await PDFDocument.create();pdf.addPage([200,200]).drawText('Portable check',{x:10,y:100,size:14});
  await page.locator('#file').setInputFiles({name:'portable.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await page.waitForFunction(()=>!document.querySelector('#export').disabled);
  const box=await page.locator('#overlay').boundingBox();
  await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.mouse.move(box.x+180,box.y+100);await page.mouse.up();
  await page.locator('#blank-text').fill('배포 확인');await page.locator('#border-visible').uncheck();
  const editDownload=page.waitForEvent('download');await page.locator('#save-project').click();
  const saved=await readFile(await (await editDownload).path());assert.equal(JSON.parse(saved).pages[0].rects[0].text,'배포 확인');
  await page.locator('#project-file').setInputFiles({name:'saved.blank.json',mimeType:'application/json',buffer:saved});
  await page.waitForFunction(()=>!document.querySelector('#export').disabled);
  const download=page.waitForEvent('download');await page.locator('#export').click();const result=await download;
  assert.match(result.suggestedFilename(),/\.zip$/);console.log('Portable extracted app: PDF open, styled text, JSON save/load, ZIP export and default 200 DPI PASS.');
}finally{await browser?.close();server.kill();}


