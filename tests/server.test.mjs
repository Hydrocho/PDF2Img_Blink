import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync } from 'node:fs';

const port = 18765;
const request = (path, method = 'GET', host = `127.0.0.1:${port}`) => new Promise((resolve,reject) => {
  const req = http.request({host:'127.0.0.1',port,path,method,headers:{Host:host}}, res => {
    const chunks=[]; res.on('data', c=>chunks.push(c));
    res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
  }); req.on('error',reject);req.end();
});
test('loopback static server restricts files, methods and hosts', async () => {
  assert.ok(existsSync('server.ps1'), 'local server must exist');
  assert.ok(existsSync('index.html'), 'entry HTML must exist at project root');
  const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','server.ps1','-Port',String(port),'-NoBrowser']);
  let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
  try {
    let ready=false;
    for(let i=0;i<60;i++) { try {await request('/');ready=true;break;}catch {await new Promise(r=>setTimeout(r,100));} }
    assert.ok(ready,output);
    const home=await request('/');assert.equal(home.status,200);assert.match(home.body.toString(),/PDF/);
    assert.match(home.headers['content-security-policy'],/connect-src 'self'/);
    assert.equal((await request('/','POST')).status,405);
    assert.equal((await request('/','GET','attacker.example')).status,403);
    assert.equal((await request('/%2e%2e/server.ps1')).status,403);
    assert.equal((await request('/vendor/%2e%2e/%2e%2e/server.ps1')).status,403);
    assert.equal((await request('/server.ps1')).status,404);
    assert.equal((await request('/README.md')).status,404);
    assert.equal((await request('/.dev/package.json')).status,404);
    const head=await request('/','HEAD');assert.equal(head.status,200);assert.equal(head.body.length,0);
    assert.match((await request('/web/model.mjs')).headers['content-type'],/javascript/);
  }finally{child.kill();}
});

