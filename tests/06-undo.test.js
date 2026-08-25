const { suite } = require('./harness');

suite('undo and redo', async (t) => {
  const { page, check, centre } = t;

  const hist = () => page.evaluate(() => window.FlowYo.history());
  const ids = () => page.evaluate(() => window.FlowYo.state.nodes.map(n => n.id));
  const buttons = () => page.evaluate(() => ({
    undo: document.getElementById('btn-undo').disabled,
    redo: document.getElementById('btn-redo').disabled
  }));
  const undoKey = () => page.keyboard.press('ControlOrMeta+z');
  const redoKey = () => page.keyboard.press('ControlOrMeta+Shift+z');

  /* ---------- 1. a freshly loaded chart has nothing to undo ---------- */
  let h = await hist();
  check('history starts with one entry', h.index === 0 && h.length === 1, h);
  check('both buttons start disabled', JSON.stringify(await buttons()) === '{"undo":true,"redo":true}', await buttons());
  await undoKey();
  await page.waitForTimeout(80);
  check('undo at the start is a no-op', (await ids()).length === 4, await ids());

  /* ---------- 2. adding ---------- */
  const before = await ids();
  await page.click('.shape-btn[data-shape="diamond"]');
  await page.waitForTimeout(120);
  check('node added', (await ids()).length === before.length + 1);
  check('undo becomes available', (await buttons()).undo === false);
  await undoKey();
  await page.waitForTimeout(120);
  check('undo removes the new node', JSON.stringify(await ids()) === JSON.stringify(before), await ids());
  check('redo becomes available', (await buttons()).redo === false);
  await redoKey();
  await page.waitForTimeout(120);
  check('redo puts it back', (await ids()).length === before.length + 1, await ids());
  await undoKey();
  await page.waitForTimeout(120);

  /* ---------- 3. moving ---------- */
  const target = before[1];
  const was = await page.evaluate(id => { const n = window.FlowYo.state.nodes.find(x => x.id === id); return { x: n.x, y: n.y }; }, target);
  let c = await centre(target);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 150, c.y + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const moved = await page.evaluate(id => { const n = window.FlowYo.state.nodes.find(x => x.id === id); return { x: n.x, y: n.y }; }, target);
  check('the drag moved it', moved.x !== was.x, { was, moved });
  await undoKey();
  await page.waitForTimeout(120);
  check('undo restores the position', JSON.stringify(await page.evaluate(id => { const n = window.FlowYo.state.nodes.find(x => x.id === id); return { x: n.x, y: n.y }; }, target)) === JSON.stringify(was), { was });
  check('one drag is one undo step', (await hist()).index === 0, await hist());

  /* ---------- 4. renaming ---------- */
  c = await centre(target);
  await page.mouse.dblclick(c.x, c.y);
  await page.waitForTimeout(80);
  await t.selectAll();
  await page.keyboard.type('Renamed');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  const label = id => page.evaluate(i => window.FlowYo.state.nodes.find(n => n.id === i).label, id);
  check('rename applied', await label(target) === 'Renamed');
  await undoKey();
  await page.waitForTimeout(120);
  check('undo restores the old label', await label(target) === 'Draw a box', await label(target));

  /* ---------- 5. deleting a node takes its arrows with it, and undo brings both back ---------- */
  const full = await page.evaluate(() => ({ n: window.FlowYo.state.nodes.length, e: window.FlowYo.state.edges.length }));
  c = await centre(target);
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(120);
  const cut = await page.evaluate(() => ({ n: window.FlowYo.state.nodes.length, e: window.FlowYo.state.edges.length }));
  check('delete removed the node and its arrows', cut.n === full.n - 1 && cut.e === full.e - 2, { full, cut });
  await undoKey();
  await page.waitForTimeout(120);
  const back = await page.evaluate(() => ({ n: window.FlowYo.state.nodes.length, e: window.FlowYo.state.edges.length }));
  check('undo restores the node and both arrows', JSON.stringify(back) === JSON.stringify(full), { full, back });

  /* ---------- 6. colour ---------- */
  c = await centre(target);
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('2');
  await page.waitForTimeout(120);
  const colour = id => page.evaluate(i => window.FlowYo.state.nodes.find(n => n.id === i).color, id);
  check('recoloured', await colour(target) === 'razz');
  await undoKey();
  await page.waitForTimeout(120);
  check('undo restores the colour', await colour(target) === 'cobalt', await colour(target));

  /* ---------- 7. storage follows the undo immediately ---------- */
  const stored = await page.evaluate(() => localStorage.getItem('flowyo:chart:v1'));
  const live = await page.evaluate(() => window.FlowYo.toMermaid());
  check('localStorage matches the undone state', stored === live, { stored, live });

  /* ---------- 8. acting after an undo discards the redo tail ---------- */
  await page.click('.shape-btn[data-shape="circle"]');
  await page.waitForTimeout(120);
  await undoKey();
  await page.waitForTimeout(120);
  check('redo is available after that undo', (await buttons()).redo === false);
  await page.click('.shape-btn[data-shape="rect"]');
  await page.waitForTimeout(120);
  check('a new action drops the redo tail', (await buttons()).redo === true, await hist());
  const afterBranch = await ids();
  await redoKey();
  await page.waitForTimeout(120);
  check('redo really is gone', JSON.stringify(await ids()) === JSON.stringify(afterBranch), await ids());

  /* ---------- 9. the buttons do the same thing ---------- */
  const n1 = (await ids()).length;
  await page.click('#btn-undo');
  await page.waitForTimeout(120);
  check('the undo button works', (await ids()).length === n1 - 1);
  await page.click('#btn-redo');
  await page.waitForTimeout(120);
  check('the redo button works', (await ids()).length === n1);

  /* ---------- 10. ⌘Z inside the editor is text undo, not chart undo ---------- */
  const chartBefore = await page.evaluate(() => window.FlowYo.toMermaid());
  c = await centre(target);
  await page.mouse.dblclick(c.x, c.y);
  await page.waitForTimeout(80);
  await page.keyboard.type('xyz');
  await undoKey();
  await page.waitForTimeout(120);
  const stillEditing = await page.evaluate(() => getComputedStyle(document.getElementById('label-editor')).display);
  check('editor stays open on ⌘Z', stillEditing === 'block', stillEditing);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  check('the chart was untouched by ⌘Z while editing', await page.evaluate(() => window.FlowYo.toMermaid()) === chartBefore);

  /* ---------- 11. walking all the way back ---------- */
  for (let i = 0; i < 40; i++) await page.evaluate(() => window.FlowYo.undo());
  await page.waitForTimeout(150);
  const home = await hist();
  check('undo bottoms out at the first entry', home.index === 0 && home.canUndo === false, home);
  check('back to the four demo shapes', (await ids()).length === 4, await ids());
});
