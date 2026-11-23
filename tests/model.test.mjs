import test from 'node:test';
import assert from 'node:assert/strict';
const mod=await import('../web/model.mjs').catch(()=>({}));
test('reverse drag and bounds produce a stable page-space rectangle',()=>{
  assert.equal(typeof mod.rectFromPoints,'function');
  assert.deepEqual(mod.rectFromPoints({x:90,y:80},{x:-10,y:20},{width:100,height:100}),{x:0,y:20,w:90,h:60});
});
test('moving a rectangle clamps its whole area inside page',()=>{
  assert.equal(typeof mod.moveRect,'function');
  assert.deepEqual(mod.moveRect({x:10,y:10,w:30,h:20},100,-100,{width:100,height:100}),{x:70,y:0,w:30,h:20});
});
test('history snapshots are independent and a new edit clears redo',()=>{
  assert.equal(typeof mod.History,'function');
  const h=new mod.History(), a=[{x:1,y:2,w:3,h:4}];h.commit(a);a[0].x=99;
  assert.equal(h.current[0].x,1);h.undo();assert.equal(h.current.length,0);h.redo();assert.equal(h.current[0].x,1);
  h.undo();h.commit([{x:5,y:6,w:7,h:8}]);assert.equal(h.canRedo,false);
});
test('RECT_DEFAULTS includes borderWidth and transparent defaults',()=>{
  assert.deepEqual(mod.RECT_DEFAULTS,{border:true,borderColor:'#000000',borderWidth:1,transparent:false,text:'',fontSize:16});
  assert.deepEqual(mod.normalizeRect({x:5,y:5,w:10,h:10}),{x:5,y:5,w:10,h:10,border:true,borderColor:'#000000',borderWidth:1,transparent:false,text:'',fontSize:16});
});
