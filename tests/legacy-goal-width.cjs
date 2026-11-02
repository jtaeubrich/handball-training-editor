// v98 deliberately changes only the centered goal opening from 2 m to 3 m.
// Map those goal rectangles back to 2 m for comparison with the immutable
// v89/v92 snapshots; separate dimension tests require the new 3 m opening.
function legacyRect(x,y,w,h) {
  if (w > h) return [x+w/6,y,w*2/3,h];
  return [x,y+h/6,w,h*2/3];
}

function legacyCanvasGoals(commands) {
  return commands.map((command,index) => {
    const [name,x,y,w,h] = command;
    const pair = name === 'fillRect' ? commands[index+1] : name === 'strokeRect' ? commands[index-1] : null;
    if (!pair || !['fillRect','strokeRect'].includes(pair[0]) || pair[0] === name ||
      ![14,18].includes(Math.min(w,h)) || Math.max(w,h) <= 18 ||
      !command.slice(1).every((value,i) => value === pair[i+1])) return command;
    return [name,...legacyRect(x,y,w,h).map(n => Math.round(n*1e8)/1e8)];
  });
}

function legacySvgGoals(svg) {
  return svg.replace(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" fill="white" stroke="([^"]+)" stroke-width="4"\/>/g,
    (_match,x,y,w,h,color) => {
      const values = legacyRect(+x,+y,+w,+h);
      return `<rect x="${values[0]}" y="${values[1]}" width="${values[2]}" height="${values[3]}" fill="white" stroke="${color}" stroke-width="4"/>`;
    });
}

module.exports = {legacyCanvasGoals,legacySvgGoals};
