const { test, expect } = require('@playwright/test');
const baseline = require('./fixtures/object-model-v91.json');

const pathTypes = ['run','complexRun','runMulti','pass','passCurve','passFake','passFakeCurve','runBall','runBallCurve','runBallMulti','tip','tipCurve','dribble','dribbleCurve','shot','shotCurve','shotFake','shotFakeCurve','screen','screenCurve','screenMulti'];
const complexTypes = ['complexRun','passCurve','passFakeCurve','runBallCurve','tipCurve','dribbleCurve','shotCurve','shotFakeCurve','screenCurve'];
const multiTypes = ['runMulti','runBallMulti','screenMulti'];

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('symbol defaults retain v91 colors, sizes, rotations and labels', async ({ page }) => {
  for (const fixture of baseline.creations) {
    const actual = await page.evaluate(({type,point,settings}) =>
      window.HandballObjectModel.createSymbol(type,point,settings), fixture);
    expect(actual, fixture.type).toEqual(fixture.expected);
  }
  const sizes = await page.evaluate(() => {
    const m = window.HandballObjectModel;
    const settings = {symbolSize:10,strokeWidth:2,strokeColor:'#111111',markerColor:'#f2c500'};
    return [m.createSymbol('ball',{x:0,y:0},settings).size, m.createSymbol('airbody',{x:0,y:0},settings).size];
  });
  expect(sizes).toEqual([24,32]);
});

test('legacy objects retain their normalization and unknown fields', async ({ page }) => {
  for (const fixture of baseline.normalizations) {
    const actual = await page.evaluate(({input}) => {
      const result = window.HandballObjectModel.normalizeLoadedObject(input);
      return {result,sameObject:result === input};
    }, fixture);
    expect(actual.result, JSON.stringify(fixture.input)).toEqual(fixture.expected);
    expect(actual.sameObject).toBe(true);
  }
});

test('all path tools start with the original geometry and independent points', async ({ page }) => {
  const objects = await page.evaluate(types => types.map(type => {
    const point = {x:40,y:60};
    const object = window.HandballObjectModel.createPath(type,point,{width:3});
    point.x = 999;
    return object;
  }), pathTypes);
  for (const object of objects) {
    const expected = {
      kind:'path',type:object.type,x1:40,y1:60,x2:40,y2:60,
      color:'#111111',width:3,showLabel:false,label:'A',labelOffsetX:0,labelOffsetY:0
    };
    if (complexTypes.includes(object.type)) Object.assign(expected,{cx1:40,cy1:60,cx2:40,cy2:60});
    if (multiTypes.includes(object.type)) expected.points = [{x:40,y:60},{x:40,y:60}];
    expect(object).toEqual(expected);
  }
  const independent = await page.evaluate(() => {
    const m = window.HandballObjectModel;
    const a = m.createPath('runMulti',{x:1,y:2},{width:2});
    const b = m.createPath('runMulti',{x:1,y:2},{width:2});
    a.points[0].x = 90;
    return [a.points[1].x,b.points[0].x];
  });
  expect(independent).toEqual([1,1]);
});

test('freehand starts with its chosen color and an independent initial point', async ({ page }) => {
  const object = await page.evaluate(() => {
    const point = {x:10,y:20};
    const result = window.HandballObjectModel.createFreehand(point,{color:'#123456',width:4});
    point.y = 999;
    return result;
  });
  expect(object).toEqual({kind:'freehand',type:'freehand',points:[{x:10,y:20}],x1:10,y1:20,x2:10,y2:20,color:'#123456',width:4});
});

test('type classification and label support cover every existing path variant', async ({ page }) => {
  const result = await page.evaluate(types => {
    const m = window.HandballObjectModel;
    return {
      paths:Array.from(m.pathTools),
      complex:types.filter(t => m.isComplexPath(t) && m.isComplexPath({type:t})),
      multi:types.filter(t => m.isMultiPointPath(t) && m.isMultiPointPath({type:t})),
      labels:types.every(type => m.objectSupportsLabel({kind:'path',type})),
      feederLabel:m.objectSupportsLabel({kind:'symbol',type:'feeder'}),
      ballLabel:m.objectSupportsLabel({kind:'symbol',type:'attackerBall'}),
      bases:['complexRun','runMulti','passFakeCurve','runBallMulti','screenCurve','unknown'].map(m.basePathType)
    };
  },pathTypes);
  expect(result.paths).toEqual(pathTypes);
  expect(result.complex).toEqual(complexTypes);
  expect(result.multi).toEqual(multiTypes);
  expect(result.labels).toBe(true);
  expect(result.feederLabel).toBe(false);
  expect(result.ballLabel).toBe(true);
  expect(result.bases).toEqual(['run','run','passFake','runBall','screen','unknown']);
});

