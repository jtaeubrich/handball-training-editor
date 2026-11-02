(function (global) {
  'use strict';

  // Dependencies keep editor state and interaction code outside the renderer.
  function createSvgRenderer({
    isMultiPointPath,
    isComplexPath,
    basePathType,
    sampledMultiPathPoints,
    offsetSampledPoints,
    sampledCurvePoints,
    bezierPoint,
    bezierTangent,
    objectSupportsLabel,
    getLabelPosition,
    sampledMidAndTangent,
    getCourtSettings,
    courtThemes,
    courtRect
  }) {
    function svgArrowFromPoints(pts,size,col,filled=true) {
      if (!pts || pts.length < 2) return '';
      const p1 = pts[pts.length - 2];
      const p2 = pts[pts.length - 1];
      return svgArrow(p1.x,p1.y,p2.x,p2.y,size,col,filled);
    }

    function svgPolylineFromPoints(pts,col,sw,extra='') {
      return `<polyline points="${svgPoints(pts)}" fill="none" stroke="${col}" stroke-width="${sw}"
               stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
    }

    function svgScreenTick(mx, my, dx, dy, tickLength, col, sw) {
      const len = Math.hypot(dx,dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const half = tickLength / 2;
      return `<line x1="${mx - nx * half}" y1="${my - ny * half}" x2="${mx + nx * half}" y2="${my + ny * half}"
               stroke="${esc(col)}" stroke-width="${sw}" stroke-linecap="round"/>`;
    }

    function svgScreenTickFromPoints(pts, tickLength, col, sw) {
      if (!pts || pts.length < 2) return '';
      const mid = sampledMidAndTangent(pts);
      return svgScreenTick(mid.x, mid.y, mid.dx, mid.dy, tickLength, col, sw);
    }

    function svgScreenTickFromCurve(o, tickLength, col, sw) {
      const mid = bezierPoint(o,0.5);
      const tan = bezierTangent(o,0.5);
      return svgScreenTick(mid.x, mid.y, tan.x, tan.y, tickLength, col, sw);
    }

    function svgPoints(pts) {
      return pts.map(p => `${p.x},${p.y}`).join(' ');
    }

    function svgCurvePath(o, extra='') {
      return `<path d="M ${o.x1} ${o.y1} C ${o.cx1} ${o.cy1}, ${o.cx2} ${o.cy2}, ${o.x2} ${o.y2}"
                   fill="none" stroke="${esc(o.color)}" stroke-width="${o.width}"
                   stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
    }

    function svgCurvePolyline(o, offset=0, extra='') {
      const pts = sampledCurvePoints(o,40,offset);
      return `<polyline points="${svgPoints(pts)}" fill="none" stroke="${esc(o.color)}"
               stroke-width="${o.width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
    }

    function svgCurveArrow(o,size) {
      const tan=bezierTangent(o,1);
      return svgArrow(o.x2-tan.x,o.y2-tan.y,o.x2,o.y2,size,o.color,true);
    }

    function svgCurveSlash(o) {
      const p=bezierPoint(o,.5), tan=bezierTangent(o,.5);
      const len=Math.hypot(tan.x,tan.y)||1, ux=tan.x/len, uy=tan.y/len, nx=-uy, ny=ux;
      const dx=ux*7+nx*10, dy=uy*7+ny*10;
      return `<line x1="${p.x-dx}" y1="${p.y-dy}" x2="${p.x+dx}" y2="${p.y+dy}"
               stroke="${esc(o.color)}" stroke-width="${o.width}" stroke-linecap="round"/>`;
    }

    function svgCurveRoof(o,baseHalf=8,tipLen=20) {
      const tan=bezierTangent(o,1), len=Math.hypot(tan.x,tan.y)||1;
      const ux=tan.x/len, uy=tan.y/len, nx=-uy, ny=ux;
      const tip=[o.x2+ux*tipLen,o.y2+uy*tipLen];
      const b1=[o.x2+nx*baseHalf,o.y2+ny*baseHalf];
      const b2=[o.x2-nx*baseHalf,o.y2-ny*baseHalf];
      return `<path d="M ${b1[0]} ${b1[1]} L ${tip[0]} ${tip[1]} L ${b2[0]} ${b2[1]}"
               fill="none" stroke="${esc(o.color)}" stroke-width="${o.width}"
               stroke-linecap="round" stroke-linejoin="round"/>`;
    }

    function esc(s) {
      return String(s)
        .replace(/&/g,'&amp;')
        .replace(/"/g,'&quot;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;');
    }

    function svgLine(x1,y1,x2,y2,o,extra='') {
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${esc(o.color)}" stroke-width="${o.width}" stroke-linecap="round" ${extra}/>`;
    }

    function svgArrow(x1,y1,x2,y2,size,color,filled=true) {
      // x2/y2 is the center of the arrow base.
      const a=Math.atan2(y2-y1,x2-x1);
      const ux=Math.cos(a), uy=Math.sin(a);
      const nx=-uy, ny=ux;

      const halfBase=size*.55;
      const tip=[x2+ux*size, y2+uy*size];
      const b1=[x2+nx*halfBase, y2+ny*halfBase];
      const b2=[x2-nx*halfBase, y2-ny*halfBase];

      return filled
        ? `<path d="M ${b1[0]} ${b1[1]} L ${tip[0]} ${tip[1]} L ${b2[0]} ${b2[1]} Z" fill="${esc(color)}"/>`
        : `<path d="M ${b1[0]} ${b1[1]} L ${tip[0]} ${tip[1]} L ${b2[0]} ${b2[1]}" fill="none" stroke="${esc(color)}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }

    function offsetPts(o,off) {
      const dx=o.x2-o.x1,dy=o.y2-o.y1,len=Math.hypot(dx,dy)||1;
      const nx=-dy/len,ny=dx/len;

      return [
        o.x1+nx*off,o.y1+ny*off,
        o.x2+nx*off,o.y2+ny*off
      ];
    }

    function slashSvg(o) {
      const mx=(o.x1+o.x2)/2,my=(o.y1+o.y2)/2;
      const a=Math.atan2(o.y2-o.y1,o.x2-o.x1);
      const dx=Math.cos(a+1.05)*12;
      const dy=Math.sin(a+1.05)*12;

      return svgLine(mx-dx,my-dy,mx+dx,my+dy,o);
    }

    function labelToSvg(o) {
      if (!o.showLabel || !o.label || !objectSupportsLabel(o)) return '';

      const p = getLabelPosition(o);
      const fontSize = o.kind === 'symbol'
        ? Math.max(13, Math.min(20, o.size * 0.45))
        : 16;
      return `<g class="player-label">
    <text x="${p.x}" y="${p.y+fontSize*0.34}" text-anchor="middle"
          font-family="Arial" font-size="${fontSize}" font-weight="700" fill="#111111">${esc(o.label)}</text>
  </g>`;
    }

    function objectToSvg(o,index) {
      const sw=o.width;
      const col=esc(o.color);

      if (o.kind === 'symbol') {
        const s=o.size;
        const x=o.x;
        const y=o.y;
        const rot=o.rotation || 0;

        const open = `<g transform="translate(${x} ${y}) rotate(${rot})">`;
        const close = `</g>`;

        if (o.type === 'attacker' || o.type === 'attackerBall') {
          const clipId = `attackerClip${index}`;
          const ballSvg = o.type === 'attackerBall'
            ? `<circle cx="${s*.36}" cy="${-s*.36}" r="${Math.max(3,s*.12)}" fill="#111111"/>`
            : '';
          return `
  <defs>
    <clipPath id="${clipId}">
      <path d="M 0 ${-s*.55} L ${-s*.48} ${s*.42} L ${s*.48} ${s*.42} Z"/>
    </clipPath>
  </defs>
  ${open}
    <path d="M 0 ${-s*.55} L ${-s*.48} ${s*.42} L ${s*.48} ${s*.42} Z"
          fill="white" stroke="${col}" stroke-width="${sw}" stroke-linejoin="round"/>
    <rect x="${-s}" y="${-s}" width="${2*s}" height="${s}"
          fill="${col}" clip-path="url(#${clipId})"/>
    ${ballSvg}
  ${close}
  ${labelToSvg(o)}`;
        }

        if (o.type === 'feeder') {
          return `${open}
    <path d="M 0 ${-s*.55} L ${-s*.48} ${s*.42} L ${s*.48} ${s*.42} Z" fill="${col}"/>
  ${close}`;
        }

        if (o.type === 'defender') {
          return `${open}
    <circle cx="0" cy="0" r="${s*.42}" fill="white" stroke="${col}" stroke-width="${sw}"/>
    <path d="M ${-s*.42} 0 A ${s*.42} ${s*.42} 0 0 1 ${s*.42} 0 L ${-s*.42} 0 Z" fill="${col}"/>
  ${close}
  ${labelToSvg(o)}`;
        }

        if (o.type === 'goalkeeper') {
          return `${open}
    <path d="M ${-s*.62} 0 L ${-s*.42} 0 M ${s*.42} 0 L ${s*.62} 0"
          fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>
    <circle cx="0" cy="0" r="${s*.42}" fill="white" stroke="${col}" stroke-width="${sw}"/>
    <path d="M ${-s*.42} 0 A ${s*.42} ${s*.42} 0 0 1 ${s*.42} 0 L ${-s*.42} 0 Z" fill="${col}"/>
  ${close}`;
        }

        if (o.type === 'ball') {
          const r=s*.43;
          const pent = [];
          for (let i=0;i<5;i++) {
            const a=-Math.PI/2+i*Math.PI*2/5;
            pent.push([Math.cos(a)*r*.38,Math.sin(a)*r*.38]);
          }
          const outerAngles=[-108,-36,36,108,180];
          const rim=outerAngles.map(a => {
            const ar=a*Math.PI/180;
            return [Math.cos(ar)*r*.88,Math.sin(ar)*r*.88];
          });
          const pentPts=pent.map(p=>`${p[0]},${p[1]}`).join(' ');
          const rimPts=rim.map(p=>`${p[0]},${p[1]}`).join(' ');
          const seams=pent.map((p,i)=>`M ${p[0]} ${p[1]} L ${rim[i][0]} ${rim[i][1]}`).join(' ');
          return `${open}
    <circle cx="0" cy="0" r="${r}" fill="#fff" stroke="#222" stroke-width="${Math.max(1.5,sw*.75)}"/>
    <polygon points="${pentPts}" fill="#222"/>
    <path d="${seams}" fill="none" stroke="#222" stroke-width="${Math.max(1.15,s*.035)}"/>
    <polygon points="${rimPts}" fill="none" stroke="#777" stroke-width="${Math.max(.8,s*.025)}"/>
  ${close}`;
        }

        if (o.type === 'coach') {
          return `${open}
    <text x="0" y="${s*.34}" text-anchor="middle" font-family="Arial" font-weight="800" font-size="${s*1.05}" fill="${col}">T</text>
  ${close}`;
        }

        if (o.type === 'cone') {
          return `${open}
    <g transform="scale(${s/48}) translate(-24 -24)">
      <path fill="${col}" d="M36.258,28.837c0,0-0.11-0.837-1.257-0.837c-0.216,0-2.392,0-3.719,0c0.798,2.671,1.497,5.135,1.497,5.279c0,2.387-3.401,3.393-8.917,3.393c-5.515,0-8.651-0.94-8.651-3.326c0-0.167,0.998-2.692,1.791-5.346c-1.591,0-3.863,0-4.063,0c-0.806,0-0.937,0.749-0.937,0.749L8.159,40.986L8.815,42h30.652l0.376-1.014L36.258,28.837z"/>
      <path fill="#ffffff" stroke="${col}" stroke-width="1.3" d="M24.001,6c-1.029,0-1.864,0.179-1.864,0.398c-0.492,1.483-8.122,26.143-8.122,26.774c0,2.388,4.471,3.827,9.985,3.827s9.986-1.439,9.986-3.827c0-0.549-7.614-25.268-8.122-26.774C25.865,6.179,25.031,6,24.001,6L24.001,6z"/>
      <path fill="${col}" d="M33.196,30.447C32.032,32.232,28.341,34,24.046,34c-4.34,0-8.156-1.696-9.281-3.51c-0.499,1.483-0.892,2.647-0.892,3.28c0,2.386,4.533,4.229,10.128,4.229c5.595,0,10.131-1.844,10.131-4.229C34.132,33.222,33.713,31.955,33.196,30.447z"/>
      <path fill="${col}" d="M31.387,24.314l-2.074-6.794c0,0-1.857,1.479-5.311,1.479c-3.453,0-5.316-1.479-5.316-1.479l-2.081,6.806c0,0,2.068,2.674,7.397,2.674C29.375,27,31.387,24.314,31.387,24.314z"/>
      <path fill="${col}" d="M27.241,10.809l-1.376-4.41c0,0-0.083-0.398-1.864-0.398c-1.844,0-1.864,0.398-1.864,0.398l-1.376,4.407c0,0,0.885,1.194,3.239,1.194C26.355,12,27.241,10.809,27.241,10.809z"/>
    </g>
  ${close}`;
        }

        if (o.type === 'ring') {
          return `${open}
    <ellipse cx="0" cy="0" rx="${s*.48}" ry="${s*.24}" fill="none" stroke="${col}" stroke-width="${sw}"/>
  ${close}`;
        }

        if (o.type === 'disc') {
          return `${open}
    <ellipse cx="0" cy="0" rx="${s*.48}" ry="${s*.24}" fill="${col}" stroke="${col}" stroke-width="${sw}"/>
  ${close}`;
        }

        if (o.type === 'airbody') {
          const h=s*1.38, w=s*.56;
          return `${open}
    <path d="M ${-w*.08} ${-h*.72}
             C ${-w*.20} ${-h*.72}, ${-w*.28} ${-h*.62}, ${-w*.28} ${-h*.52}
             C ${-w*.28} ${-h*.43}, ${-w*.23} ${-h*.35}, ${-w*.15} ${-h*.31}
             L ${-w*.18} ${-h*.22}
             C ${-w*.42} ${-h*.19}, ${-w*.54} ${-h*.03}, ${-w*.54} ${h*.16}
             L ${-w*.52} ${h*.36}
             C ${-w*.50} ${h*.62}, ${-w*.42} ${h*.80}, ${-w*.28} ${h*.98}
             L ${w*.28} ${h*.98}
             C ${w*.42} ${h*.80}, ${w*.50} ${h*.62}, ${w*.52} ${h*.36}
             L ${w*.54} ${h*.16}
             C ${w*.54} ${-h*.03}, ${w*.42} ${-h*.19}, ${w*.18} ${-h*.22}
             L ${w*.15} ${-h*.31}
             C ${w*.23} ${-h*.35}, ${w*.28} ${-h*.43}, ${w*.28} ${-h*.52}
             C ${w*.28} ${-h*.62}, ${w*.20} ${-h*.72}, ${w*.08} ${-h*.72}
             C ${w*.03} ${-h*.75}, ${-w*.03} ${-h*.75}, ${-w*.08} ${-h*.72} Z"
          fill="${col}" stroke="#1f1f1f" stroke-width="${Math.max(1.4,sw)}"
          stroke-linejoin="round" stroke-linecap="round"/>
  ${close}`;
        }

        if (o.type === 'bench') {
          const w=s*2.25, h=s*.48;
          return `${open}
    <rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="${Math.max(3,s*.10)}"
          fill="${col}" stroke="#6f4a28" stroke-width="${Math.max(2,sw)}"/>
  ${close}`;
        }

        if (o.type === 'mat') {
          const w=s*1.65, h=s*.92;
          return `${open}
    <rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="${Math.max(4,s*.12)}"
          fill="${col}" stroke="#1f5f89" stroke-width="${Math.max(2,sw)}"/>
    <line x1="${-w*.40}" y1="${h*.30}" x2="${w*.40}" y2="${h*.30}"
          stroke="#ffffff" stroke-opacity=".65" stroke-width="1.5"/>
  ${close}`;
        }

        if (o.type === 'crashMat') {
          const w=s*2.05, h=s*1.28;
          return `${open}
    <rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="${Math.max(5,s*.15)}"
          fill="${col}" stroke="#184d77" stroke-width="${Math.max(2.5,sw)}"/>
    <rect x="${-w*.40}" y="${-h*.32}" width="${w*.80}" height="${h*.64}"
          fill="none" stroke="#8dc7ed" stroke-width="1.5"/>
    <path d="M ${-w*.40} ${-h*.32} L ${w*.40} ${h*.32} M ${w*.40} ${-h*.32} L ${-w*.40} ${h*.32}"
          fill="none" stroke="#8dc7ed" stroke-opacity=".7" stroke-width="1"/>
  ${close}`;
        }
      }

      else if (o.kind === 'freehand') {
        if (!Array.isArray(o.points) || o.points.length < 2) return '';
        return `<polyline points="${svgPoints(o.points)}" fill="none"
                 stroke="${col}" stroke-width="${sw}"
                 stroke-linecap="round" stroke-linejoin="round"/>`;
      }

      else {
        let r='';

        if (isMultiPointPath(o)) {
          const base=basePathType(o);
          const centerPts = sampledMultiPathPoints(o, 18);

          if (base === 'run') {
            r = svgPolylineFromPoints(centerPts, col, sw)
              + svgArrowFromPoints(centerPts,14,o.color,true);
          }

          if (base === 'runBall') {
            r = svgPolylineFromPoints(offsetSampledPoints(centerPts,-3.25), col, sw)
              + svgPolylineFromPoints(offsetSampledPoints(centerPts,3.25), col, sw, 'stroke-dasharray="7 5"')
              + svgArrowFromPoints(centerPts,15,o.color,true);
          }

          if (base === 'screen') {
            r = svgPolylineFromPoints(centerPts, col, sw);
            if (centerPts.length >= 2) {
              r += svgScreenTick(
                centerPts[0].x,
                centerPts[0].y,
                centerPts[1].x-centerPts[0].x,
                centerPts[1].y-centerPts[0].y,
                21.6,
                o.color,
                o.width
              );
            }
          }

          return r + labelToSvg(o);
        }

        if (isComplexPath(o)) {
          const base=basePathType(o);

          if (base === 'run') {
            r = svgCurvePath(o) + svgCurveArrow(o,14);
          }

          if (base === 'pass' || base === 'passFake') {
            r = svgCurvePath(o,'stroke-dasharray="8 6"') + svgCurveArrow(o,12);
            if (base === 'passFake') r += svgCurveSlash(o);
          }

          if (base === 'runBall') {
            r = svgCurvePolyline(o,-3.25)
              + svgCurvePolyline(o,3.25,'stroke-dasharray="7 5"')
              + svgCurveArrow(o,15);
          }

          if (base === 'tip') {
            const pts=sampledCurvePoints(o,40,3.25);
            const mid=Math.floor(pts.length/2);
            const tan=bezierTangent(o,.5), len=Math.hypot(tan.x,tan.y)||1;
            const nx=-tan.y/len, ny=tan.x/len;
            pts[mid]={x:pts[mid].x+nx*13,y:pts[mid].y+ny*13};
            r = svgCurvePolyline(o,-3.25)
              + `<polyline points="${svgPoints(pts)}" fill="none" stroke="${col}" stroke-width="${sw}"
                   stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="7 5"/>`
              + svgCurveArrow(o,15);
          }

          if (base === 'dribble') {
            const pts=[];
            const steps=70;
            for(let i=0;i<=steps;i++) {
              const t=i/steps, p=bezierPoint(o,t), tan=bezierTangent(o,t);
              const len=Math.hypot(tan.x,tan.y)||1, nx=-tan.y/len, ny=tan.x/len;
              const amp=Math.sin(t*Math.PI*10)*9;
              pts.push({x:p.x+nx*amp,y:p.y+ny*amp});
            }
            r = `<polyline points="${svgPoints(pts)}" fill="none" stroke="${col}" stroke-width="${sw}"
                   stroke-linecap="round" stroke-linejoin="round"/>`
              + svgCurveArrow(o,12);
          }

          if (base === 'shot' || base === 'shotFake') {
            r = svgCurvePolyline(o,-3)
              + svgCurvePolyline(o,3)
              + svgCurveRoof(o,8,20);
            if (base === 'shotFake') r += svgCurveSlash(o);
          }

          if (base === 'screen') {
            const tan = bezierTangent(o,0);
            r = svgCurvePath(o)
              + svgScreenTick(o.x1, o.y1, tan.x, tan.y, 21.6, o.color, o.width);
          }

          return r + labelToSvg(o);
        }

        if (o.type === 'run') {
          r = svgLine(o.x1,o.y1,o.x2,o.y2,o)
            + svgArrow(o.x1,o.y1,o.x2,o.y2,14,o.color,true);
        }


        if (o.type === 'pass' || o.type === 'passFake') {
          r = svgLine(o.x1,o.y1,o.x2,o.y2,o,'stroke-dasharray="8 6"')
            + svgArrow(o.x1,o.y1,o.x2,o.y2,12,o.color,true);

          if (o.type === 'passFake') r += slashSvg(o);
        }

        if (o.type === 'runBall') {
          const laneOffset=3.25;
          const a=offsetPts(o,-laneOffset), b=offsetPts(o,laneOffset);

          r = svgLine(...a,o)
            + svgLine(...b,o,'stroke-dasharray="7 5"')
            + svgArrow(o.x1,o.y1,o.x2,o.y2,15,o.color,true);
        }

        if (o.type === 'tip') {
          const laneOffset=3.25;
          const a=offsetPts(o,-laneOffset);

          r = svgLine(...a,o);

          const dx=o.x2-o.x1,dy=o.y2-o.y1,len=Math.hypot(dx,dy)||1;
          const nx=-dy/len,ny=dx/len;

          const pt=t => [o.x1+dx*t+nx*laneOffset,o.y1+dy*t+ny*laneOffset];

          const p0=pt(0),p1=pt(.38);
          const p2=[o.x1+dx*.5+nx*(laneOffset+13),o.y1+dy*.5+ny*(laneOffset+13)];
          const p3=pt(.62),p4=pt(1);

          r += `<polyline points="${p0} ${p1} ${p2} ${p3} ${p4}"
                fill="none" stroke="${col}" stroke-width="${sw}"
                stroke-linecap="round" stroke-linejoin="round"
                stroke-dasharray="7 5"/>`
            + svgArrow(o.x1,o.y1,o.x2,o.y2,15,o.color,true);
        }

        if (o.type === 'dribble') {
          const dx=o.x2-o.x1,dy=o.y2-o.y1,len=Math.hypot(dx,dy)||1;
          const nx=-dy/len,ny=dx/len;
          const waves=Math.max(2,Math.round(len/35));
          const seg=1/(waves*2);

          let d=`M ${o.x1} ${o.y1}`;

          for(let i=1;i<=waves*2;i++) {
            const t=i*seg;
            const prev=(i-1)*seg;
            const tm=(prev+t)/2;
            const amp=(i%2?10:-10);

            d += ` Q ${o.x1+dx*tm+nx*amp} ${o.y1+dy*tm+ny*amp} ${o.x1+dx*t} ${o.y1+dy*t}`;
          }

          r = `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>`
            + svgArrow(o.x1,o.y1,o.x2,o.y2,12,o.color,true);
        }

        if (o.type === 'shot' || o.type === 'shotFake') {
          const laneOffset=3;
          const a=offsetPts(o,-laneOffset), b=offsetPts(o,laneOffset);

          r = svgLine(...a,o)
            + svgLine(...b,o);

          const angle=Math.atan2(o.y2-o.y1,o.x2-o.x1);
          const ux=Math.cos(angle), uy=Math.sin(angle);
          const nx=-uy, ny=ux;
          const tipLen=20, baseHalf=8;

          const tip=[o.x2+ux*tipLen,o.y2+uy*tipLen];
          const b1=[o.x2+nx*baseHalf,o.y2+ny*baseHalf];
          const b2=[o.x2-nx*baseHalf,o.y2-ny*baseHalf];

          r += `<path d="M ${b1[0]} ${b1[1]} L ${tip[0]} ${tip[1]} L ${b2[0]} ${b2[1]}"
                     fill="none" stroke="${col}" stroke-width="${sw}"
                     stroke-linecap="round" stroke-linejoin="round"/>`;

          if (o.type === 'shotFake') r += slashSvg(o);
        }

        if (o.type === 'screen') {
          r = svgLine(o.x1,o.y1,o.x2,o.y2,o)
            + svgScreenTick(o.x1, o.y1, o.x2-o.x1, o.y2-o.y1, 21.6, o.color, o.width);
        }

        return r + labelToSvg(o);
      }

      return '';
    }

    function svgCourt() {
      const courtSettings = getCourtSettings();
      if (courtSettings.mode === 'none') return '';

      const colors = courtThemes[courtSettings.theme] || courtThemes.gray;
      const r = courtRect(courtSettings.mode);
      const rot = courtSettings.rotation || 0;
      const rcx = r.x + r.w / 2;
      const rcy = r.y + r.h / 2;
      const rotateOpen = `<g id="court-background" transform="rotate(${rot} ${rcx} ${rcy})">`;
      const rotateClose = `</g>`;

      if (courtSettings.mode === 'half') {
        const cx = r.x + r.w / 2;
        const goalY = r.y;
        const scale = r.w / 20;
        const goalW = r.w * (3 / 20); // 3 m goal on a 20 m goal line, centered
        const six = 6 * scale;
        const nine = 9 * scale;
        const segHalf = 1.5 * scale;
        const radius = Math.hypot(r.w / 2, r.h) + 4;
        const clipId = `halfCourtClip_${Math.round(r.x)}_${Math.round(r.y)}_${Math.round(r.w)}`;

        const sectorColors = [
          colors.sector[0],
          colors.sector[1],
          colors.sector[2],
          colors.sector[3],
          colors.sector[4],
          colors.sector[5]
        ];

        const totalAngle = Math.PI;
        const baseStep = totalAngle / 6;
        const outerStep = baseStep * 1.05;
        const middleStep = baseStep * 0.80;
        const adjacentStep = (totalAngle - 2 * outerStep - 2 * middleStep) / 2;
        const sectorSteps = [outerStep, adjacentStep, middleStep, middleStep, adjacentStep, outerStep];

        let s = `<defs><clipPath id="${clipId}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/></clipPath></defs>
  ${rotateOpen}
  <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${colors.floor}"/>
  <g clip-path="url(#${clipId})">`;

        let angleCursor = 0;
        for (let i = 0; i < 6; i++) {
          const a1 = angleCursor;
          const a2 = angleCursor + sectorSteps[i];
          const x1 = cx + radius * Math.cos(a1);
          const y1 = goalY + radius * Math.sin(a1);
          const x2 = cx + radius * Math.cos(a2);
          const y2 = goalY + radius * Math.sin(a2);
          const large = (a2 - a1) > Math.PI ? 1 : 0;

          s += `<path d="M ${cx} ${goalY} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z"
                    fill="${sectorColors[i]}" fill-opacity="${courtSettings.sectorOpacity}"/>`;
          angleCursor = a2;
        }

        s += `</g>
  <g clip-path="url(#${clipId})">
  <path d="M ${cx-segHalf-nine} ${goalY}
           A ${nine} ${nine} 0 0 0 ${cx-segHalf} ${goalY+nine}
           L ${cx+segHalf} ${goalY+nine}
           A ${nine} ${nine} 0 0 0 ${cx+segHalf+nine} ${goalY}
           L ${cx-segHalf-nine} ${goalY}
           Z
           M ${cx-segHalf-six} ${goalY}
           A ${six} ${six} 0 0 0 ${cx-segHalf} ${goalY+six}
           L ${cx+segHalf} ${goalY+six}
           A ${six} ${six} 0 0 0 ${cx+segHalf+six} ${goalY}
           L ${cx-segHalf-six} ${goalY}
           Z"
        fill="${colors.area2}" fill-opacity="0.55" fill-rule="evenodd"/>
  </g>
  <path d="M ${cx-segHalf-six} ${goalY}
           A ${six} ${six} 0 0 0 ${cx-segHalf} ${goalY+six}
           L ${cx+segHalf} ${goalY+six}
           A ${six} ${six} 0 0 0 ${cx+segHalf+six} ${goalY}
           L ${cx-segHalf-six} ${goalY}
           Z" fill="${colors.area}"/>
  <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="${colors.line}" stroke-width="3"/>
  <path d="M ${cx-segHalf-six} ${goalY}
           A ${six} ${six} 0 0 0 ${cx-segHalf} ${goalY+six}
           L ${cx+segHalf} ${goalY+six}
           A ${six} ${six} 0 0 0 ${cx+segHalf+six} ${goalY}"
        fill="none" stroke="${colors.line}" stroke-width="3"/>
  <g clip-path="url(#${clipId})">
  <path d="M ${cx-segHalf-nine} ${goalY}
           A ${nine} ${nine} 0 0 0 ${cx-segHalf} ${goalY+nine}
           L ${cx+segHalf} ${goalY+nine}
           A ${nine} ${nine} 0 0 0 ${cx+segHalf+nine} ${goalY}"
        fill="none" stroke="${colors.line}" stroke-width="2.5" stroke-dasharray="10 8"/>
  </g>
  <line x1="${cx-12}" y1="${goalY+7*scale}" x2="${cx+12}" y2="${goalY+7*scale}" stroke="${colors.line}" stroke-width="3"/>
  <line x1="${cx-7}" y1="${goalY+4*scale}" x2="${cx+7}" y2="${goalY+4*scale}" stroke="${colors.line}" stroke-width="3"/>
  <rect x="${cx-goalW/2}" y="${goalY-18}" width="${goalW}" height="18" fill="white" stroke="${colors.goal}" stroke-width="4"/>
  ${rotateClose}`;
        return s;
      }

      const scale = r.h / 20;
      const left = r.x;
      const right = r.x + r.w;
      const cy = r.y + r.h / 2;
      const centerX = r.x + r.w / 2;
      const goalW = r.h * (3 / 20); // 3 m goal on a 20 m goal line, centered
      const six = 6 * scale;
      const nine = 9 * scale;
      const segHalf = 1.5 * scale;

      const fullClipId = `fullCourtClip_${Math.round(r.x)}_${Math.round(r.y)}_${Math.round(r.w)}_${Math.round(r.h)}`;

      return `<defs><clipPath id="${fullClipId}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/></clipPath></defs>
  ${rotateOpen}
  <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${colors.floor}"/>
  <g clip-path="url(#${fullClipId})">
  <path d="M ${left} ${cy-segHalf-nine}
           A ${nine} ${nine} 0 0 1 ${left+nine} ${cy-segHalf}
           L ${left+nine} ${cy+segHalf}
           A ${nine} ${nine} 0 0 1 ${left} ${cy+segHalf+nine}
           L ${left} ${cy-segHalf-nine}
           Z
           M ${left} ${cy-segHalf-six}
           A ${six} ${six} 0 0 1 ${left+six} ${cy-segHalf}
           L ${left+six} ${cy+segHalf}
           A ${six} ${six} 0 0 1 ${left} ${cy+segHalf+six}
           L ${left} ${cy-segHalf-six}
           Z"
        fill="${colors.area2}" fill-opacity="0.55" fill-rule="evenodd"/>
  <path d="M ${right} ${cy-segHalf-nine}
           A ${nine} ${nine} 0 0 0 ${right-nine} ${cy-segHalf}
           L ${right-nine} ${cy+segHalf}
           A ${nine} ${nine} 0 0 0 ${right} ${cy+segHalf+nine}
           L ${right} ${cy-segHalf-nine}
           Z
           M ${right} ${cy-segHalf-six}
           A ${six} ${six} 0 0 0 ${right-six} ${cy-segHalf}
           L ${right-six} ${cy+segHalf}
           A ${six} ${six} 0 0 0 ${right} ${cy+segHalf+six}
           L ${right} ${cy-segHalf-six}
           Z"
        fill="${colors.area2}" fill-opacity="0.55" fill-rule="evenodd"/>
  </g>
  <path d="M ${left} ${cy-segHalf-six}
           A ${six} ${six} 0 0 1 ${left+six} ${cy-segHalf}
           L ${left+six} ${cy+segHalf}
           A ${six} ${six} 0 0 1 ${left} ${cy+segHalf+six}
           Z" fill="${colors.area}"/>
  <path d="M ${right} ${cy-segHalf-six}
           A ${six} ${six} 0 0 0 ${right-six} ${cy-segHalf}
           L ${right-six} ${cy+segHalf}
           A ${six} ${six} 0 0 0 ${right} ${cy+segHalf+six}
           Z" fill="${colors.area}"/>
  <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="${colors.line}" stroke-width="3"/>
  <line x1="${centerX}" y1="${r.y}" x2="${centerX}" y2="${r.y+r.h}" stroke="${colors.line}" stroke-width="3"/>
  <circle cx="${centerX}" cy="${cy}" r="${2*scale}" fill="${colors.area2}" stroke="${colors.center}" stroke-width="3"/>
  <path d="M ${left} ${cy-segHalf-six}
           A ${six} ${six} 0 0 1 ${left+six} ${cy-segHalf}
           L ${left+six} ${cy+segHalf}
           A ${six} ${six} 0 0 1 ${left} ${cy+segHalf+six}"
        fill="none" stroke="${colors.line}" stroke-width="3"/>
  <path d="M ${right} ${cy-segHalf-six}
           A ${six} ${six} 0 0 0 ${right-six} ${cy-segHalf}
           L ${right-six} ${cy+segHalf}
           A ${six} ${six} 0 0 0 ${right} ${cy+segHalf+six}"
        fill="none" stroke="${colors.line}" stroke-width="3"/>
  <g clip-path="url(#${fullClipId})">
  <path d="M ${left} ${cy-segHalf-nine}
           A ${nine} ${nine} 0 0 1 ${left+nine} ${cy-segHalf}
           L ${left+nine} ${cy+segHalf}
           A ${nine} ${nine} 0 0 1 ${left} ${cy+segHalf+nine}"
        fill="none" stroke="${colors.line}" stroke-width="2.5" stroke-dasharray="10 8"/>
  <path d="M ${right} ${cy-segHalf-nine}
           A ${nine} ${nine} 0 0 0 ${right-nine} ${cy-segHalf}
           L ${right-nine} ${cy+segHalf}
           A ${nine} ${nine} 0 0 0 ${right} ${cy+segHalf+nine}"
        fill="none" stroke="${colors.line}" stroke-width="2.5" stroke-dasharray="10 8"/>
  </g>
  <line x1="${left+7*scale}" y1="${cy-12}" x2="${left+7*scale}" y2="${cy+12}" stroke="${colors.line}" stroke-width="3"/>
  <line x1="${right-7*scale}" y1="${cy-12}" x2="${right-7*scale}" y2="${cy+12}" stroke="${colors.line}" stroke-width="3"/>
  <line x1="${left+4*scale}" y1="${cy-7}" x2="${left+4*scale}" y2="${cy+7}" stroke="${colors.line}" stroke-width="3"/>
  <line x1="${right-4*scale}" y1="${cy-7}" x2="${right-4*scale}" y2="${cy+7}" stroke="${colors.line}" stroke-width="3"/>
  <rect x="${left-18}" y="${cy-goalW/2}" width="18" height="${goalW}" fill="white" stroke="${colors.goal}" stroke-width="4"/>
  <rect x="${right}" y="${cy-goalW/2}" width="18" height="${goalW}" fill="white" stroke="${colors.goal}" stroke-width="4"/>
  ${rotateClose}`;
    }

    return { objectToSvg, svgCourt };
  }

  global.HandballSvgRenderer = { createSvgRenderer };
})(window);
