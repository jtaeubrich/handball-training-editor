(function (global) {
  'use strict';
  let context;
  const cache=new WeakMap();
  function normalize(o) {
    o.x=Number.isFinite(+o.x) ? +o.x : 0;o.y=Number.isFinite(+o.y) ? +o.y : 0;
    o.rotation=Number.isFinite(+o.rotation) ? ((+o.rotation%360)+360)%360 : 0;
    o.color=typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) && o.color.length === 7 ? o.color : '#111111';
    o.text=String(o.text ?? 'Text eingeben').replace(/\r\n?/g,'\n').slice(0,2000);
    o.size=Math.max(12,Math.min(100,Number.isFinite(+o.size) ? +o.size : 24));
    o.textWidth=Math.max(80,Math.min(900,+o.textWidth || 320));
    o.bold=!!o.bold; o.italic=!!o.italic; o.underline=!!o.underline;
    o.textAlign=['left','center','right'].includes(o.textAlign) ? o.textAlign : 'left';
    o.showLabel=false;
    return o;
  }
  function layout(o) {
    const key=JSON.stringify([o.text,o.size,o.textWidth,o.bold,o.italic,o.textAlign]);
    if (cache.get(o)?.key === key) return cache.get(o).value;
    context ||= document.createElement('canvas').getContext('2d');
    const size=Math.max(12,Math.min(100,+o.size || 24));
    const width=Math.max(80,Math.min(900,+o.textWidth || 320));
    const font=`${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${size}px Arial`;
    context.font=font;
    const lines=[];
    for (const paragraph of String(o.text ?? '').split('\n')) {
      let line='';
      for (const char of Array.from(paragraph)) {
        if (line && context.measureText(line+char).width > width) {
          const space=line.lastIndexOf(' ');
          if (space > 0) {lines.push(line.slice(0,space));line=line.slice(space+1);}
          else {lines.push(line);line='';}
        }
        line+=char;
      }
      lines.push(line);
    }
    const lineHeight=size*1.25;
    const value={font,size,width,height:Math.max(1,lines.length)*lineHeight,lineHeight,
      lines:lines.map(text=>({text,width:context.measureText(text).width})),
      x:o.textAlign === 'right' ? width : o.textAlign === 'center' ? width/2 : 0};
    cache.set(o,{key,value});return value;
  }
  function bounds(o) {
    const text=layout(o),a=(o.rotation || 0)*Math.PI/180;
    const points=[[0,0],[text.width,0],[0,text.height],[text.width,text.height]].map(([x,y])=>({x:o.x+x*Math.cos(a)-y*Math.sin(a),y:o.y+x*Math.sin(a)+y*Math.cos(a)}));
    return {x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),x2:Math.max(...points.map(p=>p.x)),y2:Math.max(...points.map(p=>p.y))};
  }
  global.HandballText={normalize,layout,bounds};
})(window);
