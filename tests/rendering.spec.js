const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');
const baseline = require('./fixtures/rendering-v89.json');
const { installRenderCapture, measureObject, normalizeSvg } = require('./render-helpers.cjs');

const hash = value => createHash('sha256').update(value).digest('hex');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installRenderCapture);
  await page.goto('/');
});

test('all symbols, paths, labels and degenerate paths retain v89 rendering', async ({ page }) => {
  for (const fixture of baseline.cases) {
    await test.step(fixture.name, async () => {
      const { commands, svg } = await page.evaluate(measureObject, fixture.object);
      expect(hash(JSON.stringify(commands)), `${fixture.name} Canvas commands`).toBe(fixture.canvasHash);
      expect(hash(normalizeSvg(svg)), `${fixture.name} SVG`).toBe(fixture.svgHash);
    });
  }
});

test('feeder stays fully blue on Canvas; Air Body exports a filled silhouette', async ({ page }) => {
  const result = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 200;
    const c = canvas.getContext('2d');
    const object = {kind:'symbol',type:'feeder',x:100,y:100,size:80,color:'#1976d2',width:2};
    window.__renderers.canvas.drawObject(c, object);
    const pixel = y => Array.from(c.getImageData(100,y,1,1).data);
    const svg = window.__renderers.svg.objectToSvg({...object,type:'airbody'},0);
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`, 'image/svg+xml');
    return {
      top:pixel(85),bottom:pixel(115),
      paths:doc.querySelectorAll('path').length,
      fill:doc.querySelector('path').getAttribute('fill'),
      curve:doc.querySelector('path').getAttribute('d'),
      parseError:!!doc.querySelector('parsererror')
    };
  });
  expect(result.top).toEqual([25,118,210,255]);
  expect(result.bottom).toEqual([25,118,210,255]);
  expect(result.parseError).toBe(false);
  expect(result.paths).toBe(1);
  expect(result.fill).toBe('#1976d2');
  expect(result.curve).toContain('C');
});

test('SVG courts retain v89 output for every mode and rotation', async ({ page }) => {
  for (const fixture of baseline.courts) {
    const svg = await page.evaluate(({mode,rotation,theme}) => {
      for (const [id,value] of [['courtMode',mode],['courtRotation',rotation],['courtTheme',theme]]) {
        const control = document.getElementById(id);
        control.value = value;
        control.dispatchEvent(new Event('change'));
      }
      return window.__renderers.svg.svgCourt();
    }, fixture);
    expect(hash(normalizeSvg(svg)), `${fixture.mode}/${fixture.rotation}/${fixture.theme}`).toBe(fixture.svgHash);
  }
});

test('SVG preserves path variants and escapes labels', async ({ page }) => {
  const results = await page.evaluate(objects => objects.map(object => {
    const svg = window.__renderers.svg.objectToSvg(object, 0);
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`, 'image/svg+xml');
    return {
      type:object.type, svg,
      error:!!doc.querySelector('parsererror'),
      label:doc.querySelector('text')?.textContent,
      dashed:!!doc.querySelector('[stroke-dasharray]'),
      lines:doc.querySelectorAll('line').length,
      polyline:!!doc.querySelector('polyline'),
      curve:!!doc.querySelector('path[d*=" C "]')
    };
  }), baseline.cases.slice(0,42).map(f => f.object));
  for (const result of results) expect(result.error, result.type).toBe(false);
  expect(results.find(r => r.type === 'pass').dashed).toBe(true);
  expect(results.find(r => r.type === 'passCurve').curve).toBe(true);
  expect(results.find(r => r.type === 'runMulti').polyline).toBe(true);
  expect(results.find(r => r.type === 'shot').lines).toBe(2);
  expect(results.find(r => r.type === 'screen').lines).toBe(2);
  expect(results.find(r => r.label?.includes('<RM')).label).toBe('<RM & "A">');
});

test('editor loads renderer modules, selects objects and exports SVG and PNG', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#attackGroupBtn').click();
  await page.locator('#c').click({position:{x:300,y:300}});
  await expect(page.locator('#propPanel')).toBeVisible();
  await page.locator('#propShowLabel').check();
  const imageBefore = await page.locator('#c').evaluate(c => c.toDataURL());
  // Capture files at the existing export boundary without invoking native dialogs.
  await page.evaluate(() => {
    window.__exports = [];
    window.HandballExport.saveSvgText = async svg => window.__exports.push({type:'svg',svg});
    window.HandballExport.saveCanvasPng = async canvas => window.__exports.push({type:'png',image:canvas.toDataURL()});
  });
  await page.locator('#svgBtn').click();
  await page.locator('#pngBtn').click();
  const result = await page.evaluate(() => ({
    exports:window.__exports,
    image:document.querySelector('#c').toDataURL(),
    canvasFactory:typeof window.HandballCanvasRenderer.createCanvasRenderer,
    svgFactory:typeof window.HandballSvgRenderer.createSvgRenderer
  }));
  expect(result.canvasFactory).toBe('function');
  expect(result.svgFactory).toBe('function');
  expect(result.exports.map(e => e.type)).toEqual(['svg','png']);
  expect(result.exports[0].svg).toContain('attackerClip0');
  expect(result.exports[0].svg).toContain('player-label');
  expect(result.exports[1].image).not.toBe(imageBefore);
  expect(result.image).toBe(imageBefore); // selection restored after PNG export
  expect(errors).toEqual([]);
});

test('SVG court uses current settings after mode, theme and rotation changes', async ({ page }) => {
  const settings = async () => page.evaluate(() => window.__renderers.svg.svgCourt());
  const initial = await settings();
  await page.locator('#courtMode').selectOption('none');
  expect(await settings()).toBe('');
  await page.locator('#courtMode').selectOption('full');
  await page.locator('#courtRotation').selectOption('90');
  const full = await settings();
  expect(full).toContain('fullCourtClip');
  expect(full).toContain('rotate(90');
  expect(full).not.toBe(initial);
  await page.locator('#courtTheme').selectOption('gray');
  const gray = await settings();
  const themes = await page.locator('#courtTheme option').evaluateAll(options => options.map(o => o.value));
  await page.locator('#courtTheme').selectOption(themes.find(t => t !== 'gray'));
  expect(await settings()).not.toBe(gray);
});
