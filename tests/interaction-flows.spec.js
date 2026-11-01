const {test,expect}=require('@playwright/test');

const pageErrors=new WeakMap();
test.beforeEach(async({page})=>{
  const errors=[];pageErrors.set(page,errors);page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    window.__writes=[];
    window.showSaveFilePicker=async options=>({name:options.suggestedName,createWritable:async()=>({
      write:async blob=>window.__writes.push(JSON.parse(await blob.text())),close:async()=>{}
    })});
    window.__controllers=[];
    for(const [name,factory]of [['HandballTools','createTools'],['HandballMobile','createMobile'],['HandballInteractions','createInteractions']]){
      Object.defineProperty(window,name,{configurable:true,set(module){
        const create=module[factory];
        module[factory]=(...args)=>{const controller=create(...args);window.__controllers.push(controller);return controller;};
        Object.defineProperty(window,name,{value:module,configurable:true});
      }});
    }
  });
  await page.goto('/');
});
test.afterEach(async({page})=>{expect(pageErrors.get(page)).toEqual([]);});

async function project(page){
  const count=await page.evaluate(()=>window.__writes.length);
  await page.locator('#jsonSaveBtn').evaluate(button=>button.click());
  await expect.poll(()=>page.evaluate(()=>window.__writes.length)).toBe(count+1);
  return page.evaluate(()=>window.__writes.at(-1));
}
async function choose(page,type){await page.locator(`aside .tool[data-tool="${type}"]`).first().evaluate(button=>button.click());}
async function at(page,x,y){return page.locator('#c').evaluate((canvas,{x,y})=>{
  const r=canvas.getBoundingClientRect();return {x:r.left+x*r.width/canvas.width,y:r.top+y*r.height/canvas.height};
},{x,y});}
async function click(page,x,y){const p=await at(page,x,y);await page.mouse.click(p.x,p.y);}
async function drag(page,x1,y1,x2,y2){
  const a=await at(page,x1,y1),b=await at(page,x2,y2);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.mouse.up();
}

test('dragging a symbol commits its position and supports keyboard undo/redo',async({page})=>{
  await choose(page,'feeder');await click(page,240,240);
  await page.locator('#selectBtn').click();
  await drag(page,240,240,290,280);
  expect((await project(page)).objects[0]).toMatchObject({x:290,y:280});
  await page.keyboard.press('Control+z');
  expect((await project(page)).objects[0]).toMatchObject({x:240,y:240});
  await page.keyboard.press('Control+y');
  expect((await project(page)).objects[0]).toMatchObject({x:290,y:280});
});

test('rectangle selection moves a group and Delete removes it',async({page})=>{
  await choose(page,'feeder');await click(page,200,220);await click(page,300,220);
  await page.locator('#selectBtn').click();await drag(page,150,170,350,270);
  await expect(page.locator('#propType')).toHaveText('2 Objekte');
  await drag(page,200,220,230,260);
  expect((await project(page)).objects.map(o=>({x:o.x,y:o.y}))).toEqual([{x:230,y:260},{x:330,y:260}]);
  await page.keyboard.press('Delete');expect((await project(page)).objects).toEqual([]);
  await page.locator('#undoBtn').click();expect((await project(page)).objects).toHaveLength(2);
});

test('modifier duplication leaves the source object in place',async({page})=>{
  await choose(page,'feeder');await click(page,240,240);
  await page.locator('#selectBtn').click();await click(page,240,240);
  await page.keyboard.down('Control');await drag(page,240,240,300,280);await page.keyboard.up('Control');
  const objects=(await project(page)).objects;
  expect(objects).toHaveLength(2);
  expect(objects[0]).toMatchObject({x:240,y:240});
  expect(objects[1]).toMatchObject({x:300,y:280});
});

test('rotation handle rotates a selected player and undo restores it',async({page})=>{
  await choose(page,'attacker');await click(page,280,280);
  const original=(await project(page)).objects[0];
  await page.locator('#selectBtn').click();await click(page,280,280);
  const angle=original.rotation*Math.PI/180,dist=original.size*1.15;
  const x=original.x+Math.sin(angle)*dist,y=original.y-Math.cos(angle)*dist;
  await drag(page,x,y,original.x+Math.cos(angle)*dist,original.y+Math.sin(angle)*dist);
  const rotated=(await project(page)).objects[0];
  expect((rotated.rotation-original.rotation+360)%360).toBeCloseTo(90,2);
  await page.locator('#undoBtn').click();expect((await project(page)).objects[0]).toEqual(original);
});

test('path endpoints and Bezier controls remain editable',async({page})=>{
  await choose(page,'passCurve');await drag(page,200,200,400,300);
  const original=(await project(page)).objects[0];
  await page.locator('#selectBtn').click();
  const middle={x:(original.x1+original.x2)/2,y:(original.y1+original.y2)/2};
  await click(page,middle.x,middle.y);
  await drag(page,original.x2,original.y2,440,330);
  const endpoint=(await project(page)).objects[0];
  expect(endpoint).toMatchObject({x2:440,y2:330});
  await drag(page,endpoint.cx1,endpoint.cy1,endpoint.cx1+20,endpoint.cy1-30);
  const edited=(await project(page)).objects[0];
  expect(edited.cx1).toBeCloseTo(endpoint.cx1+20,4);
  expect(edited.cy1).toBeCloseTo(endpoint.cy1-30,4);
});

