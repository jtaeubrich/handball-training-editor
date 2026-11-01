// Requires the test server and the original v92 commit in local Git history.
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {chromium}=require('playwright');
const {installRenderCapture}=require('./render-helpers.cjs');
const {configureCourtScenario,measureCourt}=require('./court-helpers.cjs');
const ref='e03520a4257d58b017f92f3607e07948095d5ca3';
(async()=>{
  const source=execFileSync('git',['show',`${ref}:index.html`],{encoding:'utf8'}).replace(/\r\n/g,'\n');
  const marker='  draw();\n})();';
  if(!source.includes(marker))throw new Error('Original initialization not found');
  const html=source.replace(marker,`  draw();\n  window.__renderers.court = {drawStoryboardCourts};\n})();`);
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage();
    await page.addInitScript(installRenderCapture);
    await page.route('http://127.0.0.1:4173/',r=>r.fulfill({body:html,contentType:'text/html'}));
    await page.goto('http://127.0.0.1:4173/');
    const scenarios=[];
    for(const mode of ['none','half','full'])for(const rotation of [0,90,180,270])for(const theme of ['gray','blue'])for(const grid of [false,true])scenarios.push({layout:'1x1',cells:[{mode,rotation,theme,grid}]});
    for(const active of [0,3])scenarios.push({layout:'2x2',active,cells:[
      {mode:'half',rotation:90,theme:'gray',grid:true,opacity:0},
      {mode:'full',rotation:270,theme:'blue',grid:false,opacity:50},
      {mode:'none',rotation:0,theme:'gray',grid:true,opacity:100},
      {mode:'full',rotation:0,theme:'gray',grid:true,opacity:75}
    ]});
    const cases=[];
    for(const scenario of scenarios){
      await page.evaluate(configureCourtScenario,scenario);
      const commands=await page.evaluate(measureCourt);
      cases.push({scenario,hash:createHash('sha256').update(JSON.stringify(commands)).digest('hex')});
    }
    fs.writeFileSync(path.join(__dirname,'fixtures/court-v92.json'),JSON.stringify({source:ref,cases},null,2)+'\n');
    console.log(`Captured ${cases.length} Canvas court scenarios from v92`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
