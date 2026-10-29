const { suite } = require('./harness');

const CHART = [
  'flowchart TD',
  '    n1(("Start"))',
  '    n2["Draft"]',
  '    n3{"Happy?"}',
  '    n4(("Done"))',
  '    n1 --> n2',
  '    n2 --> n3',
  '    n3 --> n4',
  '%% pos n1 200 100',
  '%% pos n2 200 260',
  '%% pos n3 200 420',
  '%% pos n4 200 580',
  '%% arrow a1 500 120 660 120 one gunmetal "note" ""'
].join('\n');

suite('selecting several things at once', async (t) => {
  const { page, check, centre, toScreen } = t;

  const sel = () => page.evaluate(() => window.FlowYo.selection());
  const positions = () => page.evaluate(() => window.FlowYo.state.nodes.map(n => [n.id, n.x, n.y]));
  const reset = async () => {
    await page.evaluate(c => window.FlowYo.load(c), CHART);
    await page.waitForTimeout(200);
  };
  const band = async (from, to, opts = {}) => {
    const a = await toScreen(from[0], from[1]);
    const b = await toScreen(to[0], to[1]);
    if (opts.shift) await page.keyboard.down('Shift');
    if (opts.alt) await page.keyboard.down('Alt');
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    const mid = await page.evaluate(() => {
      const m = document.getElementById('marquee');
      return { shown: !m.hidden, w: +m.getAttribute('width') || 0 };
    });
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
    if (opts.shift) await page.keyboard.up('Shift');
    if (opts.alt) await page.keyboard.up('Alt');
    await page.waitForTimeout(150);
    return mid;
  };

  await reset();

  /* ---------- 1. dragging a box picks things up ---------- */
  const mid = await band([80, 40], [340, 330]);
  check('the band is visible while you drag it', mid.shown && mid.w > 10, mid);
  check('and gone once you let go', await page.evaluate(() => document.getElementById('marquee').hidden));
  let s = await sel();
  check('it selects the shapes it covers', s.nodes.join(',') === 'n1,n2', s);
  check('and the connector between them', s.edges.join(',') === 'en1_n2', s);
  check('the canvas shows them as selected', await page.evaluate(() => document.querySelectorAll('.node.selected').length) === 2);

  check('a band that touches nothing clears the selection', await (async () => {
    await band([700, 500], [800, 600]);
    const now = await sel();
    return now.nodes.length === 0 && now.edges.length === 0;
  })());

  /* ---------- 2. a free arrow is just another shape to the band ---------- */
  await band([460, 60], [700, 180]);
  s = await sel();
  check('the band picks up free arrows too', s.nodes.join(',') === 'a1', s);

  /* ---------- 3. shift extends, clicking narrows ---------- */
  await band([80, 40], [340, 330]);
  await band([80, 360], [340, 500], { shift: true });
  s = await sel();
  check('shift + band adds to what was already selected', s.nodes.join(',') === 'n1,n2,n3', s);

  let c = await centre('n2');
  await page.keyboard.down('Shift');
  await page.mouse.click(c.x, c.y);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(120);
  s = await sel();
  check('shift + click takes one back out', s.nodes.join(',') === 'n1,n3', s);
  await page.keyboard.down('Shift');
  await page.mouse.click(c.x, c.y);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(120);
  check('and puts it back', (await sel()).nodes.join(',') === 'n1,n3,n2');

  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(120);
  check('a plain click inside a group narrows to that one', (await sel()).nodes.join(',') === 'n2');

  /* ---------- 4. moving a group ---------- */
  await reset();
  await band([80, 40], [340, 500]);
  s = await sel();
  check('three shapes and two connectors selected', s.nodes.length === 3 && s.edges.length === 2, s);
  const before = await positions();
  c = await centre('n2');
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 120, c.y + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const after = await positions();
  const moved = id => {
    const a = before.find(p => p[0] === id), b = after.find(p => p[0] === id);
    return { dx: b[1] - a[1], dy: b[2] - a[2] };
  };
  check('every selected shape moves', moved('n1').dx !== 0 && moved('n2').dx !== 0 && moved('n3').dx !== 0, [moved('n1'), moved('n2'), moved('n3')]);
  check('by exactly the same amount', JSON.stringify(moved('n1')) === JSON.stringify(moved('n2')) && JSON.stringify(moved('n2')) === JSON.stringify(moved('n3')), [moved('n1'), moved('n2'), moved('n3')]);
  check('and nothing else does', moved('n4').dx === 0 && moved('n4').dy === 0, moved('n4'));
  check('the selection survives the move', (await sel()).nodes.length === 3);
  check('the whole move is one undo step', await (async () => {
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(150);
    return JSON.stringify(await positions()) === JSON.stringify(before);
  })());

  /* ---------- 5. recolouring a group ---------- */
  await reset();
  await band([80, 40], [340, 500]);
  await page.keyboard.press('2');
  await page.waitForTimeout(150);
  let colours = await page.evaluate(() => window.FlowYo.state.nodes.map(n => n.id + ':' + n.color));
  check('a colour key paints everything selected', colours.slice(0, 3).every(c => c.endsWith('razz')), colours);
  check('including the connectors', await page.evaluate(() => window.FlowYo.state.edges.slice(0, 2).every(e => e.color === 'razz')));
  check('and leaves the rest alone', colours[3] === 'n4:razz' || colours[3].split(':')[1] === 'razz', colours[3]);
  check('the swatch shows as active when they all share it', await page.evaluate(() => document.querySelector('.swatch[data-color="razz"]').getAttribute('aria-pressed')) === 'true');
  await page.keyboard.press('2');
  await page.waitForTimeout(150);
  check('pressing it again puts each back to its own default', await page.evaluate(() => {
    const n = window.FlowYo.state.nodes;
    return n[1].color === 'cobalt' && n[2].color === 'gold' && window.FlowYo.state.edges[0].color === null;
  }));

  /* ---------- 6. deleting a group ---------- */
  await reset();
  await band([80, 40], [340, 330]);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(150);
  let st = await page.evaluate(() => window.FlowYo.state);
  check('backspace removes everything selected', st.nodes.map(n => n.id).join(',') === 'n3,n4,a1', st.nodes.map(n => n.id));
  check('along with connectors that lost an end', st.edges.map(e => e.id).join(',') === 'en3_n4', st.edges);
  check('the delete is one undo step', await (async () => {
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(150);
    const back = await page.evaluate(() => window.FlowYo.state);
    return back.nodes.length === 5 && back.edges.length === 3;
  })());

  /* ---------- 7. copying a group ---------- */
  await reset();
  await band([80, 40], [340, 330]);
  const n0 = await page.evaluate(() => window.FlowYo.state.nodes.length);
  c = await centre('n1');
  await page.keyboard.down('Alt');
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 260, c.y + 40, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await page.waitForTimeout(150);
  st = await page.evaluate(() => window.FlowYo.state);
  check('alt + drag copies the whole group', st.nodes.length === n0 + 2, st.nodes.map(n => n.id));
  check('the originals stay put', st.nodes.find(n => n.id === 'n1').x === 200 && st.nodes.find(n => n.id === 'n2').x === 200, st.nodes.slice(0, 2));
  check('and the copies are the ones selected', (await sel()).nodes.length === 2 && !(await sel()).nodes.includes('n1'), await sel());

  /* ---------- 8. panning still has a home ---------- */
  await reset();
  const view0 = await page.evaluate(() => window.FlowYo.view());
  await band([700, 500], [820, 560], { alt: true });
  const view1 = await page.evaluate(() => window.FlowYo.view());
  check('⌥ + drag on empty canvas pans instead of selecting', view1.x !== view0.x, { view0, view1 });
  check('and selects nothing', (await sel()).nodes.length === 0);
});
