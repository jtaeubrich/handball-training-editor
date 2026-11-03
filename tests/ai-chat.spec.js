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
  expect(Object.keys(request)).toEqual(['messages','scene','model']);
  expect(request.model).toBe('gpt-5.4-mini');
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
    const response={...reply,commands:[...reply.commands,{op:'label_offset',target:'player1',x:20,y:-30},
      {op:'symbol_size',target:'player1',size:70},{op:'color',target:'player1',color:'#20d85a'},
      {op:'line_width',target:'pass1',width:6},{op:'color',target:'pass1',color:'#d32f2f'}]};
    return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(response)}]}]}));
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    await page.locator('#aiChatToggle').click();await page.locator('#aiChatSettings summary').click();
    await page.locator('#aiChatEndpoint').fill(`http://127.0.0.1:${server.address().port}/api/chat`);
    await page.locator('#aiChatAccess').fill(token);
    await page.locator('#aiChatModel').selectOption('gpt-5.6-sol');
    await page.locator('#aiChatPrompt').fill('Zwei Spieler und ein Pass');await page.locator('#aiChatSend').click();
    await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
    expect(await objects(page)).toHaveLength(3);expect(sent.model).toBe('gpt-5.6-sol');expect(sent.reasoning).toEqual({effort:'low'});
    expect((await objects(page))[0]).toMatchObject({labelOffsetX:20,labelOffsetY:-30,size:70,color:'#20d85a'});
    expect((await objects(page))[2]).toMatchObject({width:6,color:'#d32f2f'});
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

for(const type of ['attacker','airbody','passCurve','freehand']) {
  test(`${type}: AI styles are visible, sent on follow-up and survive undo, export and restart`,async({page})=>{
    const symbol=['attacker','airbody'].includes(type);
    if(type === 'freehand') {
      await choose(page,'freehand');
      const box=await page.locator('#c').boundingBox();
      await page.mouse.move(box.x+300,box.y+300);await page.mouse.down();
      await page.mouse.move(box.x+360,box.y+340,{steps:5});await page.mouse.up();
      expect(await objects(page)).toHaveLength(1);
    }
    const creation=type==='freehand' ? [] : symbol
      ? [{op:'add_symbol',id:'one',type,x:10,y:10,label:type==='attacker'?'1':''}]
      : [{op:'add_path',id:'one',type,points:[{x:8,y:10},{x:8,y:8},{x:12,y:8},{x:12,y:10}]}];
    const target=type==='freehand'?'object-0':'one';
    let followUp,requests=0;
    await page.route('**/api/chat',route=>{
      const request=route.request().postDataJSON();
      if(requests++ === 0) return route.fulfill({json:{message:'Stil gesetzt.',commands:[...creation,
        {op:'color',target,color:'#345678'},symbol ? {op:'symbol_size',target,size:60} : {op:'line_width',target,width:4.5}]}});
      followUp=request;
      const style=request.scene.objects[0].style;
      return route.fulfill({json:{message:'Stil angepasst.',commands:[{op:'color',target:'object-0',color:'#D32F2F'},
        symbol ? {op:'symbol_size',target:'object-0',size:style.size*1.2} : {op:'line_width',target:'object-0',width:style.width+1}]}});
    });
    const svg=async()=>{
      await page.evaluate(()=>{window.HandballExport.saveSvgText=async text=>{window.__svg=text;};});
      await page.locator('#svgBtn').click();return page.evaluate(()=>window.__svg);
    };
    await send(page,'Objekt umfärben und größer oder dicker machen');
    await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
    const before=(await objects(page))[0];
    expect(before).toMatchObject(symbol ? {size:60,color:'#345678'} : {width:4.5,color:'#345678'});
    await page.locator('#aiChatClose').click();
    const oldSvg=await svg();expect(oldSvg).toContain('#345678');
    const oldImage=await page.locator('#c').evaluate(c=>c.toDataURL());
    await send(page,symbol?'20 % größer und rot':'Noch einen Pixel dicker und rot');
    await expect(page.locator('#aiChatLog')).toContainText('Stil angepasst.');
    expect(followUp.scene.commandVersion).toBe(5);
    expect(followUp.scene.objects[0].style).toEqual({color:'#345678',size:symbol?60:null,width:symbol?before.width:4.5});
    const after=(await objects(page))[0];
    expect(after).toEqual({...before,color:'#d32f2f',...(symbol?{size:72}:{width:5.5})});
    await page.locator('#aiChatClose').click();
    const newSvg=await svg();expect(newSvg).toContain('#d32f2f');expect(newSvg).not.toEqual(oldSvg);
    if(!symbol) expect(newSvg).toContain('stroke-width="5.5"');
    expect(await page.locator('#c').evaluate((c,before)=>c.toDataURL()===before,oldImage)).toBe(false);
    await page.locator('#undoBtn').click();expect((await objects(page))[0]).toEqual(before);
    await page.locator('#redoBtn').click();expect((await objects(page))[0]).toEqual(after);
    await page.reload();expect((await objects(page))[0]).toEqual(after);
  });
}

