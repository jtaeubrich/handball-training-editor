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
        module[factory]=(...args)=>{window.__editorState=args[0];const controller=create(...args);window.__controllers.push(controller);return controller;};
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
// Firefox quantizes injected mouse coordinates to CSS pixels; canvas bounds can
// start on a half pixel. Keep a one-pixel input tolerance, but compare undo
// snapshots exactly so rounding cannot conceal lost object state.
function expectPoint(object,x,y){
  expect(Math.abs(object.x-x)).toBeLessThanOrEqual(1);
  expect(Math.abs(object.y-y)).toBeLessThanOrEqual(1);
}

test('dragging a symbol commits its position and supports keyboard undo/redo',async({page})=>{
  await choose(page,'feeder');await click(page,240,240);
  const original=(await project(page)).objects[0];
  await page.locator('#selectBtn').click();
  await drag(page,240,240,290,280);
  const moved=(await project(page)).objects[0];expectPoint(moved,290,280);
  await page.keyboard.press('Control+z');
  expect((await project(page)).objects[0]).toEqual(original);
  await page.keyboard.press('Control+y');
  expect((await project(page)).objects[0]).toEqual(moved);
});

test('rectangle selection moves a group and Delete removes it',async({page})=>{
  await choose(page,'feeder');await click(page,200,220);await click(page,300,220);
  await page.locator('#selectBtn').click();await drag(page,150,170,350,270);
  await expect(page.locator('#propType')).toHaveText('2 Objekte');
  await drag(page,200,220,230,260);
  const moved=(await project(page)).objects;expectPoint(moved[0],230,260);expectPoint(moved[1],330,260);
  expect(moved[1].x-moved[0].x).toBe(100);expect(moved[1].y).toBe(moved[0].y);
  await page.keyboard.press('Delete');expect((await project(page)).objects).toEqual([]);
  await page.locator('#undoBtn').click();expect((await project(page)).objects).toHaveLength(2);
});

test('modifier duplication leaves the source object in place',async({page})=>{
  await choose(page,'feeder');await click(page,240,240);
  const original=(await project(page)).objects[0];
  await page.locator('#selectBtn').click();await click(page,240,240);
  await page.keyboard.down('Control');await drag(page,240,240,300,280);await page.keyboard.up('Control');
  const objects=(await project(page)).objects;
  expect(objects).toHaveLength(2);
  expect(objects[0]).toEqual(original);
  expectPoint(objects[1],300,280);
});

test('rotation handle rotates a selected player and undo restores it',async({page})=>{
  await choose(page,'attacker');await click(page,280,280);
  const original=(await project(page)).objects[0];
  await page.locator('#selectBtn').click();await click(page,280,280);
  const angle=original.rotation*Math.PI/180,dist=original.size*1.15;
  const x=original.x+Math.sin(angle)*dist,y=original.y-Math.cos(angle)*dist;
  await drag(page,x,y,original.x+Math.cos(angle)*dist,original.y+Math.sin(angle)*dist);
  const rotated=(await project(page)).objects[0];
  expect(Math.abs((rotated.rotation-original.rotation+360)%360-90)).toBeLessThanOrEqual(2);
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
  expectPoint({x:endpoint.x2,y:endpoint.y2},440,330);
  await drag(page,endpoint.cx1,endpoint.cy1,endpoint.cx1+20,endpoint.cy1-30);
  const edited=(await project(page)).objects[0];
  expectPoint({x:edited.cx1,y:edited.cy1},endpoint.cx1+20,endpoint.cy1-30);
});

test('Escape cancels a multi-point preview and double click finishes once',async({page})=>{
  await choose(page,'runMulti');await click(page,200,200);await click(page,300,250);
  await page.keyboard.press('Escape');expect((await project(page)).objects).toHaveLength(0);
  await click(page,200,200);const end=await at(page,340,260);await page.mouse.dblclick(end.x,end.y);
  const objects=(await project(page)).objects;
  expect(objects).toHaveLength(1);expect(objects[0].points).toHaveLength(2);
});

