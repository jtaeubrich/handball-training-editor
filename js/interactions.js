(function (global) {
  'use strict';

  // State is shared with the editor; dependencies provide explicit actions and controls.
  function createInteractions(editorState, deps) {
    function pos(e) {
      const r = deps.canvas.getBoundingClientRect();
      return {
        x:(e.clientX-r.left)*deps.canvas.width/r.width,
        y:(e.clientY-r.top)*deps.canvas.height/r.height
      };
    }

    function deleteSelected() {
      if (editorState.selectedIndices.size === 0) return;
      const indices = Array.from(editorState.selectedIndices).sort((a,b) => b-a);
      indices.forEach(i => editorState.objects.splice(i,1));
      deps.clearSelection();
      deps.commit();
      deps.updateProperties();
      deps.draw();
    }

    const MULTI_PATH_DOUBLE_CLICK_MS = 360;

    const MULTI_PATH_DOUBLE_CLICK_DISTANCE = 14;

    let multiPathRedo = [];

    function resetMultiPathHistory() {
      multiPathRedo = [];
    }

    function redrawMultiPath() {
      editorState.lastMultiPathClickTime = 0;
      editorState.lastMultiPathClickPoint = null;
      deps.draw();
      if (editorState.drawing) deps.drawObject(deps.ctx, editorState.drawing, false);
    }

    function undoMultiPath() {
      const path = editorState.drawing;
      if (!path || !deps.isMultiPointPath(path)) return false;
      const points = path.points.map(p => ({...p}));
      points[points.length - 1] = {...points[points.length - 2]};
      // The last point follows the pointer; remove the last fixed point as well.
      if (path.points.length > 2) {
        path.points.splice(-2);
        path.points.push({...path.points[path.points.length - 1]});
        deps.syncMultiPathExtents(path);
      } else {
        editorState.drawing = null;
      }
      multiPathRedo.push({path, points, after:editorState.drawing});
      redrawMultiPath();
      return true;
    }

    function redoMultiPath() {
      const entry = multiPathRedo[multiPathRedo.length - 1];
      if (!entry || entry.after !== editorState.drawing || entry.path.type !== editorState.tool) return false;
      multiPathRedo.pop();
      editorState.drawing = entry.path;
      entry.path.points = entry.points;
      deps.syncMultiPathExtents(entry.path);
      redrawMultiPath();
      return true;
    }

    function cleanMultiPathPreviewPoints(o) {
      if (!o || !Array.isArray(o.points)) return;

      // The final double-click generates two click events before dblclick.
      // Remove trailing points that are effectively at the same location.
      while (o.points.length >= 3) {
        const a = o.points[o.points.length - 1];
        const b = o.points[o.points.length - 2];
        if (Math.hypot(a.x - b.x, a.y - b.y) > 2) break;
        o.points.pop();
      }

      deps.syncMultiPathExtents(o);
    }

    function finishMultiPath() {
      if (!editorState.drawing || !deps.isMultiPointPath(editorState.drawing) || !Array.isArray(editorState.drawing.points)) return;

      cleanMultiPathPreviewPoints(editorState.drawing);
      resetMultiPathHistory();

      if (editorState.drawing.points.length >= 2 && deps.polylineLength(editorState.drawing.points) > 6) {
        editorState.objects.push(editorState.drawing);
        deps.setSingleSelection(editorState.objects.length - 1);
        deps.commit();
      }

      editorState.drawing = null;
      editorState.lastMultiPathClickTime = 0;
      editorState.lastMultiPathClickPoint = null;
      deps.updateProperties();
      deps.draw();
    }

    function cancelMultiPath() {
      if (!editorState.drawing || !deps.isMultiPointPath(editorState.drawing)) return;
      editorState.drawing = null;
      resetMultiPathHistory();
      editorState.lastMultiPathClickTime = 0;
      editorState.lastMultiPathClickPoint = null;
      deps.draw();
    }

    function updateSelectedLabelOffsetFromEvent(e, doCommit=false) {
      if (editorState.selected < 0) return;
      const o = editorState.objects[editorState.selected];
      if (!deps.objectSupportsLabel(o)) return;

      const rect = deps.labelOffsetEditor.getBoundingClientRect();
      const px = deps.clamp(e.clientX - rect.left, 0, rect.width);
      const py = deps.clamp(e.clientY - rect.top, 0, rect.height);

      const newX = Math.round(deps.LABEL_OFFSET_MIN + (px / rect.width) * (deps.LABEL_OFFSET_MAX - deps.LABEL_OFFSET_MIN));
      const newY = Math.round(deps.LABEL_OFFSET_MIN + (py / rect.height) * (deps.LABEL_OFFSET_MAX - deps.LABEL_OFFSET_MIN));

      const targets = deps.selectedObjects().filter(deps.objectSupportsLabel);
      targets.forEach(item => {
        item.labelOffsetX = newX;
        item.labelOffsetY = newY;
        deps.ensureLabelOffset(item);
      });

      deps.propLabelPreset.value = deps.getLabelPresetForObject(o);
      deps.updateLabelOffsetEditorFromObject(o);
      deps.draw();

      if (doCommit) deps.commit();
      else editorState.labelOffsetDirty = true;
    }

    function getRotationHandle(o) {
      const dist = o.size * 1.15;
      return deps.rotatePoint(o.x, o.y-dist, o.x, o.y, o.rotation || 0);
    }

    function rotationHandleHit(x,y) {
      if (editorState.selected < 0) return -1;

      const radius = window.matchMedia('(max-width: 700px)').matches ? 20 : 11;

      if (editorState.selectedIndices.size > 1) {
        const group = deps.getGroupRotationHandle();
        if (!group) return -1;
        return Math.hypot(x-group.handle.x, y-group.handle.y) <= radius ? -2 : -1;
      }

      const o = editorState.objects[editorState.selected];
      if (o.kind !== 'symbol' || !deps.rotatableTypes.has(o.type)) return -1;

      const h = getRotationHandle(o);
      return Math.hypot(x-h.x,y-h.y) <= radius ? editorState.selected : -1;
    }

    function endpointHandleHit(x,y) {
      if (editorState.selected < 0 || editorState.selectedIndices.size > 1) return null;
      const o = editorState.objects[editorState.selected];

      if (!o || o.kind !== 'path') return null;

      const radius = window.matchMedia('(max-width: 700px)').matches ? 18 : 11;

      if (deps.isMultiPointPath(o) && Array.isArray(o.points)) {
        for (let i=0;i<o.points.length;i++) {
          const pt = o.points[i];
          if (Math.hypot(x-pt.x, y-pt.y) <= radius) return 'point:' + i;
        }
        return null;
      }

      if (Math.hypot(x-o.x1, y-o.y1) <= radius) return 'start';
      if (Math.hypot(x-o.x2, y-o.y2) <= radius) return 'end';

      if (deps.isComplexPath(o)) {
        if (Math.hypot(x-o.cx1, y-o.cy1) <= radius) return 'control1';
        if (Math.hypot(x-o.cx2, y-o.cy2) <= radius) return 'control2';
      }

      return null;
    }

    let installed = false;
    function install() {
      if (installed) return;
      installed = true;
      // Completion is handled in pointerdown; suppress the native duplicate event.
      deps.canvas.addEventListener('dblclick', e => {
      if (editorState.drawing && deps.isMultiPointPath(editorState.drawing)) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
      deps.canvas.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch' && editorState.touchGestureSuppressEditor) return;

        if (!deps.isMultiPointPath(editorState.tool)) {
          deps.canvas.setPointerCapture(e.pointerId);
        }
        const p = pos(e);
        deps.setActiveCell(deps.cellIndexAtPoint(p.x, p.y), false);

        if (editorState.tool === 'select') {
          const endpoint = endpointHandleHit(p.x, p.y);
          if (endpoint) {
            editorState.draggingEndpoint = endpoint;
            editorState.dragging = false;
            editorState.rotating = false;
            deps.draw();
            return;
          }

          const handleIndex = rotationHandleHit(p.x, p.y);

          if (handleIndex === -2) {
            const group = deps.getGroupRotationHandle();
            if (group) {
              editorState.rotatingGroup = true;
              editorState.rotating = false;
              editorState.groupRotateCenter = group.center;
              editorState.groupRotateLastAngle = Math.atan2(
                p.y - editorState.groupRotateCenter.y,
                p.x - editorState.groupRotateCenter.x
              );
              deps.draw();
              return;
            }
          }

          if (handleIndex >= 0) {
            deps.setSingleSelection(handleIndex);
            const o = editorState.objects[editorState.selected];
            editorState.rotating = true;
            editorState.rotatingGroup = false;
            editorState.rotateStartAngle = Math.atan2(p.y-o.y, p.x-o.x);
            editorState.rotateStartValue = o.rotation || 0;
            deps.updateProperties();
            deps.draw();
            return;
          }

          const hit = deps.hitTest(p.x,p.y);
          const copyModifier = (e.ctrlKey || e.metaKey) && !e.shiftKey;
          const additive = e.shiftKey || (copyModifier && (hit < 0 || !editorState.selectedIndices.has(hit)));

          if (additive) {
            if (hit >= 0) {
              deps.toggleSelection(hit);
            } else {
              editorState.selectionRect = { x1:p.x, y1:p.y, x2:p.x, y2:p.y, additive:true };
            }
          } else if (copyModifier && hit >= 0 && editorState.selectedIndices.has(hit)) {
            deps.duplicateSelectedObjects();
            deps.commit();
          } else {
            if (hit >= 0) {
              // Clicking an already selected member keeps the whole group selected.
              if (!editorState.selectedIndices.has(hit) || editorState.selectedIndices.size <= 1) {
                deps.setSingleSelection(hit);
              } else {
                editorState.selected = hit;
              }
            } else {
              editorState.selectionRect = { x1:p.x, y1:p.y, x2:p.x, y2:p.y, additive:false };
            }
          }

          deps.updateProperties();

          if (hit >= 0 && editorState.selectedIndices.size > 0 && !additive) {
            editorState.dragging = true;
            editorState.groupDragLast = {x:p.x, y:p.y};

            if (editorState.selectedIndices.size === 1) {
              const o = editorState.objects[editorState.selected];
              if (o.kind === 'symbol') {
                editorState.dragOffset = {x:p.x-o.x, y:p.y-o.y};
              } else {
                editorState.dragOffset = {x:p.x-o.x1, y:p.y-o.y1};
              }
            }
          }
          deps.draw();
          return;
        }

        if (editorState.tool === 'freehand') {
          editorState.drawing = deps.objectModel.createFreehand(p, {color:editorState.freehandColor, width:+deps.strokeWidth.value});
          return;
        }

        if (deps.isMultiPointPath(editorState.tool)) {
          resetMultiPathHistory();
          const now = performance.now();

          if (!editorState.drawing || editorState.drawing.type !== editorState.tool || !Array.isArray(editorState.drawing.points)) {
            editorState.drawing = deps.objectModel.createPath(editorState.tool, p, {width:+deps.strokeWidth.value});

            editorState.lastMultiPathClickTime = now;
            editorState.lastMultiPathClickPoint = {x:p.x,y:p.y};
          } else {
            const rapidSecondClick =
              editorState.lastMultiPathClickPoint &&
              (now - editorState.lastMultiPathClickTime) <= MULTI_PATH_DOUBLE_CLICK_MS &&
              Math.hypot(p.x - editorState.lastMultiPathClickPoint.x, p.y - editorState.lastMultiPathClickPoint.y) <= MULTI_PATH_DOUBLE_CLICK_DISTANCE;

            if (rapidSecondClick) {
              // The first click of the fast click pair is the final support point.
              // The second click is used only as the finish trigger.
              editorState.drawing.points[editorState.drawing.points.length - 1] = {
                x:editorState.lastMultiPathClickPoint.x,
                y:editorState.lastMultiPathClickPoint.y
              };
              deps.syncMultiPathExtents(editorState.drawing);
              finishMultiPath();
              return;
            }

            // Ordinary single click: fix the current preview point and create a new preview point.
            editorState.drawing.points[editorState.drawing.points.length - 1] = {x:p.x,y:p.y};
            editorState.drawing.points.push({x:p.x,y:p.y});
            deps.syncMultiPathExtents(editorState.drawing);

            editorState.lastMultiPathClickTime = now;
            editorState.lastMultiPathClickPoint = {x:p.x,y:p.y};
          }

          deps.draw();
          deps.drawObject(deps.ctx, editorState.drawing, false);
          return;
        }

        if (deps.pathTools.has(editorState.tool)) {
          editorState.drawing = deps.objectModel.createPath(editorState.tool, p, {width:+deps.strokeWidth.value});
          return;
        }

        const symbol = deps.objectModel.createSymbol(editorState.tool, p, {
          symbolSize:+deps.symbolSize.value, strokeWidth:+deps.strokeWidth.value,
          strokeColor:deps.strokeColor.value, markerColor:editorState.markerColor,
          rotation:['attacker','attackerBall','defender','goalkeeper'].includes(editorState.tool)
            ? deps.initialPlayerRotation(editorState.tool, p.x, p.y) : 0
        });

        editorState.objects.push(symbol);

        deps.setSingleSelection(editorState.objects.length - 1);
        deps.commit();
        deps.updateProperties();
        deps.draw();
      });

      deps.canvas.addEventListener('pointermove', e => {
        if (e.pointerType === 'touch' && editorState.touchGestureSuppressEditor) return;

        const p = pos(e);

        if (editorState.rotatingGroup && editorState.groupRotateCenter && editorState.selectedIndices.size > 1) {
          const currentAngle = Math.atan2(
            p.y - editorState.groupRotateCenter.y,
            p.x - editorState.groupRotateCenter.x
          );

          let deltaRad = currentAngle - editorState.groupRotateLastAngle;
          while (deltaRad > Math.PI) deltaRad -= Math.PI * 2;
          while (deltaRad < -Math.PI) deltaRad += Math.PI * 2;

          const deltaDeg = deltaRad * 180 / Math.PI;

          deps.selectedObjects().forEach(o => {
            deps.rotateObjectAround(
              o,
              editorState.groupRotateCenter.x,
              editorState.groupRotateCenter.y,
              deltaDeg
            );
          });

          editorState.groupRotateLastAngle = currentAngle;
          deps.updateProperties(false);
          deps.draw();
          return;
        }

        if (editorState.rotating && editorState.selected >= 0) {
          const o = editorState.objects[editorState.selected];
          const currentAngle = Math.atan2(p.y-o.y, p.x-o.x);
          const delta = (currentAngle - editorState.rotateStartAngle) * 180 / Math.PI;
          o.rotation = deps.normalizeAngle(editorState.rotateStartValue + delta);
          deps.updateProperties(false);
          deps.draw();
          return;
        }

        if (editorState.drawing) {
          if (editorState.drawing.kind === 'freehand') {
            const pts = editorState.drawing.points;
            const last = pts[pts.length - 1];
            if (!last || Math.hypot(p.x-last.x, p.y-last.y) >= 1.5) {
              pts.push({x:p.x,y:p.y});
              editorState.drawing.x2 = p.x;
              editorState.drawing.y2 = p.y;
            }
          } else if (deps.isMultiPointPath(editorState.drawing) && Array.isArray(editorState.drawing.points)) {
            editorState.drawing.points[editorState.drawing.points.length - 1] = {x:p.x,y:p.y};
            deps.syncMultiPathExtents(editorState.drawing);
          } else {
            editorState.drawing.x2 = p.x;
            editorState.drawing.y2 = p.y;

            if (deps.isComplexPath(editorState.drawing)) {
              const dx = editorState.drawing.x2 - editorState.drawing.x1;
              const dy = editorState.drawing.y2 - editorState.drawing.y1;
              const len = Math.hypot(dx,dy) || 1;
              const nx = -dy / len;
              const ny = dx / len;
              const bend = Math.min(70, Math.max(28, len * 0.22));

              editorState.drawing.cx1 = editorState.drawing.x1 + dx * 0.32 + nx * bend;
              editorState.drawing.cy1 = editorState.drawing.y1 + dy * 0.32 + ny * bend;
              editorState.drawing.cx2 = editorState.drawing.x1 + dx * 0.68 + nx * bend;
              editorState.drawing.cy2 = editorState.drawing.y1 + dy * 0.68 + ny * bend;
            }
          }

          deps.draw();
          deps.drawObject(deps.ctx, editorState.drawing, false);
          return;
        }

        if (editorState.selectionRect) {
          editorState.selectionRect.x2 = p.x;
          editorState.selectionRect.y2 = p.y;
          deps.draw();
          return;
        }

        if (editorState.draggingEndpoint && editorState.selected >= 0) {
          const o = editorState.objects[editorState.selected];
          if (o && o.kind === 'path') {
            if (String(editorState.draggingEndpoint).startsWith('point:') && deps.isMultiPointPath(o) && Array.isArray(o.points)) {
              const idx = +String(editorState.draggingEndpoint).split(':')[1];
              if (o.points[idx]) {
                o.points[idx].x = p.x;
                o.points[idx].y = p.y;
                deps.syncMultiPathExtents(o);
              }
            } else if (editorState.draggingEndpoint === 'start') {
              o.x1 = p.x;
              o.y1 = p.y;
            } else if (editorState.draggingEndpoint === 'end') {
              o.x2 = p.x;
              o.y2 = p.y;
            } else if (editorState.draggingEndpoint === 'control1' && deps.isComplexPath(o)) {
              o.cx1 = p.x;
              o.cy1 = p.y;
            } else if (editorState.draggingEndpoint === 'control2' && deps.isComplexPath(o)) {
              o.cx2 = p.x;
              o.cy2 = p.y;
            }
            deps.draw();
          }
          return;
        }

        if (editorState.dragging && editorState.selected >= 0) {
          if (editorState.selectedIndices.size > 1) {
            const last = editorState.groupDragLast || p;
            const dx = p.x - last.x;
            const dy = p.y - last.y;
            deps.selectedObjects().forEach(o => deps.moveObjectBy(o, dx, dy));
            editorState.groupDragLast = {x:p.x, y:p.y};
          } else {
            const o = editorState.objects[editorState.selected];

            if (o.kind === 'symbol') {
              o.x = p.x - editorState.dragOffset.x;
              o.y = p.y - editorState.dragOffset.y;
            } else {
              const newX1 = p.x - editorState.dragOffset.x;
              const newY1 = p.y - editorState.dragOffset.y;
              const dx = newX1 - o.x1;
              const dy = newY1 - o.y1;
              deps.moveObjectBy(o, dx, dy);
            }
          }
          deps.draw();
        }
      });

      deps.canvas.addEventListener('pointerup', () => {
        if (editorState.selectionRect) {
          const r = deps.rectNormalized(editorState.selectionRect);
          const tiny = r.w < 4 && r.h < 4;
          if (tiny) {
            if (!editorState.selectionRect.additive) deps.clearSelection();
          } else {
            const hits = [];
            editorState.objects.forEach((o, i) => {
              if (deps.objectFullyInsideRect(o, r)) hits.push(i);
            });
            editorState.selected = window.HandballSelection.applyRectangle(
              editorState.selectedIndices,
              hits,
              editorState.selectionRect.additive
            );
          }
          editorState.selectionRect = null;
          deps.updateProperties();
          deps.draw();
          return;
        }

        if (editorState.draggingEndpoint) {
          editorState.draggingEndpoint = null;
          deps.commit();
          deps.updateProperties();
          deps.draw();
          return;
        }

        if (editorState.rotatingGroup) {
          editorState.rotatingGroup = false;
          editorState.groupRotateCenter = null;
          deps.commit();
          deps.updateProperties();
          deps.draw();
          return;
        }

        if (editorState.rotating) {
          editorState.rotating = false;
          deps.commit();
          deps.updateProperties();
          deps.draw();
          return;
        }

        if (editorState.drawing) {
          if (editorState.drawing.kind === 'freehand') {
            if (Array.isArray(editorState.drawing.points) && editorState.drawing.points.length >= 2) {
              editorState.objects.push(editorState.drawing);
              deps.setSingleSelection(editorState.objects.length - 1);
              deps.commit();
            }
            editorState.drawing = null;
            deps.updateProperties();
            deps.draw();
            return;
          }

          if (deps.isMultiPointPath(editorState.drawing)) {
              deps.draw();
            deps.drawObject(deps.ctx, editorState.drawing, false);
            return;
          }

          const dx = editorState.drawing.x2-editorState.drawing.x1;
          const dy = editorState.drawing.y2-editorState.drawing.y1;

          if (Math.hypot(dx,dy) > 6) {
            editorState.objects.push(editorState.drawing);
            deps.setSingleSelection(editorState.objects.length - 1);
            deps.commit();
          }

          editorState.drawing = null;
          deps.updateProperties();
          deps.draw();
          return;
        }

        if (editorState.dragging) {
          editorState.dragging = false;
          editorState.groupDragLast = null;
          deps.commit();
          deps.updateProperties();
        }
      });

      deps.canvas.addEventListener('pointercancel', e => {
        if (e.pointerType === 'touch' && editorState.touchGestureSuppressEditor) return;

        editorState.selectionRect = null;
        editorState.draggingEndpoint = null;
        editorState.rotating = false;
        editorState.rotatingGroup = false;
        editorState.groupRotateCenter = null;
        editorState.dragging = false;
        editorState.groupDragLast = null;

        // Do not leave an interrupted freehand or ordinary path active.
        // Multi-point paths are intentionally preserved because they are built
        // through separate taps and can be continued after an interruption.
        if (editorState.drawing && !deps.isMultiPointPath(editorState.drawing)) {
          editorState.drawing = null;
        }

        deps.updateProperties();
        deps.draw();
      });

      window.addEventListener('keydown', e => {
        if (editorState.drawing && deps.isMultiPointPath(editorState.drawing)) {
          if (e.key === 'Enter') {
            e.preventDefault();
            finishMultiPath();
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            cancelMultiPath();
            return;
          }
        }

        if ((e.key === 'Delete' || e.key === 'Backspace') && editorState.selectedIndices.size > 0) {
          if (!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
            e.preventDefault();
            deleteSelected();
          }
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          e.shiftKey ? deps.redo() : deps.undo();
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          deps.redo();
        }
      });

      editorState.lastMultiPathClickTime = 0;

      editorState.lastMultiPathClickPoint = null;

      editorState.draggingLabelOffset = false;

      editorState.labelOffsetDirty = false;

      deps.labelOffsetEditor.addEventListener('pointerdown', e => {
        if (editorState.selected < 0) return;
        const o = editorState.objects[editorState.selected];
        if (!deps.objectSupportsLabel(o)) return;
        editorState.draggingLabelOffset = true;
        editorState.labelOffsetDirty = false;
        deps.labelOffsetEditor.setPointerCapture(e.pointerId);
        updateSelectedLabelOffsetFromEvent(e, false);
        e.preventDefault();
      });

      deps.labelOffsetEditor.addEventListener('pointermove', e => {
        if (!editorState.draggingLabelOffset) return;
        updateSelectedLabelOffsetFromEvent(e, false);
      });

      deps.labelOffsetEditor.addEventListener('pointerup', e => {
        if (!editorState.draggingLabelOffset) return;
        editorState.draggingLabelOffset = false;
        updateSelectedLabelOffsetFromEvent(e, false);
        if (editorState.labelOffsetDirty) deps.commit();
        editorState.labelOffsetDirty = false;
      });

      deps.labelOffsetEditor.addEventListener('pointercancel', () => {
        editorState.draggingLabelOffset = false;
        if (editorState.labelOffsetDirty) deps.commit();
        editorState.labelOffsetDirty = false;
      });
    }

    return { install, deleteSelected, getRotationHandle, undoMultiPath, redoMultiPath, resetMultiPathHistory };
  }

  global.HandballInteractions = { createInteractions };
})(window);
