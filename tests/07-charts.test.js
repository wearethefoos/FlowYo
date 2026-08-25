const { suite } = require('./harness');

suite('the chart library', async (t) => {
  const { page, check } = t;

  const lib = () => page.evaluate(() => window.FlowYo.charts());
  const names = async () => (await lib()).charts.map(c => c.name);
  const currentName = () => page.evaluate(() => document.getElementById('chart-name').textContent);
  const nodeCount = () => page.evaluate(() => window.FlowYo.state.nodes.length);
  const menuOpen = () => page.evaluate(() => !document.getElementById('chart-menu-panel').hidden);
  const openMenu = async () => { if (!await menuOpen()) { await page.click('#chart-btn'); await page.waitForTimeout(80); } };

  /* ---------- 1. first run makes one chart ---------- */
  let l = await lib();
  check('a fresh browser starts with one chart', l.charts.length === 1 && l.current === l.charts[0].id, l);
  check('the toolbar shows its name', await currentName() === l.charts[0].name, await currentName());
  check('the demo chart lives in it', (await nodeCount()) === 4);
  check('it is stored under its own key', await page.evaluate(() => localStorage.getItem('flowyo:chart:' + window.FlowYo.charts().current)) !== null);

  /* ---------- 2. new chart ---------- */
  await openMenu();
  check('the menu opens', await menuOpen());
  check('the menu lists every chart', await page.evaluate(() => document.querySelectorAll('#chart-items .menu-item').length) === 1);
  await page.click('#btn-chart-new');
  await page.waitForTimeout(150);
  l = await lib();
  check('new chart added and switched to', l.charts.length === 2 && l.current === l.charts[1].id, l);
  check('a new chart starts empty', (await nodeCount()) === 0, await nodeCount());
  check('the menu closed', !(await menuOpen()));
  check('new chart drops straight into rename', await page.evaluate(() => !document.getElementById('chart-rename').hidden && document.activeElement.id === 'chart-rename'));

  /* ---------- 3. rename ---------- */
  await page.keyboard.type('Onboarding flow');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  check('rename applied', await currentName() === 'Onboarding flow', await currentName());
  check('rename persisted to the index', (await lib()).charts[1].name === 'Onboarding flow', await names());
  check('the rename field is put away', await page.evaluate(() => document.getElementById('chart-rename').hidden && !document.getElementById('chart-btn').hidden));

  // escape cancels
  await openMenu();
  await page.click('#btn-chart-rename');
  await page.waitForTimeout(80);
  await t.selectAll();
  await page.keyboard.type('Nope');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  check('escape cancels a rename', await currentName() === 'Onboarding flow', await currentName());

  /* ---------- 4. the two charts hold different content ---------- */
  await page.click('.shape-btn[data-shape="diamond"]');
  await page.waitForTimeout(150);
  check('drew in the second chart', (await nodeCount()) === 1);
  const first = (await lib()).charts[0].id;
  await page.evaluate(id => window.FlowYo.switchChart(id), first);
  await page.waitForTimeout(200);
  check('switching back shows the first chart', (await nodeCount()) === 4, await nodeCount());
  check('the toolbar name follows', await currentName() !== 'Onboarding flow');
  const second = (await lib()).charts[1].id;
  await page.evaluate(id => window.FlowYo.switchChart(id), second);
  await page.waitForTimeout(200);
  check('and forward again', (await nodeCount()) === 1, await nodeCount());

  /* ---------- 5. edits land in the right chart, even mid-debounce ---------- */
  await page.click('.shape-btn[data-shape="circle"]');            // no wait: the save is still pending
  await page.evaluate(id => window.FlowYo.switchChart(id), first);
  await page.waitForTimeout(300);
  check('the pending save went to the chart being left', (await page.evaluate(id => window.FlowYo.stored(id), second)).includes('(('), await page.evaluate(id => window.FlowYo.stored(id), second));
  check('and not into the chart being opened', (await nodeCount()) === 4, await nodeCount());

  /* ---------- 6. switching charts resets undo ---------- */
  const h = await page.evaluate(() => window.FlowYo.history());
  check('a freshly opened chart has an empty history', h.index === 0 && h.canUndo === false, h);

  /* ---------- 7. duplicate ---------- */
  await openMenu();
  await page.click('#btn-chart-duplicate');
  await page.waitForTimeout(200);
  l = await lib();
  check('duplicate adds a third chart', l.charts.length === 3, await names());
  check('the copy is named after the original', /copy$/.test(l.charts[2].name), await names());
  check('the copy carries the same content', (await nodeCount()) === 4, await nodeCount());
  check('the copy is a separate document with the same shapes', await page.evaluate(() => {
    const c = window.FlowYo.charts();
    const labels = id => window.FlowYo.fromMermaid(window.FlowYo.stored(id)).nodes.map(n => n.label).join('|');
    return c.charts[0].id !== c.charts[2].id && labels(c.charts[0].id) === labels(c.charts[2].id);
  }));
  // editing the copy leaves the original alone
  await page.click('.shape-btn[data-shape="rect"]');
  await page.waitForTimeout(300);
  check('editing the copy does not touch the original', await page.evaluate(() => {
    const c = window.FlowYo.charts();
    return window.FlowYo.stored(c.charts[0].id) !== window.FlowYo.stored(c.charts[2].id);
  }));

  /* ---------- 8. delete takes two taps ---------- */
  const before = (await lib()).charts.length;
  await openMenu();
  await page.click('#btn-chart-delete');
  await page.waitForTimeout(80);
  check('the first tap only arms the delete', (await lib()).charts.length === before, await names());
  check('the button says so', await page.evaluate(() => document.getElementById('btn-chart-delete').textContent) === 'Really delete?');
  await page.click('#chart-btn');   // close the menu
  await page.waitForTimeout(80);
  await openMenu();
  check('re-opening the menu disarms it', await page.evaluate(() => document.getElementById('btn-chart-delete').textContent) === 'Delete chart');
  await page.click('#btn-chart-delete');
  await page.click('#btn-chart-delete');
  await page.waitForTimeout(200);
  l = await lib();
  check('the second tap deletes', l.charts.length === before - 1, await names());
  check('its document is gone from storage too', await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('flowyo:chart:')).length) === 2);
  check('another chart is opened', l.current && l.charts.some(c => c.id === l.current), l);

  /* ---------- 9. it all survives a reload ---------- */
  const snapshot = await lib();
  await page.reload();
  await page.waitForTimeout(400);
  const after = await lib();
  check('the library survives a reload', JSON.stringify(after) === JSON.stringify(snapshot), { snapshot, after });
  check('and reopens the same chart', await currentName() === snapshot.charts.find(c => c.id === snapshot.current).name);

  /* ---------- 10. deleting the last chart leaves a usable empty one ---------- */
  await page.evaluate(() => {
    const c = window.FlowYo.charts();
    c.charts.forEach(x => window.FlowYo.deleteChart(x.id));
  });
  await page.waitForTimeout(250);
  l = await lib();
  check('never left with zero charts', l.charts.length === 1 && l.current === l.charts[0].id, l);
  check('the replacement is empty', (await nodeCount()) === 0);
  await page.click('.shape-btn[data-shape="circle"]');
  await page.waitForTimeout(300);
  check('and it is still editable', (await nodeCount()) === 1 && (await page.evaluate(() => window.FlowYo.stored())).includes('(('));

  /* ---------- 11. an old single-chart install is migrated ---------- */
  const migrated = await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('flowyo:chart:v1', 'flowchart TD\n    n1["Legacy"]\n%% pos n1 100 100');
    localStorage.setItem('flowyo:seeded:v1', '1');
    return true;
  });
  await page.reload();
  await page.waitForTimeout(400);
  l = await lib();
  check('the old chart becomes the first chart', l.charts.length === 1, l);
  check('its content came across', await page.evaluate(() => window.FlowYo.state.nodes[0].label) === 'Legacy');
  check('the legacy key is cleaned up', await page.evaluate(() => localStorage.getItem('flowyo:chart:v1')) === null);
});
