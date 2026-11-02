(function (global) {
  'use strict';

  // State is shared with the editor; dependencies provide explicit actions and controls.
  function createTools(editorState, deps) {
    function setTool(t, button=null) {
      deps.resetMultiPathHistory();
      if (editorState.drawing && deps.isMultiPointPath(editorState.drawing) && t !== editorState.drawing.type) {
        editorState.drawing = null;
        editorState.lastMultiPathClickTime = 0;
        editorState.lastMultiPathClickPoint = null;
      }

      editorState.tool = t;
      deps.clearSelection();
      editorState.rotating = false;
      editorState.rotatingGroup = false;
      editorState.groupRotateCenter = null;
      editorState.draggingEndpoint = null;

      document.querySelectorAll('.tool, .tool-group-main, #selectBtn').forEach(b => b.classList.remove('active'));
      if (button) button.classList.add('active');
      else if (t === 'select') document.getElementById('selectBtn').classList.add('active');

      if (t === 'attacker' || t === 'attackerBall') {
        editorState.attackGroupSelection = t;
      }
      if (t === 'defender' || t === 'goalkeeper') {
        editorState.defenseGroupSelection = t;
      }
      if (['cone','ring','disc','airbody','bench','mat','crashMat'].includes(t)) {
        editorState.otherGroupSelection = t;
      }

      const pathGroupKey = (typeof pathVariantToGroup !== 'undefined') ? pathVariantToGroup[t] : null;
      if (pathGroupKey && typeof pathGroupSelections !== 'undefined') {
        pathGroupSelections[pathGroupKey] = t;
      }

      updateGroupedToolButtons();
      if (typeof updatePathGroupButtons === 'function') updatePathGroupButtons();

      if (t === 'attacker' || t === 'attackerBall') {
        attackGroupBtn?.classList.add('active');
      }
      if (t === 'defender' || t === 'goalkeeper') {
        defenseGroupBtn?.classList.add('active');
      }
      if (['cone','ring','disc','airbody','bench','mat','crashMat'].includes(t)) {
        otherGroupBtn?.classList.add('active');
      }
      if (typeof pathVariantToGroup !== 'undefined' && pathVariantToGroup[t]) {
        document.querySelector(`.path-tool-group[data-path-group="${pathVariantToGroup[t]}"] .path-group-main`)?.classList.add('active');
      }

      deps.status.textContent = t === 'select' ? 'Auswahlmodus' : 'Werkzeug: ' + (deps.typeNames[t] || t);

      const mobileSelectStateBtn = document.getElementById('mobileSelectBtn');
      if (mobileSelectStateBtn) {
        mobileSelectStateBtn.classList.toggle('active', t === 'select');
      }

      deps.canvas.style.cursor = t === 'select'
        ? 'default'
        : ((deps.pathTools.has(t) || t === 'freehand') ? 'crosshair' : 'copy');

      deps.markerColorPanel.hidden = !deps.markerTypes.has(t);
      deps.freehandColorPanel.hidden = t !== 'freehand';
      deps.updateMarkerSwatches();
      deps.updateFreehandSwatches();

      deps.updateProperties();
      deps.draw();
    }

    const attackGroupBtn = document.getElementById('attackGroupBtn');

    const defenseGroupBtn = document.getElementById('defenseGroupBtn');

    const otherGroupBtn = document.getElementById('otherGroupBtn');

    const attackToolDropdown = document.getElementById('attackToolDropdown');

    const defenseToolDropdown = document.getElementById('defenseToolDropdown');

    const otherToolDropdown = document.getElementById('otherToolDropdown');

    function attackGroupMarkup(selectedTool) {
      const withBall = selectedTool === 'attackerBall';
      const label = withBall ? 'Angreifer mit Ball' : 'Angriffsspieler';
      const ballSvg = withBall ? '<circle cx="11" cy="-9" r="4" fill="#111111"/>' : '';
      return `
        <span class="ico">
          <svg viewBox="-22 -16 44 32">
            <defs><clipPath id="triClipMainDynamic"><path d="M0,-12 L-13,12 L13,12 Z"/></clipPath></defs>
            <path d="M0,-12 L-13,12 L13,12 Z" fill="white" stroke="#1976d2" stroke-width="2"/>
            <rect x="-15" y="-14" width="30" height="14" fill="#1976d2" clip-path="url(#triClipMainDynamic)"/>
            ${ballSvg}
          </svg>
        </span>
        <span class="tool-group-label">${label}</span>
        <span class="tool-group-arrow">▼</span>`;
    }

    function defenseGroupMarkup(selectedTool) {
      const isGoalkeeper = selectedTool === 'goalkeeper';
      const label = isGoalkeeper ? 'Torwart' : 'Abwehrspieler';
      const armsSvg = isGoalkeeper
        ? '<path d="M-18,0 L-11,0 M11,0 L18,0" stroke="#d32f2f" stroke-width="2.2" stroke-linecap="round"/>'
        : '';
      return `
        <span class="ico">
          <svg viewBox="-26 -16 52 32">
            ${armsSvg}
            <circle cx="0" cy="0" r="12" fill="white" stroke="#d32f2f" stroke-width="2"/>
            <path d="M-12,0 A12,12 0 0 1 12,0 L12,0 L-12,0 Z" fill="#d32f2f"/>
          </svg>
        </span>
        <span class="tool-group-label">${label}</span>
        <span class="tool-group-arrow">▼</span>`;
    }

    function otherGroupMarkup(selectedTool) {
      const option = otherToolDropdown?.querySelector(`.tool[data-tool="${selectedTool}"]`);
      const icoHtml = option?.querySelector('.ico')?.innerHTML || '';
      const label = option ? option.textContent.trim() : 'Sonstiges';
      return `
        <span class="ico">${icoHtml}</span>
        <span class="tool-group-label">${label}</span>
        <span class="tool-group-arrow">▼</span>`;
    }

    function updateGroupedToolButtons() {
      if (attackGroupBtn) attackGroupBtn.innerHTML = attackGroupMarkup(editorState.attackGroupSelection);
      if (defenseGroupBtn) defenseGroupBtn.innerHTML = defenseGroupMarkup(editorState.defenseGroupSelection);
      if (otherGroupBtn) otherGroupBtn.innerHTML = otherGroupMarkup(editorState.otherGroupSelection);
      bindGroupedToolArrowHandlers();
    }

    function closeDesktopToolDropdowns(except=null) {
      [attackToolDropdown, defenseToolDropdown, otherToolDropdown].forEach(dd => {
        if (dd && dd !== except) dd.classList.remove('open');
      });
    }

    function bindGroupedToolArrowHandlers() {
      const attackArrow = attackGroupBtn?.querySelector('.tool-group-arrow');
      const defenseArrow = defenseGroupBtn?.querySelector('.tool-group-arrow');
      const otherArrow = otherGroupBtn?.querySelector('.tool-group-arrow');

      if (attackArrow) {
        attackArrow.onclick = (e) => {
          e.stopPropagation();
          const willOpen = !attackToolDropdown.classList.contains('open');
          closeDesktopToolDropdowns();
          if (willOpen) attackToolDropdown.classList.add('open');
        };
      }

      if (defenseArrow) {
        defenseArrow.onclick = (e) => {
          e.stopPropagation();
          const willOpen = !defenseToolDropdown.classList.contains('open');
          closeDesktopToolDropdowns();
          if (willOpen) defenseToolDropdown.classList.add('open');
        };
      }

      if (otherArrow) {
        otherArrow.onclick = (e) => {
          e.stopPropagation();
          const willOpen = !otherToolDropdown.classList.contains('open');
          closeDesktopToolDropdowns();
          if (willOpen) otherToolDropdown.classList.add('open');
        };
      }
    }

    function bindGroupMainButton(button, getCurrentTool) {
      button?.addEventListener('click', (e) => {
        if (e.target.closest('.tool-group-arrow')) return;
        setTool(getCurrentTool());
        closeDesktopToolDropdowns();
      });
    }

    const pathGroupSelections = {
      run:'run', pass:'pass', passFake:'passFake', runBall:'runBall',
      tip:'tip', dribble:'dribble', shot:'shot', shotFake:'shotFake', screen:'screen'
    };

    const pathVariantToGroup = {
      run:'run', complexRun:'run', runMulti:'run',
      pass:'pass', passCurve:'pass',
      passFake:'passFake', passFakeCurve:'passFake',
      runBall:'runBall', runBallCurve:'runBall', runBallMulti:'runBall',
      tip:'tip', tipCurve:'tip',
      dribble:'dribble', dribbleCurve:'dribble',
      shot:'shot', shotCurve:'shot',
      shotFake:'shotFake', shotFakeCurve:'shotFake',
      screen:'screen', screenCurve:'screen', screenMulti:'screen'
    };

    function updatePathGroupButtons() {
      document.querySelectorAll('.path-tool-group').forEach(group => {
        const key=group.dataset.pathGroup;
        const btn=group.querySelector('.path-group-main');
        const selectedTool=pathGroupSelections[key] || key;
        const option=group.querySelector(`.tool[data-tool="${selectedTool}"]`);
        if (!btn || !option) return;
        const ico=option.querySelector('.ico');
        if (ico) btn.querySelector('.ico').innerHTML=ico.innerHTML;
        btn.dataset.currentTool=selectedTool;
      });
    }

    const TOOL_ORDER_STORAGE_KEY = 'handballtrainer.toolOrder.v80';

    const toolOrderMobileMap = {
      players: {
        'group:attack':['attacker','attackerBall'],
        'tool:feeder':['feeder'],
        'group:defense':['defender','goalkeeper'],
        'tool:coach':['coach'],
        'tool:ball':['ball']
      },
      paths: {
        'path:run':['run','complexRun','runMulti'],
        'path:pass':['pass','passCurve'],
        'path:screen':['screen','screenCurve','screenMulti'],
        'path:passFake':['passFake','passFakeCurve'],
        'path:runBall':['runBall','runBallCurve','runBallMulti'],
        'path:tip':['tip','tipCurve'],
        'path:dribble':['dribble','dribbleCurve'],
        'path:shot':['shot','shotCurve'],
        'path:shotFake':['shotFake','shotFakeCurve'],
        'tool:freehand':['freehand']
      },
      other: {
        'group:other':['cone','ring','disc','airbody','bench','mat','crashMat']
      }
    };

    function sortableToolId(el) {
      if (!el) return null;
      if (el.matches('.path-tool-group[data-path-group]')) {
        return 'path:' + el.dataset.pathGroup;
      }
      if (el.matches('.tool-group[data-tool-group]')) {
        return 'group:' + el.dataset.toolGroup;
      }
      if (el.matches(':scope.tool[data-tool]')) {
        return 'tool:' + el.dataset.tool;
      }
      return null;
    }

    function isTopLevelSortableTool(el) {
      if (!el || el.parentElement !== document.querySelector('aside')) return false;
      return !!sortableToolId(el);
    }

    function toolSectionDefinitions() {
      const aside = document.querySelector('aside');
      if (!aside) return [];

      const headings = [...aside.children].filter(el => el.tagName === 'H3');
      const wanted = [
        ['players','Spieler / Trainer'],
        ['paths','Wege / Aktionen'],
        ['other','Sonstiges']
      ];

      return wanted.map(([key,title]) => {
        const heading = headings.find(h => h.textContent.trim() === title);
        if (!heading) return null;

        const items = [];
        let anchor = null;
        let n = heading.nextElementSibling;

        while (n) {
          if (n.tagName === 'H3') {
            anchor = n;
            break;
          }

          if (isTopLevelSortableTool(n)) {
            items.push(n);
          } else if (items.length) {
            // Color panels / help stay fixed after the sortable buttons.
            anchor = n;
            break;
          }

          n = n.nextElementSibling;
        }

        return {key, heading, items, anchor};
      }).filter(Boolean);
    }

    function currentToolOrder() {
      const result = {};
      toolSectionDefinitions().forEach(section => {
        result[section.key] = section.items
          .map(sortableToolId)
        .filter(Boolean);
      });
      return result;
    }

    function loadStoredToolOrder() {
      try {
        const raw = localStorage.getItem(TOOL_ORDER_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch (err) {
        console.warn('[Handballtrainer] Werkzeugreihenfolge konnte nicht geladen werden:', err);
        return null;
      }
    }

    function saveToolOrder() {
      try {
        localStorage.setItem(
          TOOL_ORDER_STORAGE_KEY,
          JSON.stringify(currentToolOrder())
        );
      } catch (err) {
        console.warn('[Handballtrainer] Werkzeugreihenfolge konnte nicht gespeichert werden:', err);
      }
    }

    function applyStoredToolOrder() {
      const stored = loadStoredToolOrder();
      if (!stored) return;

      toolSectionDefinitions().forEach(section => {
        const byId = new Map(
          section.items.map(item => [sortableToolId(item), item])
        );

        const requested = Array.isArray(stored[section.key])
          ? stored[section.key]
          : [];

        const ordered = [];
        requested.forEach(id => {
          const item = byId.get(id);
          if (item && !ordered.includes(item)) ordered.push(item);
        });

        // Newly introduced tools that are not in an older preference remain
        // available and are appended in their default order.
        section.items.forEach(item => {
          if (!ordered.includes(item)) ordered.push(item);
        });

        ordered.forEach(item => {
          if (section.anchor) section.anchor.before(item);
          else section.heading.parentElement.appendChild(item);
        });
      });
    }

    function clearToolSortIndicators() {
      document.querySelectorAll(
        '.sortable-tool-item.tool-sort-before, .sortable-tool-item.tool-sort-after'
      ).forEach(el => {
        el.classList.remove('tool-sort-before','tool-sort-after');
      });
    }

    function installToolSorting() {
      toolSectionDefinitions().forEach(section => {
        section.items.forEach(item => {
          item.classList.add('sortable-tool-item');
          item.dataset.sortCategory = section.key;
          item.dataset.sortId = sortableToolId(item);

          let handle = item.querySelector(':scope > .tool-sort-handle');
          if (!handle) {
            handle = document.createElement('span');
            handle.className = 'tool-sort-handle';
            handle.textContent = '⋮⋮';
            handle.title = 'Innerhalb dieser Kategorie verschieben';
            handle.setAttribute('aria-label','Werkzeug verschieben');
            handle.draggable = true;

            if (item.tagName === 'BUTTON') {
              item.prepend(handle);
            } else {
              item.prepend(handle);
            }
          }

          handle.addEventListener('click', e => {
            // A click on the grip must not select a drawing tool.
            e.preventDefault();
            e.stopPropagation();
          });

          handle.addEventListener('dragstart', e => {
            editorState.draggedToolItem = item;
            editorState.draggedToolCategory = section.key;
            item.classList.add('tool-sort-dragging');
            closeDesktopToolDropdowns();

            e.dataTransfer.effectAllowed = 'move';
            try {
              e.dataTransfer.setData('text/plain', item.dataset.sortId || '');
            } catch (_) {}
          });

          handle.addEventListener('dragend', () => {
            item.classList.remove('tool-sort-dragging');
            clearToolSortIndicators();

            if (editorState.draggedToolItem) {
              saveToolOrder();
            }

            editorState.draggedToolItem = null;
            editorState.draggedToolCategory = null;
          });

          item.addEventListener('dragover', e => {
            if (!editorState.draggedToolItem ||
                editorState.draggedToolItem === item ||
                item.dataset.sortCategory !== editorState.draggedToolCategory) return;

            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            clearToolSortIndicators();

            const rect = item.getBoundingClientRect();
            const after = e.clientY > rect.top + rect.height / 2;
            item.classList.add(after ? 'tool-sort-after' : 'tool-sort-before');
          });

          item.addEventListener('drop', e => {
            if (!editorState.draggedToolItem ||
                editorState.draggedToolItem === item ||
                item.dataset.sortCategory !== editorState.draggedToolCategory) return;

            e.preventDefault();

            const rect = item.getBoundingClientRect();
            const after = e.clientY > rect.top + rect.height / 2;

            if (after) item.after(editorState.draggedToolItem);
            else item.before(editorState.draggedToolItem);

            clearToolSortIndicators();
            saveToolOrder();
          });
        });
      });
    }

    function orderedMobileTools(groupName, fallbackTools) {
      const map = toolOrderMobileMap[groupName];
      if (!map) return fallbackTools.slice();

      const order = currentToolOrder()[groupName] || [];
      const result = [];

      order.forEach(id => {
        (map[id] || []).forEach(toolName => {
          if (!result.includes(toolName)) result.push(toolName);
        });
      });

      fallbackTools.forEach(toolName => {
        if (!result.includes(toolName)) result.push(toolName);
      });

      return result;
    }

    let installed = false;
    function install() {
      if (installed) return;
      installed = true;
      document.querySelectorAll('.tool').forEach(btn => {
        btn.addEventListener('click', () => setTool(btn.dataset.tool, btn));
      });

      editorState.attackGroupSelection = 'attacker';

      editorState.defenseGroupSelection = 'defender';

      editorState.otherGroupSelection = 'cone';

      bindGroupMainButton(attackGroupBtn, () => editorState.attackGroupSelection);

      bindGroupMainButton(defenseGroupBtn, () => editorState.defenseGroupSelection);

      bindGroupMainButton(otherGroupBtn, () => editorState.otherGroupSelection);

      document.querySelectorAll('.tool-dropdown .tool').forEach(btn => {
        btn.addEventListener('click', () => closeDesktopToolDropdowns());
      });

      document.addEventListener('click', e => {
        if (!e.target.closest('.tool-group')) closeDesktopToolDropdowns();
      });

      updateGroupedToolButtons();

      document.querySelectorAll('.path-tool-group').forEach(group => {
        const key=group.dataset.pathGroup;
        const btn=group.querySelector('.path-group-main');
        const dropdown=group.querySelector('.path-tool-dropdown');
        const arrow=btn?.querySelector('.tool-group-arrow');

        arrow?.addEventListener('click', e => {
          e.stopPropagation();
          const open=!dropdown.classList.contains('open');
          closeDesktopToolDropdowns();
          document.querySelectorAll('.path-tool-dropdown').forEach(dd => dd.classList.remove('open'));
          if (open) dropdown.classList.add('open');
        });

        btn?.addEventListener('click', e => {
          if (e.target.closest('.tool-group-arrow')) return;
          setTool(pathGroupSelections[key] || key);
          document.querySelectorAll('.path-tool-dropdown').forEach(dd => dd.classList.remove('open'));
        });

        group.querySelectorAll('.tool').forEach(option => {
          option.addEventListener('click', () => {
            pathGroupSelections[key]=option.dataset.tool;
            updatePathGroupButtons();
            dropdown.classList.remove('open');
          });
        });
      });

      document.addEventListener('click', e => {
        if (!e.target.closest('.path-tool-group')) {
          document.querySelectorAll('.path-tool-dropdown').forEach(dd => dd.classList.remove('open'));
        }
      });

      updatePathGroupButtons();

      editorState.draggedToolItem = null;

      editorState.draggedToolCategory = null;

      applyStoredToolOrder();

      installToolSorting();
    }

    return { install, setTool, orderedMobileTools };
  }

  global.HandballTools = { createTools };
})(window);