test('Escape cancels a multi-point preview and double click finishes once',async({page})=>{
  await choose(page,'runMulti');await click(page,200,200);await click(page,300,250);
  await page.keyboard.press('Escape');expect((await project(page)).objects).toHaveLength(0);
  await click(page,200,200);const end=await at(page,340,260);await page.mouse.dblclick(end.x,end.y);
  const objects=(await project(page)).objects;
  expect(objects).toHaveLength(1);expect(objects[0].points).toHaveLength(2);
});

test('desktop groups retain chosen variants and tool order survives reload',async({page})=>{
  await page.locator('#attackGroupBtn .tool-group-arrow').click();
  await page.locator('#attackToolDropdown .tool[data-tool="attackerBall"]').click();
  await expect(page.locator('#attackGroupBtn')).toContainText('Angreifer mit Ball');
  await page.locator('#selectBtn').click();await page.locator('#attackGroupBtn').click();await click(page,230,230);
  expect((await project(page)).objects[0].type).toBe('attackerBall');
  await page.evaluate(()=>localStorage.setItem('handballtrainer.toolOrder.v80',JSON.stringify({players:['tool:feeder','group:attack','group:defense']})));
  await page.reload();
  // The saved order must not remove any available tool or duplicate sort grips.
  expect(await page.locator('aside .tool[data-tool="feeder"]').count()).toBe(1);
  expect(await page.locator('.sortable-tool-item').count()).toBeGreaterThan(10);
  expect(await page.locator('.sortable-tool-item').evaluateAll(items=>items.every(item=>item.querySelectorAll(':scope > .tool-sort-handle').length===1))).toBe(true);
  await expect(page.locator('[data-sort-category="players"]').first()).toHaveAttribute('data-sort-id','tool:feeder');
  await page.setViewportSize({width:390,height:844});
  await page.locator('.mobile-nav-btn[data-mobile-group="players"]').click();
  await expect(page.locator('#mobileToolSheet .tool').first()).toHaveAttribute('data-tool','feeder');
});

test('mobile tool sheets, properties, settings and delete use the same editor state',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.locator('.mobile-nav-btn[data-mobile-group="players"]').click();
  await page.locator('#mobileToolSheet .tool[data-tool="feeder"]').click();
  await expect(page.locator('#mobileToolSheet')).not.toHaveClass(/open/);
  await click(page,150,160);expect((await project(page)).objects).toHaveLength(1);
  await page.locator('#mobilePropsBtn').click();await expect(page.locator('.properties')).toHaveClass(/mobile-open/);
  await page.locator('#mobileBackdrop').click({position:{x:10,y:10}});
  await page.locator('#mobileSettingsBtn').click();
  await page.locator('#mCourtMode').selectOption('full');
  await expect(page.locator('#courtMode')).toHaveValue('full');
  await page.locator('#mobileSettingsClose').click();
  await page.locator('#mobilePropsBtn').click();
  await page.locator('#mobileDeleteSelectionBtn').click();expect((await project(page)).objects).toHaveLength(0);
  await page.locator('#mobileBackdrop').click({position:{x:10,y:10}});
  await page.locator('#mobileUndoBtn').click();expect((await project(page)).objects).toHaveLength(1);
});

test('two-finger zoom rolls back first-finger edits and recovers after cancellation',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Trusted multi-touch injection uses the Chromium debugging protocol.');
  await page.setViewportSize({width:390,height:844});
  await choose(page,'feeder');
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  const origin=await at(page,100,180);
  const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(({x,y,id})=>({x,y,id,radiusX:2,radiusY:2}))});
  await touch('touchStart',[{...origin,id:1}]);
  await touch('touchStart',[{...origin,id:1},{x:origin.x+80,y:origin.y,id:2}]);
  await touch('touchMove',[{x:origin.x-10,y:origin.y,id:1},{x:origin.x+100,y:origin.y,id:2}]);
  await touch('touchCancel',[]);
  const result=await project(page);
  expect(result.objects).toHaveLength(0);
  expect(result.layout.zoomPercent).toBeGreaterThan(100);
  const after=await at(page,120,140);
  await touch('touchStart',[{...after,id:3}]);await touch('touchEnd',[]);
  expect((await project(page)).objects).toHaveLength(1);
});

test('a cancelled pointer cannot leave an unfinished path blocking the next placement',async({page})=>{
  await choose(page,'run');
  const p=await at(page,200,220);await page.mouse.move(p.x,p.y);await page.mouse.down();
  await page.locator('#c').dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse'});await page.mouse.up();
  await choose(page,'feeder');await click(page,240,240);
  expect((await project(page)).objects.map(o=>o.type)).toEqual(['feeder']);
});

test('installing controllers twice does not duplicate event handlers',async({page})=>{
  await page.evaluate(()=>window.__controllers.forEach(controller=>controller.install()));
  await choose(page,'feeder');await click(page,240,240);
  expect((await project(page)).objects).toHaveLength(1);
});

test('label offset dragging updates the project and undo restores the offset',async({page})=>{
  await choose(page,'attacker');await click(page,240,240);
  await page.locator('#propShowLabel').check();
  await page.locator('#labelOffsetEditor').scrollIntoViewIfNeeded();
  const box=await page.locator('#labelOffsetEditor').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.75,box.y+box.height*.25,{steps:4});await page.mouse.up();
  const object=(await project(page)).objects[0];
  expect(object.labelOffsetX).toBeCloseTo(25,0);expect(object.labelOffsetY).toBeCloseTo(-25,0);
  await page.locator('#undoBtn').click();
  expect((await project(page)).objects[0]).toMatchObject({labelOffsetX:0,labelOffsetY:0});
});