test('all symbol types accept exact sizes and colors without changing labels or positions',async({page})=>{
  const types=await page.evaluate(()=>window.HandballAiCommands.symbolTypes);
  const commands=types.flatMap((type,i)=>[
    {op:'add_symbol',id:`s${i}`,type,x:2+(i%5)*4,y:4+Math.floor(i/5)*5,label:['attacker','attackerBall','defender'].includes(type)?'1':''},
    {op:'symbol_size',target:`s${i}`,size:i===0?12:i===1?100:65},
    {op:'color',target:`s${i}`,color:'#123456'}
  ]);
  await respond(page,{message:'Alle Symbole gestaltet.',commands});await send(page);
  await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  const styled=await objects(page);expect(styled).toHaveLength(types.length);
  styled.forEach((o,i)=>expect(o).toMatchObject({type:types[i],size:i===0?12:i===1?100:65,color:'#123456'}));
  await page.locator('#aiChatClose').click();await page.locator('#undoBtn').click();expect(await objects(page)).toEqual([]);
  await page.locator('#redoBtn').click();expect(await objects(page)).toEqual(styled);
});

test('mobile styles target the selected field and copy with it',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await respond(page,{message:'Drei Felder gestaltet.',commands:[{op:'layout',cols:3,rows:1},...reply.commands,
    {op:'copy_cell',source:1,target:2},{op:'select_cell',cell:2},
    {op:'add_symbol',id:'defense',type:'defender',x:10,y:7,label:'3'},
    {op:'color',target:'defense',color:'#20d85a'},{op:'symbol_size',target:'defense',size:75},
    {op:'add_path',id:'route',type:'runMulti',points:[{x:9,y:10},{x:8,y:9},{x:10,y:8}]},
    {op:'color',target:'route',color:'#1976d2'},{op:'line_width',target:'route',width:10},
    {op:'copy_cell',source:2,target:3}]});
  await send(page);await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  const styled=await board(page);expect(styled.objects).toHaveLength(13);
  expect(styled.objects[0]).toMatchObject({size:50,color:'#1976d2'});
  expect(styled.objects[6]).toMatchObject({type:'defender',size:75,color:'#20d85a'});
  expect(styled.objects[7]).toMatchObject({type:'runMulti',width:10,color:'#1976d2'});
  expect(styled.objects[11]).toMatchObject({size:75,color:'#20d85a'});
  expect(styled.objects[12]).toMatchObject({width:10,color:'#1976d2'});
  await page.locator('#aiChatClose').click();await page.locator('#mobileUndoBtn').click();expect(await objects(page)).toEqual([]);
  await page.locator('#mobileRedoBtn').click();expect(await board(page)).toEqual(styled);
});

test('invalid style batches preserve the whole board and its undo history',async({page})=>{
  await respond(page,reply);await send(page);await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  const before=await board(page);
  for(const invalid of [
    {op:'symbol_size',target:'object-0',size:101},
    {op:'color',target:'object-0',color:'red'},
    {op:'line_width',target:'object-2',width:2.25},
    {op:'line_width',target:'object-0',width:4},
    {op:'symbol_size',target:'object-2',size:60}
  ]) {
    await respond(page,{message:'Ungültig.',commands:[{op:'layout',cols:2,rows:1},{op:'color',target:'object-1',color:'#123456'},invalid]});
    await page.locator('#aiChatPrompt').fill('Stil ändern');await page.locator('#aiChatSend').click();
    await expect(page.locator('#aiChatSend')).toBeEnabled();expect(await board(page)).toEqual(before);
  }
  await page.locator('#aiChatClose').click();await page.locator('#undoBtn').click();expect(await objects(page)).toEqual([]);
});

