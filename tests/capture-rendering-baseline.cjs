// Run manually with the test server running. Never regenerate from the refactored code.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { installRenderCapture, measureObject, normalizeSvg } = require('./render-helpers.cjs');
const fixturePath = require.resolve('./fixtures/rendering-v89.json');
const baseline = require(fixturePath);
const ref = '49627eac1f8e32a7af7eb032919c7a37c1653051';
const hash = value => createHash('sha256').update(value).digest('hex');

(async () => {
  const source = execFileSync('git', ['show', `${ref}:index.html`], {encoding:'utf8'}).replace(/\r\n/g, '\n');
  const marker = '  draw();\n})();';
  if (!source.includes(marker)) throw new Error('Original editor initialization not found');
  const html = source.replace(marker, `  draw();
  window.__renderers.canvas = { drawObject };
  window.__renderers.svg = { objectToSvg, svgCourt };
})();`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.addInitScript(installRenderCapture);
    await page.route('http://127.0.0.1:4173/', route => route.fulfill({body:html,contentType:'text/html'}));
    await page.goto('http://127.0.0.1:4173/');
    for (const fixture of baseline.cases) {
      const { commands, svg } = await page.evaluate(measureObject, fixture.object);
      fixture.canvasHash = hash(JSON.stringify(commands));
      fixture.svgHash = hash(normalizeSvg(svg));
    }
    baseline.source = `main v89 (${ref}) before renderer extraction`;
    baseline.courts = [];
    for (const mode of ['none','half','full']) {
      for (const rotation of ['0','90','180','270']) {
        for (const theme of ['gray','blue']) {
          const svg = await page.evaluate(({mode,rotation,theme}) => {
            for (const [id,value] of [['courtMode',mode],['courtRotation',rotation],['courtTheme',theme]]) {
              const control = document.getElementById(id);
              control.value = value;
              control.dispatchEvent(new Event('change'));
            }
            return window.__renderers.svg.svgCourt();
          }, {mode,rotation,theme});
          baseline.courts.push({mode,rotation,theme,svgHash:hash(normalizeSvg(svg))});
        }
      }
    }
    fs.writeFileSync(fixturePath, JSON.stringify(baseline,null,2)+'\n');
    console.log(`Captured ${baseline.cases.length} objects and ${baseline.courts.length} courts from ${ref}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
