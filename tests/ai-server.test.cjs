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
  assert.deepEqual(await (await fetch(`${s.url}/health`)).json(),{ok:true,commandVersion:5});
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

const storyboard = {...scene,layout:{cols:1,rows:1},cells:[scene]};
test('OpenAI adapter accepts storyboard context and strict field commands',async()=>{
  const commands=[{op:'layout',cols:3,rows:1},
    {op:'configure_cell',cell:2,mode:'full',rotation:90},
    {op:'select_cell',cell:2},
    {...validReply.commands[0],x:35},
    {op:'copy_cell',source:2,target:3},
    {op:'select_cell',cell:3}];
  const reply={message:'Drei Felder angelegt.',commands};
  const result=await requestOpenAI({...body,scene:storyboard},{apiKey:'fake',model:'test',fetchImpl:async(_url,options)=>{
    const request=JSON.parse(options.body);
    for(const op of ['layout','select_cell','configure_cell','copy_cell']) {
      const schema=request.text.format.schema.properties.commands.items.anyOf.find(s=>s.properties.op.enum[0]===op);
      assert.ok(schema);assert.equal(schema.additionalProperties,false);
      assert.deepEqual(schema.required,Object.keys(schema.properties));
      assert.ok(request.instructions.includes(op));
    }
    return upstream(reply);
  }});
  assert.deepEqual(result,reply);
});

test('field validation simulates command order, selection, copies and occupied cells',()=>{
  const batch=commands=>({message:'Feldänderung',commands});
  const layout={op:'layout',cols:2,rows:1};
  const copy={op:'copy_cell',source:1,target:2};
  for(const commands of [
    [{...layout,cols:5}],[{...layout,cols:1.5}],[{...layout,rows:3}],
    [layout,{op:'select_cell',cell:3}],
    [layout,validReply.commands[0],{op:'select_cell',cell:2},{op:'remove',target:'new1'}],
    [layout,validReply.commands[0],copy,copy],
    [layout,validReply.commands[0],copy,{op:'layout',cols:1,rows:1}],
    [{op:'configure_cell',cell:1,mode:'full',rotation:45}],
    [{op:'configure_cell',cell:1,mode:'full',rotation:0},{op:'configure_cell',cell:1,mode:'half',rotation:0},{...validReply.commands[0],x:25}],
    [layout,{op:'copy_cell',source:1,target:1}]
  ]) assert.throws(()=>protocol.validateReply(batch(commands),storyboard));
  assert.doesNotThrow(()=>protocol.validateReply(batch([layout,validReply.commands[0],copy,
    {op:'select_cell',cell:1},{op:'remove',target:'new1'}]),storyboard));
  assert.doesNotThrow(()=>protocol.validateReply(batch([layout,validReply.commands[0],
    {op:'remove',target:'new1'},{op:'layout',cols:1,rows:1}]),storyboard));
  assert.throws(()=>protocol.validateReply(batch([layout]),scene));
});

test('storyboard contexts reject duplicate IDs, mismatches and nested fields',()=>{
  const object={id:'object-0',kind:'symbol',type:'attacker',label:'1',x:8,y:9,points:[]};
  const first={...scene,objects:[object]};
  const valid={...first,layout:{cols:2,rows:1},cells:[first,{...scene,cell:2}]};
  assert.doesNotThrow(()=>validateRequest({...body,scene:valid}));
  for(const invalid of [
    {...valid,layout:{cols:3,rows:1}},
    {...valid,rotation:90},
    {...valid,cells:[first,{...scene,cell:2,objects:[object]}]},
    {...valid,cells:[first,{...scene,cell:1}]},
    {...valid,cells:[storyboard,{...scene,cell:2}]}
  ]) assert.throws(()=>validateRequest({...body,scene:invalid}));
});

const styledScene = {...scene,commandVersion:4};
test('strict style commands pass through OpenAI with absolute pixel values',async()=>{
  const reply={message:'Spieler größer und rot, Pass grün und dicker.',commands:[
    validReply.commands[0],{op:'symbol_size',target:'new1',size:72},
    {op:'color',target:'new1',color:'#D32F2F'},
    {op:'add_path',id:'pass1',type:'pass',points:[{x:8,y:9},{x:12,y:9}]},
    {op:'color',target:'pass1',color:'#20d85a'},{op:'line_width',target:'pass1',width:4.5}
  ]};
  const result=await requestOpenAI({...body,scene:styledScene},{apiKey:'fake',model:'test',fetchImpl:async(_url,options)=>{
    const request=JSON.parse(options.body);
    for(const op of ['symbol_size','color','line_width']) {
      const schema=request.text.format.schema.properties.commands.items.anyOf.find(s=>s.properties.op.enum[0]===op);
      assert.ok(schema);assert.equal(schema.additionalProperties,false);
      assert.deepEqual(schema.required,Object.keys(schema.properties));assert.ok(request.instructions.includes(op));
    }
    return upstream(reply);
  }});
  assert.deepEqual(result,reply);
});

