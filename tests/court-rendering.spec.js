const {test,expect}=require('@playwright/test');
const {createHash}=require('node:crypto');
const {installRenderCapture}=require('./render-helpers.cjs');
const {configureCourtScenario,measureCourt}=require('./court-helpers.cjs');
const baseline=require('./fixtures/court-v92.json');
const {legacyCanvasGoals}=require('./legacy-goal-width.cjs');

test('Canvas courts retain v92 rendering apart from the corrected goal width',async({page})=>{
  await page.addInitScript(installRenderCapture);
  await page.goto('/');
  for(const {scenario,hash}of baseline.cases){
    await test.step(JSON.stringify(scenario),async()=>{
      await page.evaluate(configureCourtScenario,scenario);
      const commands=await page.evaluate(measureCourt);
      let field;
      const goals=[];
      for(const [name,x,y,w,h] of commands){
        if(name!=='strokeRect')continue;
        if(w>=400&&h>=400)field={x,y,w,h};
        else if([14,18].includes(Math.min(w,h))&&Math.max(w,h)>18){
          expect(Math.max(w,h)/Math.min(field.w,field.h)).toBeCloseTo(3/20,8);
          if(w>h)expect(x+w/2).toBeCloseTo(field.x+field.w/2,8);
          else expect(y+h/2).toBeCloseTo(field.y+field.h/2,8);
          goals.push([w,h]);
        }
      }
      expect(goals).toHaveLength(scenario.cells.reduce((sum,c)=>sum+(c.mode==='half'?1:c.mode==='full'?2:0),0));
      expect(createHash('sha256').update(JSON.stringify(legacyCanvasGoals(commands))).digest('hex')).toBe(hash);
    });
  }
});