test('AI rotates symbols and groups, copies objects and changes types without losing styles',async({page})=>{
  await page.locator('#courtRotation').selectOption('90');
  await respond(page,{message:'Ausgangsstellung.',commands:[
    {op:'add_symbol',id:'one',type:'attacker',x:8,y:10,label:'1'},
    {op:'color',target:'one',color:'#345678'},{op:'symbol_size',target:'one',size:65},
    {op:'label_offset',target:'one',x:10,y:-20},
    {op:'add_path',id:'curve',type:'passCurve',points:[{x:8,y:10},{x:8,y:8},{x:12,y:8},{x:12,y:10}]},
    {op:'label',target:'curve',label:'A'},{op:'color',target:'curve',color:'#123456'}]});
  await send(page);await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  const before=await board(page);
  await nextReply(page,[{op:'rotate',target:'object-0',angle:90},
    {op:'copy_object',source:'object-0',id:'copy',x:12,y:10},
    {op:'symbol_type',target:'copy',type:'defender'},
    {op:'label_options',target:'copy',visible:true,set:'60',label:'IL'},
    {op:'label_options',target:'object-0',visible:false,set:'keep',label:null},
    {op:'copy_object',source:'object-1',id:'curve-copy',x:14,y:12},
    {op:'rotate_group',targets:['object-0','copy','object-1'],angle:90,center:{x:10,y:10}}]);
  const after=await board(page);expect(after.objects).toHaveLength(4);
  expect(after.objects[0]).toMatchObject({x:568,y:470,rotation:180,label:'1',showLabel:false,size:65,color:'#345678',labelOffsetX:20,labelOffsetY:10});
  expect(after.objects[2]).toMatchObject({type:'defender',x:432,y:470,rotation:180,label:'IL',defenseFormation:'60',size:65,color:'#345678'});
  expect(after.objects[3]).toMatchObject({type:'passCurve',x1:432,y1:606,color:'#123456',label:'A'});
  expect(after.objects[1].cx1).toBeCloseTo(568);expect(after.objects[1].cy1).toBeCloseTo(538);
  await page.locator('#aiChatClose').click();await page.locator('#undoBtn').click();expect(await board(page)).toEqual(before);
  await page.locator('#redoBtn').click();expect(await board(page)).toEqual(after);
  await page.reload();expect(await board(page)).toEqual(after);
});

test('AI edits path points, adds and removes segments and changes path types in place',async({page})=>{
  await respond(page,{message:'Weg angelegt.',commands:[
    {op:'add_path',id:'way',type:'runMulti',points:[{x:8,y:10},{x:7,y:9},{x:9,y:7}]},
    {op:'color',target:'way',color:'#123456'},{op:'line_width',target:'way',width:4.5},
    {op:'label',target:'way',label:'Lauf'},{op:'label_offset',target:'way',x:10,y:-20}]});
  await send(page);await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  const original=(await objects(page))[0];
  const edits=[
    {type:'runMulti',points:[{x:8,y:10},{x:6,y:9},{x:9,y:7},{x:10,y:5}]},
    {type:'runMulti',points:[{x:8,y:10},{x:6,y:9},{x:9,y:7}]},
    {type:'passCurve',points:[{x:8,y:10},{x:6,y:8},{x:10,y:6},{x:10,y:5}]},
    {type:'shot',points:[{x:10,y:5},{x:10,y:0}]}
  ];
  for(const [i,edit] of edits.entries()) {
    await nextReply(page,[{op:'edit_path',target:'object-0',...edit}],`Wegschritt ${i}.`);
    const current=(await objects(page))[0];
    expect(current).toMatchObject({color:original.color,width:original.width,label:original.label,showLabel:true,labelOffsetX:10,labelOffsetY:-20,type:edit.type});
    if(edit.type==='runMulti') expect(current.points).toHaveLength(edit.points.length);
    else expect(current.points).toBeUndefined();
    if(edit.type==='shot') {expect(current.cx1).toBeUndefined();expect(current).toMatchObject({x1:500,y1:300,x2:500,y2:130});}
  }
  const after=await objects(page);await page.locator('#aiChatClose').click();
  await page.locator('#undoBtn').click();expect((await objects(page))[0].type).toBe('passCurve');
  await page.locator('#redoBtn').click();expect(await objects(page)).toEqual(after);
  await page.reload();expect(await objects(page)).toEqual(after);
});

