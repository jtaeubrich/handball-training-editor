(function (global) {
  'use strict';

  function rotatePoint(px, py, cx, cy, angleDeg) {
    const a = angleDeg * Math.PI / 180;
    const dx = px - cx;
    const dy = py - cy;
    return {
      x: cx + dx * Math.cos(a) - dy * Math.sin(a),
      y: cy + dx * Math.sin(a) + dy * Math.cos(a)
    };
  }

  function inverseRotatePoint(px, py, cx, cy, angleDeg) {
    return rotatePoint(px, py, cx, cy, -angleDeg);
  }

  function distToSegment(px,py,x1,y1,x2,y2) {
    const dx=x2-x1, dy=y2-y1;
    const l2=dx*dx+dy*dy;
    if (!l2) return Math.hypot(px-x1,py-y1);
    let t=((px-x1)*dx+(py-y1)*dy)/l2;
    t=Math.max(0,Math.min(1,t));
    return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));
  }

  function bezierPoint(o,t) {
    const u=1-t;
    const b0=u*u*u, b1=3*u*u*t, b2=3*u*t*t, b3=t*t*t;
    return {
      x:b0*o.x1+b1*o.cx1+b2*o.cx2+b3*o.x2,
      y:b0*o.y1+b1*o.cy1+b2*o.cy2+b3*o.y2
    };
  }

  function bezierTangent(o,t) {
    const u=1-t;
    return {
      x:3*u*u*(o.cx1-o.x1)+6*u*t*(o.cx2-o.cx1)+3*t*t*(o.x2-o.cx2),
      y:3*u*u*(o.cy1-o.y1)+6*u*t*(o.cy2-o.cy1)+3*t*t*(o.y2-o.cy2)
    };
  }

  function distToBezier(px,py,o,steps=40) {
    let min=Infinity;
    let prev={x:o.x1,y:o.y1};
    for(let i=1;i<=steps;i++) {
      const cur=bezierPoint(o,i/steps);
      min=Math.min(min,distToSegment(px,py,prev.x,prev.y,cur.x,cur.y));
      prev=cur;
    }
    return min;
  }

  function sampledCurvePoints(o,steps=36,offset=0) {
    const pts=[];
    for(let i=0;i<=steps;i++) {
      const t=i/steps;
      const p=bezierPoint(o,t);
      const tan=bezierTangent(o,t);
      const len=Math.hypot(tan.x,tan.y)||1;
      const nx=-tan.y/len, ny=tan.x/len;
      pts.push({x:p.x+nx*offset,y:p.y+ny*offset,t});
    }
    return pts;
  }

  function pointAt(arr,idx) {
    if(idx<0) return arr[0];
    if(idx>=arr.length) return arr[arr.length-1];
    return arr[idx];
  }

  function catmullRomPoint(p0,p1,p2,p3,t) {
    const t2=t*t, t3=t2*t;
    return {
      x:0.5*((2*p1.x)+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
      y:0.5*((2*p1.y)+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3)
    };
  }

  function sampledMultiPathPoints(o,stepsPerSegment=18) {
    const src=Array.isArray(o.points)?o.points:[];
    if(!src.length) return [];
    if(src.length===1) return [{x:src[0].x,y:src[0].y}];
    const pts=[];
    for(let i=0;i<src.length-1;i++) {
      const p0=pointAt(src,i-1), p1=pointAt(src,i), p2=pointAt(src,i+1), p3=pointAt(src,i+2);
      const startJ=i===0?0:1;
      for(let j=startJ;j<=stepsPerSegment;j++) {
        pts.push(catmullRomPoint(p0,p1,p2,p3,j/stepsPerSegment));
      }
    }
    return pts;
  }

  function offsetSampledPoints(pts,offset=0) {
    if(!offset||pts.length<2) return pts.map(p=>({x:p.x,y:p.y}));
    return pts.map((p,i)=>{
      const prev=pts[Math.max(0,i-1)], next=pts[Math.min(pts.length-1,i+1)];
      const dx=next.x-prev.x, dy=next.y-prev.y;
      const len=Math.hypot(dx,dy)||1;
      const nx=-dy/len, ny=dx/len;
      return {x:p.x+nx*offset,y:p.y+ny*offset};
    });
  }

  function distToPolyline(px,py,pts) {
    let min=Infinity;
    for(let i=1;i<pts.length;i++) {
      min=Math.min(min,distToSegment(px,py,pts[i-1].x,pts[i-1].y,pts[i].x,pts[i].y));
    }
    return min;
  }

  function polylineLength(pts) {
    let len=0;
    for(let i=1;i<pts.length;i++) len+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);
    return len;
  }

  function hitTest(objects,x,y,{isMultiPointPath=()=>false,isComplexPath=()=>false}={}) {
    for(let i=objects.length-1;i>=0;i--) {
      const o=objects[i];

      if(o.kind==='symbol') {
        const p=inverseRotatePoint(x,y,o.x,o.y,o.rotation||0);
        const lx=p.x-o.x, ly=p.y-o.y;

        if(o.type==='bench') {
          if(Math.abs(lx)<=o.size*1.125&&Math.abs(ly)<=o.size*.24) return i;
        } else if(o.type==='mat') {
          if(Math.abs(lx)<=o.size*.825&&Math.abs(ly)<=o.size*.46) return i;
        } else if(o.type==='crashMat') {
          if(Math.abs(lx)<=o.size*1.025&&Math.abs(ly)<=o.size*.64) return i;
        } else if(o.type==='airbody') {
          if(Math.abs(lx)<=o.size*.30&&ly>=-o.size*.72&&ly<=o.size*.72) return i;
        } else if(Math.hypot(lx,ly)<o.size*.8) {
          return i;
        }
      } else if(o.kind==='freehand') {
        if(distToPolyline(x,y,o.points||[])<Math.max(9,(o.width||0)+5)) return i;
      } else if(isMultiPointPath(o)) {
        if(distToPolyline(x,y,sampledMultiPathPoints(o,18))<10) return i;
      } else if(isComplexPath(o)) {
        if(distToBezier(x,y,o)<10) return i;
      } else if(Number.isFinite(+o.x1)&&Number.isFinite(+o.y1)&&Number.isFinite(+o.x2)&&Number.isFinite(+o.y2)) {
        if(distToSegment(x,y,o.x1,o.y1,o.x2,o.y2)<10) return i;
      }
    }
    return -1;
  }

  global.HandballGeometry={
    rotatePoint,
    inverseRotatePoint,
    distToSegment,
    bezierPoint,
    bezierTangent,
    distToBezier,
    sampledCurvePoints,
    catmullRomPoint,
    sampledMultiPathPoints,
    offsetSampledPoints,
    distToPolyline,
    polylineLength,
    hitTest
  };
})(window);
