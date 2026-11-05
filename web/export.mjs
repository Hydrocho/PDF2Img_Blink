import { Zip, ZipPassThrough } from './vendor/fflate.mjs';
import {normalizeRect} from './model.mjs';

export const BORDER_WIDTH = 1.2;
const FONT='"Malgun Gothic", "Segoe UI", sans-serif';
const segmenter=new Intl.Segmenter('ko',{granularity:'grapheme'});
function textLines(ctx,text,width,size){
  ctx.font=`${size}px ${FONT}`;const lines=[];
  for(const paragraph of text.replace(/\r\n?/g,'\n').split('\n')){
    let line='';
    for(const {segment} of segmenter.segment(paragraph)){
      if(line&&ctx.measureText(line+segment).width>width){lines.push(line);line=segment;}
      else line+=segment;
    }
    lines.push(line);
  }
  return lines;
}
function paintText(ctx,r){
  const padding=Math.min(4,r.w/8,r.h/8),width=r.w-2*padding,height=r.h-2*padding;
  let size=r.fontSize,lines=textLines(ctx,r.text,width,size);
  const fits=()=>lines.length*size*1.25<=height&&lines.every(line=>ctx.measureText(line).width<=width);
  // A bounded search keeps long multiline text responsive, even in tiny blanks.
  if(!fits()){
    let low=1,high=size;
    for(let i=0;i<8;i++){size=(low+high)/2;lines=textLines(ctx,r.text,width,size);if(fits())low=size;else high=size;}
    size=low;lines=textLines(ctx,r.text,width,size);
  }
  ctx.save();ctx.beginPath();ctx.rect(r.x+padding,r.y+padding,width,height);ctx.clip();
  ctx.fillStyle='#000';ctx.textAlign='center';ctx.textBaseline='middle';
  const lineHeight=size*1.25;
  // Even 1 pt may be too large for many explicit lines in a shallow blank.
  // Scale the whole layout down as a final step rather than dropping lines.
  const widest=Math.max(1,...lines.map(line=>ctx.measureText(line).width));
  const fitScale=Math.min(1,width/widest,height/(lines.length*lineHeight));
  ctx.translate(r.x+r.w/2,r.y+r.h/2);ctx.scale(fitScale,fitScale);
  const first=-(lines.length-1)*lineHeight/2;
  lines.forEach((line,i)=>ctx.fillText(line,0,first+i*lineHeight));ctx.restore();
}
export function paintRects(ctx, rects, scale) {
  ctx.save();ctx.scale(scale,scale);ctx.lineWidth=BORDER_WIDTH;
  for(const value of rects){
    const r=normalizeRect(value);ctx.fillStyle='#fff';ctx.fillRect(r.x,r.y,r.w,r.h);
    if(r.text)paintText(ctx,r);
    if(r.border){ctx.strokeStyle=r.borderColor;ctx.strokeRect(r.x,r.y,r.w,r.h);}
  }
  ctx.restore();
}
export function checkCanvasSize(width,height){
  if(width>16000||height>16000||width*height>40000000)throw new Error('페이지가 너무 큽니다. 출력 해상도를 낮춰 주세요.');
}
const checkAbort=signal=>{if(signal.aborted)throw new DOMException('취소되었습니다.','AbortError');};
export async function exportPages(pdf, histories, {dpi,signal,onProgress,format='zip'}) {
  if(!['zip','pdf'].includes(format))throw new Error('지원하지 않는 저장 형식입니다.');
  checkAbort(signal);
  const outputPdf=format==='pdf'?await (await import('./vendor/pdf-lib.mjs')).PDFDocument.create():null;
  checkAbort(signal);
  const chunks=[];let total=0,zipError;
  const zip=outputPdf?null:new Zip((err,data)=>{if(err){zipError=err;return;}total+=data.byteLength;chunks.push(data);});
  const canvas=document.createElement('canvas');
  const scale=dpi/72, digits=Math.max(3,String(pdf.numPages).length);
  try{
    for(let n=1;n<=pdf.numPages;n++){
      checkAbort(signal);onProgress(n-1,pdf.numPages);
      await new Promise(r=>setTimeout(r,0));checkAbort(signal);
      const page=await pdf.getPage(n);
      checkAbort(signal);
      const viewport=page.getViewport({scale});
      checkCanvasSize(Math.round(viewport.width),Math.round(viewport.height));
      canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);
      const ctx=canvas.getContext('2d',{alpha:false});
      const task=page.render({canvasContext:ctx,viewport,background:'#ffffff',annotationMode:1});
      const cancel=()=>task.cancel();signal.addEventListener('abort',cancel,{once:true});
      try{await task.promise;}catch(e){checkAbort(signal);throw e;}finally{signal.removeEventListener('abort',cancel);}
      checkAbort(signal);paintRects(ctx,histories.get(n)?.current??[],scale);
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('JPEG 변환에 실패했습니다.')),'image/jpeg',0.95));
      checkAbort(signal);
      const bytes=new Uint8Array(await blob.arrayBuffer());checkAbort(signal);
      if(outputPdf){
        total+=bytes.byteLength;
        if(total>512*1024*1024)throw new Error('결과가 512MB를 넘었습니다. 해상도를 낮추거나 PDF를 나누어 주세요.');
        const image=await outputPdf.embedJpg(bytes);checkAbort(signal);
        // New pages contain only the composed JPEG, never original PDF objects.
        const size=page.getViewport({scale:1});
        outputPdf.addPage([size.width,size.height]).drawImage(image,{x:0,y:0,width:size.width,height:size.height});
      }else{
        // STORE JPEGs: recompressing already compressed images wastes memory and CPU.
        const entry=new ZipPassThrough(`page-${String(n).padStart(digits,'0')}.jpg`);zip.add(entry);
        entry.push(bytes,true);
      }
      if(zipError)throw zipError;
      if(total>512*1024*1024)throw new Error('결과가 512MB를 넘었습니다. 해상도를 낮추거나 PDF를 나누어 주세요.');
      onProgress(n,pdf.numPages);
      canvas.width=canvas.height=1;
      page.cleanup();
      await new Promise(r=>setTimeout(r,0));
    }
    checkAbort(signal);
    if(outputPdf){
      const bytes=await outputPdf.save({objectsPerTick:20});checkAbort(signal);
      if(bytes.byteLength>512*1024*1024)throw new Error('결과가 512MB를 넘었습니다. 해상도를 낮추거나 PDF를 나누어 주세요.');
      return new Blob([bytes],{type:'application/pdf'});
    }
    zip.end();if(zipError)throw zipError;
    return new Blob(chunks,{type:'application/zip'});
  }finally{canvas.width=canvas.height=1;zip?.terminate();}
}


