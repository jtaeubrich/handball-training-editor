const {test,expect}=require('@playwright/test');
const errors=new WeakMap();
test.beforeEach(async({page})=>{
  const list=[];errors.set(page,list);page.on('pageerror',e=>list.push(e.message));
  await page.addInitScript(()=>{
    Object.defineProperty(window,'HandballInteractions',{configurable:true,set(module){
      const create=module.createInteractions;
      module.createInteractions=(state,deps)=>{window.__editorState=state;return create(state,deps);};
      Object.defineProperty(window,'HandballInteractions',{value:module,configurable:true});
    }});
  });
  await page.goto('/');
});
test.afterEach(async({page})=>expect(errors.get(page)).toEqual([]));
const objects=page=>page.evaluate(()=>window.__editorState.objects);
const choose=(page,type)=>page.locator(`aside .tool[data-tool="${type}"]`).first().evaluate(b=>b.click());
const reply={message:'Zwei Spieler und ein Pass sind eingezeichnet.',commands:[
  {op:'add_symbol',id:'player1',type:'attacker',x:8,y:10,label:'1'},
  {op:'add_symbol',id:'player2',type:'attackerBall',x:12,y:10,label:'2'},
  {op:'add_path',id:'pass1',type:'pass',points:[{x:12,y:10},{x:8,y:10}]}
]};
async function send(page,text='Zwei Angreifer und ein Pass von 2 zu 1'){
  await page.locator('#aiChatToggle').click();
  await page.locator('#aiChatPrompt').fill(text);
  await page.locator('#aiChatSend').click();
}
async function respond(page,body=reply){
  await page.route('**/api/chat',route=>route.fulfill({json:body}));
}

test('a chat answer adds native objects as one undo step, persists and exports them',async({page})=>{
  let request;
  await page.route('**/api/chat',route=>{request=route.request().postDataJSON();return route.fulfill({json:reply});});
  await send(page);
  await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  expect(request.scene).toMatchObject({mode:'half',width:20,height:20,objects:[]});
  expect(Object.keys(request)).toEqual(['messages','scene']);
  const created=await objects(page);
  expect(created).toHaveLength(3);
  expect(created[0]).toMatchObject({kind:'symbol',type:'attacker',attackFormation:'numbers',label:'1',showLabel:true});
  expect(created[1]).toMatchObject({type:'attackerBall',label:'2'});
  expect(created[2]).toMatchObject({kind:'path',type:'pass',x1:created[1].x,y1:created[1].y,x2:created[0].x,y2:created[0].y});
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('handballtrainer.localDraft.v1')).snapshot.project.objects);
  expect(stored).toEqual(created);
  await page.locator('#aiChatClose').click();
  await page.locator('#undoBtn').click();expect(await objects(page)).toEqual([]);
  await page.locator('#redoBtn').click();expect(await objects(page)).toEqual(created);
  await page.evaluate(()=>{window.HandballExport.saveSvgText=async svg=>{window.__svg=svg;};});
  await page.locator('#svgBtn').click();
  await expect.poll(()=>page.evaluate(()=>window.__svg)).toContain('>1</text>');
  await page.reload();expect(await objects(page)).toEqual(created);
});

test('follow-up messages move and relabel existing players without recreating the scene',async({page})=>{
  const requests=[];
  await page.route('**/api/chat',route=>{
    requests.push(route.request().postDataJSON());
    return route.fulfill({json:requests.length===1 ? reply : {message:'Spieler 1 heißt jetzt Lea.',commands:[
      {op:'move',target:'object-0',x:6,y:9},{op:'label',target:'object-0',label:'<Lea> & 1'},
      {op:'remove',target:'object-2'}
    ]}});
  });
  await send(page);await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  const before=await objects(page);
  await page.locator('#aiChatPrompt').fill('Spieler 1 auf 9 m setzen und Lea nennen; Pass entfernen');
  await page.locator('#aiChatSend').click();
  await expect(page.locator('#aiChatLog')).toContainText('Spieler 1 heißt jetzt Lea.');
  const after=await objects(page);expect(after).toHaveLength(2);
  expect(after[1]).toEqual(before[1]);expect(after[0].attackFormation).toBe('custom');
  expect(requests[1].messages).toHaveLength(3);
  expect(requests[1].scene.objects[0]).toMatchObject({id:'object-0',label:'1',x:8,y:10});
  await page.locator('#aiChatClose').click();await page.locator('#undoBtn').click();
  expect(await objects(page)).toEqual(before);
});

