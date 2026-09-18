import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const baseline = process.argv.includes('--baseline');
const label = process.env.REGRESSION_LABEL || (baseline ? 'baseline' : 'dev');
const output = new URL(`../artifacts/queue-b/${label}/`, import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-gpu'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(() => {
  window.__mediaCalls = 0;
  window.__tracks = [];
  window.__captures = [];
  window.__timers = [];
  const encode = HTMLCanvasElement.prototype.toDataURL;
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
    if (source instanceof HTMLVideoElement) this.canvas.__capture = true;
    return draw.call(this, source, ...args);
  };
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    const result = encode.apply(this, args);
    if (this.__capture) window.__captures.push({ at: performance.now(), result });
    if (args[1] === 0.93) window.__jpeg = result;
    return result;
  };
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    window.__mediaCalls++;
    if (window.__holdMedia) await new Promise(resolve => { window.__releaseMedia = resolve; });
    const mode = constraints.video.facingMode.exact || constraints.video.facingMode.ideal;
    const canvas = document.createElement('canvas');
    window.__cameraCanvas = canvas;
    window.__paint = (width = 1920, height = 1080) => {
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
        ctx.fillStyle = `rgb(${x * 42},${y * 42},${(x+y)*21})`;
        ctx.fillRect(x*width/6, y*height/6, width/6, height/6);
        ctx.fillStyle = 'white'; ctx.font = `${width/25}px sans-serif`;
        ctx.fillText(`${x},${y}`, (x+.3)*width/6, (y+.55)*height/6);
      }
    };
    window.__paint();
    const stream = canvas.captureStream(15);
    const track = stream.getVideoTracks()[0];
    // A physical camera keeps producing frames. A static canvas can lose its
    // one resize frame while video is paused, so explicitly keep it flowing.
    const frames = setInterval(() => {
      if (track.readyState === 'ended') clearInterval(frames);
      else track.requestFrame();
    }, 60);
    track.getSettings = () => ({ facingMode: mode, width: canvas.width, height: canvas.height });
    window.__tracks.push(track);
    return stream;
  };
  navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput' }, { kind: 'videoinput' }];
  navigator.mediaDevices.getSupportedConstraints = () => ({ facingMode: true });
  navigator.canShare = data => data.files?.length === 1;
  navigator.share = async data => { window.__shared = data.files[0]; };
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = { label, checks: [], responsive: [], geometry: [], errors };
const pass = name => { results.checks.push(name); console.log('PASS: ' + name); };
const cameraReady = () => page.getByRole('button', { name: 'Снять кадр', exact: true }).waitFor({ state: 'visible' }).then(() => page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent.includes('Снять кадр'))?.disabled));
const ready = () => page.waitForFunction(baseline => {
  const review = document.querySelector('.review-stage');
  return review?.getClientRects().length > 0 && (baseline ? !!document.querySelector('a[download$="S3.jpg"]') : review.dataset.resultReady === 'true');
}, baseline);
const captureCount = () => page.evaluate(() => window.__captures.length);
async function geometry(name) {
  const value = await page.locator('.camera-viewfinder').evaluate(el => {
    const v = el.querySelector('video'); const a = el.getBoundingClientRect(); const b = v.getBoundingClientRect();
    return { width: a.width, height: a.height, videoWidth: b.width, videoHeight: b.height, source: [v.videoWidth, v.videoHeight], fit: getComputedStyle(v).objectFit };
  });
  results.geometry.push({ name, ...value });
  if (!baseline) {
    const ratio = (520 * .82) / (1560 * ((1-.16-.035-.014*2)/3));
    assert.ok(Math.abs(value.width/value.height - 1) < .002, `${name}: square viewport ${value.width} × ${value.height}`);
    assert.ok(Math.abs(value.videoWidth/value.videoHeight - ratio) < .002, `${name}: exact S3 crop`);
    assert.ok(Math.abs(value.width-value.videoWidth) < 1 && value.videoHeight <= value.height, name);
    assert.equal(value.fit, 'cover');
  }
}
async function timer(seconds, remaining) {
  const start = await captureCount();
  await page.getByRole('button', { name: 'С таймером', exact: true }).click();
  const box = await page.getByRole('dialog', { name: 'Таймер съёмки' }).boundingBox();
  assert.ok(box.width < 330 && box.height < 150 && box.x >= 0);
  const before = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: `${seconds} сек`, exact: true }).click();
  assert.equal(await page.locator('.count-pop').textContent(), String(seconds));
  await ready();
  const captures = await page.evaluate(start => window.__captures.slice(start).map(c => c.at), start);
  assert.equal(captures.length, remaining);
  let previous = before;
  for (const at of captures) { assert.ok(at-previous >= seconds*1000-150, `each countdown >= ${seconds}s`); previous = at; }
  results.checks.push(`timer ${seconds}s × ${remaining}, elapsed ${(captures.at(-1)-before)/1000}s`);
}
const viewports = [[360,800],[390,844],[430,932],[768,1024],[1024,768],[1280,800],[1366,768],[1440,900]];
try {
  await page.goto(new URL('booth', process.env.BOOTH_BASE_URL || 'http://localhost:8080/').href);
  await cameraReady();
  for (const [width,height] of viewports) {
    await page.setViewportSize({width,height}); await geometry(`initial-${width}`);
  }
  await page.setViewportSize({width:390,height:844});
  // Native canvas stream metadata changes, as when a camera rotates on resume.
  for (const [width,height] of [[1080,1920],[1920,1080],[1440,1920]]) {
    await page.evaluate(({width,height}) => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      window.__paint(width,height);
      window.dispatchEvent(new Event('orientationchange'));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      document.dispatchEvent(new Event('visibilitychange'));
    }, {width,height});
    await page.waitForFunction(width => document.querySelector('video')?.videoWidth === width, width);
    await cameraReady(); await geometry(`resume-${width}x${height}`);
  }
  await page.screenshot({path: fileURLToPath(new URL('camera-portrait-stream.png',output)), fullPage:true});
  assert.equal(await page.evaluate(() => window.__mediaCalls),1);
  if (!baseline) {
    await page.evaluate(() => {
      const track = document.querySelector('video').srcObject.getVideoTracks()[0]; track.stop(); track.dispatchEvent(new Event('ended'));
      window.dispatchEvent(new PageTransitionEvent('pageshow'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await cameraReady(); assert.equal(await page.evaluate(() => window.__mediaCalls),2); await geometry('recovered-stream');
    for (const mode of ['environment','user']) {
      await page.getByRole('button',{name:'Переключить камеру',exact:true}).click();
      await cameraReady();
      assert.equal(await page.locator('video').evaluate(v=>v.srcObject.getVideoTracks()[0].getSettings().facingMode),mode);
      assert.equal(await page.locator('video').evaluate(v=>v.style.transform),mode==='user'?'scaleX(-1)':'');
      await geometry(mode);
    }
    pass('live foreground: zero extra requests; ended stream: one; front/back and mirror');
    // Start a timer and hide; no delayed capture is allowed after returning.
    await page.getByRole('button',{name:'С таймером',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'3 сек',exact:true}).getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:'3 сек',exact:true}).click();
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForTimeout(3300);
    assert.equal(await captureCount(),0);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
    await cameraReady(); assert.equal(await page.locator('.count-pop').count(),0);
    await page.evaluate(() => window.__paint(1080, 1920));
    await page.waitForFunction(() => document.querySelector('video').videoWidth === 1080);
    await geometry('portrait-before-capture');
    const livePixels = await page.locator('.camera-crop').screenshot();
    await timer(3,3);
    const crop = await page.evaluate(async png => {
      const live = new Image(); live.src = 'data:image/png;base64,' + png; await live.decode();
      const strip = document.querySelector('.review-strip');
      const pixels = image => {
        const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
        const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0); return ctx;
      };
      const a = pixels(live), b = pixels(strip);
      let maximum = 0;
      for (const x of [.12,.37,.63,.88]) for (const y of [.2,.45,.7,.9]) {
        const first = a.getImageData(Math.round(x*live.naturalWidth), Math.round(y*live.naturalHeight), 1, 1).data;
        const second = b.getImageData(Math.round(520*(.09+x*.82)), Math.round(1560*(.035+y*((1-.16-.035-.014*2)/3))), 1, 1).data;
        for (let i=0;i<3;i++) maximum = Math.max(maximum, Math.abs(first[i]-second[i]));
      }
      return maximum;
    }, livePixels.toString('base64'));
    assert.ok(crop <= 25, `live view and final slot must show identical portrait crop: channel delta ${crop}`);
    pass(`live portrait screenshot vs final photo-slot pixels: max channel delta ${crop}`);
    assert.ok(await page.evaluate(()=>window.__tracks.every(t=>t.readyState==='ended')));
    await page.getByRole('button',{name:'Снять заново',exact:true}).click(); await cameraReady();
    await page.getByRole('button',{name:'Снять кадр',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.camera-shots img').length===1);
    await timer(5,2);
    await page.getByRole('button',{name:'Снять заново',exact:true}).click(); await cameraReady();
    for (let i=1;i<=2;i++) {await page.getByRole('button',{name:'Снять кадр',exact:true}).click();await page.waitForFunction(i=>document.querySelectorAll('.camera-shots img').length===i,i);}
    await timer(10,1);
    const original = await page.locator('.review-shots img').evaluateAll(imgs=>imgs.map(i=>i.src));
    await page.getByRole('button',{name:'Переснять кадр 2',exact:true}).click(); await cameraReady();
    await geometry('retake');
    await page.getByRole('button',{name:'С таймером',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'10 сек',exact:true}).getAttribute('aria-pressed'),'true');
    await page.keyboard.press('Escape');
    await timer(3,1);
    const changed = await page.locator('.review-shots img').evaluateAll(imgs=>imgs.map(i=>i.src));
    assert.equal(changed[0],original[0]); assert.equal(changed[2],original[2]);
    await page.getByRole('button',{name:'Переснять кадр 1',exact:true}).click(); await cameraReady();
    await page.getByRole('button',{name:'Отмена',exact:true}).click(); await ready();
    assert.deepEqual(await page.locator('.review-shots img').evaluateAll(imgs=>imgs.map(i=>i.src)),changed);
    pass('3/5/10 each countdown, remaining 3/2/1, timed retake, preference, cancel');
  } else {
    for (let i=1;i<=3;i++) {await page.getByRole('button',{name:'Снять кадр',exact:true}).click();if(i<3)await page.waitForFunction(i=>document.querySelectorAll('.camera-shots img').length===i,i);}
    await ready();
  }
  for (const [width,height] of viewports) {
    await page.setViewportSize({width,height});
    for (const expanded of [false,true]) {
      const details = page.locator('.review-secondary');
      if ((await details.getAttribute('open') !== null) !== expanded) await page.locator('.review-secondary > summary').click();
      if (expanded && !baseline && await page.getByRole('button',{name:'Подготовить для печати',exact:true}).count()) {
        await page.getByRole('button',{name:'Подготовить для печати',exact:true}).click();
        await page.getByRole('link',{name:'Скачать PNG для печати',exact:true}).waitFor();
      }
      await page.evaluate(()=>scrollTo(0,0));
      const metrics = await page.evaluate(()=>{
        const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {width:r.width,height:r.height,x:r.x,y:r.y,bottom:r.bottom};};
        return {strip:rect('.review-strip'),preview:rect('.review-preview'),controls:rect('.review-controls'),footer:rect('footer'),overflow:document.documentElement.scrollWidth>innerWidth,price:document.querySelector('.review-heading').innerText};
      });
      assert.equal(metrics.overflow,false);
      if (!baseline) {
        assert.ok(await page.locator('.review-controls .booth-filters').evaluate(el => el.scrollWidth <= el.clientWidth), 'result filters wrap without horizontal scrolling');
        assert.ok(metrics.strip.width>=190 && metrics.strip.height>=570, JSON.stringify(metrics));
        assert.ok(Math.abs(metrics.strip.height/metrics.strip.width-3)<.01);
        assert.ok(metrics.strip.height/metrics.preview.height>.9);
        assert.ok(metrics.footer.y>=metrics.controls.bottom, 'footer after controls');
        assert.match(metrics.price,/Печать 169 ₽/); assert.doesNotMatch(metrics.price,/отправка|доставка/);
        if (expanded) {
          const printBox=await page.getByRole('link',{name:'Скачать PNG для печати',exact:true}).boundingBox();
          assert.ok(printBox.height>=44 && printBox.width>=150);
        }
      }
      results.responsive.push({width,height,expanded,...metrics});
      await page.screenshot({path:fileURLToPath(new URL(`result-${width}-${expanded?'print':'closed'}.png`,output)),fullPage:true});
    }
  }
  if (!baseline) {
    assert.equal(await page.getByRole('link',{name:'Скачать макет',exact:true}).count(),0);
    await page.getByRole('button',{name:'Поделиться',exact:true}).click();
    const shared=await page.evaluate(async()=>({type:window.__shared.type,same:await window.__shared.text()===await(await fetch(window.__jpeg)).text()}));
    assert.deepEqual(shared,{type:'image/jpeg',same:true});
    const download=page.waitForEvent('download');
    await page.getByRole('link',{name:'Скачать PNG для печати',exact:true}).click();
    const file=await download; const bytes=await readFile(await file.path());
    assert.equal(bytes.readUInt32BE(16),600); assert.equal(bytes.readUInt32BE(20),1800);
    assert.equal(bytes.readUInt32BE(bytes.indexOf(Buffer.from('pHYs'))+4),11811);
    await writeFile(new URL(file.suggestedFilename(),output),bytes);
    await page.getByRole('button',{name:'Увеличить фотополоску',exact:true}).click();
    await page.getByRole('dialog').waitFor(); await page.getByRole('button',{name:'Закрыть просмотр',exact:true}).click();
    pass('8 viewports × closed/print, useful strip size, price, footer, touch targets, JPEG Share and PNG download');
    await page.getByRole('button',{name:'Снять заново',exact:true}).click(); await cameraReady();
    await page.locator('.camera-toolbar').getByRole('button',{name:'На главную',exact:true}).click();
    const calls = await page.evaluate(()=>{window.__holdMedia=true; return window.__mediaCalls;});
    await page.getByRole('link',{name:/Начать фотобудку/}).click();
    await page.waitForFunction(()=>!!window.__releaseMedia);
    await page.locator('.camera-toolbar').getByRole('button',{name:'На главную',exact:true}).click();
    await page.getByRole('link',{name:/Начать фотобудку/}).click();
    assert.equal(await page.evaluate(()=>window.__mediaCalls),calls+1);
    await page.evaluate(()=>{window.__holdMedia=false;window.__releaseMedia();});
    await cameraReady();
    assert.equal(await page.evaluate(()=>window.__mediaCalls),calls+2);
    assert.ok(await page.evaluate(()=>window.__tracks.slice(0,-1).every(t=>t.readyState==='ended')));
    await page.locator('.camera-toolbar').getByRole('button',{name:'На главную',exact:true}).click();
    assert.ok(await page.evaluate(()=>window.__tracks.every(t=>t.readyState==='ended')));
    pass('unresolved camera request across two route sessions stays serialized; stale and exiting tracks released');
  }
  assert.deepEqual(errors,[]); results.passed=true;
} catch(error) {
  results.failure=error.stack;results.passed=false;process.exitCode=1;
  await page.screenshot({path:fileURLToPath(new URL('failure.png',output)),fullPage:true});
} finally {
  await writeFile(new URL('results.json',output),JSON.stringify(results,null,2));
  console.log(JSON.stringify({passed:results.passed,checks:results.checks,failure:results.failure,viewports:results.responsive.length,geometry:results.geometry},null,2));
  await browser.close();
}
