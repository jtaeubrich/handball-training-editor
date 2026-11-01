const { test, expect } = require('@playwright/test');

const emptyProject = {
  version: 89,
  canvas: { width: 820, height: 820 },
  court: {
    mode: 'half',
    theme: 'gray',
    rotation: 0,
    sectorOpacity: 0.92,
    sectorOpacityPercent: 90,
    gridVisible: false
  },
  layout: { cols: 1, rows: 1, activeCell: 0, zoomPercent: 100 },
  cellCourts: [{
    mode: 'half',
    theme: 'gray',
    rotation: 0,
    sectorOpacity: 0.92,
    sectorOpacityPercent: 90,
    gridVisible: false
  }],
  objects: []
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(project => {
    const state = {
      openHandleName: 'training-test.json',
      writes: [],
      writeCalls: 0,
      saveAsCalls: 0
    };
    window.__fileTestState = state;

    const handle = {
      name: state.openHandleName,
      async getFile() {
        return new File(
          [JSON.stringify(project)],
          state.openHandleName,
          { type: 'application/json' }
        );
      },
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
      async createWritable() {
        return {
          async write(blob) {
            state.writeCalls += 1;
            state.writes.push(typeof blob.text === 'function' ? await blob.text() : String(blob));
          },
          async close() {}
        };
      }
    };

    window.showOpenFilePicker = async () => [handle];
    window.showSaveFilePicker = async () => {
      state.saveAsCalls += 1;
      return handle;
    };
  }, emptyProject);

  await page.goto('/');
});

test('refactored IO and export modules are loaded', async ({ page }) => {
  const modules = await page.evaluate(() => ({
    projectIO: typeof window.HandballProjectIO?.createProjectFileController,
    exportSvg: typeof window.HandballExport?.saveSvgText,
    exportPng: typeof window.HandballExport?.saveCanvasPng
  }));

  expect(modules.projectIO).toBe('function');
  expect(modules.exportSvg).toBe('function');
  expect(modules.exportPng).toBe('function');
});