test('style validation rejects invalid values, wrong object kinds, fields and removed references',()=>{
  const symbol=validReply.commands[0];
  const path={op:'add_path',id:'path1',type:'pass',points:[{x:8,y:9},{x:12,y:9}]};
  const batch=commands=>({message:'Stil ändern.',commands});
  for(const command of [
    ...[0,11.9,100.1,Infinity,NaN,'60',null].map(size=>({op:'symbol_size',target:'new1',size})),
    ...['red','#fff','#12345678','#123456\n','url(https://example.com)','<script>','#GG0000',null].map(color=>({op:'color',target:'new1',color})),
    ...[0,0.5,10.5,2.25,NaN,Infinity,'3',null].map(width=>({op:'line_width',target:'path1',width})),
    {op:'symbol_size',target:'path1',size:60},{op:'line_width',target:'new1',width:3},
    {op:'color',target:'missing',color:'#123456'},
    {op:'symbol_size',target:'new1',size:60,scale:2},
    {op:'color',target:'new1'},{op:'line_width',target:'path1'}
  ]) assert.throws(()=>protocol.validateReply(batch([symbol,path,command]),styledScene));
  for(const op of [{op:'symbol_size',target:'new1',size:60},{op:'color',target:'new1',color:'#123456'}]) {
    assert.throws(()=>protocol.validateReply(batch([symbol,{op:'remove',target:'new1'},op]),styledScene));
    assert.throws(()=>protocol.validateReply(batch([symbol,op]),scene));
  }
  const multi={...styledScene,layout:{cols:2,rows:1},cells:[styledScene,{...styledScene,cell:2}]};
  assert.throws(()=>protocol.validateReply(batch([symbol,{op:'select_cell',cell:2},{op:'color',target:'new1',color:'#123456'}]),multi));
  for(const size of [12,60.5,100]) assert.doesNotThrow(()=>protocol.validateReply(batch([symbol,{op:'symbol_size',target:'new1',size}]),styledScene));
  for(const width of [1,2.5,10]) assert.doesNotThrow(()=>protocol.validateReply(batch([path,{op:'line_width',target:'path1',width}]),styledScene));
  const freehand={id:'object-0',kind:'freehand',type:'freehand',label:'',x:5,y:5,points:[]};
  assert.doesNotThrow(()=>protocol.validateReply(batch([{op:'color',target:'object-0',color:'#20d85a'},{op:'line_width',target:'object-0',width:10}]),{...styledScene,objects:[freehand]}));
});

test('style context accepts existing and legacy values but rejects malformed styles',()=>{
  const object={id:'object-0',kind:'symbol',type:'attacker',label:'1',x:8,y:9,points:[]};
  for(const style of [undefined,{color:'#1976d2',size:50,width:2.5},{color:null,size:null,width:null},{color:'#123456',size:150,width:15}]) {
    const o=style === undefined ? object : {...object,style};
    assert.doesNotThrow(()=>validateRequest({...body,scene:{...styledScene,objects:[o]}}));
  }
  for(const style of [null,{}, {color:'red',size:50,width:2.5},{color:'#1976d2',size:0,width:2.5},
    {color:'#1976d2',size:50,width:-1},{color:'#1976d2',size:NaN,width:2.5},
    {color:'#1976d2',size:50,width:Infinity},{color:'#1976d2',size:'50',width:2.5}]) {
    assert.throws(()=>validateRequest({...body,scene:{...styledScene,objects:[{...object,style}]}}));
  }
});

const editorScene={...scene,commandVersion:5,editor:{defaults:{symbolSize:50,strokeWidth:2.5,strokeColor:'#111111',markerColor:'#f2c500'},canUndo:true,canRedo:true}};
test('extended editor commands are strict and supported by the OpenAI adapter',async()=>{
  const reply={message:'Spieler und Weg angepasst, Export vorbereitet.',commands:[
    validReply.commands[0],{op:'rotate',target:'new1',angle:90},
    {op:'copy_object',source:'new1',id:'copy1',x:12,y:9},
    {op:'symbol_type',target:'copy1',type:'defender'},
    {op:'label_options',target:'copy1',visible:false,set:'60',label:'IL'},
    {op:'rotate_group',targets:['new1','copy1'],angle:90,center:{x:10,y:10}},
    {op:'add_path',id:'path1',type:'pass',points:[{x:8,y:9},{x:12,y:9}]},
    {op:'edit_path',target:'path1',type:'complexRun',points:[{x:8,y:9},{x:8,y:8},{x:11,y:8},{x:12,y:9}]},
    {op:'defaults',symbolSize:60,strokeWidth:3,strokeColor:'#123456',markerColor:null},
    {op:'project_action',action:'export_svg'}
  ]};
  const result=await requestOpenAI({...body,scene:editorScene},{apiKey:'fake',model:'test',fetchImpl:async(_url,options)=>{
    const request=JSON.parse(options.body);
    for(const op of ['rotate','rotate_group','copy_object','symbol_type','edit_path','label_options','defaults','project_action']) {
      const schema=request.text.format.schema.properties.commands.items.anyOf.find(s=>s.properties.op.enum[0]===op);
      assert.ok(schema);assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,Object.keys(schema.properties));assert.ok(request.instructions.includes(op));
    }
    return upstream(reply);
  }});
  assert.deepEqual(result,reply);
});

