// Measure real startup/rendering work with deterministic local runtime assets.
// Hooks and performance marks are inserted into the served test copy only.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.argv.slice(2).find(a => !a.startsWith('--')) || 'playwright');
const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const root = path.resolve(arg('root', path.join(__dirname, '..')));
const vendor = path.resolve(arg('vendor', fs.existsSync(path.join(root,'vendor')) ? path.join(root,'vendor') : path.resolve(root,'../tanmaybohra/cats/vendor')));
const source = arg('source', 'nekomachi.html');
const output = path.resolve(arg('output', path.join(root, 'test-results/startup')));
fs.mkdirSync(output, {recursive:true});
const hooks = `
  window.startupTest = {
    start() { tutDone = true; startGame(); enterRun(); mode = 'play'; run.safe = 999; },
    advance(seconds) { for(let i=0;i<seconds*60;i++) tick(1/60,1/60,animTime); draw(); },
    giga: startGiga, boost: startBoost, home: exitToLanding, gfx:setGfx,
    snapshot() {
      const geometries=new Set(), textures=new Set(); let meshes=0, vertices=0;
      scene.traverse(o=>{ if(o.isMesh){ meshes++; geometries.add(o.geometry); }
        for(const m of (o.material ? (Array.isArray(o.material)?o.material:[o.material]):[]))
          for(const v of Object.values(m)) if(v?.isTexture) textures.add(v);
      });
      for(const g of geometries) vertices+=g.attributes.position?.count || 0;
      return { mode, calls:renderer.info.render.calls, triangles:renderer.info.render.triangles,
        programs:renderer.info.programs.length, gpuGeometry:renderer.info.memory.geometries,
        gpuTextures:renderer.info.memory.textures, meshes, vertices,
        geometries:geometries.size,textures:textures.size,tier:gfxTier,dpr:curDPR };
    }
  };
  performance.mark('game-ready');
`;
const server=http.createServer((req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+(pathname==='/'?'/'+source:pathname));
    assert(file.startsWith(root+path.sep));
    let data=fs.readFileSync(file);
    if(pathname==='/') {
      let html=data.toString('utf8');
      html=html.replace('  const T = THREE;', "  performance.mark('game-script');\n  const T = THREE;");
      html=html.replace(/(  \/\/ =+ ([^\r\n]+) =+\r?\n)/g, (all,label,name)=>`${all}  performance.mark(${JSON.stringify(name)});\n`);
      html=html.replace('  for (const sb of sideB) {', "  performance.mark('merge-start');\n  for (const sb of sideB) {");
      html=html.replace('  pruneShadowCasters();', "  performance.mark('merge-end');\n  pruneShadowCasters();");
      html=html.replace('  warmup();', "  performance.mark('warm-start');\n  warmup();\n  performance.mark('warm-end');");
      html=html.replace('  Portal.loadingDone();',hooks+'\n  Portal.loadingDone();');
      data=Buffer.from(html);
    }
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':file.endsWith('.mp3')?'audio/mpeg':'application/octet-stream');
    res.end(data);
  }catch(e){res.writeHead(404).end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:arg('chrome',process.env.CHROME_PATH)});
  const results=[];
  try {
    for(const spec of [
      {name:'desktop',viewport:{width:1440,height:900}},
      {name:'phone',viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}
    ]) {
      if(arg('only') && arg('only')!==spec.name) continue;
      const context=await browser.newContext(spec),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{ if(m.type()==='error' && /THREE.WebGLProgram|CONTEXT_LOST/.test(m.text())) errors.push(m.text()); });
      await page.route('https://cdn.jsdelivr.net/npm/three@0.147.0/**',r=>r.fulfill({path:path.join(vendor,new URL(r.request().url()).pathname.split('/').pop()),contentType:'text/javascript'}));
      await page.route('https://api.tanmaybohra.com/**',r=>r.fulfill({json:{scores:[]}}));
      // No font-network variance in CPU comparisons; production uses its real fonts.
      await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
      await page.addInitScript(gfx=>{
        localStorage.setItem('nekomachi-tutorial','1'); localStorage.setItem('nekomachi-gfx',gfx);
        window.longTasks=[];
        new PerformanceObserver(list=>window.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
      },arg('gfx','low'));
      const cdp=await context.newCDPSession(page);
      if(arg('cpu')) await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(arg('cpu'))});
      await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
      await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load',timeout:90000});
      await page.waitForFunction(()=>!!window.startupTest,null,{timeout:90000});
      const {profile}=await cdp.send('Profiler.stop');
      fs.writeFileSync(path.join(output,`${spec.name}.cpuprofile`),JSON.stringify(profile));
      await page.waitForTimeout(150);
      const startup=await page.evaluate(()=>({marks:performance.getEntriesByType('mark').map(e=>({name:e.name,ms:e.startTime})),
        paints:performance.getEntriesByType('paint').map(e=>({name:e.name,ms:e.startTime})),longTasks:window.longTasks,landing:startupTest.snapshot()}));
      const sample=()=>page.evaluate(()=>new Promise(resolve=>{
        const intervals=[];let prev=performance.now(),elapsed=0;
        function frame(t){ const dt=t-prev;prev=t;elapsed+=dt;intervals.push(dt);
          if(elapsed<4000)requestAnimationFrame(frame);else {intervals.sort((a,b)=>a-b);resolve({frames:intervals.length,mean:elapsed/intervals.length,p95:intervals[Math.floor(intervals.length*.95)],over50:intervals.filter(x=>x>50).length,state:startupTest.snapshot()});}}
        requestAnimationFrame(frame);
      }));
      await page.evaluate(()=>startupTest.start());
      await page.waitForTimeout(700);
      let fallback;
      if(arg('gfx','low')==='auto') {
        fallback=await page.evaluate(()=>{
          const before=startupTest.snapshot().programs;
          startupTest.gfx('low'); startupTest.advance(0.1);
          return { before, after:startupTest.snapshot().programs };
        });
        assert.equal(fallback.after,fallback.before,'Auto fallback must reuse already prepared shaders');
      }
      const run=await sample();
      await page.evaluate(()=>startupTest.giga());
      await page.waitForTimeout(1500);
      const giga=await sample();
      await page.screenshot({path:path.join(output,`${spec.name}-giga.png`)});
      await page.evaluate(()=>startupTest.home());
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(()=>startupTest.snapshot().mode),'landing');
      assert.deepEqual(errors,[],'No startup or rendering exceptions');
      results.push({name:spec.name,source,...startup,fallback,run,giga,errors});
      console.log(JSON.stringify(results.at(-1)));
      await context.close();
    }
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
