import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {chromium} from '../.dev/node_modules/playwright/index.mjs';
test('direct HTML opening explains launcher instead of leaving dead controls',async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage();await page.goto(pathToFileURL(resolve('index.html')).href);
    assert.equal(await page.locator('#startup-help').isVisible(),true);
    assert.match(await page.locator('#startup-help').textContent(),/start\.cmd/);
    assert.equal(await page.locator('#open').isDisabled(),true);
  }finally{await browser.close();}
});