test('clarifications and markup in replies are displayed as text without changing the sketch',async({page})=>{
  await respond(page,{message:'Welchen Spieler meinst du? <img src=x onerror="window.pwned=true">',commands:[]});
  await send(page,'Verschiebe den Spieler');
  await expect(page.locator('#aiChatLog')).toContainText('Welchen Spieler');
  expect(await objects(page)).toEqual([]);
  expect(await page.locator('#aiChatLog img').count()).toBe(0);
  expect(await page.evaluate(()=>window.pwned)).toBeUndefined();
  await page.locator('#aiChatReset').click();await expect(page.locator('#aiChatLog')).toBeEmpty();
});

test('invalid batches are rejected atomically even after a valid command',async({page})=>{
  await respond(page,{message:'Änderung',commands:[reply.commands[0],{op:'move',target:'missing',x:5,y:5}]});
  await send(page);await expect(page.locator('#aiChatStatus')).toContainText('nicht vorhandenes Objekt');
  expect(await objects(page)).toEqual([]);
});

test('a response is discarded when the sketch changes during the request',async({page})=>{
  let release;
  const wait=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/chat',async route=>{await wait;await route.fulfill({json:reply});});
  await send(page);await expect(page.locator('#aiChatCancel')).toBeVisible();
  await page.locator('#aiChatClose').click();
  await choose(page,'feeder');await page.locator('#c').click({position:{x:240,y:240}});
  const changed=await objects(page);release();
  await page.locator('#aiChatToggle').click();
  await expect(page.locator('#aiChatStatus')).toContainText('inzwischen verändert');
  expect(await objects(page)).toEqual(changed);
});

test('pending paths block requests, and chat shortcuts do not undo canvas objects',async({page})=>{
  let requests=0;await page.route('**/api/chat',route=>{requests++;return route.fulfill({json:reply});});
  await choose(page,'feeder');await page.locator('#c').click({position:{x:240,y:240}});
  await choose(page,'runMulti');await page.locator('#c').click({position:{x:300,y:250}});
  await send(page);
  await expect(page.locator('#aiChatStatus')).toContainText('abschließen');expect(requests).toBe(0);
  await page.locator('#aiChatPrompt').focus();await page.keyboard.press('Control+z');
  expect(await objects(page)).toHaveLength(1);
  expect(await page.evaluate(()=>window.__editorState.drawing.type)).toBe('runMulti');
});

test('abort and service failures preserve the scene and allow the next request',async({page})=>{
  await page.route('**/api/chat',route=>route.fulfill({status:503,json:{error:'not configured'}}));
  await send(page);await expect(page.locator('#aiChatStatus')).toContainText('noch nicht eingerichtet');
  expect(await objects(page)).toEqual([]);
  let release;const wait=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/chat',async route=>{await wait;await route.fulfill({json:reply}).catch(()=>{});});
  await page.locator('#aiChatPrompt').fill('Neue Übung');await page.locator('#aiChatSend').click();
  await page.locator('#aiChatCancel').click();
  await expect(page.locator('#aiChatStatus')).toContainText('abgebrochen');release();
  expect(await objects(page)).toEqual([]);
  await respond(page);await page.locator('#aiChatPrompt').fill('Neue Übung');await page.locator('#aiChatSend').click();
  await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
});

