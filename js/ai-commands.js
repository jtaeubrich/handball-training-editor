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
  const labelOffsetSchema = {type:'integer',minimum:-50,maximum:50};
  const cellSchema = {type:'integer',minimum:1,maximum:8};
  const colorSchema = {type:'string',pattern:'^#[0-9a-fA-F]{6}$',minLength:7,maxLength:7};
  const sizeSchema = {type:'number',minimum:12,maximum:100};
  const widthSchema = {type:'number',minimum:1,maximum:10,multipleOf:0.5};
  function operation(op, properties) {
    const fields = {op:{type:'string',enum:[op]},...properties};
    return {type:'object',properties:fields,required:Object.keys(fields),additionalProperties:false};
  }
  const replySchema = {
    type:'object',additionalProperties:false,required:['message','commands'],
    properties:{
      message:{type:'string',maxLength:6000},
      commands:{type:'array',maxItems:80,items:{anyOf:[
        operation('layout',{cols:{type:'integer',minimum:1,maximum:4},rows:{type:'integer',minimum:1,maximum:2}}),
        operation('select_cell',{cell:cellSchema}),
        operation('configure_cell',{cell:cellSchema,mode:{type:'string',enum:['half','full','none']},rotation:{type:'integer',enum:[0,90,180,270]}}),
        operation('copy_cell',{source:cellSchema,target:cellSchema}),
        operation('add_symbol',{id:identifier,type:{type:'string',enum:symbolTypes},x:{type:'number'},y:{type:'number'},label:labelSchema}),
        operation('add_path',{id:identifier,type:{type:'string',enum:pathTypes},points:{type:'array',minItems:2,maxItems:50,items:pointSchema}}),
        operation('move',{target:identifier,x:{type:'number'},y:{type:'number'}}),
        operation('label',{target:identifier,label:labelSchema}),
        operation('label_offset',{target:identifier,x:labelOffsetSchema,y:labelOffsetSchema}),
        operation('symbol_size',{target:identifier,size:sizeSchema}),
        operation('color',{target:identifier,color:colorSchema}),
        operation('line_width',{target:identifier,width:widthSchema}),
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
  function labelOffset(value) {
    if (!Number.isInteger(value) || value < -50 || value > 50) fail('Der Beschriftungsversatz muss eine ganze Zahl zwischen -50 und +50 Pixeln sein.');
  }
  function color(value) {
    if (typeof value !== 'string' || value.length !== 7 || !/^#[0-9a-fA-F]{6}$/.test(value)) fail('Farben müssen als sechsstelliger Hex-Farbwert angegeben werden, zum Beispiel #1976d2.');
  }
  function size(value) {
    if (!Number.isFinite(value) || value < 12 || value > 100) fail('Die Symbolgröße muss zwischen 12 und 100 Pixeln liegen.');
  }
  function lineWidth(value) {
    if (!Number.isFinite(value) || value < 1 || value > 10 || !Number.isInteger(value*2)) fail('Die Linienstärke muss zwischen 1 und 10 Pixeln liegen, in Schritten von 0,5.');
  }
  function supportsLabel(object) {
    return object.kind === 'symbol' && ['attacker','attackerBall','defender'].includes(object.type) ||
      object.kind === 'path' && pathTypes.includes(object.type);
  }
  function point(p, scene) {
    exact(p,['x','y']);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > scene.width || p.y > scene.height) fail('Ein Punkt liegt außerhalb des aktiven Spielfelds.');
  }

  function validateContext(scene, nested=false) {
    const storyboard = Object.hasOwn(scene,'cells') || Object.hasOwn(scene,'layout');
    const versioned = Object.hasOwn(scene,'commandVersion');
    exact(scene,['cell','mode','rotation','width','height','objects',...(versioned ? ['commandVersion'] : []),...(storyboard ? ['layout','cells'] : [])]);
    if (versioned && scene.commandVersion !== 4) fail('Unbekannte Version des Skizzenkontexts.');
    if (storyboard) {
      if (nested) fail('Verschachtelte Felder sind ungültig.');
      exact(scene.layout,['cols','rows']);
      const {cols,rows} = scene.layout;
      if (!Number.isInteger(cols) || cols < 1 || cols > 4 || !Number.isInteger(rows) || rows < 1 || rows > 2 || !Array.isArray(scene.cells) || scene.cells.length !== cols*rows) fail('Ungültiges Feldlayout.');
      const allIds = new Set();
      scene.cells.forEach((cell,i) => {
        validateContext(cell,true);
        if (Object.hasOwn(cell,'cells') || cell.cell !== i+1) fail('Ungültige Feldnummer.');
        for (const o of cell.objects) {
          if (allIds.has(o.id)) fail('Eine Objektreferenz ist doppelt vergeben.');
          allIds.add(o.id);
        }
      });
      const activeCell = scene.cells[scene.cell-1];
      if (!activeCell || ['cell','mode','rotation','width','height','objects','commandVersion'].some(k => JSON.stringify(activeCell[k]) !== JSON.stringify(scene[k]))) fail('Das aktive Feld stimmt nicht überein.');
    }
    if (!Number.isInteger(scene.cell) || scene.cell < 1 || scene.cell > 8 || !['half','full','none'].includes(scene.mode) || ![0,90,180,270].includes(scene.rotation) || scene.width !== (scene.mode === 'full' ? 40 : 20) || scene.height !== 20 || !Array.isArray(scene.objects) || scene.objects.length > 1200) fail('Ungültiger Skizzenkontext.');
    const ids = new Set();
    for (const object of scene.objects) {
      // v99 clients omit offsets. Accept those contexts during the server rollout.
      const hasOffsets = Object.hasOwn(object,'labelOffsetX') || Object.hasOwn(object,'labelOffsetY');
      const hasStyle = Object.hasOwn(object,'style');
      exact(object,['id','kind','type','label','x','y','points',...(hasOffsets ? ['labelOffsetX','labelOffsetY'] : []),...(hasStyle ? ['style'] : [])]);
      id(object.id); label(object.label);
      if (hasOffsets) { labelOffset(object.labelOffsetX); labelOffset(object.labelOffsetY); }
      if (hasStyle) {
        exact(object.style,['color','size','width']);
        const s = object.style;
        if (s.color !== null) color(s.color);
        if (s.size !== null && (object.kind !== 'symbol' || !Number.isFinite(s.size) || s.size <= 0 || s.size > 10000)) fail('Ungültige Symbolgröße im Skizzenkontext.');
        if (s.width !== null && (!Number.isFinite(s.width) || s.width <= 0 || s.width > 1000)) fail('Ungültige Linienstärke im Skizzenkontext.');
      }
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
    const cells = JSON.parse(JSON.stringify(scene.cells || [scene]));
    let active = scene.cell;
    let current = cells.find(c => c.cell === active);
    const ids = new Map(cells.flatMap(cell => cell.objects.map(o => [o.id,{...o,cell:cell.cell}])));
    const used = new Set(ids.keys());
    for (const c of reply.commands) {
      if (!plain(c)) fail('Ungültiger Zeichenbefehl.');
      if (['layout','select_cell','configure_cell','copy_cell'].includes(c.op)) {
        if (!scene.cells) fail('Dieser Editor unterstützt noch keine Feldbefehle. Bitte neu laden.');
        const getCell = n => {
          if (!Number.isInteger(n) || n < 1 || n > cells.length) fail('Die Feldnummer ist nicht vorhanden.');
          return cells[n-1];
        };
        if (c.op === 'layout') {
          exact(c,['op','cols','rows']);
          if (!Number.isInteger(c.cols) || c.cols < 1 || c.cols > 4 || !Number.isInteger(c.rows) || c.rows < 1 || c.rows > 2) fail('Erlaubt sind 1–4 Spalten und 1–2 Reihen.');
          const count = c.cols*c.rows;
          if ([...ids.values()].some(o => o.cell > count)) fail('Felder mit Objekten dürfen nicht entfernt werden.');
          while (cells.length < count) cells.push({...cells.at(-1),cell:cells.length+1,objects:[]});
          cells.length = count; active = Math.min(active,count);
        } else if (c.op === 'select_cell') {
          exact(c,['op','cell']); getCell(c.cell); active = c.cell;
        } else if (c.op === 'configure_cell') {
          exact(c,['op','cell','mode','rotation']);
          const cell = getCell(c.cell);
          if (!['half','full','none'].includes(c.mode) || ![0,90,180,270].includes(c.rotation)) fail('Ungültige Feldausrichtung.');
          Object.assign(cell,{mode:c.mode,rotation:c.rotation,width:c.mode === 'full' ? 40 : 20});
        } else {
          exact(c,['op','source','target']);
          const source = getCell(c.source), target = getCell(c.target);
          if (c.source === c.target || [...ids.values()].some(o => o.cell === c.target)) fail('Kopieren ist nur in ein anderes, leeres Feld möglich.');
          Object.assign(target,{mode:source.mode,rotation:source.rotation,width:source.width});
          // Copies become addressable with fresh IDs in the next request.
          for (const o of [...ids.values()].filter(o => o.cell === c.source)) ids.set(Symbol('copy'),{...o,cell:c.target});
        }
        current = cells.find(cell => cell.cell === active);
      } else if (c.op === 'add_symbol') {
        exact(c,['op','id','type','x','y','label']); id(c.id); label(c.label); point({x:c.x,y:c.y},current);
        if (!symbolTypes.includes(c.type)) fail('Unbekanntes Spielersymbol.');
        if (c.label && !['attacker','attackerBall','defender'].includes(c.type)) fail('Dieses Symbol unterstützt keine Beschriftung.');
        if (used.has(c.id)) fail('Eine Objektreferenz ist doppelt vergeben.');
        used.add(c.id); ids.set(c.id,{kind:'symbol',type:c.type,cell:active});
      } else if (c.op === 'add_path') {
        exact(c,['op','id','type','points']); id(c.id);
        if (!pathTypes.includes(c.type) || !Array.isArray(c.points) || c.points.length < 2 || c.points.length > 50) fail('Ungültiger Pfad.');
        const multi = c.type.endsWith('Multi');
        const curve = c.type === 'complexRun' || c.type.endsWith('Curve');
        if ((!multi && !curve && c.points.length !== 2) || (curve && c.points.length !== 4)) fail('Gerade Wege benötigen 2 Punkte, Kurven 4 Punkte.');
        c.points.forEach(p => point(p,current));
        if (used.has(c.id)) fail('Eine Objektreferenz ist doppelt vergeben.');
        used.add(c.id); ids.set(c.id,{kind:'path',type:c.type,cell:active});
      } else if (['move','label','label_offset','symbol_size','color','line_width','remove'].includes(c.op)) {
        const keys = {move:['x','y'],label:['label'],label_offset:['x','y'],symbol_size:['size'],color:['color'],line_width:['width'],remove:[]};
        exact(c,['op','target',...keys[c.op]]);
        if (['symbol_size','color','line_width'].includes(c.op) && scene.commandVersion !== 4) fail('Für Größen- und Farbbefehle bitte den Editor aktualisieren.');
        id(c.target);
        if (!ids.has(c.target)) fail('Die KI verweist auf ein nicht vorhandenes Objekt.');
        if (ids.get(c.target).cell !== active) fail('Vor der Objektänderung das betreffende Feld auswählen.');
        if (c.op === 'move') point({x:c.x,y:c.y},current);
        if (c.op === 'label') label(c.label);
        if (c.op === 'label_offset') {
          labelOffset(c.x); labelOffset(c.y);
          if (!supportsLabel(ids.get(c.target))) fail('Dieses Objekt unterstützt keinen Beschriftungsversatz.');
        }
        if (c.op === 'symbol_size') {
          size(c.size);
          if (ids.get(c.target).kind !== 'symbol') fail('Nur Symbole unterstützen eine Symbolgröße.');
        }
        if (c.op === 'color') color(c.color);
        if (c.op === 'line_width') {
          lineWidth(c.width);
          if (!['path','freehand'].includes(ids.get(c.target).kind)) fail('Die Linienstärke kann nur für Wege und Freihandlinien geändert werden.');
        }
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
      key:JSON.stringify([bounds.x,bounds.y,bounds.w,bounds.h,rotation,mode]),
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
      const offset = value => Number.isFinite(value) ? Math.max(-50,Math.min(50,Math.round(value))) : 0;
      descriptions.push({id:objectId,kind:o.kind,type:o.type,label:o.showLabel && typeof o.label === 'string' ? o.label.slice(0,24) : '',...rounded(start),points:points.map(rounded),
        labelOffsetX:offset(o.labelOffsetX),labelOffsetY:offset(o.labelOffsetY),
        style:{color:typeof o.color === 'string' && o.color.length === 7 && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color.toLowerCase() : null,
          size:o.kind === 'symbol' && Number.isFinite(o.size) && o.size > 0 && o.size <= 10000 ? o.size : null,
          width:Number.isFinite(o.width) && o.width > 0 && o.width <= 1000 ? o.width : null}});
    });
    const scene = {cell:cell.index+1,mode:settings.mode,rotation:settings.rotation,width:settings.mode === 'full' ? 40 : 20,height:20,objects:descriptions,commandVersion:4};
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
        else if (c.op === 'symbol_size') o.size = c.size;
        else if (c.op === 'color') o.color = c.color.toLowerCase();
        else if (c.op === 'line_width') o.width = c.width;
        else if (c.op === 'label_offset') {
          o.labelOffsetX = c.x; o.labelOffsetY = c.y;
          model.ensureLabelOffset(o);
        }
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

  function describeProject(objects,layout,courts,deps) {
    const contexts = deps.cells(layout,courts).map((cell,i) => {
      const settings = courts[i];
      return describeScene(objects,cell,settings,settings.mode === 'none' ? cell : deps.bounds(settings.mode,settings.rotation,cell));
    });
    const context = contexts[layout.activeCell];
    return {...context,scene:{...context.scene,layout:{cols:layout.cols,rows:layout.rows},cells:contexts.map(c => c.scene)}};
  }

  // Plan the complete answer on detached data. No editor state changes before success.
  function planProject(project,context,reply,deps) {
    validateReply(reply,context.scene);
    const result = JSON.parse(JSON.stringify(project));
    let objects = result.objects;
    let cells = deps.cells(result.layout,result.cellCourts);
    const owner = o => cells.findIndex(cell => {
      const x = o.kind === 'symbol' ? o.x : o.x1, y = o.kind === 'symbol' ? o.y : o.y1;
      return x >= cell.x && x <= cell.x+cell.w && y >= cell.y && y <= cell.y+cell.h;
    });
    let owners = objects.map(owner);
    let references = new Map(objects.map((o,i) => [`object-${i}`,i]));
    function frames() {
      return cells.map((cell,i) => {
        const s = result.cellCourts[i];
        return createFrame(s.mode === 'none' ? cell : deps.bounds(s.mode,s.rotation,cell),s.rotation,s.mode);
      });
    }
    function transform(o,from,to,delta) {
      if (from.key === to.key && !delta) return;
      for (const [x,y] of [['x','y'],['x1','y1'],['x2','y2'],['cx1','cy1'],['cx2','cy2']]) {
        if (Number.isFinite(o[x]) && Number.isFinite(o[y])) {
          const p = to.toWorld(from.fromWorld({x:o[x],y:o[y]})); o[x]=p.x; o[y]=p.y;
        }
      }
      if (Array.isArray(o.points)) o.points = o.points.map(p => ({...p,...to.toWorld(from.fromWorld(p))}));
      if (delta) {
        if (Number.isFinite(o.rotation)) o.rotation = ((o.rotation+delta)%360+360)%360;
        const a = delta*Math.PI/180, x = o.labelOffsetX || 0, y = o.labelOffsetY || 0;
        if (Object.hasOwn(o,'labelOffsetX')) { o.labelOffsetX=Math.round(x*Math.cos(a)-y*Math.sin(a)) || 0; o.labelOffsetY=Math.round(x*Math.sin(a)+y*Math.cos(a)) || 0; }
      }
    }
    for (const c of reply.commands) {
      if (['layout','configure_cell','copy_cell'].includes(c.op)) {
        const oldFrames = frames(), rotations = result.cellCourts.map(s => s.rotation);
        if (c.op === 'layout') {
          Object.assign(result.layout,{cols:c.cols,rows:c.rows,activeCell:Math.min(result.layout.activeCell,c.cols*c.rows-1)});
          while (result.cellCourts.length < c.cols*c.rows) result.cellCourts.push({...result.cellCourts.at(-1)});
          result.cellCourts.length = c.cols*c.rows;
        } else if (c.op === 'configure_cell') {
          Object.assign(result.cellCourts[c.cell-1],{mode:c.mode,rotation:c.rotation});
        } else {
          result.cellCourts[c.target-1] = {...result.cellCourts[c.source-1]};
        }
        cells = deps.cells(result.layout,result.cellCourts);
        const newFrames = frames();
        objects.forEach((o,i) => {
          const n = owners[i];
          if (n >= 0 && newFrames[n]) transform(o,oldFrames[n],newFrames[n],result.cellCourts[n].rotation-rotations[n]);
        });
        if (c.op === 'copy_cell') {
          const copies = objects.flatMap((o,i) => owners[i] === c.source-1 ? [JSON.parse(JSON.stringify(o))] : []);
          copies.forEach(o => transform(o,newFrames[c.source-1],newFrames[c.target-1],0));
          objects.push(...copies); owners.push(...copies.map(() => c.target-1));
        }
      } else if (c.op === 'select_cell') result.layout.activeCell = c.cell-1;
      else {
        const n = result.layout.activeCell;
        const description = describeScene(objects,cells[n],result.cellCourts[n],result.cellCourts[n].mode === 'none' ? cells[n] : deps.bounds(result.cellCourts[n].mode,result.cellCourts[n].rotation,cells[n]));
        description.references = new Map([...references].filter(([,i]) => owners[i] === n));
        description.scene.objects = [...description.references].map(([id,i]) => ({id,kind:objects[i].kind,type:objects[i].type}));
        const next = planObjects(objects,description,{message:reply.message,commands:[c]},{...deps,initialPlayerRotation:(type,x,y) => {
          const s = result.cellCourts[n], f = description.frame, p = f.fromWorld({x,y});
          if (s.mode === 'none') return 0;
          let target;
          if (['attacker','attackerBall'].includes(type)) target = s.mode === 'half' ? {x:10,y:0} : {x:p.x <= 20 ? 0 : 40,y:10};
          else if (['defender','goalkeeper'].includes(type)) target = s.mode === 'half' ? {x:p.x,y:20} : {x:20,y:p.y};
          else return 0;
          const goal = f.toWorld(target);
          return ((Math.atan2(goal.y-y,goal.x-x)*180/Math.PI+90)%360+360)%360;
        }});
        if (c.op === 'remove') {
          const removed = references.get(c.target);
          owners.splice(removed,1);
          references = new Map([...references].filter(([key]) => key !== c.target).map(([key,i]) => [key,i > removed ? i-1 : i]));
        } else if (c.op === 'add_symbol' || c.op === 'add_path') {
          references.set(c.id,next.length-1); owners.push(n);
        }
        objects = next;
      }
    }
    result.objects = objects;
    result.court = {...result.cellCourts[0]};
    return result;
  }

  return {symbolTypes,pathTypes,replySchema,validateContext,validateReply,createFrame,describeScene,describeProject,planObjects,planProject};
});
