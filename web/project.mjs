import {normalizeRect} from './model.mjs';

export const MAX_PROJECT_BYTES=10*1024*1024;
const invalid=()=>{throw new Error('편집 파일의 형식이나 값이 올바르지 않습니다.');};
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
function readRect(value){
  if(!isObject(value))invalid();
  const r=normalizeRect(value);
  if(!finite(r.x,0,100000)||!finite(r.y,0,100000)||!finite(r.w,3,100000)||!finite(r.h,3,100000)||
     typeof r.border!=='boolean'||typeof r.borderColor!=='string'||!/^#[0-9a-f]{6}$/i.test(r.borderColor)||
     !finite(r.borderWidth,1,20)||typeof r.transparent!=='boolean'||
     typeof r.text!=='string'||r.text.length>2000||!finite(r.fontSize,8,72))invalid();
  return {x:r.x,y:r.y,w:r.w,h:r.h,border:r.border,borderColor:r.borderColor.toLowerCase(),borderWidth:r.borderWidth,transparent:r.transparent,text:r.text,fontSize:r.fontSize};
}
export function createProject(meta,histories){
  return {format:'pdf-blank-editor',version:1,
    document:{name:meta.name,sha256:meta.sha256,pageCount:meta.pageCount},
    pages:[...histories].filter(([,h])=>h.current.length).sort(([a],[b])=>a-b).map(([number,h])=>({number,rects:h.current.map(readRect)}))};
}
export function parseProject(text,meta){
  if(typeof text!=='string'||text.length>MAX_PROJECT_BYTES)invalid();
  let data;try{data=JSON.parse(text);}catch{invalid();}
  if(!isObject(data)||data.format!=='pdf-blank-editor'||data.version!==1||!isObject(data.document)||!Array.isArray(data.pages))invalid();
  const doc=data.document;
  if(typeof doc.name!=='string'||doc.name.length>1024||typeof doc.sha256!=='string'||!/^([0-9a-f]{64})$/.test(doc.sha256)||
    !Number.isInteger(doc.pageCount)||doc.pageCount<1||doc.pageCount>100000)invalid();
  if(doc.sha256!==meta.sha256||doc.pageCount!==meta.pageCount)throw new Error('현재 PDF와 일치하지 않는 편집 파일입니다. 저장할 때 사용한 원본 PDF를 열어 주세요.');
  if(data.pages.length>doc.pageCount)invalid();
  const pages=new Map();let count=0;
  for(const page of data.pages){
    if(!isObject(page)||!Number.isInteger(page.number)||page.number<1||page.number>doc.pageCount||pages.has(page.number)||!Array.isArray(page.rects))invalid();
    count+=page.rects.length;if(count>10000)throw new Error('편집 파일은 최대 10,000개의 빈칸을 지원합니다.');
    pages.set(page.number,page.rects.map(readRect));
  }
  return pages;
}
export function validatePageBounds(rects,viewport){
  for(const r of rects)if(r.x+r.w>viewport.width+.001||r.y+r.h>viewport.height+.001)
    throw new Error('페이지 범위를 벗어난 빈칸이 있어 편집 파일을 불러올 수 없습니다.');
}
