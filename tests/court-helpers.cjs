function configureCourtScenario(scenario) {
  const change = (id,value,event='change') => {
    const input=document.getElementById(id);
    if(input.type==='checkbox')input.checked=value; else input.value=value;
    input.dispatchEvent(new Event(event));
  };
  change('layoutGrid',scenario.layout);
  for(const [i,cell]of scenario.cells.entries()) {
    change('activeCellSelect',String(i));
    change('courtMode',cell.mode);
    change('courtTheme',cell.theme);
    change('courtRotation',String(cell.rotation));
    change('gridVisible',cell.grid);
    change('sectorOpacity',String(cell.opacity ?? 90),'input');
  }
  change('activeCellSelect',String(scenario.active ?? 0));
}

function measureCourt() {
  const target=document.createElement('canvas');
  target.width=document.querySelector('#c').width;
  target.height=document.querySelector('#c').height;
  const context=target.getContext('2d'),commands=[];
  const normalize=value=>typeof value==='number'?Math.round(value*1e8)/1e8:Array.isArray(value)?value.map(normalize):value;
  const proxy=new Proxy(context,{
    get(target,key){
      if(typeof target[key]!=='function')return target[key];
      return (...args)=>{commands.push([key,...args.map(normalize)]);return target[key](...args);};
    },
    set(target,key,value){commands.push(['set',key,normalize(value)]);target[key]=value;return true;}
  });
  window.__renderers.court.drawStoryboardCourts(proxy);
  return commands;
}
module.exports={configureCourtScenario,measureCourt};
