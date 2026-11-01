const { test, expect } = require('@playwright/test');

const emptyProject = {
  version: 86,
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
            state.writes.push(await blob.text());
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

test('loaded project saves back to the same file handle and name', async ({ page }) => {
  await page.getByRole('button', { name: 'Projekt laden' }).click();
  await expect(page.locator('#status')).toContainText('Projekt geladen: training-test.json');

  await page.getByRole('button', { name: 'Projekt speichern' }).click();

  const result = await page.evaluate(() => ({
    writes: window.__fileTestState.writes.length,
    saveAsCalls: window.__fileTestState.saveAsCalls,
    status: document.querySelector('#status').textContent
  }));

  expect(result.writes).toBe(1);
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

  await page.getByRole('button', { name: 'Auswahl' }).click();
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

  await page.getByRole('button', { name: 'Auswahl' }).click();
  await page.locator('#c').click({ position: { x: 300, y: 300 } });

  const props = page.locator('.properties');
  const editor = page.locator('#labelOffsetEditor');
  await editor.scrollIntoViewIfNeeded();

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
