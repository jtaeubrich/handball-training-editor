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

test('only the active storyboard field is sent and rotated coordinates map to the court',async({page})=>{
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
  const created=await objects(page);expect(created).toHaveLength(2);
  // Second cell: (1004,20), court bounds (1144,130,680,680).
  expect(created[1].x).toBeCloseTo(1824);expect(created[1].y).toBeCloseTo(470);
  expect(created[0].type).toBe('feeder');
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
    return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(reply)}]}]}));
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    await page.locator('#aiChatToggle').click();await page.locator('#aiChatSettings summary').click();
    await page.locator('#aiChatEndpoint').fill(`http://127.0.0.1:${server.address().port}/api/chat`);
    await page.locator('#aiChatAccess').fill(token);
    await page.locator('#aiChatPrompt').fill('Zwei Spieler und ein Pass');await page.locator('#aiChatSend').click();
    await expect(page.locator('#aiChatStatus')).toContainText('Skizze aktualisiert');
    expect(await objects(page)).toHaveLength(3);expect(sent.model).toBe('test-model');
  } finally { await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}); }
});