for (const type of ['runMulti','runBallMulti','screenMulti']) {
  test(`${type}: undo removes one segment, redraws it and continues from the remaining endpoint`,async({page})=>{
    await choose(page,'feeder');await click(page,450,400);
    const original=(await project(page)).objects;
    await choose(page,type);
    await click(page,200,200);await click(page,300,250);
    const remaining=await page.locator('#c').evaluate(canvas=>canvas.toDataURL());
    await click(page,380,300);
    await page.locator('#undoBtn').click();
    expect(await page.evaluate(()=>window.__editorState.drawing.points)).toHaveLength(3);
    expect(await page.locator('#c').evaluate((canvas,before)=>canvas.toDataURL()===before,remaining)).toBe(true);
    expect((await project(page)).objects).toEqual(original);
    await page.keyboard.press('Control+y');
    expect(await page.evaluate(()=>window.__editorState.drawing.points)).toHaveLength(4);
    await page.keyboard.press('Control+z');
    await click(page,320,350);
    await page.keyboard.press('Control+y'); // Continuing discards the removed branch.
    await page.keyboard.press('Enter');
    const path=(await project(page)).objects[1];
    expect(path.points).toHaveLength(3);
    expectPoint(path.points[1],300,250);expectPoint(path.points[2],320,350);
    await page.locator('#undoBtn').click();
    expect((await project(page)).objects).toEqual(original);
    await page.locator('#redoBtn').click();
    expect((await project(page)).objects[1]).toEqual(path);
  });
}

test('undoing every pending point permits a fresh path and does not resurrect cancelled points',async({page})=>{
  await choose(page,'runMulti');await click(page,200,200);await click(page,300,250);
  await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');
  expect(await page.evaluate(()=>window.__editorState.drawing)).toBeNull();
  await page.keyboard.press('Control+y');await page.keyboard.press('Control+y');
  expect(await page.evaluate(()=>window.__editorState.drawing.points)).toHaveLength(3);
  await page.keyboard.press('Escape');await page.keyboard.press('Control+y');
  expect(await page.evaluate(()=>window.__editorState.drawing)).toBeNull();
  await click(page,400,300);await click(page,480,350);await page.keyboard.press('Enter');
  const path=(await project(page)).objects[0];expect(path.points).toHaveLength(2);
  expectPoint(path.points[0],400,300);expectPoint(path.points[1],480,350);
});

test('mobile undo preserves remaining segments in the local draft',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await choose(page,'runMulti');
  await click(page,350,200);await click(page,450,250);await click(page,550,300);
  await page.locator('#mobileUndoBtn').click();
  const pending=await page.evaluate(()=>JSON.parse(localStorage.getItem('handballtrainer.localDraft.v1')).snapshot.pendingObject);
  expect(pending.points).toHaveLength(3);
  expectPoint(pending.points[1],450,250);
  await page.reload();
  const path=(await project(page)).objects[0];
  expect(path.points).toEqual(pending.points);
  expectPoint(path.points[0],350,200);expectPoint(path.points[1],450,250);
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
  const initialZoom=(await project(page)).layout.zoomPercent;
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  const origin=await at(page,250,260);
  const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(({x,y,id})=>({x,y,id,radiusX:2,radiusY:2}))});
  await touch('touchStart',[{...origin,id:1}]);
  await touch('touchStart',[{...origin,id:1},{x:origin.x+80,y:origin.y,id:2}]);
  await touch('touchMove',[{x:origin.x-10,y:origin.y,id:1},{x:origin.x+100,y:origin.y,id:2}]);
  await touch('touchCancel',[]);
  const result=await project(page);
  expect(result.objects).toHaveLength(0);
  expect(result.layout.zoomPercent).toBeGreaterThan(initialZoom);
  const after=await at(page,270,240);
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
