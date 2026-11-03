import * as pdfjs from './vendor/pdfjs/pdf.mjs';
import { History, clamp, rectFromPoints, moveRect, resizeRect, normalizeRect, RECT_DEFAULTS } from './model.mjs';
import { paintRects, checkCanvasSize, exportPages } from './export.mjs';
import {createProject,parseProject,validatePageBounds,MAX_PROJECT_BYTES} from './project.mjs';

pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
const $=id=>document.getElementById(id);
let pdf=null, pageNumber=1, zoom=1, bounds={width:1,height:1}, histories=new Map();
let mode='draw', selected=-1, gesture=null, rendering=false, loading=false, exporting=false;
let renderTask=null, renderVersion=0, exportController=null, savedSignature='[]', pendingPassword=null;
let documentMeta=null,defaults={...RECT_DEFAULTS};
const history=()=>{if(!histories.has(pageNumber))histories.set(pageNumber,new History());return histories.get(pageNumber);};
const signature=()=>JSON.stringify([...histories].filter(([,h])=>h.current.length).sort(([a],[b])=>a-b).map(([n,h])=>[n,h.current]));
const dirty=()=>signature()!==savedSignature;
const busy=()=>rendering||loading||exporting;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function controls(){
  const off=!pdf||busy();
  for(const id of ['draw','select','zoom-in','zoom-out','fit','page-number','export','save-project','load-project'])$(id).disabled=off;
  $('open').disabled=$('open-empty').disabled=loading||exporting;
  $('dpi').disabled=exporting;
  $('prev').disabled=off||pageNumber<=1;$('next').disabled=off||pageNumber>=pdf.numPages;
  $('undo').disabled=off||!history().canUndo;$('redo').disabled=off||!history().canRedo;
  $('delete').disabled=off||selected<0;
  $('page-number').value=pageNumber;$('page-number').max=pdf?.numPages??1;
  $('page-total').textContent=`/ ${pdf?.numPages??0}`;
  $('zoom-label').textContent=`${Math.round(zoom*100)}%`;
  $('count').textContent=pdf?history().current.length:0;
  $('overlay').style.cursor=mode==='draw'?'crosshair':'default';
  $('overlay').style.pointerEvents=off?'none':'auto';
  for(const id of ['draw','select'])$(id).setAttribute('aria-pressed',String(mode===id));
  inspector(off);
}
function inspector(off){
  const current=pdf&&selected>=0?history().current[selected]:null,r=normalizeRect(current??defaults);
  $('property-title').textContent=current?'선택한 빈칸':'새 빈칸 설정';
  $('property-hint').textContent=current?'이 빈칸의 테두리와 텍스트를 편집합니다.':'테두리 설정은 앞으로 그리는 빈칸에 적용됩니다.';
  $('border-visible').disabled=off;$('border-color').disabled=off||!r.border;$('font-size').disabled=off;
  $('blank-text').disabled=off||!current;
  $('border-visible').checked=r.border;
  for(const [id,value] of [['border-color',r.borderColor],['blank-text',current?r.text:''],['font-size',r.fontSize]]){
    if(document.activeElement!==$(id))$(id).value=value;
  }
  $('save-state').textContent=!pdf?'편집 파일로 저장하면 나중에 이어서 작업할 수 있어요.':dirty()?'저장하지 않은 편집 내용이 있습니다.':'편집 파일 기준으로 변경 사항이 없습니다.';
}
function changeProperty(key,value){
  if(!pdf||busy())return;
  if(selected>=0){const rects=history().current;rects[selected]={...normalizeRect(rects[selected]),[key]:value};history().commit(rects);redraw();}
  else if(key!=='text')defaults[key]=value;
  controls();
}
$('border-visible').onchange=e=>changeProperty('border',e.target.checked);
$('border-color').oninput=e=>changeProperty('borderColor',e.target.value);
$('blank-text').oninput=e=>{if(!e.isComposing)changeProperty('text',e.target.value);};
$('blank-text').addEventListener('compositionend',e=>changeProperty('text',e.target.value));
$('font-size').onchange=e=>{const value=Number(e.target.value);if(Number.isFinite(value)&&value>=8&&value<=72)changeProperty('fontSize',value);else{e.target.value=selected>=0?normalizeRect(history().current[selected]).fontSize:defaults.fontSize;}};
function redraw(rects=history().current){
  const c=$('overlay'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
  const scale=c.width/bounds.width;paintRects(ctx,rects,scale);
  if(selected>=0&&rects[selected]){
    const r=rects[selected],s=7*(window.devicePixelRatio||1);
    ctx.save();ctx.strokeStyle='#258eaa';ctx.lineWidth=1.5*(window.devicePixelRatio||1);ctx.setLineDash([5,4]);
    ctx.strokeRect(r.x*scale-3,r.y*scale-3,r.w*scale+6,r.h*scale+6);ctx.setLineDash([]);
    for(const [x,y] of [[r.x,r.y],[r.x+r.w,r.y],[r.x,r.y+r.h],[r.x+r.w,r.y+r.h]]){
      ctx.fillStyle='#fff';ctx.fillRect(x*scale-s/2,y*scale-s/2,s,s);ctx.strokeRect(x*scale-s/2,y*scale-s/2,s,s);
    }ctx.restore();
  }
}
async function snapshot(doc,n,scale){
  const page=await doc.getPage(n),base=page.getViewport({scale:1}),viewport=page.getViewport({scale});
  const ratio=Math.min(window.devicePixelRatio||1,2),canvas=document.createElement('canvas');
  checkCanvasSize(Math.ceil(viewport.width*ratio),Math.ceil(viewport.height*ratio));
  canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);
  const task=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport,transform:[ratio,0,0,ratio,0,0],background:'#ffffff',annotationMode:1});
  renderTask=task;await task.promise;
  return {canvas,base,viewport};
}
function display({canvas,base,viewport}){
  bounds={width:base.width,height:base.height};
  const target=$('pdf-canvas'),overlay=$('overlay');
  for(const c of [target,overlay]){c.width=canvas.width;c.height=canvas.height;c.style.width=`${viewport.width}px`;c.style.height=`${viewport.height}px`;}
  target.getContext('2d').drawImage(canvas,0,0);canvas.width=canvas.height=1;
  $('paper').style.width=`${viewport.width}px`;$('paper').style.height=`${viewport.height}px`;
  $('paper').hidden=false;$('empty').hidden=true;redraw();
}
async function render(n=pageNumber,newZoom=zoom){
  if(!pdf||loading||exporting)return;
  cancelGesture();const version=++renderVersion;renderTask?.cancel();rendering=true;controls();
  try{
    const shot=await snapshot(pdf,n,newZoom);
    if(version!==renderVersion){shot.canvas.width=shot.canvas.height=1;return;}
    pageNumber=n;zoom=newZoom;selected=-1;display(shot);status(`${n} / ${pdf.numPages} 페이지 · 드래그하여 빈칸을 그리세요.`);
  }catch(e){if(version===renderVersion&&e.name!=='RenderingCancelledException')status(`페이지를 표시할 수 없습니다. ${e.message}`,true);}
  finally{if(version===renderVersion){rendering=false;renderTask=null;controls();}}
}
function askPassword(update,reason,task){
  $('password-message').textContent=reason===pdfjs.PasswordResponses.INCORRECT_PASSWORD?'암호가 올바르지 않습니다. 다시 입력하세요.':'이 문서는 암호로 보호되어 있습니다.';
  $('password').value='';pendingPassword={update,task};
  if(!$('password-dialog').open)$('password-dialog').showModal();$('password').focus();
}
function cancelPassword(){const pending=pendingPassword;pendingPassword=null;$('password').value='';$('password-dialog').close();pending?.task.destroy();}
$('password-form').addEventListener('submit',e=>{e.preventDefault();const pending=pendingPassword;pendingPassword=null;const value=$('password').value;$('password').value='';$('password-dialog').close();pending?.update(value);});
$('password-cancel').onclick=cancelPassword;
$('password-dialog').addEventListener('cancel',e=>{e.preventDefault();cancelPassword();});
async function openFile(file){
  if(!file||loading||exporting)return;
  if(dirty()&&!confirm('새 PDF를 열면 현재 빈칸 편집 내용이 사라집니다. 계속할까요?'))return;
  cancelGesture();++renderVersion;renderTask?.cancel();rendering=false;loading=true;controls();status('PDF를 읽고 있습니다…');
  let task,candidate;
  try{
    const bytes=new Uint8Array(await file.arrayBuffer());
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    task=pdfjs.getDocument({data:bytes,
      cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,
      iccUrl:new URL('./vendor/pdfjs/iccs/',import.meta.url).href,
      standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,
      wasmUrl:new URL('./vendor/pdfjs/wasm/',import.meta.url).href,isEvalSupported:false,enableXfa:false});
    task.onPassword=(update,reason)=>askPassword(update,reason,task);
    candidate=await task.promise;
    const first=await candidate.getPage(1),base=first.getViewport({scale:1});
    const fit=clamp(($('viewport').clientWidth-70)/base.width,.25,1.3);
    const shot=await snapshot(candidate,1,fit);
    const old=pdf;pdf=candidate;candidate=null;pageNumber=1;zoom=fit;histories=new Map();savedSignature='[]';selected=-1;
    documentMeta={name:file.name,sha256:hash,pageCount:pdf.numPages};
    $('filename').textContent=file.name;$('document-info').textContent=`${pdf.numPages}페이지 · 로컬 PDF`;
    display(shot);status('PDF를 열었습니다. 가릴 부분을 드래그하세요.');
    old?.loadingTask.destroy().catch(()=>{});
  }catch(e){
    if(candidate)await candidate.loadingTask.destroy().catch(()=>{});else if(task)await task.destroy().catch(()=>{});
    status('PDF를 열 수 없습니다. 파일이 손상되었거나 암호 입력이 취소되었습니다.',true);
  }finally{loading=false;renderTask=null;pendingPassword=null;if($('password-dialog').open)$('password-dialog').close();controls();}
}
$('file').addEventListener('change',e=>{const f=e.target.files[0];e.target.value='';openFile(f);});
for(const id of ['open','open-empty'])$(id).onclick=()=>$('file').click();
for(const id of ['draw','select'])$(id).onclick=()=>{cancelGesture();mode=id;selected=-1;$('mode-hint').textContent=mode==='draw'?'가릴 부분을 마우스로 드래그하세요. 흰색 바탕과 검은 테두리로 채워집니다.':'빈칸을 클릭해 선택하고 이동하세요. 모서리를 끌어 크기를 바꿀 수 있습니다.';redraw();controls();};
$('prev').onclick=()=>render(pageNumber-1);$('next').onclick=()=>render(pageNumber+1);
$('page-number').onchange=e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=1&&n<=pdf.numPages)render(n);else controls();};
$('zoom-in').onclick=()=>render(pageNumber,clamp(zoom+.2,.25,3));$('zoom-out').onclick=()=>render(pageNumber,clamp(zoom-.2,.25,3));
$('fit').onclick=()=>render(pageNumber,clamp(($('viewport').clientWidth-70)/bounds.width,.25,3));
function undo(redo=false){if(!pdf||busy())return;cancelGesture();redo?history().redo():history().undo();selected=-1;redraw();controls();}
$('undo').onclick=()=>undo();$('redo').onclick=()=>undo(true);
function remove(){if(!pdf||busy()||selected<0)return;const rects=history().current;rects.splice(selected,1);history().commit(rects);selected=-1;redraw();controls();}
$('delete').onclick=remove;
function point(event){const b=$('overlay').getBoundingClientRect();return{x:clamp((event.clientX-b.left)/b.width*bounds.width,0,bounds.width),y:clamp((event.clientY-b.top)/b.height*bounds.height,0,bounds.height)};}
function cancelGesture(){if(!gesture)return;gesture=null;redraw();}
$('overlay').addEventListener('pointerdown',e=>{
  if(busy()||!pdf||e.button!==0||gesture)return;e.preventDefault();$('overlay').focus();
  const p=point(e),rects=history().current;
  if(mode==='draw'){selected=-1;gesture={type:'draw',start:p,rects,index:rects.length,pointer:e.pointerId};}
  else{
    let anchor=null;const r=rects[selected],tol=9/zoom;
    if(r)for(const [x,y,ax,ay] of [[r.x,r.y,r.x+r.w,r.y+r.h],[r.x+r.w,r.y,r.x,r.y+r.h],[r.x,r.y+r.h,r.x+r.w,r.y],[r.x+r.w,r.y+r.h,r.x,r.y]]){
      if(Math.abs(p.x-x)<=tol&&Math.abs(p.y-y)<=tol){anchor={x:ax,y:ay};break;}
    }
    if(anchor)gesture={type:'resize',anchor,start:p,rects,index:selected,pointer:e.pointerId};
    else{
      selected=rects.findLastIndex(r=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h);
      if(selected>=0)gesture={type:'move',start:p,rects,index:selected,pointer:e.pointerId};
    }
  }
  if(gesture)$('overlay').setPointerCapture(e.pointerId);redraw();controls();
});
function gestureRects(e){
  const p=point(e),g=gesture,rects=structuredClone(g.rects);
  if(g.type==='draw')rects[g.index]={...defaults,text:'',...rectFromPoints(g.start,p,bounds)};
  if(g.type==='resize')rects[g.index]=resizeRect(g.rects[g.index],g.anchor,p,bounds);
  if(g.type==='move')rects[g.index]=moveRect(g.rects[g.index],p.x-g.start.x,p.y-g.start.y,bounds);
  return rects;
}
$('overlay').addEventListener('pointermove',e=>{if(gesture&&gesture.pointer===e.pointerId)redraw(gestureRects(e));});
$('overlay').addEventListener('pointerup',e=>{
  if(!gesture||gesture.pointer!==e.pointerId)return;const g=gesture,rects=gestureRects(e),r=rects[g.index];gesture=null;
  if(r&&r.w>=3&&r.h>=3){history().commit(rects);selected=g.index;}
  if($('overlay').hasPointerCapture(e.pointerId))$('overlay').releasePointerCapture(e.pointerId);redraw();controls();
});
$('overlay').addEventListener('pointercancel',cancelGesture);
$('overlay').addEventListener('lostpointercapture',cancelGesture);
document.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea')||busy()||!pdf)return;
  if(e.key==='Escape'){cancelGesture();selected=-1;redraw();controls();}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();undo(true);}
});
window.addEventListener('beforeunload',e=>{if(dirty()||exporting){e.preventDefault();e.returnValue='';}});
$('cancel').onclick=()=>{exportController?.abort();$('cancel').disabled=true;status('변환을 취소하고 있습니다…');};
$('export').onclick=async()=>{
  if(!pdf||busy())return;cancelGesture();exporting=true;controls();$('progress-box').hidden=false;$('cancel').disabled=false;$('progress').value=0;
  exportController=new AbortController();
  try{
    const blob=await exportPages(pdf,histories,{dpi:Number($('dpi').value),signal:exportController.signal,onProgress:(done,total)=>{
      $('progress').value=done/total*100;status(`JPEG 변환 중… ${done} / ${total} 페이지`);
    }});
    if(exportController.signal.aborted)throw new DOMException('취소','AbortError');
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
    a.download=$('filename').textContent.replace(/\.pdf$/i,'').replace(/[<>:"/\\|?*]/g,'_')+'-빈칸-JPEG.zip';
    a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    status(`${pdf.numPages}페이지 변환 완료 · ZIP 다운로드를 시작했습니다.`);
  }catch(e){status(e.name==='AbortError'?'변환을 취소했습니다.':`저장에 실패했습니다. ${e.message}`,e.name!=='AbortError');}
  finally{exporting=false;exportController=null;$('progress-box').hidden=true;controls();}
};
function downloadBlob(blob,suffix){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
  a.download=documentMeta.name.replace(/\.pdf$/i,'').replace(/[<>:"/\\|?*]/g,'_')+suffix;
  a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
$('save-project').onclick=()=>{
  if(!pdf||busy())return;cancelGesture();
  try{
    const text=JSON.stringify(createProject(documentMeta,histories),null,2),blob=new Blob([text],{type:'application/json'});
    if(blob.size>MAX_PROJECT_BYTES)throw new Error('편집 파일이 10MB를 넘었습니다. 빈칸 수나 텍스트를 줄여 주세요.');
    parseProject(text,documentMeta);
    downloadBlob(blob,'.blank.json');savedSignature=signature();controls();status('편집 파일 다운로드를 시작했습니다. 원본 PDF와 함께 보관하세요.');
  }catch(e){status(`편집 저장에 실패했습니다. ${e.message}`,true);}
};
$('load-project').onclick=()=>$('project-file').click();
$('project-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file||!pdf||busy())return;
  cancelGesture();loading=true;controls();status('편집 파일을 확인하고 있습니다…');
  try{
    if(file.size>MAX_PROJECT_BYTES)throw new Error('편집 파일은 10MB 이하만 지원합니다.');
    const pages=parseProject(await file.text(),documentMeta);
    for(const [n,rects] of pages){const p=await pdf.getPage(n);validatePageBounds(rects,p.getViewport({scale:1}));}
    if(dirty()&&!confirm('저장하지 않은 편집 내용을 불러온 내용으로 바꿀까요?')){status('편집 불러오기를 취소했습니다.');return;}
    histories=new Map([...pages].map(([n,rects])=>[n,new History(rects)]));selected=-1;savedSignature=signature();redraw();
    status('편집 내용을 불러왔습니다. 이어서 작업할 수 있습니다.');
  }catch(error){status(`편집 파일을 불러올 수 없습니다. ${error.message}`,true);}
  finally{loading=false;controls();}
};
controls();



