(function (global) {
  'use strict';

  const markerTypes = new Set(['cone','ring','disc','airbody']);
  const pathTools = new Set(['run','complexRun','runMulti','pass','passCurve','passFake','passFakeCurve','runBall','runBallCurve','runBallMulti','tip','tipCurve','dribble','dribbleCurve','shot','shotCurve','shotFake','shotFakeCurve','screen','screenCurve','screenMulti']);

  const complexPathTypes = new Set([
    'complexRun','passCurve','passFakeCurve','runBallCurve',
    'tipCurve','dribbleCurve','shotCurve','shotFakeCurve','screenCurve'
  ]);

  const multiPointPathTypes = new Set(['runMulti','runBallMulti','screenMulti']);

  function isComplexPath(oOrType) {
    const t = typeof oOrType === 'string' ? oOrType : oOrType?.type;
    return complexPathTypes.has(t);
  }

  function isMultiPointPath(oOrType) {
    const t = typeof oOrType === 'string' ? oOrType : oOrType?.type;
    return multiPointPathTypes.has(t);
  }

  function basePathType(oOrType) {
    const t = typeof oOrType === 'string' ? oOrType : oOrType?.type;
    const map = {
      complexRun:'run',
      runMulti:'run',
      passCurve:'pass',
      passFakeCurve:'passFake',
      runBallCurve:'runBall',
      runBallMulti:'runBall',
      tipCurve:'tip',
      dribbleCurve:'dribble',
      shotCurve:'shot',
      shotFakeCurve:'shotFake',
      screenCurve:'screen',
      screenMulti:'screen'
    };
    return map[t] || t;
  }

  const rotatableTypes = new Set(['attacker','attackerBall','defender','goalkeeper','airbody','bench','mat','crashMat']);
  const labelTypes = new Set(['attacker','attackerBall','defender']);
  const pathLabelLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  const attackLabels = {
    '33': ['LA','RL','RM','KS','RR','RA'],
    '24': ['RA','RR','KR','RL','KL','LA'],
    numbers: Array.from({length:10}, (_, index) => String(index + 1))
  };
  const defenseLabels = {
    '321': ['AL','HL','VM','HM','HR','AR'],
    '60': ['AL','HL','IL','IR','HR','AR'],
    numbers: attackLabels.numbers
  };

  const typeNames = {
    attacker: 'Angriffsspieler',
    attackerBall: 'Angreifer mit Ball',
    feeder: 'Anspieler',
    defender: 'Abwehrspieler',
    goalkeeper: 'Torwart',
    coach: 'Trainer / Übungsleiter',
    run: 'Laufweg',
    complexRun: 'Komplexer Laufweg',
    runMulti: 'Mehrpunkt-Laufweg',
    pass: 'Ballweg / Passweg',
    passCurve: 'Komplexer Ballweg / Passweg',
    passFake: 'Passtäuschung',
    passFakeCurve: 'Komplexe Passtäuschung',
    runBall: 'Laufweg mit Ball',
    runBallCurve: 'Komplexer Laufweg mit Ball',
    runBallMulti: 'Mehrpunkt-Laufweg mit Ball',
    tip: 'Tippen des Balls',
    tipCurve: 'Komplexes Tippen des Balls',
    dribble: 'Prellen des Balls',
    dribbleCurve: 'Komplexes Prellen des Balls',
    shot: 'Torwurf',
    shotCurve: 'Komplexer Torwurf',
    shotFake: 'Torwurftäuschung',
    shotFakeCurve: 'Komplexe Torwurftäuschung',
    screen: 'Sperre',
    screenCurve: 'Komplexe Sperre',
    screenMulti: 'Mehrpunkt-Sperre',
    cone: 'Hütchen',
    ring: 'Reifen',
    disc: 'Markierung',
    ball: 'Ball',
    freehand: 'Freihandzeichnung',
    bench: 'Turnbank',
    mat: 'Sportmatte',
    crashMat: 'Weichbodenmatte',
    airbody: 'Air Body'
  };

  function objectSupportsLabel(o) {
    return !!o && (
      (o.kind === 'symbol' && labelTypes.has(o.type)) ||
      (o.kind === 'path' && pathTools.has(o.type))
    );
  }

  const LABEL_OFFSET_MIN = -50;
  const LABEL_OFFSET_MAX = 50;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function ensureLabelOffset(o) {
    if (!o) return;
    if (!Number.isFinite(+o.labelOffsetX)) o.labelOffsetX = 0;
    if (!Number.isFinite(+o.labelOffsetY)) o.labelOffsetY = 0;
    o.labelOffsetX = clamp(Math.round(+o.labelOffsetX), LABEL_OFFSET_MIN, LABEL_OFFSET_MAX);
    o.labelOffsetY = clamp(Math.round(+o.labelOffsetY), LABEL_OFFSET_MIN, LABEL_OFFSET_MAX);
  }

  function syncMultiPathExtents(o) {
    if (!o || !Array.isArray(o.points) || !o.points.length) return;
    o.x1 = o.points[0].x;
    o.y1 = o.points[0].y;
    o.x2 = o.points[o.points.length - 1].x;
    o.y2 = o.points[o.points.length - 1].y;
  }

  // Preserve legacy project defaults in place, including unrecognized fields.
  function normalizeLoadedObject(o) {
    if (o && o.kind === 'symbol' && (o.type === 'attacker' ||
        (o.type === 'attackerBall' && ['numbers','custom'].includes(o.attackFormation)))) {
      if (typeof o.showLabel !== 'boolean') o.showLabel = false;
      if (!['33','24','numbers','custom'].includes(o.attackFormation)) o.attackFormation = '33';
      if (o.attackFormation === 'custom') {
        if (typeof o.label !== 'string') o.label = '';
      } else {
        const valid = attackLabels[o.attackFormation];
        if (o.attackFormation === 'numbers' && typeof o.label === 'number') o.label = String(o.label);
        if (!valid.includes(o.label)) o.label = valid.includes('RM') ? 'RM' : valid[0];
      }
      ensureLabelOffset(o);
    }

    if (o && o.kind === 'symbol' && o.type === 'defender') {
      if (typeof o.showLabel !== 'boolean') o.showLabel = false;
      if (!['321','60','numbers','custom'].includes(o.defenseFormation)) o.defenseFormation = '321';
      if (o.defenseFormation === 'custom') {
        if (typeof o.label !== 'string') o.label = '';
      } else {
        const valid = defenseLabels[o.defenseFormation];
        if (o.defenseFormation === 'numbers' && typeof o.label === 'number') o.label = String(o.label);
        if (!valid.includes(o.label)) o.label = valid.includes('HM') ? 'HM' : valid[0];
      }
      ensureLabelOffset(o);
    }

    if (o && o.kind === 'symbol' && o.type === 'goalkeeper') {
      o.showLabel = false;
    }

    if (o && o.kind === 'path') {
      if (typeof o.showLabel !== 'boolean') o.showLabel = false;
      if (typeof o.label !== 'string') o.label = 'A';
      ensureLabelOffset(o);

      if (isMultiPointPath(o)) {
        if (!Array.isArray(o.points) || o.points.length < 2) {
          o.points = [
            {x:Number.isFinite(+o.x1) ? +o.x1 : 0, y:Number.isFinite(+o.y1) ? +o.y1 : 0},
            {x:Number.isFinite(+o.x2) ? +o.x2 : 0, y:Number.isFinite(+o.y2) ? +o.y2 : 0}
          ];
        }
        syncMultiPathExtents(o);
      }

      if (isComplexPath(o)) {
        const dx = o.x2 - o.x1;
        const dy = o.y2 - o.y1;
        if (!Number.isFinite(+o.cx1)) o.cx1 = o.x1 + dx * 0.33;
        if (!Number.isFinite(+o.cy1)) o.cy1 = o.y1 + dy * 0.33;
        if (!Number.isFinite(+o.cx2)) o.cx2 = o.x1 + dx * 0.67;
        if (!Number.isFinite(+o.cy2)) o.cy2 = o.y1 + dy * 0.67;
      }
    }

    return o;
  }

  function createSymbol(type, p, {symbolSize, strokeWidth, strokeColor, markerColor, rotation=0}) {
    const defaultSymbolColor =
      (type === 'attacker' || type === 'attackerBall' || type === 'feeder') ? '#1976d2' :
      (type === 'defender' || type === 'goalkeeper') ? '#d32f2f' :
      type === 'bench' ? '#b8874f' :
      type === 'mat' ? '#4da3d9' :
      type === 'crashMat' ? '#397cb8' :
      type === 'ball' ? '#ffffff' :
      markerTypes.has(type) ? markerColor :
      strokeColor;

    const symbol = {
      kind:'symbol',
      type,
      x:p.x,
      y:p.y,
      size:type === 'ball'
        ? Math.max(24, Math.round(symbolSize * 0.68))
        : (type === 'airbody'
          ? Math.max(32, Math.round(symbolSize * 0.72))
          : symbolSize),
      color:defaultSymbolColor,
      width:strokeWidth,
      rotation:['attacker','attackerBall','defender','goalkeeper'].includes(type)
        ? rotation
        : 0
    };

    if (type === 'attacker' || type === 'attackerBall') {
      symbol.showLabel = false;
      symbol.attackFormation = '33';
      symbol.label = 'RM';
      symbol.labelOffsetX = 0;
      symbol.labelOffsetY = 0;
    }

    if (type === 'defender') {
      symbol.showLabel = false;
      symbol.defenseFormation = '321';
      symbol.label = 'HM';
      symbol.labelOffsetX = 0;
      symbol.labelOffsetY = 0;
    }
    return symbol;
  }

  function createPath(type, p, {width,color='#111111'}) {
    const object = {
      kind:'path', type,
      x1:p.x, y1:p.y, x2:p.x, y2:p.y,
      color, width,
      showLabel:false, label:'A', labelOffsetX:0, labelOffsetY:0
    };
    if (isMultiPointPath(type)) {
      object.points = [{x:p.x,y:p.y},{x:p.x,y:p.y}];
    }
    if (isComplexPath(type)) {
      object.cx1 = p.x; object.cy1 = p.y;
      object.cx2 = p.x; object.cy2 = p.y;
    }
    return object;
  }

  function createFreehand(p, {color, width}) {
    return {
      kind:'freehand',
      type:'freehand',
      points:[{x:p.x,y:p.y}],
      x1:p.x, y1:p.y, x2:p.x, y2:p.y,
      color,
      width
    };
  }

  global.HandballObjectModel = {
    markerTypes, pathTools, rotatableTypes, labelTypes, pathLabelLetters,
    attackLabels, defenseLabels, typeNames, LABEL_OFFSET_MIN, LABEL_OFFSET_MAX,
    isComplexPath, isMultiPointPath, basePathType, objectSupportsLabel,
    clamp, ensureLabelOffset, syncMultiPathExtents, normalizeLoadedObject,
    createSymbol, createPath, createFreehand
  };
})(window);