test('legacy project load-save-load preserves normalized objects and custom data', async ({ page }) => {
  const objects = baseline.normalizations.filter(f => f.input?.kind === 'symbol' && f.input.type !== 'attackerBall')
    .map(f => ({x:300,y:300,size:40,rotation:0,color:'#1976d2',width:2,...f.input}));
  objects.push({kind:'path',type:'passCurve',x1:100,y1:100,x2:220,y2:180,color:'#111111',width:2,label:123,custom:'keep'});
  await page.evaluate(() => {
    window.__projectWrites = [];
    window.showSaveFilePicker = async options => ({
      name:options.suggestedName,
      createWritable:async () => ({
        write:async blob => window.__projectWrites.push(await blob.text()), close:async () => {}
      })
    });
  });
  const load = async project => {
    await page.locator('#jsonFile').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
    await expect(page.locator('#status')).toHaveText('Projekt geladen: legacy.json');
  };
  await load({version:89,objects});
  await page.locator('#jsonSaveBtn').click();
  await expect(page.locator('#status')).toHaveText('Projekt gespeichert: legacy.json');
  const first = await page.evaluate(() => JSON.parse(window.__projectWrites[0]));
  const expected = await page.evaluate(objects => objects.map(window.HandballObjectModel.normalizeLoadedObject),objects);
  expect(first.objects).toEqual(expected);
  expect(first.version).toBe(98);
  await load(first);
  await page.locator('#jsonSaveBtn').click();
  await expect.poll(() => page.evaluate(() => window.__projectWrites.length)).toBe(2);
  const second = await page.evaluate(() => JSON.parse(window.__projectWrites[1]));
  expect(second.objects).toEqual(first.objects);
});

test('editor creates symbols, paths and freehand with undo and redo', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    window.__projectWrites = [];
    window.showSaveFilePicker = async options => ({
      name:options.suggestedName,
      createWritable:async () => ({write:async blob => window.__projectWrites.push(await blob.text()),close:async () => {}})
    });
  });
  const choose = async type => page.locator(`.tool[data-tool="${type}"]`).first().evaluate(button => button.click());
  await choose('attackerBall');
  await page.locator('#c').click({position:{x:200,y:200}});
  for (const type of ['run','passCurve','freehand']) {
    await choose(type);
    const box = await page.locator('#c').boundingBox();
    await page.mouse.move(box.x+200,box.y+220);
    await page.mouse.down();
    await page.mouse.move(box.x+280,box.y+260,{steps:5});
    await page.mouse.up();
  }
  await choose('runMulti');
  await page.locator('#c').click({position:{x:200,y:200}});
  await page.locator('#c').click({position:{x:290,y:240}});
  await page.keyboard.press('Enter');
  await page.locator('#jsonSaveBtn').click();
  await expect.poll(() => page.evaluate(() => window.__projectWrites.length)).toBe(1);
  const original = await page.evaluate(() => JSON.parse(window.__projectWrites[0]).objects);
  expect(original.map(o => o.type)).toEqual(['attackerBall','run','passCurve','freehand','runMulti']);
  expect(original[0]).toMatchObject({kind:'symbol',color:'#1976d2',attackFormation:'33',label:'RM'});
  expect(original[2].cx1).toEqual(expect.any(Number));
  expect(original[3].points.length).toBeGreaterThan(1);
  expect(original[4].points.length).toBeGreaterThanOrEqual(2);
  await page.locator('#undoBtn').click();
  await page.locator('#jsonSaveBtn').click();
  await expect.poll(() => page.evaluate(() => window.__projectWrites.length)).toBe(2);
  expect(await page.evaluate(() => JSON.parse(window.__projectWrites[1]).objects.length)).toBe(4);
  await page.locator('#redoBtn').click();
  await page.locator('#jsonSaveBtn').click();
  await expect.poll(() => page.evaluate(() => window.__projectWrites.length)).toBe(3);
  expect(await page.evaluate(() => JSON.parse(window.__projectWrites[2]).objects)).toEqual(original);
  expect(errors).toEqual([]);
});
