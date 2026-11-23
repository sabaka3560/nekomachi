// Local-only browser checks. Hooks are injected into the served copy, never the game.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.argv.slice(2).find(a => !a.startsWith('--')) || 'playwright');
const option = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = path.resolve(option('root') || path.join(__dirname, '..'));
const output = path.resolve(option('output') || path.join(root, 'test-results'));
fs.mkdirSync(output, { recursive:true });
const baseline = process.argv.includes('--baseline');
const perf = process.argv.includes('--perf');
const smoke = process.argv.includes('--smoke');
const source = option('source') || (baseline ? 'checkpoints/nekomachi-v22-before-camera.html' : 'nekomachi.html');
const hooks = `
  window.gameTest = {
    start() { tutDone = true; startGame(); enterRun(); mode = 'play'; run.safe = 999; },
    giga: startGiga, endGiga, boost: startBoost, input,
    advance(seconds, hz = 60) { for (let i = 0; i < Math.round(seconds * hz); i++) tick(1 / hz, 1 / hz, animTime); draw(); },
    frameAt(ms) { frame(ms); },
    clock() { return last; },
    pause() { toggleGamePause(); },
    retry() { retryNow(); },
    home() { exitToLanding(); },
    appearances() {
      for (const world of WORLDS) { applyWorld(world); draw(); }
      for (const skin of SKINS) { applySkin(skin); draw(); }
      applyWorld(equippedWorld); applySkin(SKINS[0]);
      return { worlds: WORLDS.length, cats: SKINS.length };
    },
    set(values) { Object.assign(run, values); },
    gfx: setGfx,
    resizeLens() { const fov=camera.fov; resize(); return camera.fov-fov; },
    targetId() { return post?.composer.renderTarget1.texture.uuid; },
    snapshot() {
      scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      const bounds = new T.Box3().makeEmpty();
      cat.traverseVisible(o => { if (!o.isMesh) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bounds.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); });
      const points = [];
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) points.push(V3(x,y,z).project(camera).toArray());
      return { mode, paused, camera: camera.position.toArray(), fov: camera.fov, cat: cat.scale.x,
        bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, projected: points,
        groundShadow: blob.scale.toArray(), dist: run?.dist, time: run?.time, x: run?.x, ry: run?.ry,
        giga: run?.giga, gigaS: run?.gigaS, tier: gfxTier, dpr: curDPR,
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        programs: renderer.info.programs.length, geometries: renderer.info.memory.geometries,
        fishInstances: fishMesh.count, activeFish: fishes.filter(f => f.on).length,
        detailsAttached: sideB.every(b => b.details.every(d => { let p=d; while(p && p!==b.g) p=p.parent; return p===b.g; })) };
    }
  };
`;
const server = http.createServer((req,res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const target = path.resolve(root, '.' + (pathname === '/' ? '/nekomachi.html' : pathname));
  if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    if (pathname === '/' || pathname === '/nekomachi.html') {
      let html = fs.readFileSync(path.join(root,source), 'utf8');
      if (!smoke) {
        html = html.replaceAll('requestAnimationFrame(frame);', 'if (!window.__manual) requestAnimationFrame(frame);');
        html = html.replace('  Portal.loadingDone();', hooks + '\n  Portal.loadingDone();');
      }
      res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(html);
    } else {
      const mime = {'.mp3':'audio/mpeg','.js':'text/javascript','.png':'image/png','.webmanifest':'application/manifest+json','.html':'text/html; charset=utf-8'};
      res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
      res.end(fs.readFileSync(target));
    }
  } catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const executablePath = process.argv.find(a=>a.startsWith('--chrome='))?.slice(9) || process.env.CHROME_PATH;
  const browser = await chromium.launch({ headless:true, executablePath });
  const results = [];
  try {
    for (const spec of [
      { name:'desktop', viewport:{width:1440,height:900} },
      { name:'phone', viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 },
      { name:'reduced', viewport:{width:1280,height:720}, reducedMotion:'reduce' },
      ...(smoke ? [{ name:'landscape-reduced', viewport:{width:844,height:390}, isMobile:true, hasTouch:true, reducedMotion:'reduce' }] : [])
    ]) {
      if (option('only') && spec.name !== option('only')) continue;
      const context = await browser.newContext(spec);
      const page = await context.newPage(); const errors = [];
      page.on('pageerror',e=>{ errors.push(e.message); console.error(`Browser error (${spec.name}): ${e.message}`); });
      page.on('console',m=>{ if(m.type()==='error' && /THREE.WebGLProgram|CONTEXT_LOST/.test(m.text())) errors.push(m.text()); });
      await page.route('https://api.tanmaybohra.com/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"scores":[]}'}));
      await page.addInitScript(manual => { if (window !== window.top) return; window.__manual = manual; localStorage.setItem('nekomachi-tutorial','1'); localStorage.setItem('nekomachi-gfx','low'); }, !smoke);
      const response = await page.goto(option('url') || `http://127.0.0.1:${server.address().port}/`,{waitUntil:'load',timeout:90000});
      assert(response.ok(), 'Game document must load');
      if (smoke) {
        await page.locator('#stage canvas').waitFor();
        assert(await page.locator('#play').isVisible(), 'Play button is visible');
        // The CTA continuously bobs; click its current centre without waiting for animation stability.
        await page.locator('#play').click({force:true});
        await page.waitForFunction(() => !document.getElementById('hud').hidden, null, {timeout:30000}).catch(async error => {
          await page.screenshot({path:path.join(output,`failed-start-${spec.name}.png`)});
          console.error('Start diagnostics:', await page.evaluate(() => ({ body:document.body.className, play:document.getElementById('play').getBoundingClientRect().toJSON(), hudHidden:document.getElementById('hud').hidden })), errors);
          throw error;
        });
        await page.waitForTimeout(1800);
        await page.locator('#gpause').click();
        assert(await page.locator('#pausemenu').isVisible(),'Pause menu opens through UI');
        await page.locator('#resume').click();
        assert(!(await page.locator('#pausemenu').isVisible()),'Resume closes pause menu');
        await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(350);
        const distance = await page.locator('#distN').textContent();
        assert(parseInt(distance.replace(/[^0-9]/g,''),10) > 0,'A real run must advance');
        await page.screenshot({path:path.join(output,`smoke-${spec.name}.png`)});
        assert.deepEqual(errors,[],'No browser exceptions');
        results.push({name:spec.name,source:option('url') || source,distance,errors});
        console.log(`${spec.name}: unmodified release loads, starts, pauses, resumes and runs`);
        await context.close(); continue;
      }
      await page.waitForFunction(()=>!!window.gameTest,{timeout:90000});
      await page.evaluate(()=>{ gameTest.start(); gameTest.advance(1); });
      if (perf) {
        await page.evaluate(()=>{ gameTest.gfx('auto'); gameTest.set({giga:999,safe:999}); window.__manual=false; gameTest.frameAt(performance.now()); });
        await page.waitForTimeout(3000);
        const timings = await page.evaluate(()=>new Promise(resolve=>{
          const intervals=[]; let previous=performance.now(), elapsed=0;
          function sample(t) { const dt=t-previous; previous=t; elapsed+=dt; intervals.push(dt); if(elapsed<10000) requestAnimationFrame(sample); else { intervals.sort((a,b)=>a-b); resolve({frames:intervals.length,mean:elapsed/intervals.length,p50:intervals[Math.floor(intervals.length*.5)],p95:intervals[Math.floor(intervals.length*.95)],over33:intervals.filter(x=>x>33.5).length,state:gameTest.snapshot()}); } }
          requestAnimationFrame(sample);
        }));
        results.push({name:spec.name,...timings,errors});
        console.log(JSON.stringify(results.at(-1)));
        await context.close(); continue;
      }
      // Let the iris UI finish independently of deterministic simulation time.
      await page.waitForTimeout(600);
      const normal = await page.evaluate(()=>gameTest.snapshot());
      if (!baseline && !source.includes('checkpoints/')) assert.equal(normal.fishInstances,normal.activeFish,'Only live fish should be submitted to the GPU');
      const growth = await page.evaluate(()=>{
        gameTest.giga(); const states=[];
        for(let i=0;i<20;i++) { gameTest.advance(0.1); states.push(gameTest.snapshot()); }
        return states;
      });
      if (!baseline) for (const state of growth) for (const p of state.projected) assert(Math.abs(p[0]) < 0.98 && Math.abs(p[1]) < 0.98, `Growth clipped in ${spec.name}: ${p}`);
      await page.waitForTimeout(1100);
      const giga = await page.evaluate(()=>gameTest.snapshot());
      await page.screenshot({path:path.join(output,`${baseline?'before':'after'}-${spec.name}-giga.png`)});
      if (!baseline) {
        assert.equal(await page.evaluate(()=>gameTest.resizeLens()),0,'Resizing the drawing buffer must preserve FOV');
        assert(giga.camera[1] > normal.camera[1] + 5, 'Giga camera must rise above the cat');
        assert(giga.camera[2] > normal.camera[2] + 3, 'Giga camera must pull back');
        for (const p of giga.projected) assert(Math.abs(p[0]) < 0.94 && Math.abs(p[1]) < 0.94, `Cat clipped in ${spec.name}: ${p}`);
        assert(giga.groundShadow[0] > normal.groundShadow[0] * 2, 'Contact shadow must scale with cat');
        assert(giga.detailsAttached, 'Scenery detail culling must reference attached meshes');
      }
      await page.evaluate(()=>{ gameTest.input('left'); gameTest.advance(0.7); });
      const lane = await page.evaluate(()=>gameTest.snapshot());
      if (!baseline) for (const p of lane.projected) assert(Math.abs(p[0]) < 0.98 && Math.abs(p[1]) < 0.98, `Left lane clipped in ${spec.name}: ${p}`);
      await page.evaluate(()=>{ gameTest.input('right'); gameTest.input('right'); gameTest.advance(0.7); });
      const right = await page.evaluate(()=>gameTest.snapshot());
      if (!baseline) for (const p of right.projected) assert(Math.abs(p[0]) < 0.98 && Math.abs(p[1]) < 0.98, `Right lane clipped in ${spec.name}: ${p}`);
      await page.evaluate(()=>{ gameTest.endGiga(); gameTest.advance(2); });
      const ended = await page.evaluate(()=>gameTest.snapshot());
      assert(ended.gigaS < 1.01, 'Giga must shrink back smoothly');
      await page.evaluate(()=>{ gameTest.boost(); gameTest.advance(2); });
      const boost = await page.evaluate(()=>gameTest.snapshot());
      await page.screenshot({path:path.join(output,`${baseline?'before':'after'}-${spec.name}-boost.png`)});
      await page.evaluate(()=>gameTest.pause());
      const pausedBefore = await page.evaluate(()=>gameTest.snapshot());
      await page.evaluate(()=>{ let t=gameTest.clock(); for(let i=1;i<=30;i++) gameTest.frameAt(t+i*1000/60); });
      const pausedAfter = await page.evaluate(()=>gameTest.snapshot());
      assert.equal(pausedAfter.dist,pausedBefore.dist,'Pause must freeze distance');
      await page.evaluate(()=>{ gameTest.retry(); gameTest.advance(2); });
      const retry = await page.evaluate(()=>gameTest.snapshot());
      assert(retry.cat < 1.2,'Retry must reset size');
      await page.evaluate(()=>gameTest.home());
      assert.equal(await page.evaluate(()=>gameTest.snapshot().mode),'landing');
      if (!baseline && spec.name === 'desktop') {
        assert.deepEqual(await page.evaluate(()=>gameTest.appearances()),{worlds:5,cats:7},'All worlds and cat materials render after batching');
        await page.evaluate(()=>gameTest.gfx('ultra'));
        const target = await page.evaluate(()=>gameTest.targetId());
        await page.evaluate(()=>{ gameTest.gfx('high'); gameTest.gfx('low'); gameTest.gfx('ultra'); });
        assert.equal(await page.evaluate(()=>gameTest.targetId()),target,'Graphics changes should reuse render targets');
        await page.evaluate(()=>gameTest.gfx('low'));
        const elapsed = await page.evaluate(()=>{
          gameTest.start(); gameTest.set({v:0,giga:999}); const before=gameTest.snapshot().time;
          let t=gameTest.clock(); for(const dt of [10,30,12,28,16,24,10,30]) { t+=dt; gameTest.frameAt(t); }
          return gameTest.snapshot().time-before;
        });
        assert(Math.abs(elapsed-0.16)<1e-6,'Uneven frames must advance by elapsed time, without speed pumping');
        const rates = await page.evaluate(()=>[30,60,120,144].map(hz=>{
          gameTest.retry(); gameTest.set({giga:999,safe:999}); gameTest.advance(2,hz);
          gameTest.input('right'); gameTest.advance(0.5,hz);
          return gameTest.snapshot();
        }));
        assert(Math.max(...rates.map(s=>s.x))-Math.min(...rates.map(s=>s.x)) < 0.03,'Lane response should agree across refresh rates');
        assert(Math.max(...rates.map(s=>s.gigaS))-Math.min(...rates.map(s=>s.gigaS)) < 0.01,'Growth should agree across refresh rates');
      }
      assert.deepEqual(errors,[],'No browser exceptions');
      results.push({name:spec.name,normal,giga,lane,ended,boost,errors});
      console.log(`${spec.name}: camera, transformation, lanes, boost, pause, retry passed`);
      await context.close();
    }
    fs.writeFileSync(path.join(output,`${baseline?'before':'after'}-${smoke?'smoke':perf?'performance':'camera'}.json`),JSON.stringify(results,null,2));
  } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