test('extended commands reject wrong types, invalid label sets, duplicate IDs and unsupported versions',()=>{
  const symbol=validReply.commands[0],path={op:'add_path',id:'path1',type:'pass',points:[{x:8,y:9},{x:12,y:9}]};
  const batch=commands=>({message:'Bearbeiten.',commands});
  const invalid=[
    {op:'rotate',target:'new1',angle:360},{op:'rotate',target:'path1',angle:90},{op:'rotate',target:'new1',angle:1.5},
    {op:'rotate_group',targets:['new1','new1'],angle:90,center:{x:10,y:10}},
    {op:'rotate_group',targets:[],angle:90,center:{x:10,y:10}},
    {op:'rotate_group',targets:['new1'],angle:361,center:{x:10,y:10}},
    {op:'rotate_group',targets:['new1'],angle:90,center:{x:21,y:10}},
    {op:'copy_object',source:'new1',id:'new1',x:10,y:10},{op:'copy_object',source:'missing',id:'copy',x:10,y:10},
    {op:'symbol_type',target:'path1',type:'attacker'},{op:'symbol_type',target:'new1',type:'unknown'},
    {op:'edit_path',target:'new1',type:'pass',points:path.points},
    {op:'edit_path',target:'path1',type:'passCurve',points:path.points},
    {op:'edit_path',target:'path1',type:'freehand',points:path.points},
    {op:'label_options',target:'new1',visible:false,set:'60',label:null},
    {op:'label_options',target:'new1',visible:false,set:'33',label:'IL'},
    {op:'label_options',target:'new1',visible:false,set:'keep',label:'1'},
    {op:'label_options',target:'path1',visible:true,set:'numbers',label:'1'},
    {op:'defaults',symbolSize:null,strokeWidth:null,strokeColor:null,markerColor:null},
    {op:'defaults',symbolSize:101,strokeWidth:null,strokeColor:null,markerColor:null},
    {op:'defaults',symbolSize:null,strokeWidth:2.25,strokeColor:null,markerColor:null},
    {op:'defaults',symbolSize:null,strokeWidth:null,strokeColor:'red',markerColor:null},
    {op:'project_action',action:'shell'}
  ];
  invalid.forEach(c=>assert.throws(()=>protocol.validateReply(batch([symbol,path,c]),editorScene)));
  const valid={op:'copy_object',source:'new1',id:'copy1',x:12,y:10};
  assert.throws(()=>protocol.validateReply(batch([symbol,valid]),styledScene));
  assert.throws(()=>protocol.validateReply(batch([symbol,{op:'symbol_type',target:'new1',type:'ball'},{op:'rotate',target:'new1',angle:90}]),editorScene));
  assert.throws(()=>protocol.validateReply(batch([symbol,{op:'remove',target:'new1'},valid]),editorScene));
  assert.doesNotThrow(()=>protocol.validateReply(batch([symbol,{op:'symbol_type',target:'new1',type:'defender'},
    {op:'label_options',target:'new1',visible:true,set:'60',label:'IL'}]),editorScene));
});

test('history actions are exclusive and require available history; file actions are final',()=>{
  const batch=commands=>({message:'Aktion.',commands});
  for(const action of ['undo','redo']) {
    assert.doesNotThrow(()=>protocol.validateReply(batch([{op:'project_action',action}]),editorScene));
    assert.throws(()=>protocol.validateReply(batch([validReply.commands[0],{op:'project_action',action}]),editorScene));
    assert.throws(()=>protocol.validateReply(batch([{op:'project_action',action}]),{...editorScene,editor:{...editorScene.editor,canUndo:false,canRedo:false}}));
  }
  for(const action of ['save','load','export_svg','export_png']) {
    assert.doesNotThrow(()=>protocol.validateReply(batch([{op:'project_action',action}]),editorScene));
    assert.throws(()=>protocol.validateReply(batch([{op:'project_action',action},validReply.commands[0]]),editorScene));
    assert.throws(()=>protocol.validateReply(batch([{op:'project_action',action},{op:'project_action',action}]),editorScene));
  }
});