test('mobile chat controls fit and the access code stays out of local storage',async({page})=>{
  await page.setViewportSize({width:320,height:740});
  await respond(page);await page.locator('#aiChatToggle').click();
  await page.locator('#aiChatSettings summary').click();
  await page.locator('#aiChatAccess').fill('test-access-code-not-an-openai-key');
  await page.locator('#aiChatSettings summary').click();
  const box=await page.locator('#aiChat').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);
  await page.locator('#aiChatPrompt').fill('Zwei Angreifer');await page.locator('#aiChatSend').click();
  await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('test-access-code');
  await page.locator('#aiChatClose').click();await page.locator('#mobileUndoBtn').click();
  expect(await objects(page)).toEqual([]);
});

test('all storyboard fields are sent and active rotated coordinates map to the court',async({page})=>{
  await page.locator('#layoutGrid').selectOption('2x1');
  await choose(page,'feeder');await page.locator('#c').click({position:{x:240,y:240}});
  await page.locator('#activeCellSelect').selectOption({value:'1'});
  await page.locator('#courtRotation').selectOption('90');
  let request;
  await page.route('**/api/chat',route=>{
    request=route.request().postDataJSON();
    return route.fulfill({json:{message:'Torwart platziert.',commands:[{op:'add_symbol',id:'goalie',type:'goalkeeper',x:10,y:0,label:''}]}});
  });
  await send(page,'Torwart ins Tor');await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  expect(request.scene).toMatchObject({cell:2,rotation:90,objects:[]});
  expect(request.scene.layout).toEqual({cols:2,rows:1});
  expect(request.scene.cells[0].objects[0]).toMatchObject({id:'object-0',type:'feeder'});
  const created=await objects(page);expect(created).toHaveLength(2);
  // Second cell: (1004,20), court bounds (1144,130,680,680).
  expect(created[1].x).toBeCloseTo(1824);expect(created[1].y).toBeCloseTo(470);
  expect(created[0].type).toBe('feeder');
});

const board = page => page.evaluate(() => ({layout:{...window.__editorState.layoutSettings},courts:window.__editorState.cellCourts,objects:window.__editorState.objects}));
async function nextReply(page,commands,message='Felder aktualisiert.') {
  await respond(page,{message,commands});
  await page.locator('#aiChatPrompt').fill('Nächster Schritt');
  await page.locator('#aiChatSend').click();
  await expect(page.locator('#aiChatLog')).toContainText(message);
}

test('AI builds three phases, copies a field and edits another in one persistent undo step',async({page})=>{
  const initial=await board(page);
  await respond(page,{message:'Drei Phasen angelegt.',commands:[
    {op:'layout',cols:3,rows:1},
    {op:'configure_cell',cell:1,mode:'half',rotation:90},
    ...reply.commands,
    {op:'copy_cell',source:1,target:2},
    {op:'configure_cell',cell:2,mode:'full',rotation:270},
    {op:'configure_cell',cell:3,mode:'none',rotation:180},
    {op:'select_cell',cell:3},
    {op:'add_path',id:'finish',type:'shotCurve',points:[{x:10,y:12},{x:9,y:8},{x:10,y:4},{x:10,y:0}]}
  ]});
  await send(page,'Drei Phasen');
  await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  const created=await board(page);
  expect(created.layout).toEqual({cols:3,rows:1,activeCell:2});
  expect(created.courts.map(s=>[s.mode,s.rotation])).toEqual([['half',90],['full',270],['none',180]]);
  expect(created.objects).toHaveLength(7);
  expect(created.objects[0]).toMatchObject({x:500,y:452,label:'1'});
  expect(created.objects[3]).toMatchObject({x:1484,y:796,label:'1'});
  expect(created.objects[6].kind).toBe('path');
  await page.locator('#aiChatClose').click();
  await page.locator('#undoBtn').click();expect(await board(page)).toEqual(initial);
  await page.locator('#redoBtn').click();expect(await board(page)).toEqual(created);
  await page.evaluate(()=>{window.HandballExport.saveSvgText=async svg=>{window.__svg=svg;};});
  await page.locator('#svgBtn').click();
  expect(await page.evaluate(()=>new DOMParser().parseFromString(window.__svg,'image/svg+xml').querySelectorAll('text').length)).toBeGreaterThanOrEqual(4);
  await page.reload();expect(await board(page)).toEqual(created);
  let request;
  await page.route('**/api/chat',route=>{
    request=route.request().postDataJSON();
    return route.fulfill({json:{message:'Kopie angepasst.',commands:[{op:'select_cell',cell:2},{op:'label',target:'object-3',label:'4'}]}});
  });
  await send(page,'Im zweiten Feld Spieler 1 in 4 umbenennen');
  await expect(page.locator('#aiChatLog')).toContainText('Kopie angepasst.');
  expect(request.scene.cells.map(c=>c.objects.length)).toEqual([3,3,1]);
  expect(request.scene.cells[1].objects[0]).toMatchObject({x:8,y:10,id:'object-3'});
  expect((await objects(page))[0].label).toBe('1');expect((await objects(page))[3].label).toBe('4');
});

