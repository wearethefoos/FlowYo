const { suite } = require('./harness');

/**
 * Everything here runs on an emulated phone with real touch events and a
 * realistic finger radius — which is the only way the fuzzy-hit-testing bugs
 * (a fingertip snapping onto a connector handle instead of the shape) show up.
 */
suite('touch: dragging, connecting, editing and pinching on a phone', async (t) => {
  const { page, check, touch, centre } = t;

  const pos = id => page.evaluate(i => { const n = window.FlowYo.state.nodes.find(x => x.id === i); return { x: n.x, y: n.y }; }, id);
  const zoom = () => page.evaluate(() => window.FlowYo.view().k);
  const editorUp = () => page.evaluate(() => getComputedStyle(document.getElementById('label-editor')).display === 'block');
  const reset = async () => {
    await page.evaluate(() => { window.FlowYo.load('flowchart TD\n  n1(("Start"))\n  n2["Draw a box"]\n  n3{"Happy?"}\n  n1 --> n2\n  n2 --> n3\n%% pos n1 420 100\n%% pos n2 420 260\n%% pos n3 420 430'); });
    await page.waitForTimeout(200);
  };

  check('the page thinks it is a touch device', await page.evaluate(() => matchMedia('(pointer: coarse)').matches));

  /* ---------- 1. the layout fits a phone ---------- */
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    canvas: Math.round(document.getElementById('stage').getBoundingClientRect().height),
    hints: Math.round(document.getElementById('hints').getBoundingClientRect().height),
    shapesOnScreen: [...document.querySelectorAll('.shape-btn')].every(b => b.getBoundingClientRect().right <= window.innerWidth),
    copyOnScreen: document.getElementById('btn-export').getBoundingClientRect().right <= window.innerWidth,
    height: window.innerHeight
  }));
  check('nothing spills off the side of the screen', layout.overflow <= 0, layout);
  check('every shape button is reachable without scrolling', layout.shapesOnScreen, layout);
  check('so is the Copy button', layout.copyOnScreen, layout);
  check('the hint strip stays one line', layout.hints < 60, layout);
  check('the canvas still gets most of the screen', layout.canvas > layout.height * 0.6, layout);

  /* ---------- 2. drag a shape — including one that is already selected ---------- */
  await reset();
  const id = await page.evaluate(() => window.FlowYo.state.nodes[1].id);
  let before = await pos(id);
  let c = await centre(id);
  await touch.drag(c, { x: c.x + 70, y: c.y + 50 });
  let after = await pos(id);
  check('a first touch drags the shape', after.x !== before.x && after.y !== before.y, { before, after });

  // the regression: once selected, the handles are live, and a fat finger used to
  // land on one of them and start an arrow instead of moving the shape
  before = await pos(id);
  c = await centre(id);
  await touch.tap(c.x, c.y);
  check('tapping selects it', await page.evaluate(() => !!document.querySelector('.node.selected')));
  const edgesBefore = await page.evaluate(() => window.FlowYo.state.edges.length);
  c = await centre(id);
  await touch.drag(c, { x: c.x - 60, y: c.y + 60 });
  after = await pos(id);
  check('dragging a selected shape still moves it', after.x !== before.x || after.y !== before.y, { before, after });
  check('and does not draw a stray arrow', await page.evaluate(() => window.FlowYo.state.edges.length) === edgesBefore);

  /* ---------- 3. the handles are still usable on purpose ---------- */
  await reset();
  const src = await page.evaluate(() => window.FlowYo.state.nodes[0].id);
  const dst = await page.evaluate(() => window.FlowYo.state.nodes[2].id);
  c = await centre(src);
  await touch.tap(c.x, c.y);
  const handle = await page.evaluate(i => {
    const list = document.querySelectorAll(`[data-id="${i}"] .anchor`);
    const r = list[2].getBoundingClientRect();
    const shape = document.querySelector(`[data-id="${i}"] .node-shape`).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, size: r.width, opacity: getComputedStyle(list[2]).opacity,
             below: r.y > shape.bottom - 2 };
  }, src);
  check('selecting reveals the handles', handle.opacity === '1', handle);
  check('they are finger-sized', handle.size >= 14, handle);
  check('and they sit outside the shape, clear of the drag area', handle.below, handle);
  const target = await centre(dst);
  const n0 = await page.evaluate(() => window.FlowYo.state.edges.length);
  await touch.drag({ x: handle.x, y: handle.y }, target);
  const made = await page.evaluate(() => window.FlowYo.state.edges.map(e => e.from + '->' + e.to));
  check('dragging a handle onto another shape connects them', made.length === n0 + 1 && made.includes(src + '->' + dst), made);

  /* ---------- 4. double-tap to rename ---------- */
  await reset();
  c = await centre(id);
  await touch.doubleTap(c.x, c.y);
  check('double-tap opens the label editor', await editorUp());
  await page.keyboard.type('On the phone');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check('and the typing sticks', await page.evaluate(i => window.FlowYo.state.nodes.find(n => n.id === i).label, id) === 'On the phone');

  // an arrow, too
  const edgeId = await page.evaluate(() => window.FlowYo.state.edges[0].id);
  const ec = await t.edgePoint(edgeId);
  await touch.doubleTap(ec.x, ec.y);
  check('double-tap on an arrow opens its editor', await editorUp());
  await page.keyboard.type('yes');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check('arrows can be labelled by thumb', await page.evaluate(i => window.FlowYo.state.edges.find(e => e.id === i).label, edgeId) === 'yes');

  /* ---------- 5. one finger pans, two fingers zoom ---------- */
  await reset();
  const view0 = await page.evaluate(() => window.FlowYo.view());
  await touch.drag({ x: 60, y: 300 }, { x: 200, y: 380 });
  const view1 = await page.evaluate(() => window.FlowYo.view());
  check('one finger on empty canvas pans', view1.x !== view0.x && view1.y !== view0.y, { view0, view1 });
  check('panning does not move any shape', await page.evaluate(() => window.FlowYo.state.nodes[1].x) === 420);

  const z0 = await zoom();
  await touch.pinch({ x: 195, y: 350 }, 1.8);
  const z1 = await zoom();
  check('two fingers spreading zooms in', z1 > z0 * 1.2, { z0, z1 });
  await touch.pinch({ x: 195, y: 350 }, 0.4);
  const z2 = await zoom();
  check('and pinching zooms back out', z2 < z1 * 0.8, { z1, z2 });

  const nodesBefore = await page.evaluate(() => JSON.stringify(window.FlowYo.state.nodes.map(n => [n.x, n.y])));
  await touch.pinch({ x: 195, y: 350 }, 1.4);
  check('pinching never disturbs the chart itself', await page.evaluate(() => JSON.stringify(window.FlowYo.state.nodes.map(n => [n.x, n.y]))) === nodesBefore);

  // a second finger landing mid-drag hands over to the pinch instead of flinging the shape
  await reset();
  c = await centre(id);
  const held = await pos(id);
  await touch.send('touchStart', [touch.point(c.x, c.y, 1)]);
  await touch.send('touchMove', [touch.point(c.x + 20, c.y + 20, 1)]);
  await page.waitForTimeout(20);
  await touch.send('touchStart', [touch.point(c.x + 20, c.y + 20, 1), touch.point(c.x + 120, c.y + 120, 2)]);
  await touch.send('touchMove', [touch.point(c.x - 20, c.y - 20, 1), touch.point(c.x + 180, c.y + 180, 2)]);
  await page.waitForTimeout(30);
  await touch.send('touchEnd', []);
  await page.waitForTimeout(200);
  const landed = await pos(id);
  check('the shape stops where the second finger arrived, it does not follow the pinch',
    Math.abs(landed.x - held.x) < 60 && Math.abs(landed.y - held.y) < 60, { held, landed });
  check('no drag is left running afterwards', await page.evaluate(() => !document.querySelector('.node.dragging')));

  /* ---------- 6. the toolbar still works by thumb ---------- */
  await reset();
  const count = await page.evaluate(() => window.FlowYo.state.nodes.length);
  const btn = await page.locator('.shape-btn[data-shape="diamond"]').boundingBox();
  await touch.drag({ x: btn.x + btn.width / 2, y: btn.y + btn.height / 2 }, { x: 200, y: 420 });
  check('a shape can be dragged off the toolbar', await page.evaluate(() => window.FlowYo.state.nodes.length) === count + 1);
  await touch.tap(btn.x + btn.width / 2, btn.y + btn.height / 2);
  check('or tapped to drop one in the middle', await page.evaluate(() => window.FlowYo.state.nodes.length) === count + 2);

  const menuBtn = await page.locator('#chart-btn').boundingBox();
  await touch.tap(menuBtn.x + menuBtn.width / 2, menuBtn.y + menuBtn.height / 2);
  check('the chart menu opens by tap', await page.evaluate(() => !document.getElementById('chart-menu-panel').hidden));
  await touch.tap(200, 500);
  check('and closes again', await page.evaluate(() => document.getElementById('chart-menu-panel').hidden));
}, { touch: true });
