export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function rectFromPoints(a, b, bounds) {
  const x1=clamp(a.x,0,bounds.width), y1=clamp(a.y,0,bounds.height);
  const x2=clamp(b.x,0,bounds.width), y2=clamp(b.y,0,bounds.height);
  return {x:Math.min(x1,x2),y:Math.min(y1,y2),w:Math.abs(x2-x1),h:Math.abs(y2-y1)};
}
export function moveRect(rect, dx, dy, bounds) {
  return {...rect,x:clamp(rect.x+dx,0,bounds.width-rect.w),y:clamp(rect.y+dy,0,bounds.height-rect.h)};
}
export function resizeRect(rect, anchor, point, bounds) {
  return {...rect,...rectFromPoints(anchor,point,bounds)};
}
export const RECT_DEFAULTS=Object.freeze({border:true,borderColor:'#000000',text:'',fontSize:16});
export function normalizeRect(rect){return {...RECT_DEFAULTS,...rect};}
export class History {
  #states=[[]]; #index=0;
  constructor(initial=[]){this.#states=[structuredClone(initial)];}
  get current(){return structuredClone(this.#states[this.#index]);}
  get canUndo(){return this.#index>0;}
  get canRedo(){return this.#index<this.#states.length-1;}
  commit(rects){
    if(JSON.stringify(rects)===JSON.stringify(this.#states[this.#index]))return;
    this.#states.splice(this.#index+1);this.#states.push(structuredClone(rects));this.#index++;
  }
  undo(){if(this.canUndo)this.#index--;return this.current;}
  redo(){if(this.canRedo)this.#index++;return this.current;}
}
