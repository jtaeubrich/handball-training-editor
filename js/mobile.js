(function (global) {
  'use strict';

  // State is shared with the editor; dependencies provide explicit actions and controls.
  function createMobile(editorState, deps) {
    const canvasScroller = deps.canvas.closest('main');

    const touchPointers = new Map();

    function touchMidpoint() {
      const pts = Array.from(touchPointers.values());
      if (pts.length < 2) return null;
      return {
        x:(pts[0].x + pts[1].x) / 2,
        y:(pts[0].y + pts[1].y) / 2
      };
    }

    function touchDistance() {
      const pts = Array.from(touchPointers.values());
      if (pts.length < 2) return 0;
      return Math.hypot(
        pts[1].x - pts[0].x,
        pts[1].y - pts[0].y
      );
    }

    function captureTouchCheckpoint() {
      // Only the current object state is deep-cloned.
      // History / redo contain immutable snapshots and can therefore be copied
      // shallowly. This avoids repeatedly cloning up to 100 full drawings.
      return {
        objects:deps.clone(editorState.objects),
        historyState:deps.historyManager.snapshot(),
        selected:editorState.selected,
        selectedIndices:Array.from(editorState.selectedIndices),
        drawing:editorState.drawing ? deps.clone(editorState.drawing) : null
      };
    }

    function restoreTouchCheckpoint() {
      if (!editorState.touchGestureCheckpoint) return;

      editorState.objects = deps.clone(editorState.touchGestureCheckpoint.objects);
      deps.historyManager.restore(editorState.touchGestureCheckpoint.historyState);

      editorState.selected = editorState.touchGestureCheckpoint.selected;
      editorState.selectedIndices = new Set(editorState.touchGestureCheckpoint.selectedIndices);
      editorState.drawing = editorState.touchGestureCheckpoint.drawing
        ? deps.clone(editorState.touchGestureCheckpoint.drawing)
        : null;

      editorState.dragging = false;
      editorState.draggingEndpoint = null;
      editorState.rotating = false;
      editorState.rotatingGroup = false;
      editorState.groupRotateCenter = null;
      editorState.groupDragLast = null;
      editorState.selectionRect = null;

      deps.updateProperties();
      deps.draw();
    }

    function safeCaptureTouchPointer(pointerId) {
      try {
        if (!deps.canvas.hasPointerCapture(pointerId)) {
          deps.canvas.setPointerCapture(pointerId);
        }
      } catch (_) {
        // Safari may reject capture during edge/cancel transitions.
        // Window-level cleanup below still prevents stale pointer editorState.
      }
    }

    function beginTwoFingerGesture() {
      const midpoint = touchMidpoint();
      const distance = touchDistance();
      if (!midpoint || !distance) return;

      // The first finger has intentionally been allowed to behave exactly like
      // desktop input. If a second finger appears, revert that partial action and
      // turn the interaction into a pure viewport gesture.
      restoreTouchCheckpoint();

      editorState.touchGestureActive = true;
      editorState.touchGestureSuppressEditor = true;
      editorState.touchGestureStartDistance = distance;
      editorState.touchGestureStartZoom = editorState.canvasZoom;

      const r = deps.canvas.getBoundingClientRect();
      editorState.touchGestureAnchorCanvas = {
        x:(midpoint.x - r.left) * deps.canvas.width / r.width,
        y:(midpoint.y - r.top) * deps.canvas.height / r.height
      };

      // Keep BOTH pointers captured by the canvas. The previous implementation
      // released capture here; on iOS that could cause pointerup/cancel to be lost
      // when a finger moved outside the canvas and leave the editor blocked.
      for (const pointerId of touchPointers.keys()) {
        safeCaptureTouchPointer(pointerId);
      }

      deps.status.textContent = 'Zwei-Finger-Zoom / Verschieben';
    }

    function updateTwoFingerGesture() {
      if (!editorState.touchGestureActive ||
          touchPointers.size < 2 ||
          !canvasScroller ||
          !editorState.touchGestureAnchorCanvas) return;

      const midpoint = touchMidpoint();
      const distance = touchDistance();
      if (!midpoint || !distance) return;

      const ratio = distance / editorState.touchGestureStartDistance;
      const targetZoom = Math.max(
        0.25,
        Math.min(2, editorState.touchGestureStartZoom * ratio)
      );

      deps.setCanvasZoom(targetZoom * 100);

      // Keep the canvas coordinate below the initial two-finger midpoint below
      // the CURRENT midpoint. This gives pinch zoom and two-finger panning in one
      // gesture without changing any object coordinates.
      const r = deps.canvas.getBoundingClientRect();
      const anchorClientX =
        r.left + editorState.touchGestureAnchorCanvas.x * r.width / deps.canvas.width;
      const anchorClientY =
        r.top + editorState.touchGestureAnchorCanvas.y * r.height / deps.canvas.height;

      canvasScroller.scrollLeft += anchorClientX - midpoint.x;
      canvasScroller.scrollTop  += anchorClientY - midpoint.y;
    }

    function resetTouchGestureState(forceEditorCleanup=false) {
      touchPointers.clear();
      editorState.touchGestureActive = false;
      editorState.touchGestureSuppressEditor = false;
      editorState.touchGestureStartDistance = 0;
      editorState.touchGestureAnchorCanvas = null;
      editorState.touchGestureCheckpoint = null;

      if (forceEditorCleanup) {
        editorState.dragging = false;
        editorState.draggingEndpoint = null;
        editorState.rotating = false;
        editorState.rotatingGroup = false;
        editorState.groupRotateCenter = null;
        editorState.groupDragLast = null;
        editorState.selectionRect = null;

        // A normal single-point path/freehand interaction that was interrupted by
        // Safari must not stay half-open and block future taps.
        if (editorState.drawing && !deps.isMultiPointPath(editorState.drawing)) {
          editorState.drawing = null;
        }

        deps.updateProperties();
        deps.draw();
      }

      deps.status.textContent = editorState.tool === 'select'
        ? 'Auswahlmodus'
        : 'Werkzeug: ' + (deps.typeNames[editorState.tool] || editorState.tool);
    }

    function finishTouchPointer(e) {
      if (e.pointerType !== 'touch') return;

      const wasGesture =
        editorState.touchGestureActive || editorState.touchGestureSuppressEditor;

      touchPointers.delete(e.pointerId);

      if (editorState.touchGestureActive && touchPointers.size < 2) {
        editorState.touchGestureActive = false;
        editorState.touchGestureAnchorCanvas = null;
      }

      // After a two-finger gesture the remaining finger is intentionally ignored
      // until it is lifted. This prevents it from suddenly placing/moving an
      // object when the user finishes the gesture.
      if (touchPointers.size === 0) {
        editorState.touchGestureSuppressEditor = false;
        editorState.touchGestureCheckpoint = null;

        deps.status.textContent = editorState.tool === 'select'
          ? 'Auswahlmodus'
          : 'Werkzeug: ' + (deps.typeNames[editorState.tool] || editorState.tool);
      }

      if (wasGesture) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }

    const mobileMedia = window.matchMedia('(max-width: 700px)');

    const mobileProperties = document.querySelector('.properties');

    const mobileToolSheet = document.getElementById('mobileToolSheet');

    const mobileToolSheetGrid = document.getElementById('mobileToolSheetGrid');

    const mobileToolSheetTitle = document.getElementById('mobileToolSheetTitle');

    const mobileToolSheetClose = document.getElementById('mobileToolSheetClose');

    const mobileBackdrop = document.getElementById('mobileBackdrop');

    const mobileHint = document.getElementById('mobileHint');

    const mobilePropsBtn = document.getElementById('mobilePropsBtn');

    const mobileDeleteSelectionBtn = document.getElementById('mobileDeleteSelectionBtn');

    const mobileSettingsBtn = document.getElementById('mobileSettingsBtn');

    const mobileSettingsSheet = document.getElementById('mobileSettingsSheet');

    const mobileSettingsClose = document.getElementById('mobileSettingsClose');

    const mobileSelectBtn = document.getElementById('mobileSelectBtn');

    const mobileUndoBtn = document.getElementById('mobileUndoBtn');

    const mobileRedoBtn = document.getElementById('mobileRedoBtn');

    const mobileGroups = {
      players: {
        title:'Spieler / Trainer',
        tools:['attacker','attackerBall','feeder','defender','goalkeeper','coach','ball']
      },
      paths: {
        title:'Wege / Aktionen',
        tools:['run','complexRun','runMulti','pass','passCurve','passFake','passFakeCurve','runBall','runBallCurve','runBallMulti','tip','tipCurve','dribble','dribbleCurve','shot','shotCurve','shotFake','shotFakeCurve','screen','screenCurve','screenMulti','freehand']
      },
      other: {
        title:'Sonstiges',
        tools:['cone','ring','disc','airbody','bench','mat','crashMat']
      }
    };

    function mobileLayoutActive() {
      return mobileMedia.matches;
    }

    function showMobileHint(message) {
      if (!mobileHint) return;
      mobileHint.textContent = message;
      mobileHint.classList.add('show');
      clearTimeout(editorState.mobileHintTimer);
      editorState.mobileHintTimer = setTimeout(() => mobileHint.classList.remove('show'), 950);
    }

    function updateMobileDeleteSelectionState() {
      if (!mobileDeleteSelectionBtn) return;
      mobileDeleteSelectionBtn.disabled = editorState.selectedIndices.size === 0;
    }

    function closeMobilePanels() {
      mobileToolSheet?.classList.remove('open');
      mobileSettingsSheet?.classList.remove('open');
      mobileProperties?.classList.remove('mobile-open');
      mobileBackdrop?.classList.remove('show');
      mobilePropsBtn?.classList.remove('active');
      document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
    }

    function openMobileToolGroup(name) {
      const group = mobileGroups[name];
      if (!group || !mobileToolSheetGrid) return;

      mobileProperties?.classList.remove('mobile-open');
      mobileSettingsSheet?.classList.remove('open');
      mobileToolSheetGrid.innerHTML = '';

      const originals = [...document.querySelectorAll('aside .tool')];
      const orderedTools = deps.orderedMobileTools(name, group.tools);
      orderedTools.forEach(toolName => {
        const original = originals.find(el => el.dataset.tool === toolName);
        if (!original) return;

        const clone = original.cloneNode(true);
        if (deps.pathTools.has(toolName)) {
          const action = deps.typeNames[deps.basePathType(toolName)] || toolName;
          const variant = deps.isMultiPointPath(toolName)
            ? 'Mehrpunkt' : deps.isComplexPath(toolName) ? 'Komplex' : 'Einfach';
          const icon = clone.querySelector('.ico');
          const caption = document.createElement('span');
          caption.className = 'mobile-tool-caption';
          const name = document.createElement('span');
          name.className = 'mobile-tool-name';
          name.textContent = action;
          const detail = document.createElement('span');
          detail.className = 'mobile-tool-variant';
          detail.textContent = variant;
          caption.append(name, detail);
          clone.replaceChildren(...(icon ? [icon, caption] : [caption]));
          clone.classList.add('mobile-action-tool');
          clone.setAttribute('aria-label', `${action} – ${variant}`);
        }
        clone.classList.toggle('active', editorState.tool === toolName);
        clone.addEventListener('click', () => {
          deps.setTool(toolName);
          document.querySelectorAll('#mobileToolSheet .tool').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === toolName);
          });
          closeMobilePanels();
          showMobileHint((deps.typeNames[toolName] || toolName) + ' ausgewählt');
        });
        mobileToolSheetGrid.appendChild(clone);
      });

      mobileToolSheetTitle.textContent = group.title;
      mobileToolSheet.classList.add('open');
      mobileBackdrop.classList.add('show');
      document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mobileGroup === name);
      });
    }

    function openMobileProperties() {
      mobileToolSheet?.classList.remove('open');
      mobileSettingsSheet?.classList.remove('open');

      // Always open the burger menu. With no selection the existing
      // empty-properties view is shown instead of silently doing nothing.
      deps.updateProperties();
      updateMobileDeleteSelectionState();

      mobileProperties?.classList.add('mobile-open');
      mobileBackdrop?.classList.add('show');
      mobilePropsBtn?.classList.add('active');
    }

    function copySelectOptions(source, target) {
      target.innerHTML = '';
      [...source.options].forEach(opt => {
        const clone = document.createElement('option');
        clone.value = opt.value;
        clone.textContent = opt.textContent;
        target.appendChild(clone);
      });
    }

    function syncMobileSettingsFromHeader() {
      const pairs = [
        ['strokeColor','mStrokeColor'],
        ['strokeWidth','mStrokeWidth'],
        ['symbolSize','mSymbolSize'],
        ['courtMode','mCourtMode'],
        ['courtTheme','mCourtTheme'],
        ['courtRotation','mCourtRotation'],
        ['sectorOpacity','mSectorOpacity'],
        ['layoutGrid','mLayoutGrid'],
        ['zoomRange','mZoomRange']
      ];

      pairs.forEach(([sourceId,targetId]) => {
        const source = document.getElementById(sourceId);
        const target = document.getElementById(targetId);
        if (source && target) target.value = source.value;
      });

      const mGrid = document.getElementById('mGridVisible');
      if (mGrid) mGrid.checked = deps.gridVisible.checked;
      const mFreehand = document.getElementById('mFreehandCustomColor');
      if (mFreehand) mFreehand.value = editorState.freehandColor;

      document.getElementById('mSectorOpacityValue').textContent = deps.sectorOpacityValue.textContent;
      document.getElementById('mZoomValue').textContent = deps.zoomValue.textContent;

      const mActive = document.getElementById('mActiveCellSelect');
      copySelectOptions(deps.activeCellSelect, mActive);
      mActive.value = deps.activeCellSelect.value;
    }

    function proxyInput(sourceId, targetId, eventName='change') {
      const source = document.getElementById(sourceId);
      const target = document.getElementById(targetId);
      if (!source || !target) return;

      target.addEventListener(eventName, () => {
        if (target.type === 'checkbox') source.checked = target.checked;
        else source.value = target.value;

        source.dispatchEvent(new Event(eventName, {bubbles:true}));
        syncMobileSettingsFromHeader();
      });
    }

    function openMobileSettings() {
      mobileToolSheet?.classList.remove('open');
      mobileProperties?.classList.remove('mobile-open');
      syncMobileSettingsFromHeader();
      mobileSettingsSheet?.classList.add('open');
      mobileBackdrop?.classList.add('show');
    }

    let installed = false;
    function install() {
      if (installed) return;
      installed = true;
      editorState.touchGestureActive = false;

      editorState.touchGestureSuppressEditor = false;

      editorState.touchGestureStartDistance = 0;

      editorState.touchGestureStartZoom = 1;

      editorState.touchGestureAnchorCanvas = null;

      editorState.touchGestureCheckpoint = null;

      deps.canvas.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'touch') return;

        // If Safari ever left a stale touch behind, starting a brand-new physical
        // interaction must recover automatically instead of blocking the editor.
        if (!e.isPrimary && touchPointers.size === 0) {
          resetTouchGestureState(false);
        }

        if (touchPointers.size === 0) {
          editorState.touchGestureCheckpoint = captureTouchCheckpoint();
        }

        touchPointers.set(e.pointerId, {
          x:e.clientX,
          y:e.clientY
        });

        safeCaptureTouchPointer(e.pointerId);

        if (touchPointers.size >= 2) {
          if (!editorState.touchGestureActive) beginTwoFingerGesture();

          e.preventDefault();
          e.stopImmediatePropagation();
        } else if (editorState.touchGestureSuppressEditor) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }, {capture:true, passive:false});

      deps.canvas.addEventListener('pointermove', e => {
        if (e.pointerType !== 'touch' ||
            !touchPointers.has(e.pointerId)) return;

        touchPointers.set(e.pointerId, {
          x:e.clientX,
          y:e.clientY
        });

        if (editorState.touchGestureActive) {
          updateTwoFingerGesture();
          e.preventDefault();
          e.stopImmediatePropagation();
        } else if (editorState.touchGestureSuppressEditor) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }, {capture:true, passive:false});

      deps.canvas.addEventListener(
        'pointerup',
        finishTouchPointer,
        {capture:true, passive:false}
      );

      deps.canvas.addEventListener(
        'pointercancel',
        finishTouchPointer,
        {capture:true, passive:false}
      );

      ['gesturestart','gesturechange','gestureend'].forEach(type => {
        deps.canvas.addEventListener(type, e => {
          e.preventDefault();
        }, {passive:false});
      });

      window.addEventListener('pointerup', e => {
        if (e.pointerType !== 'touch') return;
        if (touchPointers.has(e.pointerId)) {
          touchPointers.delete(e.pointerId);
        }
        if (touchPointers.size === 0 && !editorState.touchGestureActive) {
          editorState.touchGestureSuppressEditor = false;
          editorState.touchGestureCheckpoint = null;
        }
      });

      window.addEventListener('pointercancel', e => {
        if (e.pointerType !== 'touch') return;
        touchPointers.delete(e.pointerId);

        if (touchPointers.size === 0) {
          resetTouchGestureState(true);
        }
      });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden && touchPointers.size) {
          resetTouchGestureState(true);
        }
      });

      window.addEventListener('blur', () => {
        if (touchPointers.size) {
          resetTouchGestureState(true);
        }
      });

      editorState.mobileHintTimer = null;

      proxyInput('strokeColor','mStrokeColor','input');

      proxyInput('strokeWidth','mStrokeWidth','change');

      proxyInput('symbolSize','mSymbolSize','change');

      proxyInput('courtMode','mCourtMode','change');

      proxyInput('courtTheme','mCourtTheme','change');

      proxyInput('courtRotation','mCourtRotation','change');

      proxyInput('sectorOpacity','mSectorOpacity','input');

      proxyInput('gridVisible','mGridVisible','change');

      proxyInput('layoutGrid','mLayoutGrid','change');

      proxyInput('activeCellSelect','mActiveCellSelect','change');

      proxyInput('zoomRange','mZoomRange','input');

      document.querySelectorAll('.mobile-freehand-swatch').forEach(btn => {
        btn.addEventListener('click', () => {
          deps.setFreehandColor(btn.dataset.color);
          const input = document.getElementById('mFreehandCustomColor');
          if (input) input.value = editorState.freehandColor;
        });
      });

      document.getElementById('mFreehandCustomColor')?.addEventListener('input', e => {
        deps.setFreehandColor(e.target.value);
      });

      document.getElementById('mZoomOutBtn')?.addEventListener('click', () => {
        deps.zoomOutBtn.click();
        syncMobileSettingsFromHeader();
      });

      document.getElementById('mZoomInBtn')?.addEventListener('click', () => {
        deps.zoomInBtn.click();
        syncMobileSettingsFromHeader();
      });

      document.getElementById('mDuplicateCellBtn')?.addEventListener('click', () => {
        deps.duplicateCellBtn.click();
        syncMobileSettingsFromHeader();
      });

      document.getElementById('mJsonSaveBtn')?.addEventListener('click', () => document.getElementById('jsonSaveBtn').click());

      document.getElementById('mJsonLoadBtn')?.addEventListener('click', () => document.getElementById('jsonLoadBtn').click());

      document.getElementById('mPngBtn')?.addEventListener('click', () => document.getElementById('pngBtn').click());

      document.getElementById('mSvgBtn')?.addEventListener('click', () => document.getElementById('svgBtn').click());

      document.getElementById('mClearBtn')?.addEventListener('click', () => document.getElementById('clearBtn').click());

      document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => openMobileToolGroup(btn.dataset.mobileGroup));
      });

      mobileToolSheetClose?.addEventListener('click', closeMobilePanels);

      mobileSettingsClose?.addEventListener('click', closeMobilePanels);

      mobileBackdrop?.addEventListener('click', closeMobilePanels);

      mobileSettingsBtn?.addEventListener('click', () => {
        if (mobileSettingsSheet?.classList.contains('open')) closeMobilePanels();
        else openMobileSettings();
      });

      mobilePropsBtn?.addEventListener('click', () => {
        if (mobileProperties?.classList.contains('mobile-open')) closeMobilePanels();
        else openMobileProperties();
      });

      mobileDeleteSelectionBtn?.addEventListener('click', () => {
        if (!editorState.selectedIndices.size) return;

        const count = editorState.selectedIndices.size;
        deps.deleteSelected();
        updateMobileDeleteSelectionState();

        showMobileHint(
          count > 1
            ? `${count} Objekte gelöscht`
            : 'Objekt gelöscht'
        );
      });

      mobileSelectBtn?.addEventListener('click', () => {
        deps.setTool('select');
        closeMobilePanels();
        showMobileHint('Auswahlmodus');
      });

      mobileUndoBtn?.addEventListener('click', deps.undo);

      mobileRedoBtn?.addEventListener('click', deps.redo);

      mobileSelectBtn?.classList.toggle('active', editorState.tool === 'select');

      updateMobileDeleteSelectionState();

      mobileMedia.addEventListener?.('change', () => {
        closeMobilePanels();
        deps.draw();
      });
    }

    return { install };
  }

  global.HandballMobile = { createMobile };
})(window);