test('AI toggles labels without losing text and selects all supported player label sets',async({page})=>{
  await respond(page,{message:'Spieler angelegt.',commands:[reply.commands[0],
    {op:'add_symbol',id:'defense',type:'defender',x:12,y:8,label:'2'},
    {op:'label_options',target:'player1',visible:false,set:'custom',label:'Lea'}]});
  await send(page);await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  let sent;
  await page.route('**/api/chat',route=>{sent=route.request().postDataJSON();return route.fulfill({json:{message:'Wieder sichtbar.',commands:[
    {op:'label_options',target:'object-0',visible:true,set:'keep',label:null}]}});});
  await page.locator('#aiChatPrompt').fill('Label wieder zeigen');await page.locator('#aiChatSend').click();
  await expect(page.locator('#aiChatLog')).toContainText('Wieder sichtbar.');
  expect(sent.scene.objects[0]).toMatchObject({label:'Lea',editing:{showLabel:false,labelSet:'custom'}});
  expect((await objects(page))[0]).toMatchObject({label:'Lea',showLabel:true,attackFormation:'custom'});
  for(const [i,set,label] of [[0,'33','RM'],[0,'24','KR'],[0,'numbers','10'],[1,'321','VM'],[1,'60','IL'],[1,'numbers','9']]) {
    await nextReply(page,[{op:'label_options',target:`object-${i}`,visible:true,set,label}],`Labelset ${i} ${set}.`);
    expect((await objects(page))[i]).toMatchObject({label,showLabel:true,[i?'defenseFormation':'attackFormation']:set});
  }
  await page.reload();expect((await objects(page))[0]).toMatchObject({label:'10',attackFormation:'numbers'});
  expect((await objects(page))[1]).toMatchObject({label:'9',defenseFormation:'numbers'});
});

const defaults=page=>page.evaluate(()=>({symbolSize:+document.querySelector('#symbolSize').value,strokeWidth:+document.querySelector('#strokeWidth').value,strokeColor:document.querySelector('#strokeColor').value,markerColor:window.__editorState.markerColor}));
test('AI global defaults affect subsequent AI and manual objects, persist and undo together',async({page})=>{
  await page.locator('#symbolSize').fill('55');
  const original=await defaults(page);
  await respond(page,{message:'Vorgaben geändert.',commands:[
    {op:'defaults',symbolSize:70,strokeWidth:5,strokeColor:'#345678',markerColor:'#20d85a'},
    {op:'add_symbol',id:'cone',type:'cone',x:8,y:10,label:''},
    {op:'add_path',id:'run',type:'run',points:[{x:10,y:10},{x:12,y:8}]}]});
  await send(page);await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  const changed={symbolSize:70,strokeWidth:5,strokeColor:'#345678',markerColor:'#20d85a'};
  expect(await defaults(page)).toEqual(changed);
  const created=await objects(page);expect(created[0]).toMatchObject({size:70,width:5,color:'#20d85a'});expect(created[1]).toMatchObject({width:5,color:'#345678'});
  await page.locator('#aiChatClose').click();await page.locator('#undoBtn').click();expect(await defaults(page)).toEqual(original);expect(await objects(page)).toEqual([]);
  await page.locator('#redoBtn').click();expect(await defaults(page)).toEqual(changed);expect(await objects(page)).toEqual(created);
  await choose(page,'cone');await page.locator('#c').click({position:{x:300,y:300}});
  expect((await objects(page)).at(-1)).toMatchObject({size:70,width:5,color:'#20d85a'});
  await choose(page,'run');const box=await page.locator('#c').boundingBox();
  await page.mouse.move(box.x+400,box.y+300);await page.mouse.down();await page.mouse.move(box.x+450,box.y+350,{steps:5});await page.mouse.up();
  expect((await objects(page)).at(-1)).toMatchObject({kind:'path',width:5,color:'#345678'});
  await page.reload();expect(await defaults(page)).toEqual(changed);
});

