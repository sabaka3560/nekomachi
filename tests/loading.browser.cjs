// Production-build regression: slow fonts, same-origin runtime, and first-visit offline cache.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const arg=(n,d)=>process.argv.find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3)||d;
const {chromium}=require(process.argv.slice(2).find(a=>!a.startsWith('--'))||'playwright');
const root=path.resolve(arg('root',path.join(__dirname,'..'))),output=path.resolve(arg('output',path.join(root,'test-results/loading')));
fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.webmanifest':'application/manifest+json','.png':'image/png','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');
    if(pathname.startsWith('/assets/'))res.setHeader('Cache-Control','public, max-age=31536000, immutable');
    res.end(fs.readFileSync(file));
  }catch{res.writeHead(404).end();}
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,executablePath:arg('chrome',process.env.CHROME_PATH)});
  const results=[];
  try{
    for(const spec of [{name:'desktop',viewport:{width:1440,height:900}},{name:'phone',viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}]){
      const context=await browser.newContext(spec),page=await context.newPage(),errors=[];
      let releaseFonts, fontsRequested=false;
      const fontsGate=new Promise(r=>releaseFonts=r);
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|CONTEXT_LOST/.test(m.text()))errors.push(m.text());});
      await page.route('https://fonts.googleapis.com/**',async r=>{fontsRequested=true;await fontsGate;await r.fulfill({contentType:'text/css',body:''});});
      await page.route('https://cdn.jsdelivr.net/**',r=>r.abort());
      await page.route('https://api.tanmaybohra.com/**',r=>r.fulfill({json:{scores:[]}}));
      await page.addInitScript(()=>localStorage.setItem('nekomachi-tutorial','1'));
      const start=Date.now();
      await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:60000});
      await page.locator('#stage canvas').waitFor();
      assert(fontsRequested,'The delayed-font request must be exercised');
      assert(await page.locator('#play').isVisible(),'The game must load before optional fonts arrive');
      const startupMs=Date.now()-start;
      const runtime=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>/three-r147\./.test(e.name)).map(e=>e.name));
      assert.equal(runtime.length,1,'Only one bundled Three.js runtime request');
      await page.locator('#play').click({force:true});
      await page.waitForFunction(()=>!document.getElementById('hud').hidden,null,{timeout:20000});
      releaseFonts();
      await page.waitForFunction(()=>document.getElementById('neko-fonts').media==='all');
      await page.screenshot({path:path.join(output,`${spec.name}-run.png`)});
      await page.waitForTimeout(700);
      await page.locator('#gpause').click();
      assert(await page.locator('#pausemenu').isVisible());
      await page.locator('#resume').click();
      await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');
      assert.deepEqual(errors,[],'Late fonts must not break gameplay');
      await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
      await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
      const cached=await page.evaluate(async()=>{
        const names=await caches.keys(),cache=await caches.open(names.find(n=>n.startsWith('nekomachi-')));
        return (await cache.keys()).map(r=>new URL(r.url).pathname);
      });
      assert(cached.some(p=>p.startsWith('/assets/three-r147.')),'The runtime must be precached on the first visit');
      await context.setOffline(true);
      await page.reload({waitUntil:'domcontentloaded',timeout:30000});
      await page.locator('#play').click({force:true});
      await page.waitForFunction(()=>!document.getElementById('hud').hidden,null,{timeout:20000});
      await page.waitForFunction(()=>parseInt(document.getElementById('distN').textContent.replace(/[^0-9]/g,''),10)>0,null,{timeout:15000});
      const distance=await page.locator('#distN').textContent();
      assert(parseInt(distance.replace(/[^0-9]/g,''),10)>0,'Offline play advances');
      assert.deepEqual(errors,[],'No browser or shader errors');
      results.push({name:spec.name,startupMs,runtime,cached,offlineDistance:distance,errors});
      console.log(JSON.stringify(results.at(-1)));
      await context.close();
    }
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
