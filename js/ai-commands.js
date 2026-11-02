(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HandballAiCommands = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';

  const symbolTypes = ['attacker','attackerBall','defender','goalkeeper','feeder','coach','ball','cone','ring','disc','airbody','bench','mat','crashMat'];
  const pathTypes = ['run','complexRun','runMulti','pass','passCurve','passFake','passFakeCurve','runBall','runBallCurve','runBallMulti','tip','tipCurve','dribble','dribbleCurve','shot','shotCurve','shotFake','shotFakeCurve','screen','screenCurve','screenMulti'];
  const pointSchema = {type:'object',properties:{x:{type:'number'},y:{type:'number'}},required:['x','y'],additionalProperties:false};
  const identifier = {type:'string',pattern:'^[a-zA-Z0-9_-]{1,40}$'};
  const labelSchema = {type:'string',maxLength:24};
  function operation(op, properties) {
    const fields = {op:{type:'string',enum:[op]},...properties};
    return {type:'object',properties:fields,required:Object.keys(fields),additionalProperties:false};
  }
  const replySchema = {
    type:'object',additionalProperties:false,required:['message','commands'],
    properties:{
      message:{type:'string',maxLength:6000},
      commands:{type:'array',maxItems:80,items:{anyOf:[
        operation('add_symbol',{id:identifier,type:{type:'string',enum:symbolTypes},x:{type:'number'},y:{type:'number'},label:labelSchema}),
        operation('add_path',{id:identifier,type:{type:'string',enum:pathTypes},points:{type:'array',minItems:2,maxItems:50,items:pointSchema}}),
        operation('move',{target:identifier,x:{type:'number'},y:{type:'number'}}),
        operation('label',{target:identifier,label:labelSchema}),
        operation('remove',{target:identifier})
      ]}}
    }
  };

  function fail(message) { throw new Error(message); }
  function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function exact(value, keys) {
    if (!plain(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value,k))) fail('Ungültiger Zeichenbefehl.');
  }
  function id(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(value)) fail('Ungültige Objektreferenz.'); }
  function label(value) { if (typeof value !== 'string' || value.length > 24) fail('Beschriftungen dürfen höchstens 24 Zeichen enthalten.'); }
  function point(p, scene) {
    exact(p,['x','y']);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > scene.width || p.y > scene.height) fail('Ein Punkt liegt außerhalb des aktiven Spielfelds.');
  }

  function validateContext(scene) {
    exact(scene,['cell','mode','rotation','width','height','objects']);
    if (!Number.isInteger(scene.cell) || scene.cell < 1 || scene.cell > 8 || !['half','full','none'].includes(scene.mode) || ![0,90,180,270].includes(scene.rotation) || scene.width !== (scene.mode === 'full' ? 40 : 20) || scene.height !== 20 || !Array.isArray(scene.objects) || scene.objects.length > 1200) fail('Ungültiger Skizzenkontext.');
    const ids = new Set();
    for (const object of scene.objects) {
      exact(object,['id','kind','type','label','x','y','points']);
      id(object.id); label(object.label);
      if (ids.has(object.id) || !['symbol','path','freehand'].includes(object.kind) || !(symbolTypes.includes(object.type) || pathTypes.includes(object.type) || object.type === 'freehand') || !Number.isFinite(object.x) || !Number.isFinite(object.y) || Math.abs(object.x) > 1000 || Math.abs(object.y) > 1000 || !Array.isArray(object.points) || object.points.length > 200) fail('Ungültiges Objekt im Skizzenkontext.');
      ids.add(object.id);
      for (const p of object.points) {
        exact(p,['x','y']);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1000 || Math.abs(p.y) > 1000) fail('Ungültige Pfadpunkte im Skizzenkontext.');
      }
    }
    return scene;
  }

  function validateReply(reply, scene) {
    exact(reply,['message','commands']);
    if (typeof reply.message !== 'string' || !reply.message.trim() || reply.message.length > 6000 || !Array.isArray(reply.commands) || reply.commands.length > 80) fail('Die KI-Antwort enthält keine gültigen Zeichenbefehle.');
    const ids = new Map(scene.objects.map(o => [o.id,o.kind]));
    const used = new Set(ids.keys());
    for (const c of reply.commands) {
      if (!plain(c)) fail('Ungültiger Zeichenbefehl.');
      if (c.op === 'add_symbol') {
        exact(c,['op','id','type','x','y','label']); id(c.id); label(c.label); point({x:c.x,y:c.y},scene);
        if (!symbolTypes.includes(c.type)) fail('Unbekanntes Spielersymbol.');
        if (c.label && !['attacker','attackerBall','defender'].includes(c.type)) fail('Dieses Symbol unterstützt keine Beschriftung.');
        if (used.has(c.id)) fail('Eine Objektreferenz ist doppelt vergeben.');
        used.add(c.id); ids.set(c.id,'symbol');
      } else if (c.op === 'add_path') {
        exact(c,['op','id','type','points']); id(c.id);
        if (!pathTypes.includes(c.type) || !Array.isArray(c.points) || c.points.length < 2 || c.points.length > 50) fail('Ungültiger Pfad.');
        const multi = c.type.endsWith('Multi');
        const curve = c.type === 'complexRun' || c.type.endsWith('Curve');
        if ((!multi && !curve && c.points.length !== 2) || (curve && c.points.length !== 4)) fail('Gerade Wege benötigen 2 Punkte, Kurven 4 Punkte.');
        c.points.forEach(p => point(p,scene));
        if (used.has(c.id)) fail('Eine Objektreferenz ist doppelt vergeben.');
        used.add(c.id); ids.set(c.id,'path');
      } else if (['move','label','remove'].includes(c.op)) {
        exact(c,c.op === 'move' ? ['op','target','x','y'] : c.op === 'label' ? ['op','target','label'] : ['op','target']);
        id(c.target);
        if (!ids.has(c.target)) fail('Die KI verweist auf ein nicht vorhandenes Objekt.');
        if (c.op === 'move') point({x:c.x,y:c.y},scene);
        if (c.op === 'label') label(c.label);
        if (c.op === 'remove') ids.delete(c.target);
      } else fail('Unbekannter Zeichenbefehl.');
    }
    return reply;
  }

  function createFrame(bounds, rotation, mode) {
    const width = mode === 'full' ? 40 : 20;
    const angle = rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    const cx = bounds.x + bounds.w/2, cy = bounds.y + bounds.h/2;
    return {
      toWorld(p) {
        const x = (p.x/width-.5)*bounds.w, y = (p.y/20-.5)*bounds.h;
        return {x:cx+x*cos-y*sin,y:cy+x*sin+y*cos};
      },
      fromWorld(p) {
        const dx = p.x-cx, dy = p.y-cy;
        return {x:((dx*cos+dy*sin)/bounds.w+.5)*width,y:((-dx*sin+dy*cos)/bounds.h+.5)*20};
      }
    };
  }

  function describeScene(objects, cell, settings, bounds) {
    const frame = createFrame(bounds,settings.rotation,settings.mode);
    const rounded = p => Object.fromEntries(Object.entries(frame.fromWorld(p)).map(([k,v]) => [k,Math.round(v*1000)/1000]));
    const references = new Map();
    const descriptions = [];
    objects.forEach((o,index) => {
      const start = o.kind === 'symbol' ? {x:o.x,y:o.y} : {x:o.x1,y:o.y1};
      if (!Number.isFinite(start.x) || !Number.isFinite(start.y) || start.x < cell.x || start.x > cell.x+cell.w || start.y < cell.y || start.y > cell.y+cell.h) return;
      const objectId = `object-${index}`;
      references.set(objectId,index);
      let points = [];
      if (Array.isArray(o.points)) {
        const step = Math.max(1,Math.ceil(o.points.length/199));
        points = o.points.filter((_,i) => i%step === 0 || i === o.points.length-1);
      } else if (o.kind === 'path') {
        points = [{x:o.x1,y:o.y1},...(Number.isFinite(o.cx1) ? [{x:o.cx1,y:o.cy1},{x:o.cx2,y:o.cy2}] : []),{x:o.x2,y:o.y2}];
      }
      descriptions.push({id:objectId,kind:o.kind,type:o.type,label:o.showLabel && typeof o.label === 'string' ? o.label.slice(0,24) : '',...rounded(start),points:points.map(rounded)});
    });
    const scene = {cell:cell.index+1,mode:settings.mode,rotation:settings.rotation,width:settings.mode === 'full' ? 40 : 20,height:20,objects:descriptions};
    validateContext(scene);
    return {scene,references,frame};
  }

  function planObjects(objects, context, reply, deps) {
    validateReply(reply,context.scene);
    const result = JSON.parse(JSON.stringify(objects));
    const refs = new Map([...context.references].map(([key,index]) => [key,result[index]]));
    const model = deps.model;
    function setLabel(o,text) {
      if (!model.objectSupportsLabel(o)) fail('Dieses Objekt unterstützt keine Beschriftung.');
      if (['attacker','attackerBall','defender'].includes(o.type)) {
        o[o.type === 'defender' ? 'defenseFormation' : 'attackFormation'] = /^(?:[1-9]|10)$/.test(text) ? 'numbers' : 'custom';
      }
      o.label = text; o.showLabel = !!text;
      model.ensureLabelOffset(o);
    }
    for (const c of reply.commands) {
      if (c.op === 'add_symbol') {
        const p = context.frame.toWorld(c);
        const o = model.createSymbol(c.type,p,{...deps.defaults,rotation:deps.initialPlayerRotation(c.type,p.x,p.y)});
        if (c.label) setLabel(o,c.label);
        refs.set(c.id,o); result.push(o);
      } else if (c.op === 'add_path') {
        const points = c.points.map(context.frame.toWorld);
        const o = model.createPath(c.type,points[0],{width:deps.defaults.strokeWidth});
        o.x2 = points.at(-1).x; o.y2 = points.at(-1).y;
        if (model.isMultiPointPath(o)) { o.points = points; model.syncMultiPathExtents(o); }
        else if (model.isComplexPath(o)) Object.assign(o,{cx1:points[1].x,cy1:points[1].y,cx2:points[2].x,cy2:points[2].y});
        refs.set(c.id,o); result.push(o);
      } else {
        const o = refs.get(c.target);
        if (c.op === 'remove') { result.splice(result.indexOf(o),1); refs.delete(c.target); }
        else if (c.op === 'label') setLabel(o,c.label);
        else {
          const p = context.frame.toWorld(c);
          const dx = p.x-(o.kind === 'symbol' ? o.x : o.x1), dy = p.y-(o.kind === 'symbol' ? o.y : o.y1);
          for (const [x,y] of [['x','y'],['x1','y1'],['x2','y2'],['cx1','cy1'],['cx2','cy2']]) {
            if (Number.isFinite(o[x]) && Number.isFinite(o[y])) { o[x]+=dx; o[y]+=dy; }
          }
          if (Array.isArray(o.points)) o.points.forEach(pt => { pt.x+=dx; pt.y+=dy; });
        }
      }
    }
    return result;
  }

  return {symbolTypes,pathTypes,replySchema,validateContext,validateReply,createFrame,describeScene,planObjects};
});
