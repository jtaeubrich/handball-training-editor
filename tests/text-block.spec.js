const {test,expect}=require('@playwright/test');
const errors=new WeakMap();
test.beforeEach(async({page})=>{
  const list=[];errors.set(page,list);page.on('pageerror',e=>list.push(e.message));
  await page.addInitScript(()=>{
    window.__writes=[];
    window.showSaveFilePicker=async()=>({name:'text-test.json',createWritable:async()=>({write:async blob=>window.__writes.push(JSON.parse(await blob.text())),close:async()=>{}})});
    Object.defineProperty(window,'HandballInteractions',{configurable:true,set(module){
      const create=module.createInteractions;module.createInteractions=(state,deps)=>{window.__editorState=state;return create(state,deps);};
      Object.defineProperty(window,'HandballInteractions',{value:module,configurable:true});
    }});
  });
  await page.goto('/');
});
test.afterEach(async({page})=>expect(errors.get(page)).toEqual([]));
const objects=page=>page.evaluate(()=>window.__editorState.objects);
async function create(page){
  await page.locator('aside .tool[data-tool="text"]').evaluate(b=>b.click());
  await page.locator('#c').click({position:{x:240,y:240}});
}
test('a text block can be edited, styled, moved, saved and exported without interpreting markup',async({page})=>{
  await create(page);await expect(page.locator('#propTextContent')).toBeVisible();
  const content='Torwart einwerfen\nPass von 2 zu 1 <script> & Abschluss';
  await page.locator('#propTextContent').fill(content);await page.locator('#propTextContent').press('Tab');
  await page.locator('#propSize').fill('32');await page.locator('#propSize').press('Tab');
  await page.locator('#propTextBold').check();await page.locator('#propTextItalic').check();await page.locator('#propTextUnderline').check();
  await page.locator('#propTextAlign').selectOption('center');
  await page.locator('#propColor').evaluate(input=>{input.value='#d32f2f';input.dispatchEvent(new Event('change'));});
  await page.locator('#propTextWidth').fill('400');await page.locator('#propTextWidth').press('Tab');
  const styled=(await objects(page))[0];
  expect(styled).toMatchObject({kind:'symbol',type:'text',text:content,size:32,color:'#d32f2f',bold:true,italic:true,underline:true,textAlign:'center',textWidth:400});
  await page.locator('#undoBtn').click();expect((await objects(page))[0].textWidth).toBe(320);
  await page.locator('#redoBtn').click();expect((await objects(page))[0]).toEqual(styled);
  const point=await page.locator('#c').evaluate((c,o)=>{const r=c.getBoundingClientRect();return {x:r.left+o.x+200,y:r.top+o.y+20};},styled);
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+40,point.y+30,{steps:5});await page.mouse.up();
  const moved=(await objects(page))[0];expect(moved.x-styled.x).toBeCloseTo(40,0);expect(moved.y-styled.y).toBeCloseTo(30,0);
  await page.locator('#jsonSaveBtn').click();await expect.poll(()=>page.evaluate(()=>window.__writes.length)).toBe(1);
  expect(await page.evaluate(()=>window.__writes[0].objects[0])).toEqual(moved);
  await page.evaluate(()=>{window.HandballExport.saveSvgText=async svg=>{window.__svg=svg;};});
  await page.locator('#svgBtn').click();
  const svg=await page.evaluate(()=>window.__svg);expect(svg).toContain('font-size="32"');expect(svg).toContain('font-weight="700"');expect(svg).toContain('text-decoration="underline"');expect(svg).toContain('&lt;script&gt;');expect(svg).not.toContain('<script>');
  await page.reload();expect((await objects(page))[0]).toEqual(moved);
});
test('mobile text tool opens properties and supports multiline input without deleting the object',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-mobile-group="other"]').click();
  await page.locator('#mobileToolSheet .tool[data-tool="text"]').click();
  await page.locator('#c').click({position:{x:240,y:240}});
  await expect(page.locator('#propTextContent')).toBeVisible();
  await page.locator('#propTextContent').fill('Beschreibung\nZwei Reihen mit Ball');
  await page.locator('#propTextContent').press('Backspace');
  expect(await objects(page)).toHaveLength(1);
  await page.locator('#propTextContent').press('Tab');
  await page.locator('#propTextBold').check();
  expect((await objects(page))[0]).toMatchObject({text:'Beschreibung\nZwei Reihen mit Bal',bold:true});
  await page.reload();expect((await objects(page))[0]).toMatchObject({text:'Beschreibung\nZwei Reihen mit Bal',bold:true});
});
test('text bounds wrap long content and AI can still move a sketch containing a text block',async({page})=>{
  await create(page);await page.locator('#propTextContent').fill('Lange Beschreibung einer Übung mit mehreren Spielern und Aktionen.');await page.locator('#propTextContent').press('Tab');
  const layout=await page.evaluate(()=>window.HandballText.layout(window.__editorState.objects[0]));expect(layout.lines.length).toBeGreaterThan(1);
  let request;await page.route('**/api/chat',route=>{request=route.request().postDataJSON();return route.fulfill({json:{message:'Text verschoben.',commands:[{op:'move',target:'object-0',x:10,y:10}]}});});
  await page.locator('#aiChatToggle').click();await page.locator('#aiChatPrompt').fill('Text in die Mitte setzen');await page.locator('#aiChatSend').click();
  await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  expect(request.scene.objects[0]).toMatchObject({type:'text',text:'Lange Beschreibung einer Übung mit mehreren Spielern und Aktionen.'});
  expect((await objects(page))[0]).toMatchObject({x:500,y:470,type:'text'});
});