for(const rotation of [0,90,180,270]) {
  test(`mobile AI rotates existing players and multipoint paths to ${rotation} degrees`,async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await respond(page,{message:'Ausgangsstellung.',commands:[
      {op:'add_symbol',id:'one',type:'attacker',x:8,y:9,label:'1'},
      {op:'label_offset',target:'one',x:10,y:-20},
      {op:'add_path',id:'path',type:'runMulti',points:[{x:8,y:9},{x:7,y:8},{x:9,y:7}]}
    ]});
    await send(page);await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
    const before=await board(page);
    await nextReply(page,[{op:'configure_cell',cell:1,mode:'half',rotation}],`Gedreht auf ${rotation}.`);
    const after=await board(page), a=rotation*Math.PI/180;
    const rotate=p=>({x:500+(p.x-500)*Math.cos(a)-(p.y-470)*Math.sin(a),y:470+(p.x-500)*Math.sin(a)+(p.y-470)*Math.cos(a)});
    const p=rotate(before.objects[0]);
    expect(after.objects[0].x).toBeCloseTo(p.x);expect(after.objects[0].y).toBeCloseTo(p.y);
    expect(after.objects[0].rotation).toBeCloseTo((before.objects[0].rotation+rotation)%360);
    expect(after.objects[0].labelOffsetX).toBe(Math.round(10*Math.cos(a)+20*Math.sin(a)));
    after.objects[1].points.forEach((p,i)=>{
      const expected=rotate(before.objects[1].points[i]);expect(p.x).toBeCloseTo(expected.x);expect(p.y).toBeCloseTo(expected.y);
    });
    await page.locator('#aiChatClose').click();
    await page.locator('#mobileUndoBtn').click();expect(await board(page)).toEqual(before);
    await page.locator('#mobileRedoBtn').click();expect(await board(page)).toEqual(after);
  });
}

test('layout reflow preserves metre positions, paths and references after removals',async({page})=>{
  await respond(page,{message:'Zwei Felder.',commands:[{op:'layout',cols:2,rows:1},...reply.commands,
    {op:'select_cell',cell:2},{op:'add_symbol',id:'other',type:'defender',x:10,y:10,label:'3'}]});
  await send(page);await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  const before=await board(page);
  await nextReply(page,[{op:'layout',cols:1,rows:2},{op:'configure_cell',cell:1,mode:'full',rotation:90},
    {op:'select_cell',cell:1},{op:'remove',target:'object-0'},
    {op:'move',target:'object-1',x:25,y:10},{op:'label_offset',target:'object-2',x:20,y:-30},
    {op:'select_cell',cell:2},{op:'label',target:'object-3',label:'Lea'}]);
  const after=await board(page);
  expect(after.objects).toHaveLength(3);
  expect(after.objects[0]).toMatchObject({x:500,y:635,label:'2'});
  expect(after.objects[1]).toMatchObject({labelOffsetX:20,labelOffsetY:-30});
  expect(after.objects[2]).toMatchObject({x:500,y:1494,label:'Lea'});
  await page.locator('#aiChatClose').click();await page.locator('#undoBtn').click();expect(await board(page)).toEqual(before);
  await page.locator('#redoBtn').click();expect(await board(page)).toEqual(after);
});