test('AI undo and redo use existing history without adding another history step',async({page})=>{
  await respond(page,reply);await send(page);await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  const created=await objects(page);let request;
  await page.route('**/api/chat',route=>{request=route.request().postDataJSON();return route.fulfill({json:{message:'Zurückgenommen.',commands:[{op:'project_action',action:'undo'}]}});});
  await page.locator('#aiChatPrompt').fill('Rückgängig');await page.locator('#aiChatSend').click();
  await expect(page.locator('#aiChatStatus')).toContainText('rückgängig gemacht');expect(await objects(page)).toEqual([]);
  expect(request.scene.editor).toMatchObject({canUndo:true,canRedo:false});
  await page.route('**/api/chat',route=>{request=route.request().postDataJSON();return route.fulfill({json:{message:'Wiederholt.',commands:[{op:'project_action',action:'redo'}]}});});
  await page.locator('#aiChatPrompt').fill('Wiederholen');await page.locator('#aiChatSend').click();
  await expect(page.locator('#aiChatStatus')).toContainText('wiederholt');expect(await objects(page)).toEqual(created);
  expect(request.scene.editor).toMatchObject({canUndo:false,canRedo:true});
  await page.locator('#aiChatClose').click();await page.locator('#undoBtn').click();expect(await objects(page)).toEqual([]);
});

for(const action of ['save','export_svg','export_png','load']) {
  test(`AI ${action} prepares one browser action and executes only after a user click`,async({page})=>{
    await page.evaluate(()=>{
      window.__actions=[];
      window.showSaveFilePicker=async()=>{window.__actions.push('save');return {name:'ki-projekt.json',createWritable:async()=>({write:async blob=>{window.__saved=JSON.parse(await blob.text());},close:async()=>{}})};};
      window.HandballExport.saveSvgText=async svg=>{window.__actions.push('export_svg');window.__svg=svg;};
      window.HandballExport.saveCanvasPng=async canvas=>{window.__actions.push('export_png');window.__png=canvas.toDataURL();};
      window.showOpenFilePicker=async()=>{window.__actions.push('load');return [{name:'geladen.json',getFile:async()=>new File([JSON.stringify({objects:[{kind:'symbol',type:'cone',x:300,y:300,size:40,width:2,color:'#20d85a',rotation:0}]})],'geladen.json',{type:'application/json'})}];};
    });
    await respond(page,{message:'Dateiaktion vorbereitet.',commands:[...reply.commands,{op:'project_action',action}]});
    await send(page);await expect(page.locator('#aiChatStatus')).toContainText('Dateiaktion vorbereitet');
    const before=await objects(page);expect(before).toHaveLength(3);
    expect(await page.evaluate(()=>window.__actions)).toEqual([]);
    const button=page.locator('.ai-chat-file-action');await expect(button).toBeVisible();await button.click();
    await expect.poll(()=>page.evaluate(()=>window.__actions)).toEqual([action]);
    if(action==='save') {await expect.poll(()=>page.evaluate(()=>window.__saved?.objects)).toEqual(before);expect(await page.evaluate(()=>window.__saved.defaults.symbolSize)).toBe(50);}
    if(action==='export_svg') expect(await page.evaluate(()=>window.__svg)).toContain('>1</text>');
    if(action==='export_png') expect(await page.evaluate(()=>window.__png)).toContain('data:image/png');
    if(action==='load') {await expect(page.locator('#status')).toContainText('Projekt geladen: geladen.json');expect(await objects(page)).toHaveLength(1);}
    else expect(await objects(page)).toEqual(before);
  });
}

test('stale file actions cannot export a later sketch and file-only actions do not create history',async({page})=>{
  await page.evaluate(()=>{window.__exports=0;window.HandballExport.saveSvgText=async()=>{window.__exports++;};});
  await respond(page,{message:'SVG vorbereitet.',commands:[{op:'project_action',action:'export_svg'}]});
  await send(page);await expect(page.locator('.ai-chat-file-action')).toBeVisible();
  await page.locator('#aiChatClose').click();await choose(page,'cone');await page.locator('#c').click({position:{x:300,y:300}});
  await page.locator('#aiChatToggle').click();await page.locator('.ai-chat-file-action').click();
  await expect(page.locator('#aiChatStatus')).toContainText('inzwischen verändert');expect(await page.evaluate(()=>window.__exports)).toBe(0);
  await page.locator('#aiChatClose').click();await page.locator('#undoBtn').click();expect(await objects(page)).toEqual([]);
});

