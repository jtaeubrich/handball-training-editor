const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const ref = 'b39e2dc703ea0499235e99277a6670bfebbb54c7';
const source = cp.execFileSync('git',['show',`${ref}:index.html`],{encoding:'utf8'}).replace(/\r\n/g,'\n');
const definitions = source.slice(source.indexOf('  const pathTools ='),source.indexOf('  function clone(v)'));
const offsets = source.slice(source.indexOf('  const LABEL_OFFSET_MIN'),source.indexOf('  function getLabelPosition'));
const sync = source.match(/^  function syncMultiPathExtents\([^]*?^  }/m)[0];
const normalize = source.slice(source.indexOf('        objects=data.objects.map(o => {'), source.indexOf('        if (data.layout)'));
const symbol = source.slice(source.indexOf('    const defaultSymbolColor ='),source.indexOf('    objects.push(symbol);'));
const settings = {symbolSize:50,strokeWidth:3,strokeColor:'#123456',markerColor:'#f2c500',freehandColor:'#111111',rotation:37};
const context = {tool:null,p:{x:120,y:150},markerColor:settings.markerColor,strokeColor:{value:settings.strokeColor},symbolSize:{value:settings.symbolSize},strokeWidth:{value:settings.strokeWidth},initialPlayerRotation:()=>settings.rotation};
const symbols = ['attacker','attackerBall','feeder','defender','goalkeeper','ball','coach','cone','ring','disc','airbody','bench','mat','crashMat'];
const creations = symbols.map(type => ({type,point:context.p,settings,expected:JSON.parse(vm.runInNewContext(`${definitions}\nconst markerTypes=new Set(['cone','ring','disc','airbody']);\n${symbol}\nJSON.stringify(symbol)`,{...context,tool:type}))}));
const inputs = [
 {kind:'symbol',type:'attacker',label:'invalid',attackFormation:'invalid',labelOffsetX:99.8,labelOffsetY:-99.8},
 {kind:'symbol',type:'attacker',label:'KR',attackFormation:'24',showLabel:true,labelOffsetX:'12.6',labelOffsetY:'invalid'},
 {kind:'symbol',type:'defender',label:'invalid',defenseFormation:'invalid'},
 {kind:'symbol',type:'defender',label:'IL',defenseFormation:'60',showLabel:true,labelOffsetX:-12.4,labelOffsetY:null},
 {kind:'symbol',type:'attackerBall',label:'custom',showLabel:true,extra:'keep'},
 {kind:'symbol',type:'goalkeeper',showLabel:true},
 {kind:'symbol',type:'feeder',color:'#1976d2',custom:123},
 {kind:'path',type:'run',x1:10,y1:20,x2:110,y2:220,label:123,labelOffsetX:'2.6'},
 {kind:'path',type:'complexRun',x1:10,y1:20,x2:110,y2:220,cx1:77,cy1:'88',cx2:'bad'},
 {kind:'path',type:'passCurve',x1:10,y1:20,x2:110,y2:220,showLabel:true,label:'custom',labelOffsetX:-80},
 {kind:'path',type:'runMulti',x1:'10',y1:'bad',x2:110,y2:220},
 {kind:'path',type:'screenMulti',x1:999,y1:999,x2:999,y2:999,points:[{x:1,y:2},{x:5,y:6},{x:8,y:9}]},
 {kind:'path',type:'runBallMulti',points:[{x:10,y:20}]},
 {kind:'freehand',points:[{x:1,y:2}],custom:'untouched'},
 {kind:'future',type:'custom',extra:{value:1}}, null
];
const normalizations = inputs.map(input=>({input,expected:JSON.parse(vm.runInNewContext(`${definitions}\n${offsets}\n${sync}\nlet objects; const data={objects:[${JSON.stringify(input)}]};\n${normalize}\nJSON.stringify(objects[0]);`))}));
fs.writeFileSync(path.join(__dirname,'fixtures/object-model-v91.json'),JSON.stringify({source:ref,creations,normalizations},null,2)+'\n');
console.log(`Captured ${creations.length} creations and ${normalizations.length} normalizations from v91`);