test('invalid field batches never change objects, layout or history',async({page})=>{
  await respond(page,reply);await send(page);await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  const before=await board(page);
  for(const commands of [
    [{op:'layout',cols:2,rows:1},{op:'select_cell',cell:3}],
    [{op:'layout',cols:2,rows:1},{op:'select_cell',cell:2},{op:'remove',target:'object-0'}],
    [{op:'layout',cols:2,rows:1},{op:'copy_cell',source:1,target:2},{op:'copy_cell',source:1,target:2}],
    [{op:'layout',cols:2,rows:1},{op:'copy_cell',source:1,target:2},{op:'layout',cols:1,rows:1}],
    [{op:'configure_cell',cell:1,mode:'full',rotation:45}]
  ]) {
    await respond(page,{message:'Ungültig.',commands});
    await page.locator('#aiChatPrompt').fill('Ändern');await page.locator('#aiChatSend').click();
    await expect(page.locator('#aiChatSend')).toBeEnabled();
    expect(await board(page)).toEqual(before);
  }
  await page.locator('#aiChatClose').click();await page.locator('#undoBtn').click();expect(await objects(page)).toEqual([]);
});

test('complex and multipoint commands remain native editable paths',async({page})=>{
  await respond(page,{message:'Wege eingezeichnet.',commands:[
    {op:'add_path',id:'curve',type:'shotCurve',points:[{x:8,y:9},{x:8,y:6},{x:10,y:4},{x:10,y:0}]},
    {op:'add_path',id:'multi',type:'runBallMulti',points:[{x:8,y:10},{x:7,y:9},{x:9,y:7}]}
  ]});
  await send(page);await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  const paths=await objects(page);expect(paths[0]).toMatchObject({type:'shotCurve',cx1:432,cy1:334,cx2:500,cy2:266});
  expect(paths[1].points).toHaveLength(3);
  await page.locator('#aiChatClose').click();
  await page.locator('#c').click({position:{x:432,y:470}});
  await expect(page.locator('#propType')).toContainText('Mehrpunkt');
});

test('browser reaches the separate service through real CORS and authenticated HTTP',async({page})=>{
  const {createServer}=require('../server/server.cjs');
  const token='test-only-shared-access-code-32-characters';
  let sent;
  const server=createServer({env:{
    OPENAI_API_KEY:'fake-test-key',OPENAI_MODEL:'test-model',AI_CHAT_TOKEN:token,
    AI_ALLOWED_ORIGINS:'http://127.0.0.1:4173'
  },fetchImpl:async(_url,options)=>{
    sent=JSON.parse(options.body);
    const response={...reply,commands:[...reply.commands,{op:'label_offset',target:'player1',x:20,y:-30}]};
    return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(response)}]}]}));
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    await page.locator('#aiChatToggle').click();await page.locator('#aiChatSettings summary').click();
    await page.locator('#aiChatEndpoint').fill(`http://127.0.0.1:${server.address().port}/api/chat`);
    await page.locator('#aiChatAccess').fill(token);
    await page.locator('#aiChatPrompt').fill('Zwei Spieler und ein Pass');await page.locator('#aiChatSend').click();
    await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
    expect(await objects(page)).toHaveLength(3);expect(sent.model).toBe('test-model');
    expect((await objects(page))[0]).toMatchObject({labelOffsetX:20,labelOffsetY:-30});
  } finally { await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}); }
});

