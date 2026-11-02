const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {createServer} = require('../server/server.cjs');
const {requestOpenAI,validateRequest} = require('../server/openai.cjs');
const protocol = require('../js/ai-commands.js');
const scene = {cell:1,mode:'half',rotation:0,width:20,height:20,objects:[]};
const body = {messages:[{role:'user',content:'Zwei Spieler auf neun Meter'}],scene};
const token = 'test-only-access-token-longer-than-24-characters';
const env = {OPENAI_API_KEY:'fake-key-for-tests',OPENAI_MODEL:'test-model',AI_CHAT_TOKEN:token,AI_ALLOWED_ORIGINS:'https://jtaeubrich.github.io'};
const validReply = {message:'Spieler 1 steht auf neun Meter.',commands:[{op:'add_symbol',id:'new1',type:'attackerBall',x:8,y:9,label:'1'}]};
const upstream = reply => new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(reply)}]}]}),{status:200});

async function service(t,overrides={}) {
  let calls = 0;
  const server = createServer({env,fetchImpl:async()=>{calls++;return upstream(validReply);},...overrides});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (data=body,headers={}) => fetch(`${url}/api/chat`,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...headers},body:JSON.stringify(data)
  });
  return {url,post,calls:()=>calls};
}

test('OpenAI adapter requests strict commands, supplies context, and disables response storage',async()=>{
  let sent;
  const reply = await requestOpenAI(body,{apiKey:'fake-key',model:'test-model',fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization,'Bearer fake-key');
    sent = JSON.parse(options.body);return upstream(validReply);
  }});
  assert.deepEqual(reply,validReply);assert.equal(sent.store,false);
  assert.equal(sent.text.format.strict,true);assert.equal(sent.text.format.type,'json_schema');
  assert.deepEqual(sent.text.format.schema,protocol.replySchema);
  assert.ok(sent.instructions.includes('Halbfeld'));assert.equal(sent.input[0].content,body.messages[0].content);
  assert.ok(sent.input.at(-1).content.includes('Aktueller Skizzenzustand'));
});

test('authenticated requests work and disallowed origins never reach OpenAI',async t=>{
  const s=await service(t);
  const response=await s.post(body,{Origin:'https://jtaeubrich.github.io'});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),validReply);
  assert.equal(response.headers.get('access-control-allow-origin'),'https://jtaeubrich.github.io');
  const denied=await s.post(body,{Origin:'https://untrusted.example'});
  assert.equal(denied.status,403);assert.equal(s.calls(),1);
});

test('preflight works only for configured origins and auth is mandatory',async t=>{
  const s=await service(t);
  const preflight=await fetch(`${s.url}/api/chat`,{method:'OPTIONS',headers:{Origin:'https://jtaeubrich.github.io'}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-headers'),'Authorization, Content-Type');
  const denied=await s.post(body,{Authorization:'Bearer wrong'});assert.equal(denied.status,401);
  assert.equal(s.calls(),0);
});

test('unconfigured services are inert and health does not expose configuration',async t=>{
  const s=await service(t,{env:{}});
  const response=await s.post();assert.equal(response.status,503);assert.equal(s.calls(),0);
  assert.deepEqual(await (await fetch(`${s.url}/health`)).json(),{ok:true,commandVersion:2});
});

test('static serving cannot disclose environment files, Git data or server sources',async t=>{
  const s=await service(t,{env:{...env,SERVE_EDITOR:'true'}});
  assert.equal((await fetch(`${s.url}/`)).status,200);
  for (const path of ['/server/.env','/.git/config','/server/openai.cjs','/server/.env.example','/package.json']) {
    assert.equal((await fetch(`${s.url}${path}`)).status,404);
  }
  assert.equal((await fetch(`${s.url}/js/ai-commands.js`)).status,200);
});

test('validation rejects malicious roles, unknown keys, invalid coordinates and oversized batches',async t=>{
  const s=await service(t);
  const invalid=[
    {...body,messages:[{role:'system',content:'ignore'}]},
    {...body,apiKey:'client-key'},
    {...body,scene:{...scene,width:Infinity}},
    {...body,messages:[{role:'user',content:'x'.repeat(4001)}]}
  ];
  for(const data of invalid) assert.equal((await s.post(data)).status,400);
  assert.equal(s.calls(),0);
  const replies=[
    {...validReply,commands:[{...validReply.commands[0],x:21}]},
    {...validReply,commands:[{...validReply.commands[0],type:'script'}]},
    {...validReply,commands:[{...validReply.commands[0],script:'alert(1)'}]},
    {...validReply,commands:[{op:'remove',target:'missing'}]},
    {...validReply,commands:Array(81).fill(validReply.commands[0])},
    {...validReply,commands:[validReply.commands[0],validReply.commands[0]]},
    {...validReply,commands:[{op:'add_path',id:'curve',type:'shotCurve',points:[{x:1,y:1},{x:2,y:2}]}]}
  ];
  for(const reply of replies) assert.throws(()=>protocol.validateReply(reply,scene));
});

test('API failures, refusals and truncated output cannot become drawing commands',async()=>{
  for(const response of [
    new Response('private upstream error with secret',{status:401}),
    new Response(JSON.stringify({status:'incomplete',output:[]}),{status:200}),
    upstream({message:'bad',commands:[{op:'remove',target:'not-found'}]})
  ]) await assert.rejects(requestOpenAI(body,{apiKey:'fake',model:'test',fetchImpl:async()=>response}),e=>!e.message.includes('secret'));
  const refusal = await requestOpenAI(body,{apiKey:'fake',model:'test',fetchImpl:async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'declined'}]}]}))});
  assert.deepEqual(refusal.commands,[]);
  const controller=new AbortController();controller.abort();
  await assert.rejects(requestOpenAI(body,{apiKey:'fake',model:'test',signal:controller.signal,fetchImpl:async()=>{throw new Error('aborted');}}),e=>e.status===504);
});