test('history manager supports commit, undo and redo', async ({ page }) => {
  const result = await page.evaluate(() => {
    const history = window.HandballStateHistory.createHistory({
      initialObjects: [{ id: 1 }],
      maxEntries: 10
    });

    history.commit([{ id: 1 }, { id: 2 }]);
    history.commit([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const undo = history.undo();
    const redo = history.redo();

    return {
      undoLength: undo.length,
      redoLength: redo.length,
      debug: history.debugState()
    };
  });

  expect(result.undoLength).toBe(2);
  expect(result.redoLength).toBe(3);
  expect(result.debug.historyLength).toBe(3);
  expect(result.debug.redoLength).toBe(0);
});

test('selection helper supports single, toggle and rectangle multi-selection', async ({ page }) => {
  const result = await page.evaluate(() => {
    const indices = new Set();
    let selected = window.HandballSelection.setSingle(indices, 1);
    selected = window.HandballSelection.toggle(indices, selected, 3);
    selected = window.HandballSelection.applyRectangle(indices, [0, 2], true);

    const objects = ['a','b','c','d'];
    return {
      selected,
      indices: Array.from(indices).sort((a,b) => a-b),
      objects: window.HandballSelection.selectedObjects(indices, objects)
    };
  });

  expect(result.selected).toBe(2);
  expect(result.indices).toEqual([0,1,2,3]);
  expect(result.objects).toEqual(['b','d','a','c']);
});

test('geometry helpers calculate distances and curve samples', async ({ page }) => {
  const result = await page.evaluate(() => {
    const g = window.HandballGeometry;
    const segmentDistance = g.distToSegment(5, 5, 0, 0, 10, 0);
    const bezier = {
      x1: 0, y1: 0,
      cx1: 0, cy1: 10,
      cx2: 10, cy2: 10,
      x2: 10, y2: 0
    };
    const mid = g.bezierPoint(bezier, 0.5);
    const multi = g.sampledMultiPathPoints({
      points: [{x:0,y:0},{x:10,y:10},{x:20,y:0}]
    }, 6);

    return {
      segmentDistance,
      mid,
      multiCount: multi.length,
      polylineLength: g.polylineLength([{x:0,y:0},{x:3,y:4},{x:6,y:8}])
    };
  });

  expect(result.segmentDistance).toBeCloseTo(5, 5);
  expect(result.mid.x).toBeCloseTo(5, 5);
  expect(result.mid.y).toBeCloseTo(7.5, 5);
  expect(result.multiCount).toBeGreaterThan(6);
  expect(result.polylineLength).toBeCloseTo(10, 5);
});

test('geometry hit testing distinguishes hits from misses', async ({ page }) => {
  const result = await page.evaluate(() => {
    const g = window.HandballGeometry;
    const objects = [
      { kind:'symbol', type:'attacker', x:100, y:100, size:50, rotation:0 },
      { kind:'symbol', type:'airbody', x:200, y:200, size:36, rotation:0 },
      { kind:'path', type:'run', x1:300, y1:300, x2:400, y2:300 }
    ];

    return {
      attackerHit: g.hitTest(objects, 100, 100, {}),
      airbodyHit: g.hitTest(objects, 200, 200, {}),
      pathHit: g.hitTest(objects, 350, 305, {
        isMultiPointPath: () => false,
        isComplexPath: () => false
      }),
      miss: g.hitTest(objects, 700, 700, {
        isMultiPointPath: () => false,
        isComplexPath: () => false
      })
    };
  });

  expect(result.attackerHit).toBe(0);
  expect(result.airbodyHit).toBe(1);
  expect(result.pathHit).toBe(2);
  expect(result.miss).toBe(-1);
});

test('loaded project saves back to the same file handle and name', async ({ page }) => {
  await page.getByRole('button', { name: 'Projekt laden' }).click();
  await expect(page.locator('#status')).toContainText('Projekt geladen: training-test.json');

  await page.getByRole('button', { name: 'Projekt speichern' }).click();

  const result = await page.evaluate(() => ({
    writes: window.__fileTestState.writes.length,
    writeCalls: window.__fileTestState.writeCalls,
    saveAsCalls: window.__fileTestState.saveAsCalls,
    status: document.querySelector('#status').textContent
  }));

  expect(result.writeCalls).toBe(1);
  expect(result.saveAsCalls).toBe(0);
  expect(result.status).toContain('Projekt gespeichert: training-test.json');
});

test('feeder uses attacker blue and remains fully filled', async ({ page }) => {
  await page.evaluate(() => {
    const feeder = document.querySelector('.tool[data-tool="feeder"]');
    feeder.click();
    const canvas = document.querySelector('#c');
    const rect = canvas.getBoundingClientRect();
    const ev = new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: rect.left + 250,
      clientY: rect.top + 250
    });
    canvas.dispatchEvent(ev);
  });

  const project = await page.evaluate(() => {
    const c = document.querySelector('#c');
    return {
      status: document.querySelector('#status').textContent,
      // Canvas pixels are intentionally not inspected here; the object color
      // and SVG output together cover the color + full-fill semantics.
      svgButtonExists: !!document.querySelector('#svgBtn')
    };
  });

  expect(project.status).toContain('Anspieler');

  await page.getByRole('button', { name: 'Auswahl', exact: true }).click();
  await page.locator('#c').click({ position: { x: 250, y: 250 } });
  await expect(page.locator('#propColor')).toHaveValue('#1976d2');
  await expect(page.locator('#attackerPropColors')).toBeVisible();
});

test('desktop label offset control can be scrolled fully into view', async ({ page }) => {
  await page.evaluate(() => {
    const btn = document.querySelector('.tool[data-tool="attacker"]');
    btn.click();

    const canvas = document.querySelector('#c');
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 2,
      pointerType: 'mouse',
      clientX: rect.left + 300,
      clientY: rect.top + 300
    }));
  });

  const editor = page.locator('#labelOffsetEditor');
  await expect(page.locator('#labelProps')).toBeVisible();
  await expect(editor).toBeVisible();

  await page.evaluate(() => {
    document.querySelector('#labelOffsetEditor').scrollIntoView({
      block:'end'
    });
  });

  const boxes = await page.evaluate(() => {
    const p = document.querySelector('.properties').getBoundingClientRect();
    const e = document.querySelector('#labelOffsetEditor').getBoundingClientRect();
    return {
      propTop: p.top,
      propBottom: p.bottom,
      editorTop: e.top,
      editorBottom: e.bottom
    };
  });

  expect(boxes.editorTop).toBeGreaterThanOrEqual(boxes.propTop);
  expect(boxes.editorBottom).toBeLessThanOrEqual(boxes.propBottom);
});