test('invalid extended batches preserve board, defaults and history atomically',async({page})=>{
  await respond(page,reply);await send(page);await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
  const before=await board(page),previous=await defaults(page);
  for(const bad of [
    {op:'rotate',target:'object-0',angle:400},
    {op:'symbol_type',target:'object-2',type:'defender'},
    {op:'label_options',target:'object-0',visible:false,set:'60',label:'IL'},
    {op:'copy_object',source:'object-0',id:'object-0',x:10,y:10},
    {op:'edit_path',target:'object-2',type:'passCurve',points:[{x:10,y:10},{x:12,y:8}]},
    {op:'rotate_group',targets:['object-0'],angle:180,center:{x:20,y:20}}
  ]) {
    await respond(page,{message:'Ungültig.',commands:[{op:'defaults',symbolSize:90,strokeWidth:null,strokeColor:null,markerColor:null},bad]});
    await page.locator('#aiChatPrompt').fill('Ändern');await page.locator('#aiChatSend').click();await expect(page.locator('#aiChatSend')).toBeEnabled();
    expect(await board(page)).toEqual(before);expect(await defaults(page)).toEqual(previous);
  }
  await page.locator('#aiChatClose').click();await page.locator('#undoBtn').click();expect(await objects(page)).toEqual([]);
});

for(const [model,name,price] of [
  ['gpt-5.4-mini','GPT-5.4 Mini','4,50'],['gpt-5.6-sol','GPT-5.6 Sol','20,00'],['gpt-6-astra','GPT-6 Astra','50,00']
]) {
  test(`${model}: selection persists, reaches the service and is shown on the answer`,async({page})=>{
    let sent;
    await page.route('**/api/chat',route=>{sent=route.request().postDataJSON();return route.fulfill({json:reply});});
    await page.locator('#aiChatToggle').click();
    await expect(page.locator('#aiChatModel option')).toHaveCount(3);
    await page.locator('#aiChatModel').selectOption(model);
    await expect(page.locator('#aiChatModelCost')).toContainText(price);
    await page.reload();await page.locator('#aiChatToggle').click();
    await expect(page.locator('#aiChatModel')).toHaveValue(model);
    await page.locator('#aiChatPrompt').fill('Zwei Spieler und ein Pass');await page.locator('#aiChatSend').click();
    await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
    expect(sent.model).toBe(model);
    await expect(page.locator('.ai-chat-assistant strong').last()).toHaveText(`KI · ${name}`);
    const created=await objects(page);expect(created).toHaveLength(3);
    await page.locator('#aiChatClose').click();await page.locator('#undoBtn').click();expect(await objects(page)).toEqual([]);
    await page.locator('#redoBtn').click();expect(await objects(page)).toEqual(created);
    await page.locator('#aiChatToggle').click();await expect(page.locator('#aiChatModel')).toHaveValue(model);
  });
}

test('mobile model choice is locked during a request; unavailable models do not trigger a fallback',async({page})=>{
  await page.setViewportSize({width:320,height:740});
  const calls=[];let release;
  const wait=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/chat',async route=>{
    calls.push(route.request().postDataJSON().model);await wait;await route.fulfill({status:422,json:{error:'Unavailable'}});
  });
  await page.locator('#aiChatToggle').click();
  await page.locator('#aiChatModel').selectOption('gpt-6-astra');
  const box=await page.locator('#aiChatModel').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);
  await page.locator('#aiChatPrompt').fill('Spieler erstellen');await page.locator('#aiChatSend').click();
  await expect(page.locator('#aiChatModel')).toBeDisabled();release();
  await expect(page.locator('#aiChatStatus')).toContainText('nicht freigeschaltet');
  await expect(page.locator('#aiChatModel')).toBeEnabled();await expect(page.locator('#aiChatModel')).toHaveValue('gpt-6-astra');
  await expect(page.locator('#aiChatPrompt')).toHaveValue('Spieler erstellen');
  expect(calls).toEqual(['gpt-6-astra']);expect(await objects(page)).toEqual([]);
  await page.route('**/api/chat',route=>{calls.push(route.request().postDataJSON().model);return route.fulfill({json:reply});});
  await page.locator('#aiChatModel').selectOption('gpt-5.4-mini');await page.locator('#aiChatSend').click();
  await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');expect(calls).toEqual(['gpt-6-astra','gpt-5.4-mini']);
});

test('unknown stored model choices return to the inexpensive default without requesting AI',async({page})=>{
  await page.evaluate(()=>localStorage.setItem('handballtrainer.aiModel.v1','unknown-premium-model'));
  let calls=0;await page.route('**/api/chat',route=>{calls++;return route.fulfill({json:reply});});
  await page.reload();await page.locator('#aiChatToggle').click();
  await expect(page.locator('#aiChatModel')).toHaveValue('gpt-5.4-mini');expect(calls).toBe(0);
});
