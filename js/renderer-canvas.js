(function (global) {
  'use strict';

  // Dependencies keep editor state and interaction code outside the renderer.
  function createCanvasRenderer({
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
    sampledMidAndTangent
  }) {
    function sampledArrowHead(c, pts, size=12, filled=true) {
      if (!pts || pts.length < 2) return;
      const p1 = pts[pts.length - 2];
      const p2 = pts[pts.length - 1];
      arrowHead(c,p1.x,p1.y,p2.x,p2.y,size,filled);
    }

    function drawScreenTick(c, mx, my, dx, dy, tickLength=21.6, width=2.2) {
      const len = Math.hypot(dx,dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const half = tickLength / 2;
      c.save();
      c.lineWidth = width;
      c.beginPath();
      c.moveTo(mx - nx * half, my - ny * half);
      c.lineTo(mx + nx * half, my + ny * half);
      c.stroke();
      c.restore();
    }

    function drawScreenTickFromPoints(c, pts, tickLength=21.6, width=2.2) {
      if (!pts || pts.length < 2) return;
      const mid = sampledMidAndTangent(pts);
      drawScreenTick(c, mid.x, mid.y, mid.dx, mid.dy, tickLength, width);
    }

    function strokePoints(c, pts) {
      if (!pts.length) return;
      c.beginPath();
      c.moveTo(pts[0].x,pts[0].y);
      for (let i=1;i<pts.length;i++) c.lineTo(pts[i].x,pts[i].y);
      c.stroke();
    }

    function curveArrowHead(c,o,size=12,filled=true) {
      const tan = bezierTangent(o,1);
      arrowHead(c,o.x2-tan.x,o.y2-tan.y,o.x2,o.y2,size,filled);
    }

    function curveSlash(c,o) {
      const p = bezierPoint(o,.5);
      const tan = bezierTangent(o,.5);
      const len = Math.hypot(tan.x,tan.y)||1;
      const ux=tan.x/len, uy=tan.y/len;
      const nx=-uy, ny=ux;
      const dx = ux*7 + nx*10;
      const dy = uy*7 + ny*10;
      c.beginPath();
      c.moveTo(p.x-dx,p.y-dy);
      c.lineTo(p.x+dx,p.y+dy);
      c.stroke();
    }

    function curveRoof(c,o,baseHalf=8,tipLen=20) {
      const tan = bezierTangent(o,1);
      const len = Math.hypot(tan.x,tan.y)||1;
      const ux=tan.x/len, uy=tan.y/len;
      const nx=-uy, ny=ux;
      const tipX=o.x2+ux*tipLen, tipY=o.y2+uy*tipLen;
      c.beginPath();
      c.moveTo(o.x2+nx*baseHalf,o.y2+ny*baseHalf);
      c.lineTo(tipX,tipY);
      c.lineTo(o.x2-nx*baseHalf,o.y2-ny*baseHalf);
      c.stroke();
    }

    function arrowHead(c,x1,y1,x2,y2,size=11,filled=true) {
      // x2/y2 is the CENTER OF THE ARROW BASE.
      // The arrow tip extends beyond the end of the line.
      const a=Math.atan2(y2-y1,x2-x1);
      const ux=Math.cos(a), uy=Math.sin(a);
      const nx=-uy, ny=ux;

      const halfBase=size*.55;
      const tipX=x2+ux*size;
      const tipY=y2+uy*size;

      const b1x=x2+nx*halfBase;
      const b1y=y2+ny*halfBase;
      const b2x=x2-nx*halfBase;
      const b2y=y2-ny*halfBase;

      c.beginPath();
      c.moveTo(b1x,b1y);
      c.lineTo(tipX,tipY);
      c.lineTo(b2x,b2y);

      if (filled) {
        c.closePath();
        c.fill();
      } else {
        c.stroke();
      }
    }

    function lineLocal(c,x1,y1,x2,y2,offset) {
      const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1;
      const nx=-dy/len,ny=dx/len;

      c.beginPath();
      c.moveTo(x1+nx*offset,y1+ny*offset);
      c.lineTo(x2+nx*offset,y2+ny*offset);
      c.stroke();
    }

    function slash(c,x1,y1,x2,y2) {
      const mx=(x1+x2)/2,my=(y1+y2)/2;
      const a=Math.atan2(y2-y1,x2-x1);
      const dx=Math.cos(a+1.05)*12;
      const dy=Math.sin(a+1.05)*12;

      c.beginPath();
      c.moveTo(mx-dx,my-dy);
      c.lineTo(mx+dx,my+dy);
      c.stroke();
    }

    function drawObjectLabel(c,o) {
      if (!o.showLabel || !o.label || !objectSupportsLabel(o)) return;

      const p = getLabelPosition(o);
      const fontSize = o.kind === 'symbol'
        ? Math.max(13, Math.min(20, o.size * 0.45))
        : 16;

      c.save();
      c.font = `700 ${fontSize}px Arial`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';

      // Transparent label background: draw text only.
      c.fillStyle = '#111111';
      c.fillText(o.label, p.x, p.y+0.5);
      c.restore();
    }

    function drawObject(c,o) {
      c.save();
      c.strokeStyle=o.color;
      c.fillStyle=o.color;
      c.lineWidth=o.width;
      c.lineCap='round';
      c.lineJoin='round';

      if (o.kind === 'symbol') {
        c.translate(o.x,o.y);
        c.rotate((o.rotation || 0) * Math.PI / 180);

        const s=o.size;

        if (o.type === 'attacker' || o.type === 'attackerBall') {
          // Halb gefülltes Dreieck: obere Hälfte weiß, untere Hälfte schwarz.
          c.save();

          c.beginPath();
          c.moveTo(0,-s*.55);
          c.lineTo(-s*.48,s*.42);
          c.lineTo(s*.48,s*.42);
          c.closePath();
          c.clip();

          c.fillStyle=o.color;
          c.fillRect(-s,-s,s*2,s);

          c.fillStyle='#fff';
          c.fillRect(-s,0,s*2,s);

          c.restore();

          c.beginPath();
          c.moveTo(0,-s*.55);
          c.lineTo(-s*.48,s*.42);
          c.lineTo(s*.48,s*.42);
          c.closePath();
          c.stroke();
          if (o.type === 'attackerBall') {
            c.save();
            c.fillStyle = '#111111';
            c.beginPath();
            c.arc(s*.36,-s*.36,Math.max(3,s*.12),0,Math.PI*2);
            c.fill();
            c.restore();
          }
        }

        else if (o.type === 'feeder') {
          c.beginPath();
          c.moveTo(0,-s*.55);
          c.lineTo(-s*.48,s*.42);
          c.lineTo(s*.48,s*.42);
          c.closePath();
          c.fill();
        }

        else if (o.type === 'defender') {
          c.beginPath();
          c.arc(0,0,s*.42,0,Math.PI*2);
          c.fillStyle='#fff';
          c.fill();
          c.stroke();

          c.beginPath();
          c.arc(0,0,s*.42,Math.PI,0);
          c.lineTo(s*.42,0);
          c.lineTo(-s*.42,0);
          c.closePath();

          c.fillStyle=o.color;
          c.fill();
        }

        else if (o.type === 'goalkeeper') {
          c.beginPath();
          c.moveTo(-s*.62,0);
          c.lineTo(-s*.42,0);
          c.moveTo(s*.42,0);
          c.lineTo(s*.62,0);
          c.strokeStyle=o.color;
          c.stroke();

          c.beginPath();
          c.arc(0,0,s*.42,0,Math.PI*2);
          c.fillStyle='#fff';
          c.fill();
          c.stroke();

          c.beginPath();
          c.arc(0,0,s*.42,Math.PI,0);
          c.lineTo(s*.42,0);
          c.lineTo(-s*.42,0);
          c.closePath();

          c.fillStyle=o.color;
          c.fill();
        }

        else if (o.type === 'ball') {
          const r = s * .43;
          c.save();

          c.fillStyle = '#fff';
          c.strokeStyle = '#222';
          c.lineWidth = Math.max(1.5, o.width*.75);
          c.beginPath();
          c.arc(0,0,r,0,Math.PI*2);
          c.fill();
          c.stroke();

          // Central pentagon and surrounding panel seams for a classic football look.
          const pent = [];
          for (let i=0; i<5; i++) {
            const a = -Math.PI/2 + i * Math.PI*2/5;
            pent.push({x:Math.cos(a)*r*.38, y:Math.sin(a)*r*.38});
          }

          c.fillStyle = '#222';
          c.beginPath();
          c.moveTo(pent[0].x,pent[0].y);
          for (let i=1;i<pent.length;i++) c.lineTo(pent[i].x,pent[i].y);
          c.closePath();
          c.fill();

          const outerAngles = [-108,-36,36,108,180];
          c.strokeStyle = '#222';
          c.lineWidth = Math.max(1.15, s*.035);
          pent.forEach((p,i) => {
            const a = outerAngles[i] * Math.PI/180;
            c.beginPath();
            c.moveTo(p.x,p.y);
            c.lineTo(Math.cos(a)*r*.88, Math.sin(a)*r*.88);
            c.stroke();
          });

          // Additional polygon seams suggest the surrounding hexagonal panels.
          c.strokeStyle = '#777';
          c.lineWidth = Math.max(.8, s*.025);
          const rim = outerAngles.map(a => {
            const ar=a*Math.PI/180;
            return {x:Math.cos(ar)*r*.88,y:Math.sin(ar)*r*.88};
          });
          c.beginPath();
          c.moveTo(rim[0].x,rim[0].y);
          for (let i=1;i<rim.length;i++) c.lineTo(rim[i].x,rim[i].y);
          c.closePath();
          c.stroke();

          c.restore();
        }

        else if (o.type === 'coach') {
          c.font=`800 ${s*1.05}px Arial`;
          c.textAlign='center';
          c.textBaseline='middle';
          c.fillText('T',0,s*.04);
        }

        else if (o.type === 'cone') {
          // Pylon based on the uploaded SVG template:
          // colored rings stay in the chosen object color, white rings stay white.
          c.save();
          const k = s / 48;
          c.scale(k, k);
          c.translate(-24, -24);

          const basePath = new Path2D("M36.258,28.837c0,0-0.11-0.837-1.257-0.837c-0.216,0-2.392,0-3.719,0c0.798,2.671,1.497,5.135,1.497,5.279c0,2.387-3.401,3.393-8.917,3.393c-5.515,0-8.651-0.94-8.651-3.326c0-0.167,0.998-2.692,1.791-5.346c-1.591,0-3.863,0-4.063,0c-0.806,0-0.937,0.749-0.937,0.749L8.159,40.986L8.815,42h30.652l0.376-1.014L36.258,28.837z");
          const bodyPath = new Path2D("M24.001,6c-1.029,0-1.864,0.179-1.864,0.398c-0.492,1.483-8.122,26.143-8.122,26.774c0,2.388,4.471,3.827,9.985,3.827s9.986-1.439,9.986-3.827c0-0.549-7.614-25.268-8.122-26.774C25.865,6.179,25.031,6,24.001,6L24.001,6z");
          const ring1 = new Path2D("M33.196,30.447C32.032,32.232,28.341,34,24.046,34c-4.34,0-8.156-1.696-9.281-3.51c-0.499,1.483-0.892,2.647-0.892,3.28c0,2.386,4.533,4.229,10.128,4.229c5.595,0,10.131-1.844,10.131-4.229C34.132,33.222,33.713,31.955,33.196,30.447z");
          const ring2 = new Path2D("M31.387,24.314l-2.074-6.794c0,0-1.857,1.479-5.311,1.479c-3.453,0-5.316-1.479-5.316-1.479l-2.081,6.806c0,0,2.068,2.674,7.397,2.674C29.375,27,31.387,24.314,31.387,24.314z");
          const ring3 = new Path2D("M27.241,10.809l-1.376-4.41c0,0-0.083-0.398-1.864-0.398c-1.844,0-1.864,0.398-1.864,0.398l-1.376,4.407c0,0,0.885,1.194,3.239,1.194C26.355,12,27.241,10.809,27.241,10.809z");

          c.fillStyle = o.color;
          c.fill(basePath);

          c.fillStyle = '#ffffff';
          c.strokeStyle = o.color;
          c.lineWidth = 1.3;
          c.fill(bodyPath);
          c.stroke(bodyPath);

          c.fillStyle = o.color;
          c.fill(ring1);
          c.fill(ring2);
          c.fill(ring3);
          c.restore();
        }

        else if (o.type === 'ring') {
          c.beginPath();
          c.ellipse(0,0,s*.48,s*.24,0,0,Math.PI*2);
          c.stroke();
        }

        else if (o.type === 'disc') {
          c.beginPath();
          c.ellipse(0,0,s*.48,s*.24,0,0,Math.PI*2);
          c.fill();
          c.stroke();
        }

        else if (o.type === 'airbody') {
          c.save();
          c.fillStyle = o.color;
          c.strokeStyle = '#1f1f1f';
          c.lineWidth = Math.max(1.4, o.width);

          const h = s * 1.38;
          const w = s * 0.56;

          c.beginPath();
          c.moveTo(-w*.08, -h*.72);
          c.bezierCurveTo(-w*.20, -h*.72, -w*.28, -h*.62, -w*.28, -h*.52);
          c.bezierCurveTo(-w*.28, -h*.43, -w*.23, -h*.35, -w*.15, -h*.31);
          c.lineTo(-w*.18, -h*.22);
          c.bezierCurveTo(-w*.42, -h*.19, -w*.54, -h*.03, -w*.54, h*.16);
          c.lineTo(-w*.52, h*.36);
          c.bezierCurveTo(-w*.50, h*.62, -w*.42, h*.80, -w*.28, h*.98);
          c.lineTo(w*.28, h*.98);
          c.bezierCurveTo(w*.42, h*.80, w*.50, h*.62, w*.52, h*.36);
          c.lineTo(w*.54, h*.16);
          c.bezierCurveTo(w*.54, -h*.03, w*.42, -h*.19, w*.18, -h*.22);
          c.lineTo(w*.15, -h*.31);
          c.bezierCurveTo(w*.23, -h*.35, w*.28, -h*.43, w*.28, -h*.52);
          c.bezierCurveTo(w*.28, -h*.62, w*.20, -h*.72, w*.08, -h*.72);
          c.bezierCurveTo(w*.03, -h*.75, -w*.03, -h*.75, -w*.08, -h*.72);
          c.closePath();
          c.fill();
          c.stroke();
          c.restore();
        }

        else if (o.type === 'bench') {
          const w = s * 2.25;
          const h = s * 0.48;
          c.save();
          c.fillStyle = o.color;
          c.strokeStyle = '#6f4a28';
          c.lineWidth = Math.max(2, o.width);
          c.beginPath();
          c.roundRect(-w/2, -h/2, w, h, Math.max(3, s*.10));
          c.fill();
          c.stroke();
          c.restore();
        }

        else if (o.type === 'mat') {
          const w = s * 1.65;
          const h = s * 0.92;
          c.save();
          c.fillStyle = o.color;
          c.strokeStyle = '#1f5f89';
          c.lineWidth = Math.max(2, o.width);
          c.beginPath();
          c.roundRect(-w/2, -h/2, w, h, Math.max(4, s*.12));
          c.fill();
          c.stroke();
          c.strokeStyle = 'rgba(255,255,255,.65)';
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(-w*.40, h*.30);
          c.lineTo(w*.40, h*.30);
          c.stroke();
          c.restore();
        }

        else if (o.type === 'crashMat') {
          const w = s * 2.05;
          const h = s * 1.28;
          c.save();
          c.fillStyle = o.color;
          c.strokeStyle = '#184d77';
          c.lineWidth = Math.max(2.5, o.width);
          c.beginPath();
          c.roundRect(-w/2, -h/2, w, h, Math.max(5, s*.15));
          c.fill();
          c.stroke();

          c.strokeStyle = '#8dc7ed';
          c.lineWidth = 1.5;
          c.strokeRect(-w*.40, -h*.32, w*.80, h*.64);
          c.globalAlpha = .65;
          c.beginPath();
          c.moveTo(-w*.40, -h*.32);
          c.lineTo(w*.40, h*.32);
          c.moveTo(w*.40, -h*.32);
          c.lineTo(-w*.40, h*.32);
          c.stroke();
          c.restore();
        }

        c.restore();
      }

      else if (o.kind === 'freehand') {
        if (Array.isArray(o.points) && o.points.length) {
          c.beginPath();
          c.moveTo(o.points[0].x,o.points[0].y);
          for (let i=1;i<o.points.length;i++) c.lineTo(o.points[i].x,o.points[i].y);
          c.stroke();
        }
        c.restore();
      }

      else {
        const {x1,y1,x2,y2}=o;

        if (isMultiPointPath(o)) {
          const base = basePathType(o);
          const centerPts = sampledMultiPathPoints(o, 18);

          if (base === 'run') {
            strokePoints(c, centerPts);
            sampledArrowHead(c, centerPts, 14, true);
          }

          if (base === 'runBall') {
            const laneOffset = 3.25;
            strokePoints(c, offsetSampledPoints(centerPts, -laneOffset));
            c.setLineDash([7,5]);
            strokePoints(c, offsetSampledPoints(centerPts, laneOffset));
            c.setLineDash([]);
            sampledArrowHead(c, centerPts, 15, true);
          }

          if (base === 'screen') {
            strokePoints(c, centerPts);
            if (centerPts.length >= 2) {
              drawScreenTick(
                c,
                centerPts[0].x,
                centerPts[0].y,
                centerPts[1].x-centerPts[0].x,
                centerPts[1].y-centerPts[0].y,
                21.6,
                o.width
              );
            }
          }
        }

        else if (isComplexPath(o)) {
          const base = basePathType(o);

          if (base === 'run') {
            strokePoints(c, sampledCurvePoints(o));
            curveArrowHead(c,o,14,true);
          }

          if (base === 'pass' || base === 'passFake') {
            c.setLineDash([8,6]);
            strokePoints(c, sampledCurvePoints(o));
            c.setLineDash([]);
            curveArrowHead(c,o,12,true);
            if (base === 'passFake') curveSlash(c,o);
          }

          if (base === 'runBall') {
            const laneOffset=3.25;
            strokePoints(c, sampledCurvePoints(o,40,-laneOffset));
            c.setLineDash([7,5]);
            strokePoints(c, sampledCurvePoints(o,40,laneOffset));
            c.setLineDash([]);
            curveArrowHead(c,o,15,true);
          }

          if (base === 'tip') {
            const laneOffset=3.25;
            strokePoints(c, sampledCurvePoints(o,40,-laneOffset));

            const pts=sampledCurvePoints(o,40,laneOffset);
            const mid=Math.floor(pts.length/2);
            const p=pts[mid];
            const tan=bezierTangent(o,.5);
            const len=Math.hypot(tan.x,tan.y)||1;
            const nx=-tan.y/len, ny=tan.x/len;
            pts[mid]={x:p.x+nx*13,y:p.y+ny*13,t:.5};

            c.setLineDash([7,5]);
            strokePoints(c,pts);
            c.setLineDash([]);
            curveArrowHead(c,o,15,true);
          }

          if (base === 'dribble') {
            const pts=[];
            const steps=70;
            for(let i=0;i<=steps;i++) {
              const t=i/steps, p=bezierPoint(o,t), tan=bezierTangent(o,t);
              const len=Math.hypot(tan.x,tan.y)||1;
              const nx=-tan.y/len, ny=tan.x/len;
              const amp=Math.sin(t*Math.PI*10)*9;
              pts.push({x:p.x+nx*amp,y:p.y+ny*amp});
            }
            strokePoints(c,pts);
            curveArrowHead(c,o,12,true);
          }

          if (base === 'shot' || base === 'shotFake') {
            const laneOffset=3;
            strokePoints(c, sampledCurvePoints(o,40,-laneOffset));
            strokePoints(c, sampledCurvePoints(o,40,laneOffset));
            curveRoof(c,o,8,20);
            if (base === 'shotFake') curveSlash(c,o);
          }

          if (base === 'screen') {
            const pts = sampledCurvePoints(o,40,0);
            strokePoints(c, pts);
            const tan = bezierTangent(o,0);
            drawScreenTick(c, o.x1, o.y1, tan.x, tan.y, 21.6, o.width);
          }
        }

        else if (o.type === 'run') {
          c.beginPath();
          c.moveTo(x1,y1);
          c.lineTo(x2,y2);
          c.stroke();
          arrowHead(c,x1,y1,x2,y2,14,true);
        }


        if (o.type === 'pass' || o.type === 'passFake') {
          c.setLineDash([8,6]);
          c.beginPath();
          c.moveTo(x1,y1);
          c.lineTo(x2,y2);
          c.stroke();

          c.setLineDash([]);
          arrowHead(c,x1,y1,x2,y2,12,true);

          if (o.type === 'passFake') slash(c,x1,y1,x2,y2);
        }

        if (o.type === 'runBall') {
          // Beide Linien enden exakt auf der Grundseite des Abschlussdreiecks.
          // Die Linien liegen etwas enger zusammen; das Dreieck überragt beide.
          const laneOffset=3.25;

          lineLocal(c,x1,y1,x2,y2,-laneOffset);

          c.setLineDash([7,5]);
          lineLocal(c,x1,y1,x2,y2,laneOffset);
          c.setLineDash([]);

          arrowHead(c,x1,y1,x2,y2,15,true);
        }

        if (o.type === 'tip') {
          // Durchgezogene und gestrichelte Linie enden am selben Punkt.
          // Der "Tipp"-Knick bleibt in der gestrichelten Linie erhalten.
          const laneOffset=3.25;

          lineLocal(c,x1,y1,x2,y2,-laneOffset);

          const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1;
          const nx=-dy/len,ny=dx/len;
          const m1=.38,m2=.62,depth=13;

          c.setLineDash([7,5]);
          c.beginPath();
          c.moveTo(x1+nx*laneOffset,y1+ny*laneOffset);
          c.lineTo(x1+dx*m1+nx*laneOffset,y1+dy*m1+ny*laneOffset);
          c.lineTo(x1+dx*.5+nx*(laneOffset+depth),y1+dy*.5+ny*(laneOffset+depth));
          c.lineTo(x1+dx*m2+nx*laneOffset,y1+dy*m2+ny*laneOffset);
          c.lineTo(x2+nx*laneOffset,y2+ny*laneOffset);
          c.stroke();
          c.setLineDash([]);

          arrowHead(c,x1,y1,x2,y2,15,true);
        }

        if (o.type === 'dribble') {
          const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1;
          const nx=-dy/len,ny=dx/len;
          const waves=Math.max(2,Math.round(len/35));
          const seg=1/(waves*2);

          c.beginPath();
          c.moveTo(x1,y1);

          for(let i=1;i<=waves*2;i++) {
            const t=i*seg;
            const prev=(i-1)*seg;
            const tm=(prev+t)/2;
            const amp=(i%2?10:-10);

            const cx=x1+dx*tm+nx*amp;
            const cy=y1+dy*tm+ny*amp;

            c.quadraticCurveTo(cx,cy,x1+dx*t,y1+dy*t);
          }

          c.stroke();
          arrowHead(c,x1,y1,x2,y2,12,true);
        }

        if (o.type === 'shot' || o.type === 'shotFake') {
          // Die Doppelspur liegt enger zusammen. Das offene "Dach" überragt
          // beide Linien deutlich und beginnt mit seiner Grundseite am Linienende.
          const laneOffset=3;
          lineLocal(c,x1,y1,x2,y2,-laneOffset);
          lineLocal(c,x1,y1,x2,y2,laneOffset);

          const a=Math.atan2(y2-y1,x2-x1);
          const ux=Math.cos(a), uy=Math.sin(a);
          const nx=-uy, ny=ux;
          const tipLen=20;
          const baseHalf=8;

          const tipX=x2+ux*tipLen;
          const tipY=y2+uy*tipLen;

          c.beginPath();
          c.moveTo(x2+nx*baseHalf,y2+ny*baseHalf);
          c.lineTo(tipX,tipY);
          c.lineTo(x2-nx*baseHalf,y2-ny*baseHalf);
          c.stroke();

          if (o.type === 'shotFake') slash(c,x1,y1,x2,y2);
        }

        if (o.type === 'screen') {
          c.beginPath();
          c.moveTo(x1,y1);
          c.lineTo(x2,y2);
          c.stroke();
          drawScreenTick(c, x1, y1, x2-x1, y2-y1, 21.6, o.width);
        }

        c.restore();
      }

      drawObjectLabel(c,o);

    }

    return { drawObject };
  }

  global.HandballCanvasRenderer = { createCanvasRenderer };
})(window);
