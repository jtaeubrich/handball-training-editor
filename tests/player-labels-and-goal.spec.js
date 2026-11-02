const {test,expect}=require('@playwright/test');
const {installRenderCapture}=require('./render-helpers.cjs');
const {configureCourtScenario}=require('./court-helpers.cjs');
const KEY='handballtrainer.localDraft.v1';
const draft=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key))?.snapshot.project,KEY);

for(const type of ['attacker','attackerBall','defender']){
  test(`${type}: numbers 1–10 and free labels survive undo, export and restart`,async({page})=>{
    await page.goto('/');
    await page.locator(`aside .tool[data-tool="${type}"]`).first().evaluate(button=>button.click());
    await page.locator('#c').click({position:{x:300,y:300}});
    const group=type==='defender'?'Defense':'Attack';
    await page.locator(`#prop${group}Formation`).selectOption('numbers');
    expect(await page.locator(`#prop${group}Label option`).evaluateAll(options=>options.map(o=>o.value)))
      .toEqual(Array.from({length:10},(_,i)=>String(i+1)));
    await page.locator(`#prop${group}Label`).selectOption({value:'10'});
    expect((await draft(page)).objects[0]).toMatchObject({label:'10',showLabel:true});
    await page.locator(`#prop${group}Formation`).selectOption('custom');
    const text='Mitte <1> & Lea';
    await page.locator(`#prop${group}CustomLabel`).fill(text);
    await page.locator(`#prop${group}CustomLabel`).press('Tab');
    expect((await draft(page)).objects[0].label).toBe(text);
    await page.locator('#undoBtn').click();expect((await draft(page)).objects[0].label).toBe('10');
    await page.locator('#redoBtn').click();expect((await draft(page)).objects[0].label).toBe(text);
    await page.reload();
    await expect(page.locator('#status')).toHaveText('Letzte Zeichnung lokal wiederhergestellt');
    expect((await draft(page)).objects[0].label).toBe(text);
    await page.evaluate(()=>{
      window.HandballExport.saveSvgText=async svg=>{window.__svgText=svg;};
      window.showSaveFilePicker=async options=>({name:options.suggestedName,createWritable:async()=>({
        write:async blob=>{window.__project=JSON.parse(await blob.text());},close:async()=>{}
      })});
    });
    await page.locator('#svgBtn').click();
    expect(await page.evaluate(()=>new DOMParser().parseFromString(window.__svgText,'image/svg+xml').querySelector('text')?.textContent)).toBe(text);
    await page.locator('#jsonSaveBtn').click();
    await expect.poll(()=>page.evaluate(()=>window.__project?.objects[0]?.label)).toBe(text);
  });
}

test('new label sets normalize consistently for all player types',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(()=>{
    const m=window.HandballObjectModel;
    return ['attacker','attackerBall','defender'].flatMap(type=>{
      const key=type==='defender'?'defenseFormation':'attackFormation';
      return [['numbers',10],['numbers','invalid'],['custom','Freier Spieler']].map(([set,label])=>{
        const o={kind:'symbol',type,[key]:set,label,showLabel:true};m.normalizeLoadedObject(o);return o.label;
      });
    });
  });
  expect(result).toEqual(['10','1','Freier Spieler','10','1','Freier Spieler','10','1','Freier Spieler']);
});

test('numbered players can be imported and edited on a smartphone',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await page.locator('aside .tool[data-tool="attackerBall"]').first().evaluate(button=>button.click());
  await page.locator('#c').click({position:{x:300,y:300}});
  await page.locator('#mobilePropsBtn').click();
  await page.locator('#propAttackFormation').selectOption('numbers');
  await page.locator('#propAttackLabel').selectOption({value:'7'});
  expect((await draft(page)).objects[0].label).toBe('7');
  await page.locator('#propAttackFormation').selectOption('custom');
  await page.locator('#propAttackCustomLabel').fill('Spieler links');
  await page.locator('#propAttackCustomLabel').press('Tab');
  expect((await draft(page)).objects[0].label).toBe('Spieler links');
});

for(const mode of ['half','full']){
  test(`smartphone ${mode} court: goals are centered and 3m on a 20m goal-line width`,async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await page.addInitScript(installRenderCapture);await page.goto('/');
    await page.evaluate(configureCourtScenario,{layout:'1x1',cells:[{mode,rotation:mode==='full'?90:0,theme:'gray',grid:false}]});
    const result=await page.evaluate(()=>{
      const canvas=document.getElementById('c'),c=document.createElement('canvas').getContext('2d');
      const fields=[],goals=[];
      const rect=(x,y,w,h)=>{
        const m=c.getTransform();
        const points=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([x,y])=>m.transformPoint({x,y}));
        return {x,y,w,h,points:points.map(p=>({x:p.x,y:p.y}))};
      };
      const proxy=new Proxy(c,{get(target,key){
        if(key==='strokeRect')return(x,y,w,h)=>{
          if(c.lineWidth===4)goals.push(rect(x,y,w,h));
          if(w>=400&&h>=400)fields.push(rect(x,y,w,h));
          return c.strokeRect(x,y,w,h);
        };
        const value=target[key];return typeof value==='function'?value.bind(target):value;
      },set(target,key,value){target[key]=value;return true;}});
      window.__renderers.court.drawStoryboardCourts(proxy);
      const r=canvas.getBoundingClientRect(),scale=r.width/canvas.width;
      const fieldWidth=Math.max(...fields[0].points.map(p=>p.x))-Math.min(...fields[0].points.map(p=>p.x));
      return {fieldWidth:fieldWidth*scale,viewportWidth:canvas.closest('main').clientWidth,
        goals:goals.map(g=>({width:Math.max(g.w,g.h)*scale,
          center:r.left+g.points.reduce((sum,p)=>sum+p.x,0)/4*scale}))};
    });
    expect(result.goals).toHaveLength(mode==='half'?1:2);
    expect(result.fieldWidth).toBeLessThanOrEqual(result.viewportWidth-28);
    expect(result.fieldWidth).toBeGreaterThan(result.viewportWidth-45);
    for(const goal of result.goals){
      expect(goal.width/result.fieldWidth).toBeCloseTo(3/20,6);
      expect(Math.abs(goal.center-result.viewportWidth/2)).toBeLessThan(2);
    }
  });
}

test('a manually chosen mobile zoom survives resizing and restart',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await page.locator('#zoomRange').evaluate(input=>{input.value='80';input.dispatchEvent(new Event('input'));});
  await page.setViewportSize({width:360,height:844});
  await expect(page.locator('#zoomRange')).toHaveValue('80');
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await page.reload();await expect(page.locator('#zoomRange')).toHaveValue('80');
});
