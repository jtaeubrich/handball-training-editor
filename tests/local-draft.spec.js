const {test,expect}=require('@playwright/test');
const KEY='handballtrainer.localDraft.v1';
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key))?.snapshot,KEY);
const objects=async page=>(await stored(page))?.project.objects;
const choose=(page,type)=>page.locator(`aside .tool[data-tool="${type}"]`).first().evaluate(button=>button.click());
async function addPlayer(page){await choose(page,'feeder');await page.locator('#c').click({position:{x:230,y:230}});}

test('drawing survives closing and reopening a page in the same browser',async({page,context})=>{
  await page.goto('/');await addPlayer(page);
  await expect.poll(async()=>(await objects(page))?.length).toBe(1);
  const before=await objects(page);
  await page.close();
  const reopened=await context.newPage();await reopened.goto('/');
  await expect(reopened.locator('#status')).toHaveText('Letzte Zeichnung lokal wiederhergestellt');
  expect(await objects(reopened)).toEqual(before);
  await choose(reopened,'feeder');await reopened.locator('#c').click({position:{x:330,y:230}});
  expect(await objects(reopened)).toHaveLength(2);
});

test('storyboard, cell courts, active cell and zoom are restored',async({page})=>{
  await page.goto('/');
  await page.locator('#layoutGrid').selectOption('2x1');
  await page.locator('#activeCellSelect').selectOption({value:'1'});
  await page.locator('#courtMode').selectOption('full');
  await page.locator('#courtTheme').selectOption('blue');
  await page.locator('#courtRotation').selectOption('90');
  await page.locator('#gridVisible').check();
  await page.locator('#zoomRange').fill('75');
  await page.locator('#zoomRange').dispatchEvent('input');
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  const before=(await stored(page)).project;
  expect(before.layout.activeCell).toBe(1);
  await page.reload();
  await expect(page.locator('#layoutGrid')).toHaveValue('2x1');
  await expect(page.locator('#activeCellSelect')).toHaveValue('1');
  await expect(page.locator('#courtMode')).toHaveValue('full');
  await expect(page.locator('#courtRotation')).toHaveValue('90');
  await expect(page.locator('#courtTheme')).toHaveValue('blue');
  await expect(page.locator('#gridVisible')).toBeChecked();
  await expect(page.locator('#zoomRange')).toHaveValue('75');
  expect((await stored(page)).project).toEqual(before);
});

test('undo, redo and clearing replace the local drawing',async({page})=>{
  await page.goto('/');await addPlayer(page);
  await page.locator('#undoBtn').click();expect(await objects(page)).toHaveLength(0);
  await page.locator('#redoBtn').click();expect(await objects(page)).toHaveLength(1);
  await page.reload();
  await page.locator('#clearBtn').click();expect(await objects(page)).toHaveLength(0);
  await page.reload();expect(await objects(page)).toHaveLength(0);
});

test('loaded project keeps its name and content after restarting',async({page})=>{
  await page.goto('/');
  await page.locator('#jsonFile').setInputFiles({name:'training-montag.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({
    version:89,objects:[{kind:'symbol',type:'feeder',x:230,y:230,size:40,width:2,color:'#1976d2'}]
  }))});
  await expect(page.locator('#status')).toHaveText('Projekt geladen: training-montag.json');
  await page.reload();
  await expect(page.locator('#status')).toHaveText('Letzte Zeichnung lokal wiederhergestellt');
  await page.evaluate(()=>{
    window.showSaveFilePicker=async options=>({name:options.suggestedName,createWritable:async()=>({write:async blob=>{window.__saved=JSON.parse(await blob.text());},close:async()=>{}})});
  });
  await page.locator('#jsonSaveBtn').click();
  await expect(page.locator('#status')).toHaveText('Projekt gespeichert: training-montag.json');
  expect(await page.evaluate(()=>window.__saved.objects)).toHaveLength(1);
});

test('a newly chosen project filename is immediately included in the local draft',async({page})=>{
  await page.goto('/');await addPlayer(page);
  await page.evaluate(()=>{
    window.showSaveFilePicker=async()=>({name:'neue-uebung.json',createWritable:async()=>({write:async()=>{},close:async()=>{}})});
  });
  await page.locator('#jsonSaveBtn').click();
  await expect(page.locator('#status')).toHaveText('Projekt gespeichert: neue-uebung.json');
  expect((await stored(page)).fileName).toBe('neue-uebung.json');
  await page.reload();
  await expect(page.locator('#status')).toHaveText('Letzte Zeichnung lokal wiederhergestellt');
  expect((await stored(page)).fileName).toBe('neue-uebung.json');
});

test('an interrupted freehand stroke is recovered as an editable object',async({page})=>{
  await page.goto('/');await choose(page,'freehand');
  const box=await page.locator('#c').boundingBox();
  await page.mouse.move(box.x+200,box.y+200);await page.mouse.down();
  await page.mouse.move(box.x+280,box.y+240,{steps:5});
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  const draft=await stored(page);expect(draft.pendingObject.kind).toBe('freehand');
  await page.mouse.up();
  // Restore the interrupted snapshot rather than the later completed stroke.
  await page.evaluate(({key,draft})=>localStorage.setItem(key,JSON.stringify({schemaVersion:1,snapshot:draft})),{key:KEY,draft});
  await page.reload();
  await expect(page.locator('#status')).toHaveText('Letzte Zeichnung lokal wiederhergestellt');
  await expect.poll(async()=>(await stored(page))?.pendingObject).toBe(null);
  expect((await objects(page))[0]).toMatchObject({kind:'freehand',points:draft.pendingObject.points});
});

test('corrupted local data does not stop the editor from opening',async({page})=>{
  await page.addInitScript(key=>localStorage.setItem(key,'{bad json'),KEY);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#status')).toContainText('konnte nicht wiederhergestellt');
  await addPlayer(page);expect(await objects(page)).toHaveLength(1);expect(errors).toEqual([]);
});

test('a storage quota failure leaves the previous draft intact and drawing remains usable',async({page})=>{
  await page.goto('/');await addPlayer(page);const before=await objects(page);
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});
  await choose(page,'feeder');await page.locator('#c').click({position:{x:330,y:230}});
  await expect(page.locator('#status')).toContainText('Lokale Sicherung nicht möglich');
  expect(await objects(page)).toEqual(before);
  await page.locator('#selectBtn').click();await page.locator('#c').click({position:{x:330,y:230}});
  await expect(page.locator('#propPanel')).toBeVisible();
});
