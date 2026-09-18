import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
const dir = new URL("../artifacts/owner-feedback/",import.meta.url);
await mkdir(dir,{recursive:true});
await writeFile(new URL("baseline-compose.ts",dir),execFileSync("git",["show","2d2c51ad0cc839e1da306c47f23a6a9a60f89742:src/lib/compose.ts"],{encoding:"utf8"}).replaceAll("@/lib/", "../../src/lib/"));
const browser=await chromium.launch({channel:"chrome"});
try {
  const page=await browser.newPage();
  await page.goto("http://localhost:8080/",{waitUntil:"networkidle"});
  const result=await page.evaluate(async()=>{
    const before=await import("/artifacts/owner-feedback/baseline-compose.ts");
    const after=await import("/src/lib/compose.ts");
    const {BOOTH_LAYOUTS}=await import("/src/lib/layouts.ts");
    // Warm the exact weights before the baseline render as well. v0.0.6 only
    // preloaded normal weights, which could let captions change after first use.
    await Promise.all([document.fonts.load('500 24px "Outfit"'),document.fonts.load('italic 500 32px "Fraunces"')]);
    const check=(ok,label)=>{if(!ok)throw new Error(label);};
    const c=document.createElement("canvas");c.width=1920;c.height=1080;const ctx=c.getContext("2d");
    ctx.fillStyle="#d75c3b";ctx.fillRect(0,0,1920,1080);ctx.fillStyle="#398cbb";ctx.fillRect(960,0,960,1080);
    const shots=[c.toDataURL(),c.toDataURL(),c.toDataURL()];
    const calls=[];const fillText=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){
      const m=this.measureText(text);calls.push({text,x,y,font:this.font,scale:this.getTransform().a,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent});
      return fillText.call(this,text,x,y,...args);
    };
    const decode=async blob=>{const img=await createImageBitmap(blob);const c=document.createElement("canvas");c.width=img.width;c.height=img.height;const ctx=c.getContext("2d");ctx.drawImage(img,0,0);return {data:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height};};
    const results=[];let final;
    for(const id of ["S3","S4"]){
      const layout=BOOTH_LAYOUTS.find(l=>l.id===id);const inputs=[...shots,shots[0]].slice(0,layout.poses);
      for(const dpi of [300,600]){
        const meta={dateLabel:"18.09.2026"};
        // S4 isn't a supported print spec; compare its unchanged digital output.
        if(id==="S4"){
          check(await before.composeLayout(layout,inputs,"none",meta)===await after.composeLayout(layout,inputs,"none",meta),"non-S3 unchanged");break;
        }
        calls.length=0;
        const old=await before.composePrintMaster(layout,inputs,"none",meta,{widthMm:50.8,heightMm:152.4,dpi});
        const oldCalls=calls.slice();calls.length=0;
        const next=await after.composePrintMaster(layout,inputs,"none",meta,{widthMm:50.8,heightMm:152.4,dpi});
        const newCalls=calls.slice();
        const om=oldCalls.find(c=>c.text==="inc & soul"),nm=newCalls.find(c=>c.text==="inc & soul");
        const pt=f=>Number(/([\d.]+)px/.exec(f)[1])*nm.scale/dpi*72;
        check(Math.abs(pt(nm.font)-pt(om.font)+2)<0.01,"logo -2 physical pt relative to v0.0.7");
        check(om.x===nm.x&&om.y===nm.y,"brand alignment unchanged");
        const date=newCalls.find(c=>c.text==="18.09.2026");
        const oldDate=oldCalls.find(c=>c.text==="18.09.2026"); check(Math.abs(pt(date.font)-pt(oldDate.font)-2)<0.01,"date +2 physical pt"); check(date.x===oldDate.x && date.y===oldDate.y,"date position unchanged");
        check(nm.bottom<layout.height&&nm.top>date.bottom,"logo fits below date and inside strip");
        const a=await decode(old.blob),b=await decode(next.blob);
        const top=Math.floor(Math.min(oldDate.top,date.top)*nm.scale)-Math.ceil(2*nm.scale);
        let changed=0;
        for(let i=0;i<a.data.length;i++)if(a.data[i]!==b.data[i]){check(Math.floor(i/4/a.width)>=top,JSON.stringify({label:"photos, margins and separator pixels unchanged",pixel:[Math.floor(i/4)%a.width,Math.floor(i/4/a.width)],top,oldCalls,newCalls}));changed++;}
        check(changed>0,"brand pixels changed");
        results.push({dpi,dateBeforePt:pt(oldDate.font),dateAfterPt:pt(date.font),brandBeforePt:pt(om.font),brandAfterPt:pt(nm.font),dateGapLayoutPx:nm.top-date.bottom,bottomMarginLayoutPx:layout.height-nm.bottom,changedChannels:changed,unchangedThroughRow:top-1});
        if(dpi===300)final=Array.from(new Uint8Array(await next.blob.arrayBuffer()));
      }
    }
    CanvasRenderingContext2D.prototype.fillText=fillText;
    return {results,final,fonts:[...document.fonts].filter(f=>f.status==="loaded").map(f=>({family:f.family,weight:f.weight,style:f.style}))};
  });
  assert.equal(result.results.length,2);
  await writeFile(new URL("brand-print-300dpi.png",dir),Buffer.from(result.final));delete result.final;
  await writeFile(new URL("brand-results.json",dir),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
