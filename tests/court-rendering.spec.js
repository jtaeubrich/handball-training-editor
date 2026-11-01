const {test,expect}=require('@playwright/test');
const {createHash}=require('node:crypto');
const {installRenderCapture}=require('./render-helpers.cjs');
const {configureCourtScenario,measureCourt}=require('./court-helpers.cjs');
const baseline=require('./fixtures/court-v92.json');

test('Canvas courts and storyboards retain v92 rendering',async({page})=>{
  await page.addInitScript(installRenderCapture);
  await page.goto('/');
  for(const {scenario,hash}of baseline.cases){
    await test.step(JSON.stringify(scenario),async()=>{
      await page.evaluate(configureCourtScenario,scenario);
      const commands=await page.evaluate(measureCourt);
      expect(createHash('sha256').update(JSON.stringify(commands)).digest('hex')).toBe(hash);
    });
  }
});
