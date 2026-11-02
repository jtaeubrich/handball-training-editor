(function (global) {
  'use strict';

  // State is shared with the editor; dependencies provide explicit actions and controls.
  function createCourtRenderer(editorState, deps) {
    const courtThemes = {
      gray: {
        floor:'#f7f7f7',
        line:'#4f4f4f',
        area:'#9a9a9a',
        area2:'#d5d5d5',
        // ordered from right outer sector to left outer sector
        sector:['#d9e1ec','#b9c6d9','#f0f0f0','#d7d7d7','#aebdd3','#ccd7e6'],
        goal:'#333333',
        center:'#8a8a8a'
      },
      orange: {
        floor:'#fff7ed',
        line:'#8d4d14',
        area:'#e79a54',
        area2:'#f3d2b3',
        sector:['#f9dfc1','#efbf93','#fff1e2','#f7dec7','#e6b07d','#f2d3b5'],
        goal:'#8a3e0b',
        center:'#d57a32'
      },
      blue: {
        floor:'#f2f8fd',
        line:'#000000',
        area:'#127ebc',
        area2:'#d7d7d7',
        sector:['#9ccae5','#7aa7d2','#ececec','#9baecf','#6f95c7','#93c3e1'],
        goal:'#000000',
        center:'#5b8fb5'
      }
    };

    function courtRect(mode) {
      const rot = ((editorState.courtSettings.rotation % 360) + 360) % 360;
      const swapped = rot === 90 || rot === 270;

      if (mode === 'full') {
        // Handball proportions 40 x 20. Fit inside canvas also after rotation.
        const maxW = deps.canvas.width - 100;
        const maxH = deps.canvas.height - 100;

        let w = 920, h = 460;
        if (swapped) {
          const scale = Math.min(maxW / h, maxH / w, 1);
          w *= scale;
          h *= scale;
        } else {
          const scale = Math.min(maxW / w, maxH / h, 1);
          w *= scale;
          h *= scale;
        }
        return { x:(deps.canvas.width-w)/2, y:(deps.canvas.height-h)/2, w, h };
      }

      // Square half court: rotation does not change its footprint.
      // Use the larger square canvas efficiently.
      const s = Math.min(680, deps.canvas.width-120, deps.canvas.height-120);
      return { x:(deps.canvas.width-s)/2, y:(deps.canvas.height-s)/2, w:s, h:s };
    }

    function withCourtRotation(c, r, fn) {
      c.save();
      const cx = r.x + r.w/2;
      const cy = r.y + r.h/2;
      const a = (editorState.courtSettings.rotation || 0) * Math.PI / 180;
      c.translate(cx, cy);
      c.rotate(a);
      c.translate(-cx, -cy);
      fn();
      c.restore();
    }

    function drawGoal(c, x, y, width, depth, side, colors) {
      c.save();
      c.strokeStyle = colors.goal;
      c.lineWidth = 4;
      c.fillStyle = '#ffffff';

      if (side === 'top') {
        c.fillRect(x-width/2, y-depth, width, depth);
        c.strokeRect(x-width/2, y-depth, width, depth);
      } else if (side === 'bottom') {
        c.fillRect(x-width/2, y, width, depth);
        c.strokeRect(x-width/2, y, width, depth);
      } else if (side === 'left') {
        c.fillRect(x-depth, y-width/2, depth, width);
        c.strokeRect(x-depth, y-width/2, depth, width);
      } else {
        c.fillRect(x, y-width/2, depth, width);
        c.strokeRect(x, y-width/2, depth, width);
      }
      c.restore();
    }

    function drawHalfCourt(c, r, colors) {
      withCourtRotation(c, r, () => {
        c.save();

        c.fillStyle = colors.floor;
        c.fillRect(r.x, r.y, r.w, r.h);

        const cx = r.x + r.w / 2;
        const goalY = r.y;
        const scale = r.w / 20;   // half field = 20 x 20 m
        const goalW = r.w * 0.10; // 10% of the goal-line width, centered on that line
        const six = 6 * scale;
        const nine = 9 * scale;
        const segHalf = 1.5 * scale; // 3 m straight section, centered

        // Tactical sectors
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
        const radius = Math.hypot(r.w / 2, r.h) + 4;

        c.save();
        c.beginPath();
        c.rect(r.x, r.y, r.w, r.h);
        c.clip();
        c.globalAlpha = editorState.courtSettings.sectorOpacity;

        let angleCursor = 0;
        for (let i = 0; i < 6; i++) {
          const a1 = angleCursor;
          const a2 = angleCursor + sectorSteps[i];
          c.fillStyle = sectorColors[i];
          c.beginPath();
          c.moveTo(cx, goalY);
          c.arc(cx, goalY, radius, a1, a2, false);
          c.closePath();
          c.fill();
          angleCursor = a2;
        }
        c.restore();

        // Colored 6-9m band (with 3m straight segment).
        // Clip it to the actual 20 x 20 m court so it never extends beyond
        // the side lines.
        c.save();
        c.beginPath();
        c.rect(r.x, r.y, r.w, r.h);
        c.clip();

        c.fillStyle = colors.area2;
        c.globalAlpha = 0.55;

        c.beginPath();
        // Outer 9m contour
        c.moveTo(cx - segHalf - nine, goalY);
        c.arc(cx - segHalf, goalY, nine, Math.PI, Math.PI / 2, true);
        c.lineTo(cx + segHalf, goalY + nine);
        c.arc(cx + segHalf, goalY, nine, Math.PI / 2, 0, true);
        c.lineTo(cx + segHalf + nine, goalY);
        c.closePath();

        // Inner 6m contour as hole
        c.moveTo(cx - segHalf - six, goalY);
        c.arc(cx - segHalf, goalY, six, Math.PI, Math.PI / 2, true);
        c.lineTo(cx + segHalf, goalY + six);
        c.arc(cx + segHalf, goalY, six, Math.PI / 2, 0, true);
        c.lineTo(cx + segHalf + six, goalY);
        c.lineTo(cx - segHalf - six, goalY);
        c.closePath();

        c.fill('evenodd');
        c.restore();

        // Goal area fill (0-6 m)
        c.fillStyle = colors.area;
        c.beginPath();
        c.moveTo(cx - segHalf - six, goalY);
        c.arc(cx - segHalf, goalY, six, Math.PI, Math.PI / 2, true);
        c.lineTo(cx + segHalf, goalY + six);
        c.arc(cx + segHalf, goalY, six, Math.PI / 2, 0, true);
        c.lineTo(cx + segHalf + six, goalY);
        c.lineTo(cx - segHalf - six, goalY);
        c.closePath();
        c.fill();

        // Field border
        c.strokeStyle = colors.line;
        c.lineWidth = 3;
        c.strokeRect(r.x, r.y, r.w, r.h);

        // 6 m line
        c.beginPath();
        c.moveTo(cx - segHalf - six, goalY);
        c.arc(cx - segHalf, goalY, six, Math.PI, Math.PI / 2, true);
        c.lineTo(cx + segHalf, goalY + six);
        c.arc(cx + segHalf, goalY, six, Math.PI / 2, 0, true);
        c.lineTo(cx + segHalf + six, goalY);
        c.stroke();

        // 9 m dashed line, clipped exactly at the field boundary.
        c.save();
        c.beginPath();
        c.rect(r.x, r.y, r.w, r.h);
        c.clip();

        c.setLineDash([10, 8]);
        c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(cx - segHalf - nine, goalY);
        c.arc(cx - segHalf, goalY, nine, Math.PI, Math.PI / 2, true);
        c.lineTo(cx + segHalf, goalY + nine);
        c.arc(cx + segHalf, goalY, nine, Math.PI / 2, 0, true);
        c.lineTo(cx + segHalf + nine, goalY);
        c.stroke();
        c.setLineDash([]);
        c.restore();

        // 7 m and 4 m marks
        c.lineWidth = 3;
        const mark7 = goalY + 7 * scale;
        const mark4 = goalY + 4 * scale;
        c.beginPath();
        c.moveTo(cx - 12, mark7);
        c.lineTo(cx + 12, mark7);
        c.stroke();
        c.beginPath();
        c.moveTo(cx - 7, mark4);
        c.lineTo(cx + 7, mark4);
        c.stroke();

        // Goal
        drawGoal(c, cx, goalY, goalW, 18, 'top', colors);

        c.restore();
      });
    }

    function drawFullCourt(c, r, colors) {
      withCourtRotation(c, r, () => {
        c.save();

        c.fillStyle = colors.floor;
        c.fillRect(r.x, r.y, r.w, r.h);

        const scale = r.h / 20;   // full field = 40 x 20 m
        const left = r.x;
        const right = r.x + r.w;
        const cy = r.y + r.h / 2;
        const centerX = r.x + r.w / 2;
        const goalW = r.h * 0.10; // 10% of the goal-line width, centered on that line
        const six = 6 * scale;
        const nine = 9 * scale;
        const segHalf = 1.5 * scale; // 3 m straight section, centered

        // Colored 6-9m bands, clipped to the 40 x 20 m court.
        c.save();
        c.beginPath();
        c.rect(r.x, r.y, r.w, r.h);
        c.clip();

        c.fillStyle = colors.area2;
        c.globalAlpha = 0.55;

        // Left 6-9m band
        c.beginPath();
        c.moveTo(left, cy - segHalf - nine);
        c.arc(left, cy - segHalf, nine, -Math.PI / 2, 0, false);
        c.lineTo(left + nine, cy + segHalf);
        c.arc(left, cy + segHalf, nine, 0, Math.PI / 2, false);
        c.lineTo(left, cy + segHalf + nine);
        c.closePath();

        c.moveTo(left, cy - segHalf - six);
        c.arc(left, cy - segHalf, six, -Math.PI / 2, 0, false);
        c.lineTo(left + six, cy + segHalf);
        c.arc(left, cy + segHalf, six, 0, Math.PI / 2, false);
        c.lineTo(left, cy + segHalf + six);
        c.lineTo(left, cy - segHalf - six);
        c.closePath();
        c.fill('evenodd');

        // Right 6-9m band
        c.beginPath();
        c.moveTo(right, cy - segHalf - nine);
        c.arc(right, cy - segHalf, nine, -Math.PI / 2, Math.PI, true);
        c.lineTo(right - nine, cy + segHalf);
        c.arc(right, cy + segHalf, nine, Math.PI, Math.PI / 2, true);
        c.lineTo(right, cy + segHalf + nine);
        c.closePath();

        c.moveTo(right, cy - segHalf - six);
        c.arc(right, cy - segHalf, six, -Math.PI / 2, Math.PI, true);
        c.lineTo(right - six, cy + segHalf);
        c.arc(right, cy + segHalf, six, Math.PI, Math.PI / 2, true);
        c.lineTo(right, cy + segHalf + six);
        c.lineTo(right, cy - segHalf - six);
        c.closePath();
        c.fill('evenodd');

        c.restore();

        // Filled goal areas
        c.fillStyle = colors.area;

        // Left goal area
        c.beginPath();
        c.moveTo(left, cy - segHalf - six);
        c.arc(left, cy - segHalf, six, -Math.PI / 2, 0, false);
        c.lineTo(left + six, cy + segHalf);
        c.arc(left, cy + segHalf, six, 0, Math.PI / 2, false);
        c.lineTo(left, cy + segHalf + six);
        c.closePath();
        c.fill();

        // Right goal area
        c.beginPath();
        c.moveTo(right, cy - segHalf - six);
        c.arc(right, cy - segHalf, six, -Math.PI / 2, Math.PI, true);
        c.lineTo(right - six, cy + segHalf);
        c.arc(right, cy + segHalf, six, Math.PI, Math.PI / 2, true);
        c.lineTo(right, cy + segHalf + six);
        c.closePath();
        c.fill();

        // Field border
        c.strokeStyle = colors.line;
        c.lineWidth = 3;
        c.strokeRect(r.x, r.y, r.w, r.h);

        // Centre line
        c.beginPath();
        c.moveTo(centerX, r.y);
        c.lineTo(centerX, r.y + r.h);
        c.stroke();

        // Centre / throw-off circle
        c.fillStyle = colors.area2;
        c.beginPath();
        c.arc(centerX, cy, 2 * scale, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = colors.center;
        c.lineWidth = 3;
        c.stroke();

        // 6 m lines
        c.strokeStyle = colors.line;
        c.lineWidth = 3;

        c.beginPath();
        c.moveTo(left, cy - segHalf - six);
        c.arc(left, cy - segHalf, six, -Math.PI / 2, 0, false);
        c.lineTo(left + six, cy + segHalf);
        c.arc(left, cy + segHalf, six, 0, Math.PI / 2, false);
        c.lineTo(left, cy + segHalf + six);
        c.stroke();

        c.beginPath();
        c.moveTo(right, cy - segHalf - six);
        c.arc(right, cy - segHalf, six, -Math.PI / 2, Math.PI, true);
        c.lineTo(right - six, cy + segHalf);
        c.arc(right, cy + segHalf, six, Math.PI, Math.PI / 2, true);
        c.lineTo(right, cy + segHalf + six);
        c.stroke();

        // 9 m dashed lines, clipped exactly at the side lines.
        c.save();
        c.beginPath();
        c.rect(r.x, r.y, r.w, r.h);
        c.clip();

        c.setLineDash([10, 8]);
        c.lineWidth = 2.5;

        c.beginPath();
        c.moveTo(left, cy - segHalf - nine);
        c.arc(left, cy - segHalf, nine, -Math.PI / 2, 0, false);
        c.lineTo(left + nine, cy + segHalf);
        c.arc(left, cy + segHalf, nine, 0, Math.PI / 2, false);
        c.lineTo(left, cy + segHalf + nine);
        c.stroke();

        c.beginPath();
        c.moveTo(right, cy - segHalf - nine);
        c.arc(right, cy - segHalf, nine, -Math.PI / 2, Math.PI, true);
        c.lineTo(right - nine, cy + segHalf);
        c.arc(right, cy + segHalf, nine, Math.PI, Math.PI / 2, true);
        c.lineTo(right, cy + segHalf + nine);
        c.stroke();

        c.setLineDash([]);
        c.restore();

        // 7 m and 4 m marks
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(left + 7 * scale, cy - 12);
        c.lineTo(left + 7 * scale, cy + 12);
        c.stroke();
        c.beginPath();
        c.moveTo(right - 7 * scale, cy - 12);
        c.lineTo(right - 7 * scale, cy + 12);
        c.stroke();

        c.beginPath();
        c.moveTo(left + 4 * scale, cy - 7);
        c.lineTo(left + 4 * scale, cy + 7);
        c.stroke();
        c.beginPath();
        c.moveTo(right - 4 * scale, cy - 7);
        c.lineTo(right - 4 * scale, cy + 7);
        c.stroke();

        // Goals
        drawGoal(c, left, cy, goalW, 18, 'left', colors);
        drawGoal(c, right, cy, goalW, 18, 'right', colors);

        c.restore();
      });
    }

    function drawCourt(c) {
      if (editorState.courtSettings.mode === 'none') return;
      const colors = courtThemes[editorState.courtSettings.theme] || courtThemes.gray;
      const r = courtRect(editorState.courtSettings.mode);
      if (editorState.courtSettings.mode === 'half') drawHalfCourt(c,r,colors);
      else drawFullCourt(c,r,colors);
    }

    function grid() {
      if (!editorState.courtSettings.gridVisible) return;
      deps.ctx.save();
      deps.ctx.strokeStyle='#ececec';
      deps.ctx.lineWidth=1;

      for(let x=25; x<deps.canvas.width; x+=25) {
        deps.ctx.beginPath();
        deps.ctx.moveTo(x,0);
        deps.ctx.lineTo(x,deps.canvas.height);
        deps.ctx.stroke();
      }

      for(let y=25; y<deps.canvas.height; y+=25) {
        deps.ctx.beginPath();
        deps.ctx.moveTo(0,y);
        deps.ctx.lineTo(deps.canvas.width,y);
        deps.ctx.stroke();
      }

      deps.ctx.restore();
    }

    function withCourtRotationFor(c, r, settings, fn) {
      c.save();
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const a = ((settings.rotation || 0) * Math.PI) / 180;
      c.translate(cx, cy);
      c.rotate(a);
      c.translate(-cx, -cy);
      fn();
      c.restore();
    }

    function drawHalfCourtInBounds(c, bounds, colors, settings) {
      const r = deps.cellCourtRect('half', settings.rotation, bounds);
      withCourtRotationFor(c, r, settings, () => {
        c.save();
        c.fillStyle = colors.floor;
        c.fillRect(r.x, r.y, r.w, r.h);
        const cx = r.x + r.w / 2;
        const goalY = r.y;
        const scale = r.w / 20;
        const goalW = r.w * 0.10; // 10% of the goal-line width, centered on that line
        const six = 6 * scale;
        const nine = 9 * scale;
        const segHalf = 1.5 * scale;
        const totalAngle = Math.PI;
        const baseStep = totalAngle / 6;
        const outerStep = baseStep * 1.05;
        const middleStep = baseStep * 0.80;
        const adjacentStep = (totalAngle - 2 * outerStep - 2 * middleStep) / 2;
        const sectorSteps = [outerStep, adjacentStep, middleStep, middleStep, adjacentStep, outerStep];
        const radius = Math.hypot(r.w / 2, r.h) + 4;

        c.save();
        c.beginPath();
        c.rect(r.x, r.y, r.w, r.h);
        c.clip();
        c.globalAlpha = settings.sectorOpacity;
        let angleCursor = 0;
        for (let i = 0; i < 6; i++) {
          const a1 = angleCursor;
          const a2 = angleCursor + sectorSteps[i];
          c.fillStyle = colors.sector[i];
          c.beginPath();
          c.moveTo(cx, goalY);
          c.arc(cx, goalY, radius, a1, a2, false);
          c.closePath();
          c.fill();
          angleCursor = a2;
        }
        c.restore();

        c.save();
        c.beginPath();
        c.rect(r.x, r.y, r.w, r.h);
        c.clip();
        c.fillStyle = colors.area2;
        c.globalAlpha = 0.55;
        c.beginPath();
        c.moveTo(cx - segHalf - nine, goalY);
        c.arc(cx - segHalf, goalY, nine, Math.PI, Math.PI / 2, true);
        c.lineTo(cx + segHalf, goalY + nine);
        c.arc(cx + segHalf, goalY, nine, Math.PI / 2, 0, true);
        c.lineTo(cx + segHalf + nine, goalY);
        c.closePath();
        c.moveTo(cx - segHalf - six, goalY);
        c.arc(cx - segHalf, goalY, six, Math.PI, Math.PI / 2, true);
        c.lineTo(cx + segHalf, goalY + six);
        c.arc(cx + segHalf, goalY, six, Math.PI / 2, 0, true);
        c.lineTo(cx + segHalf + six, goalY);
        c.lineTo(cx - segHalf - six, goalY);
        c.closePath();
        c.fill('evenodd');
        c.restore();

        c.fillStyle = colors.area;
        c.beginPath();
        c.moveTo(cx - segHalf - six, goalY);
        c.arc(cx - segHalf, goalY, six, Math.PI, Math.PI / 2, true);
        c.lineTo(cx + segHalf, goalY + six);
        c.arc(cx + segHalf, goalY, six, Math.PI / 2, 0, true);
        c.lineTo(cx + segHalf + six, goalY);
        c.lineTo(cx - segHalf - six, goalY);
        c.closePath();
        c.fill();

        c.strokeStyle = colors.line;
        c.lineWidth = 2.5;
        c.strokeRect(r.x, r.y, r.w, r.h);
        c.beginPath();
        c.moveTo(cx - segHalf - six, goalY);
        c.arc(cx - segHalf, goalY, six, Math.PI, Math.PI / 2, true);
        c.lineTo(cx + segHalf, goalY + six);
        c.arc(cx + segHalf, goalY, six, Math.PI / 2, 0, true);
        c.lineTo(cx + segHalf + six, goalY);
        c.stroke();

        c.save();
        c.beginPath();
        c.rect(r.x, r.y, r.w, r.h);
        c.clip();
        c.setLineDash([10, 8]);
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(cx - segHalf - nine, goalY);
        c.arc(cx - segHalf, goalY, nine, Math.PI, Math.PI / 2, true);
        c.lineTo(cx + segHalf, goalY + nine);
        c.arc(cx + segHalf, goalY, nine, Math.PI / 2, 0, true);
        c.lineTo(cx + segHalf + nine, goalY);
        c.stroke();
        c.setLineDash([]);
        c.restore();

        c.lineWidth = 2.5;
        const mark7 = goalY + 7 * scale;
        const mark4 = goalY + 4 * scale;
        c.beginPath();
        c.moveTo(cx - 8, mark7);
        c.lineTo(cx + 8, mark7);
        c.stroke();
        c.beginPath();
        c.moveTo(cx - 5, mark4);
        c.lineTo(cx + 5, mark4);
        c.stroke();
        drawGoal(c, cx, goalY, goalW, 14, 'top', colors);
        c.restore();
      });
    }

    function drawFullCourtInBounds(c, bounds, colors, settings) {
      const r = deps.cellCourtRect('full', settings.rotation, bounds);
      withCourtRotationFor(c, r, settings, () => {
        c.save();
        c.fillStyle = colors.floor;
        c.fillRect(r.x, r.y, r.w, r.h);
        const scale = r.h / 20;
        const left = r.x;
        const right = r.x + r.w;
        const cy = r.y + r.h / 2;
        const centerX = r.x + r.w / 2;
        const goalW = r.h * 0.10; // 10% of the goal-line width, centered on that line
        const six = 6 * scale;
        const nine = 9 * scale;
        const segHalf = 1.5 * scale;

        c.save();
        c.beginPath();
        c.rect(r.x, r.y, r.w, r.h);
        c.clip();
        c.fillStyle = colors.area2;
        c.globalAlpha = 0.55;

        c.beginPath();
        c.moveTo(left, cy - segHalf - nine);
        c.arc(left, cy - segHalf, nine, -Math.PI / 2, 0, false);
        c.lineTo(left + nine, cy + segHalf);
        c.arc(left, cy + segHalf, nine, 0, Math.PI / 2, false);
        c.lineTo(left, cy + segHalf + nine);
        c.closePath();
        c.moveTo(left, cy - segHalf - six);
        c.arc(left, cy - segHalf, six, -Math.PI / 2, 0, false);
        c.lineTo(left + six, cy + segHalf);
        c.arc(left, cy + segHalf, six, 0, Math.PI / 2, false);
        c.lineTo(left, cy + segHalf + six);
        c.lineTo(left, cy - segHalf - six);
        c.closePath();
        c.fill('evenodd');

        c.beginPath();
        c.moveTo(right, cy - segHalf - nine);
        c.arc(right, cy - segHalf, nine, -Math.PI / 2, Math.PI, true);
        c.lineTo(right - nine, cy + segHalf);
        c.arc(right, cy + segHalf, nine, Math.PI, Math.PI / 2, true);
        c.lineTo(right, cy + segHalf + nine);
        c.closePath();
        c.moveTo(right, cy - segHalf - six);
        c.arc(right, cy - segHalf, six, -Math.PI / 2, Math.PI, true);
        c.lineTo(right - six, cy + segHalf);
        c.arc(right, cy + segHalf, six, Math.PI, Math.PI / 2, true);
        c.lineTo(right, cy + segHalf + six);
        c.lineTo(right, cy - segHalf - six);
        c.closePath();
        c.fill('evenodd');
        c.restore();

        c.fillStyle = colors.area;
        c.beginPath();
        c.moveTo(left, cy - segHalf - six);
        c.arc(left, cy - segHalf, six, -Math.PI / 2, 0, false);
        c.lineTo(left + six, cy + segHalf);
        c.arc(left, cy + segHalf, six, 0, Math.PI / 2, false);
        c.lineTo(left, cy + segHalf + six);
        c.closePath();
        c.fill();

        c.beginPath();
        c.moveTo(right, cy - segHalf - six);
        c.arc(right, cy - segHalf, six, -Math.PI / 2, Math.PI, true);
        c.lineTo(right - six, cy + segHalf);
        c.arc(right, cy + segHalf, six, Math.PI, Math.PI / 2, true);
        c.lineTo(right, cy + segHalf + six);
        c.closePath();
        c.fill();

        c.strokeStyle = colors.line;
        c.lineWidth = 2.5;
        c.strokeRect(r.x, r.y, r.w, r.h);
        c.beginPath();
        c.moveTo(centerX, r.y);
        c.lineTo(centerX, r.y + r.h);
        c.stroke();
        c.fillStyle = colors.area2;
        c.beginPath();
        c.arc(centerX, cy, 2 * scale, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = colors.center;
        c.stroke();
        c.strokeStyle = colors.line;

        c.beginPath();
        c.moveTo(left, cy - segHalf - six);
        c.arc(left, cy - segHalf, six, -Math.PI / 2, 0, false);
        c.lineTo(left + six, cy + segHalf);
        c.arc(left, cy + segHalf, six, 0, Math.PI / 2, false);
        c.lineTo(left, cy + segHalf + six);
        c.stroke();

        c.beginPath();
        c.moveTo(right, cy - segHalf - six);
        c.arc(right, cy - segHalf, six, -Math.PI / 2, Math.PI, true);
        c.lineTo(right - six, cy + segHalf);
        c.arc(right, cy + segHalf, six, Math.PI, Math.PI / 2, true);
        c.lineTo(right, cy + segHalf + six);
        c.stroke();

        c.save();
        c.beginPath();
        c.rect(r.x, r.y, r.w, r.h);
        c.clip();
        c.setLineDash([10, 8]);
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(left, cy - segHalf - nine);
        c.arc(left, cy - segHalf, nine, -Math.PI / 2, 0, false);
        c.lineTo(left + nine, cy + segHalf);
        c.arc(left, cy + segHalf, nine, 0, Math.PI / 2, false);
        c.lineTo(left, cy + segHalf + nine);
        c.stroke();

        c.beginPath();
        c.moveTo(right, cy - segHalf - nine);
        c.arc(right, cy - segHalf, nine, -Math.PI / 2, Math.PI, true);
        c.lineTo(right - nine, cy + segHalf);
        c.arc(right, cy + segHalf, nine, Math.PI, Math.PI / 2, true);
        c.lineTo(right, cy + segHalf + nine);
        c.stroke();
        c.setLineDash([]);
        c.restore();

        c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(left + 7 * scale, cy - 8);
        c.lineTo(left + 7 * scale, cy + 8);
        c.stroke();
        c.beginPath();
        c.moveTo(right - 7 * scale, cy - 8);
        c.lineTo(right - 7 * scale, cy + 8);
        c.stroke();
        c.beginPath();
        c.moveTo(left + 4 * scale, cy - 5);
        c.lineTo(left + 4 * scale, cy + 5);
        c.stroke();
        c.beginPath();
        c.moveTo(right - 4 * scale, cy - 5);
        c.lineTo(right - 4 * scale, cy + 5);
        c.stroke();
        drawGoal(c, left, cy, goalW, 14, 'left', colors);
        drawGoal(c, right, cy, goalW, 14, 'right', colors);
        c.restore();
      });
    }

    function drawGridInBounds(c, bounds) {
      c.save();
      c.beginPath();
      c.rect(bounds.x, bounds.y, bounds.w, bounds.h);
      c.clip();
      c.strokeStyle = '#ececec';
      c.lineWidth = 1;
      for (let x = bounds.x + 25; x < bounds.x + bounds.w; x += 25) {
        c.beginPath();
        c.moveTo(x, bounds.y);
        c.lineTo(x, bounds.y + bounds.h);
        c.stroke();
      }
      for (let y = bounds.y + 25; y < bounds.y + bounds.h; y += 25) {
        c.beginPath();
        c.moveTo(bounds.x, y);
        c.lineTo(bounds.x + bounds.w, y);
        c.stroke();
      }
      c.restore();
    }

    function drawStoryboardCourts(c) {
      const cells = deps.storyboardCells();
      cells.forEach(cell => {
        const settings = editorState.cellCourts[cell.index] || deps.makeDefaultCourtSettings();
        c.save();
        c.fillStyle = '#ffffff';
        c.fillRect(cell.x, cell.y, cell.w, cell.h);
        if (settings.mode !== 'none') {
          const colors = courtThemes[settings.theme] || courtThemes.gray;
          if (settings.mode === 'half') drawHalfCourtInBounds(c, cell, colors, settings);
          else drawFullCourtInBounds(c, cell, colors, settings);
        }
        if (settings.gridVisible) drawGridInBounds(c, cell);

        const showCellFrame = deps.layoutCellCount() > 1;
        if (showCellFrame) {
          c.strokeStyle = cell.index === editorState.layoutSettings.activeCell ? '#1976d2' : '#d0d7de';
          c.lineWidth = cell.index === editorState.layoutSettings.activeCell ? 2.5 : 1.2;
          c.strokeRect(cell.x, cell.y, cell.w, cell.h);

          c.fillStyle = cell.index === editorState.layoutSettings.activeCell ? '#1976d2' : '#6b7280';
          c.fillRect(cell.x + 8, cell.y + 8, 28, 20);
          c.fillStyle = '#fff';
          c.font = 'bold 12px Arial, sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(String(cell.index + 1), cell.x + 22, cell.y + 18);
        }
        c.restore();
      });
    }

    return { courtRect, drawStoryboardCourts, courtThemes };
  }

  global.HandballCourtRenderer = { createCourtRenderer };
})(window);
