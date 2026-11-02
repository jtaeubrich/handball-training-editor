const {test,expect}=require('@playwright/test');

const actions = [
  ['Laufweg',[['run','Einfach'],['complexRun','Komplex'],['runMulti','Mehrpunkt']]],
  ['Ballweg / Passweg',[['pass','Einfach'],['passCurve','Komplex']]],
  ['Passtäuschung',[['passFake','Einfach'],['passFakeCurve','Komplex']]],
  ['Laufweg mit Ball',[['runBall','Einfach'],['runBallCurve','Komplex'],['runBallMulti','Mehrpunkt']]],
  ['Tippen des Balls',[['tip','Einfach'],['tipCurve','Komplex']]],
  ['Prellen des Balls',[['dribble','Einfach'],['dribbleCurve','Komplex']]],
  ['Torwurf',[['shot','Einfach'],['shotCurve','Komplex']]],
  ['Torwurftäuschung',[['shotFake','Einfach'],['shotFakeCurve','Komplex']]],
  ['Sperre',[['screen','Einfach'],['screenCurve','Komplex'],['screenMulti','Mehrpunkt']]]
];

for(const width of [320,390]){
  test(`mobile actions show distinct action and variant labels at ${width}px`,async({page})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height:844});
    await page.goto('/');
    await page.locator('.mobile-nav-btn[data-mobile-group="paths"]').click();
    const names=[];
    for(const [action,variants]of actions){
      for(const [type,variant]of variants){
        const button=page.locator(`#mobileToolSheet .tool[data-tool="${type}"]`);
        await expect(button.locator('.mobile-tool-name')).toHaveText(action);
        await expect(button.locator('.mobile-tool-variant')).toHaveText(variant);
        await expect(button).toHaveAccessibleName(`${action} – ${variant}`);
        await expect(button.locator('.ico svg')).toHaveCount(1);
        names.push(await button.getAttribute('aria-label'));
      }
    }
    expect(new Set(names).size).toBe(21);
    await expect(page.locator('#mobileToolSheet .tool[data-tool="freehand"]')).toContainText('Freihand');
    const fits=await page.locator('#mobileToolSheet .mobile-action-tool').evaluateAll(buttons=>buttons.every(button=>{
      const name=button.querySelector('.mobile-tool-name');
      return name.scrollWidth<=name.clientWidth+1 && button.scrollWidth<=button.clientWidth+1;
    }));
    expect(fits).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('mobile action variants still activate the matching drawing tool',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.locator('.mobile-nav-btn[data-mobile-group="paths"]').click();
  await page.locator('#mobileToolSheet .tool[data-tool="passCurve"]').click();
  await expect(page.locator('#status')).toContainText('Komplexer Ballweg / Passweg');
  await expect(page.locator('#passGroupBtn')).toHaveAttribute('data-current-tool','passCurve');
  await expect(page.locator('#mobileToolSheet')).not.toHaveClass(/open/);
  await page.locator('.mobile-nav-btn[data-mobile-group="paths"]').click();
  await expect(page.locator('#mobileToolSheet .tool[data-tool="passCurve"]')).toHaveClass(/active/);
});