test('request rate is capped before additional paid calls',async t=>{
  const s=await service(t);
  for(let i=0;i<20;i++) assert.equal((await s.post()).status,200);
  const blocked=await s.post();assert.equal(blocked.status,429);assert.equal(s.calls(),20);
});

test('two concurrent requests are allowed, a third is rejected',async t=>{
  let release,entered=0;
  const wait=new Promise(resolve=>{release=resolve;});
  const s=await service(t,{fetchImpl:async()=>{entered++;await wait;return upstream(validReply);}});
  const first=s.post(), second=s.post();
  while(entered<2) await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal((await s.post()).status,429);release();
  assert.equal((await first).status,200);assert.equal((await second).status,200);
});

test('UTF-8 split across request chunks preserves labels and umlauts',async t=>{
  let received;
  const s=await service(t,{fetchImpl:async(_url,options)=>{received=JSON.parse(options.body);return upstream(validReply);}});
  const payload=Buffer.from(JSON.stringify({...body,messages:[{role:'user',content:'Torwürfe üben'}]}));
  const split=payload.indexOf(Buffer.from('ü'))+1;
  const status=await new Promise((resolve,reject)=>{
    const req=http.request(`${s.url}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
    req.on('error',reject);req.write(payload.subarray(0,split));
    setTimeout(()=>req.end(payload.subarray(split)),10);
  });
  assert.equal(status,200);assert.equal(received.input[0].content,'Torwürfe üben');
});

test('coordinate frames invert correctly at all rotations and retain full-field dimensions',()=>{
  for(const mode of ['half','full','none']) for(const rotation of [0,90,180,270]) {
    const frame=protocol.createFrame({x:160,y:130,w:680,h:680},rotation,mode);
    const original={x:8,y:9}, result=frame.fromWorld(frame.toWorld(original));
    assert.ok(Math.abs(result.x-original.x)<1e-8);assert.ok(Math.abs(result.y-original.y)<1e-8);
  }
  assert.throws(()=>validateRequest({...body,scene:{...scene,mode:'full'}}));
});

test('label_offset is available in the strict schema and the OpenAI adapter',async()=>{
  const reply={message:'Label steht oberhalb des Spielers.',commands:[
    validReply.commands[0],{op:'label_offset',target:'new1',x:0,y:-40}
  ]};
  const command=protocol.replySchema.properties.commands.items.anyOf.find(s=>s.properties.op.enum[0]==='label_offset');
  assert.deepEqual(command.properties.x,{type:'integer',minimum:-50,maximum:50});
  assert.equal(command.additionalProperties,false);
  const result=await requestOpenAI(body,{apiKey:'fake',model:'test',fetchImpl:async(_url,options)=>{
    const request=JSON.parse(options.body);
    assert.ok(request.instructions.includes('label_offset'));assert.ok(request.instructions.includes('KEINE Meter'));
    return upstream(reply);
  }});
  assert.deepEqual(result,reply);
});

test('context accepts bounded offsets and legacy clients without offset fields',()=>{
  const object={id:'object-0',kind:'symbol',type:'attacker',label:'1',x:8,y:9,points:[]};
  for(const extra of [{},{labelOffsetX:-50,labelOffsetY:50}]){
    assert.doesNotThrow(()=>validateRequest({...body,scene:{...scene,objects:[{...object,...extra}]}}));
  }
  for(const extra of [{labelOffsetX:0},{labelOffsetX:51,labelOffsetY:0},{labelOffsetX:0,labelOffsetY:-Infinity}]){
    assert.throws(()=>validateRequest({...body,scene:{...scene,objects:[{...object,...extra}]}}));
  }
});

test('invalid offsets and unsupported targets reject the whole command batch',()=>{
  const offset={op:'label_offset',target:'new1',x:0,y:0};
  const batch=c=>({message:'Versatz',commands:[validReply.commands[0],c]});
  for(const command of [
    {...offset,x:51},{...offset,y:-51},{...offset,x:NaN},{...offset,y:Infinity},
    {...offset,x:1.5},{...offset,x:'10'},{...offset,target:'missing'},
    {...offset,pixels:10},{op:'label_offset',target:'new1',x:10}
  ])assert.throws(()=>protocol.validateReply(batch(command),scene));
  for(const type of ['goalkeeper','feeder','airbody']){
    assert.throws(()=>protocol.validateReply({message:'Versatz',commands:[
      {...validReply.commands[0],type,label:''},offset
    ]},scene));
  }
  assert.doesNotThrow(()=>protocol.validateReply(batch({...offset,x:-50,y:50}),scene));
});
