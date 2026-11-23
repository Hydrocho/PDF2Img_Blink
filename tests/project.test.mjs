import test from 'node:test';
import assert from 'node:assert/strict';
import {History} from '../web/model.mjs';
const project=await import('../web/project.mjs').catch(()=>({}));
const model=await import('../web/model.mjs');
const meta={name:'원본.pdf',sha256:'a'.repeat(64),pageCount:3};
const rect={x:10,y:20,w:80,h:40,border:false,borderColor:'#ff0000',borderWidth:1,transparent:false,text:'한글\n빈칸',fontSize:16};
const example=()=>({format:'pdf-blank-editor',version:1,document:meta,pages:[{number:2,rects:[rect]}]});
test('sidecar roundtrip preserves styles and text across pages without embedding PDF',()=>{
  assert.equal(typeof project.createProject,'function');
  const h=new History();h.commit([rect]);const content=project.createProject(meta,new Map([[2,h]]));
  assert.deepEqual(project.parseProject(JSON.stringify(content),{...meta,name:'renamed.pdf'}).get(2),[rect]);
  assert.deepEqual(Object.keys(content).sort(),['document','format','pages','version']);
  assert.deepEqual(Object.keys(content.document).sort(),['name','pageCount','sha256']);
});
test('sidecar rejects different PDF bytes even with same filename and page count',()=>{
  assert.equal(typeof project.parseProject,'function');
  assert.throws(()=>project.parseProject(JSON.stringify(example()),{...meta,sha256:'b'.repeat(64)}),/PDF/);
});
test('sidecar rejects invalid structure, page duplicates, colors, types and unbounded values',()=>{
  assert.equal(typeof project.parseProject,'function');
  const invalid=[null,{}, {...example(),version:99}, {...example(),pages:[example().pages[0],example().pages[0]]}];
  for(const patch of [{x:-1},{w:0},{x:'1'},{border:'false'},{borderWidth:0},{borderWidth:21},{borderWidth:'1'},{transparent:'false'},{fontSize:0},{text:'a'.repeat(2001)},{borderColor:'url(https://x)'},{h:Infinity}]){
    invalid.push({...example(),pages:[{number:2,rects:[{...rect,...patch}]}]});
  }
  invalid.push({...example(),pages:[{number:4,rects:[rect]}]});
  for(const data of invalid)assert.throws(()=>project.parseProject(JSON.stringify(data),meta));
  assert.throws(()=>project.parseProject('{',meta));
});
test('sidecar cannot place rectangles outside the actual PDF page',()=>{
  assert.equal(typeof project.validatePageBounds,'function');
  assert.doesNotThrow(()=>project.validatePageBounds([rect],{width:100,height:100}));
  assert.throws(()=>project.validatePageBounds([{...rect,x:50}],{width:100,height:100}));
});
test('resizing preserves text and styling instead of replacing with geometry only',()=>{
  assert.equal(typeof model.resizeRect,'function');
  assert.deepEqual(model.resizeRect(rect,{x:10,y:20},{x:150,y:90},{width:200,height:100}),{...rect,w:140,h:70});
});
test('imported history starts at clean baseline and edits can be undone to it',()=>{
  const h=new History([rect]);assert.deepEqual(h.current,[rect]);assert.equal(h.canUndo,false);
  h.commit([{...rect,text:'changed'}]);h.undo();assert.equal(h.current[0].text,'한글\n빈칸');
});
test('sidecar accepts legacy project without borderWidth and transparent',()=>{
  const legacyRect={x:10,y:20,w:80,h:40,border:true,borderColor:'#000000',text:'구버전',fontSize:16};
  const legacyData={format:'pdf-blank-editor',version:1,document:meta,pages:[{number:1,rects:[legacyRect]}]};
  const parsed=project.parseProject(JSON.stringify(legacyData),meta);
  assert.deepEqual(parsed.get(1),[{...legacyRect,borderWidth:1,transparent:false}]);
});