for(const type of ['attacker','attackerBall','defender','pass']){
  test(`${type}: AI sets label offsets, receives them on follow-up, and preserves export and undo`,async({page})=>{
    let requestCount=0,followUp;
    const create=type==='pass'
      ? [{op:'add_path',id:'new1',type,points:[{x:8,y:10},{x:12,y:10}]},{op:'label',target:'new1',label:'A'}]
      : [{op:'add_symbol',id:'new1',type,x:10,y:10,label:'1'}];
    await page.route('**/api/chat',route=>{
      const first=requestCount++===0;
      if(!first)followUp=route.request().postDataJSON();
      return route.fulfill({json:{message:first?'Objekt und Label angelegt.':'Label versetzt.',commands:first
        ? [...create,{op:'label_offset',target:'new1',x:12,y:-18}]
        : [{op:'label_offset',target:'object-0',x:-25,y:40}]}});
    });
    const svgPosition=async()=>{
      await page.evaluate(()=>{window.HandballExport.saveSvgText=async svg=>{window.__svg=svg;};});
      await page.locator('#svgBtn').click();
      return page.evaluate(()=>{
        const doc=new DOMParser().parseFromString(window.__svg,'image/svg+xml');
        const text=doc.querySelector('text');return {x:+text.getAttribute('x'),y:+text.getAttribute('y')};
      });
    };
    await send(page,'Label etwas nach rechts oben setzen');
    await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
    const before=(await objects(page))[0];
    expect(before).toMatchObject({labelOffsetX:12,labelOffsetY:-18,showLabel:true});
    await page.locator('#aiChatClose').click();const oldSvg=await svgPosition();
    const oldImage=await page.locator('#c').evaluate(c=>c.toDataURL());
    await send(page,'Label stattdessen links unten setzen');
    await expect(page.locator('#aiChatLog')).toContainText('Label versetzt.');
    expect(followUp.scene.objects[0]).toMatchObject({labelOffsetX:12,labelOffsetY:-18});
    const after=(await objects(page))[0];
    expect(after).toEqual({...before,labelOffsetX:-25,labelOffsetY:40});
    await page.locator('#aiChatClose').click();const newSvg=await svgPosition();
    expect(newSvg.x-oldSvg.x).toBeCloseTo(-37,6);expect(newSvg.y-oldSvg.y).toBeCloseTo(58,6);
    expect(await page.locator('#c').evaluate((c,before)=>c.toDataURL()===before,oldImage)).toBe(false);
    await page.locator('#undoBtn').click();expect((await objects(page))[0]).toEqual(before);
    await page.locator('#redoBtn').click();expect((await objects(page))[0]).toEqual(after);
    await page.reload();expect((await objects(page))[0]).toEqual(after);
  });
}

test('mobile rotated-field label offsets remain canvas pixels at any zoom',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.locator('#courtRotation').evaluate(input=>{input.value='90';input.dispatchEvent(new Event('change'));});
  await respond(page,{message:'Label steht rechts oberhalb.',commands:[
    {op:'add_symbol',id:'one',type:'attackerBall',x:10,y:10,label:'1'},
    {op:'label_offset',target:'one',x:50,y:-50}
  ]});
  await send(page);
  await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  const after=(await objects(page))[0];expect(after).toMatchObject({labelOffsetX:50,labelOffsetY:-50});
  await page.locator('#aiChatClose').click();
  await page.locator('#zoomRange').evaluate(input=>{input.value='75';input.dispatchEvent(new Event('input'));});
  expect((await objects(page))[0]).toEqual(after);
  await page.locator('#mobileUndoBtn').click();expect(await objects(page)).toEqual([]);
  await page.locator('#mobileRedoBtn').click();expect((await objects(page))[0]).toEqual(after);
});

test('an out-of-range offset rejects all preceding changes in the answer',async({page})=>{
  await respond(page,{message:'Versatz',commands:[reply.commands[0],{op:'label_offset',target:'player1',x:51,y:0}]});
  await send(page);
  await expect(page.locator('#aiChatStatus')).toContainText('zwischen -50 und +50');
  expect(await objects(page)).toEqual([]);
});
