const { suite } = require('./harness');

const CHART = [
  'flowchart TD',
  '    n1(("Start"))',
  '    n2["Draft"]',
  '    n1 --> n2',
  '%% pos n1 200 120',
  '%% pos n2 200 300'
].join('\n');

suite('keyboard shortcuts', async (t) => {
  const { page, check, centre } = t;

  const st = () => page.evaluate(() => window.FlowYo.state);
  const sel = () => page.evaluate(() => window.FlowYo.selection());
  const shapes = async () => (await st()).nodes.map(n => n.shape);
  const reset = async () => {
    await page.evaluate(c => window.FlowYo.load(c), CHART);
    await page.waitForTimeout(180);
  };
  const press = async (key, opts) => { await page.keyboard.press(key, opts); await page.waitForTimeout(160); };
  const pick = async id => { const c = await centre(id); await page.mouse.click(c.x, c.y); await page.waitForTimeout(120); };

  await reset();

  /* ---------- 1. ⌥ + letter adds a shape ---------- */
  for (const [combo, shape] of [['Alt+KeyC', 'circle'], ['Alt+KeyS', 'rect'], ['Alt+KeyD', 'diamond'], ['Alt+KeyP', 'person'], ['Alt+KeyA', 'arrow']]) {
    const before = (await st()).nodes.length;
    await press(combo);
    const now = await st();
    check(`${combo.replace('Alt+Key', '⌥')} adds a ${shape}`, now.nodes.length === before + 1 && now.nodes.slice(-1)[0].shape === shape, now.nodes.slice(-1)[0]);
    if (shape !== 'arrow') await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
  }
  check('the new shape is the selected one', (await sel()).nodes.length === 1);
  check('a new shape lands where you are looking', await page.evaluate(() => {
    const n = window.FlowYo.state.nodes.slice(-1)[0];
    const r = document.getElementById('canvas').getBoundingClientRect();
    const v = window.FlowYo.view();
    const sx = v.x + n.x * v.k, sy = v.y + n.y * v.k;
    return sx > 0 && sx < r.width && sy > 0 && sy < r.height;
  }));
  check('except an arrow, which has nothing to type yet', await page.evaluate(() => getComputedStyle(document.getElementById('label-editor')).display) === 'none');

  /* ---------- 2. a letter on its own changes the selected shape ---------- */
  await reset();
  await pick('n2');
  check('the square is selected', (await sel()).nodes.join() === 'n2');
  await press('KeyD');
  check('D turns it into a diamond', (await st()).nodes.find(n => n.id === 'n2').shape === 'diamond');
  await press('KeyP');
  check('P turns it into a person', (await st()).nodes.find(n => n.id === 'n2').shape === 'person');
  check('its label comes along', (await st()).nodes.find(n => n.id === 'n2').label === 'Draft');
  check('and so do its connectors', (await st()).edges.length === 1);
  check('the default colour follows the new shape', (await st()).nodes.find(n => n.id === 'n2').color === 'razz');

  // a colour you chose yourself is kept
  await press('Digit3');
  await press('KeyS');
  check('a colour you picked survives the change', (await st()).nodes.find(n => n.id === 'n2').color === 'gold');

  await press('KeyA');
  let n2 = (await st()).nodes.find(n => n.id === 'n2');
  check('A turns it into an arrow', n2.shape === 'arrow' && n2.hx > 0, n2);
  check('which drops the connectors it can no longer have', (await st()).edges.length === 0);
  await press('KeyC');
  n2 = (await st()).nodes.find(n => n.id === 'n2');
  check('and it can come back as a circle', n2.shape === 'circle' && n2.w > 0, n2);
  check('one keystroke is one undo step', await (async () => {
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(150);
    return (await st()).nodes.find(n => n.id === 'n2').shape === 'arrow';
  })());

  /* ---------- 3. changing a whole group ---------- */
  await reset();
  await page.evaluate(() => window.FlowYo.selectMany(['n1', 'n2'], []));
  await press('KeyP');
  check('a letter changes every selected shape', (await shapes()).join() === 'person,person', await shapes());

  /* ---------- 4. arrow keys grow a connected shape ---------- */
  await reset();
  await pick('n1');
  let before = await st();
  await press('ArrowRight');
  let now = await st();
  const grown = now.nodes.slice(-1)[0];
  check('→ adds a shape', now.nodes.length === before.nodes.length + 1, now.nodes.map(n => n.id));
  check('to the right of the selected one', grown.x > now.nodes.find(n => n.id === 'n1').x + 80, grown);
  check('of the same kind', grown.shape === 'circle', grown);
  check('connected to it', now.edges.some(e => e.from === 'n1' && e.to === grown.id), now.edges);
  check('with its label ready to type over', await page.evaluate(() => getComputedStyle(document.getElementById('label-editor')).display) === 'block');
  await page.keyboard.type('Next');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  check('so typing names it', (await st()).nodes.slice(-1)[0].label === 'Next');

  await pick('n1');
  await press('ArrowUp');
  now = await st();
  check('↑ puts one above', now.nodes.slice(-1)[0].y < now.nodes.find(n => n.id === 'n1').y - 80, now.nodes.slice(-1)[0]);
  await page.keyboard.press('Escape');

  await page.evaluate(() => window.FlowYo.selectMany([], []));
  before = await st();
  await press('ArrowDown');
  check('with nothing selected the arrow keys do nothing', (await st()).nodes.length === before.nodes.length);

  /* ---------- 5. space cycles an arrow's ends ---------- */
  await reset();
  const edgeId = (await st()).edges[0].id;
  const ep = await t.edgePoint(edgeId);
  await page.mouse.click(ep.x, ep.y);
  await page.waitForTimeout(120);
  check('the connector is selected', (await sel()).edges.join() === edgeId);
  const styleNow = () => page.evaluate(id => window.FlowYo.state.edges.find(e => e.id === id).ends, edgeId);
  check('it starts pointing one way', await styleNow() === 'one');
  await press('Space');
  check('space makes it point both ways', await styleNow() === 'both');
  const drawn = () => page.evaluate(id => {
    const g = document.querySelector(`[data-id="${id}"]`);
    const lines = [...g.querySelectorAll('.edge-line')];
    return { lines: lines.length, starts: lines.filter(l => l.getAttribute('marker-start')).length };
  }, edgeId);
  check('and draws a head at each end', JSON.stringify(await drawn()) === '{"lines":1,"starts":1}', await drawn());
  await press('Space');
  check('again and it becomes two separate lines', await styleNow() === 'pair');
  check('drawn as two', (await drawn()).lines === 2, await drawn());
  await press('Space');
  check('and round again to one way', await styleNow() === 'one');

  // the same key works on a free arrow
  await press('Alt+KeyA');
  const arrowId = (await st()).nodes.slice(-1)[0].id;
  await press('Space');
  check('space cycles a free arrow too', (await st()).nodes.find(n => n.id === arrowId).ends === 'both');

  /* ---------- 6. delete and the editor ---------- */
  await reset();
  await pick('n2');
  await press('Backspace');
  check('backspace removes the selected shape', (await st()).nodes.map(n => n.id).join() === 'n1');

  await pick('n1');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  check('enter opens the label editor', await page.evaluate(() => getComputedStyle(document.getElementById('label-editor')).display) === 'block');
  await page.keyboard.type('x');
  const typed = await page.evaluate(() => document.getElementById('label-editor').value);
  check('letters type into the editor instead of changing the shape', typed.endsWith('x'), typed);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  check('and the shape is untouched', (await st()).nodes[0].shape === 'circle');
});
