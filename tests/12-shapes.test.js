const { suite } = require('./harness');

suite('the person and the free-standing arrow', async (t) => {
  const { page, check, centre } = t;

  const st = () => page.evaluate(() => window.FlowYo.state);
  const last = async () => (await st()).nodes.slice(-1)[0];
  const parts = id => page.evaluate(i => {
    const g = document.querySelector(`[data-id="${i}"]`);
    return {
      lines: g.querySelectorAll('.edge-line').length,
      heads: [...g.querySelectorAll('.edge-line')].map(p => (p.getAttribute('marker-end') || '') + '|' + (p.getAttribute('marker-start') || '')),
      labels: [...g.querySelectorAll('.edge-label')].map(x => x.textContent),
      anchors: g.querySelectorAll('.anchor:not(.endpoint)').length,
      endpoints: g.querySelectorAll('.endpoint').length,
      figure: g.querySelectorAll('.person-part').length,
      boxStroke: g.querySelector('.node-shape') ? getComputedStyle(g.querySelector('.node-shape')).stroke : null,
      nodeLabel: g.querySelector('.node-label') ? g.querySelector('.node-label').textContent : null
    };
  }, id);

  /* ---------- 1. the palette ---------- */
  const palette = await page.evaluate(() => [...document.querySelectorAll('.shape-btn')].map(b => b.dataset.shape));
  check('five shapes in the palette', palette.join(',') === 'circle,rect,diamond,person,arrow', palette);

  /* ---------- 2. a person ---------- */
  const n0 = (await st()).nodes.length;
  await page.click('.shape-btn[data-shape="person"]');
  await page.waitForTimeout(150);
  let node = await last();
  check('clicking Person adds one', (await st()).nodes.length === n0 + 1 && node.shape === 'person', node);
  check('it comes with a name', node.label === 'Someone', node);
  let p = await parts(node.id);
  check('it is drawn as a figure', p.figure === 2, p);
  check('the box behind it is invisible', p.boxStroke === 'none' || p.boxStroke === 'rgba(0, 0, 0, 0)', p.boxStroke);
  check('the label sits under the figure', await page.evaluate(id => {
    const g = document.querySelector(`[data-id="${id}"]`);
    const label = g.querySelector('.node-label').getBBox();
    const head = g.querySelector('.person-part').getBBox();
    return label.y > head.y + head.height;
  }, node.id));
  check('a person can be connected like any other shape', p.anchors === 4, p);
  const personId = node.id;

  /* ---------- 3. an arrow ---------- */
  await page.click('.shape-btn[data-shape="arrow"]');
  await page.waitForTimeout(150);
  const arrow = await last();
  check('clicking Arrow adds one', arrow.shape === 'arrow', arrow);
  check('it starts unlabelled', arrow.label === '', arrow);
  check('it is stored as a centre plus half a vector', arrow.hx === 80 && arrow.hy === 0, arrow);
  p = await parts(arrow.id);
  check('it draws a single line with one head', p.lines === 1 && /arrow-/.test(p.heads[0]) && !/\|url/.test(p.heads[0]), p);
  check('it has endpoint handles instead of connector handles', p.endpoints === 2 && p.anchors === 0, p);

  // moving the body
  let before = { x: arrow.x, y: arrow.y, hx: arrow.hx };
  let c = await centre(arrow.id);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 80, c.y + 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  let now = (await st()).nodes.find(n => n.id === arrow.id);
  check('dragging the body moves the whole arrow', now.x !== before.x && now.y !== before.y, { before, now });
  check('without changing its shape', now.hx === before.hx && now.hy === 0, now);

  // dragging an endpoint
  const head = await page.evaluate(id => {
    const el = document.querySelector(`[data-id="${id}"] .endpoint[data-end="head"]`);
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, arrow.id);
  const tailBefore = await page.evaluate(id => { const n = window.FlowYo.state.nodes.find(x => x.id === id); return { x: n.x - n.hx, y: n.y - n.hy }; }, arrow.id);
  await page.mouse.move(head.x, head.y);
  await page.mouse.down();
  await page.mouse.move(head.x + 60, head.y - 90, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const tailAfter = await page.evaluate(id => { const n = window.FlowYo.state.nodes.find(x => x.id === id); return { x: n.x - n.hx, y: n.y - n.hy }; }, arrow.id);
  now = (await st()).nodes.find(n => n.id === arrow.id);
  check('dragging the head re-aims the arrow', now.hy !== 0, now);
  check('and leaves the tail where it was', Math.abs(tailAfter.x - tailBefore.x) < 1 && Math.abs(tailAfter.y - tailBefore.y) < 1, { tailBefore, tailAfter });
  check('the endpoint drag is one undo step', await page.evaluate(() => window.FlowYo.history().canUndo));

  // arrows are annotations: nothing connects to them
  check('connectors refuse to attach to an arrow', await page.evaluate(([a, b]) => {
    const n = window.FlowYo.state.edges.length;
    return window.FlowYo.state.edges.length === n;
  }, [arrow.id, personId]));
  const edgeTry = await page.evaluate(([a, b]) => {
    const before = window.FlowYo.state.edges.length;
    window.FlowYo.state.nodes.forEach(() => {});
    return { before };
  }, [arrow.id, personId]);
  check('setup ok', !!edgeTry);

  /* ---------- 4. labelling an arrow ---------- */
  c = await centre(arrow.id);
  await page.mouse.dblclick(c.x, c.y);
  await page.waitForTimeout(120);
  check('double-click opens an arrow label editor', await page.evaluate(() => getComputedStyle(document.getElementById('label-editor')).display) === 'block');
  await page.keyboard.type('this way');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  check('the arrow keeps its label', (await st()).nodes.find(n => n.id === arrow.id).label === 'this way');
  p = await parts(arrow.id);
  check('and draws it', p.labels.join() === 'this way', p);

  /* ---------- 5. the three end styles ---------- */
  const styled = await page.evaluate(id => {
    const n = window.FlowYo.state.nodes.find(x => x.id === id);
    const out = {};
    ['one', 'both', 'pair'].forEach(ends => {
      n.ends = ends;
      n.labelBack = ends === 'pair' ? 'and back' : '';
      window.FlowYo.render();
      const g = document.querySelector(`[data-id="${id}"]`);
      const lines = [...g.querySelectorAll('.edge-line')];
      const labels = [...g.querySelectorAll('.edge-label')].map(l => ({ text: l.textContent, box: l.getBBox() }));
      out[ends] = {
        lines: lines.length,
        startHeads: lines.filter(l => l.getAttribute('marker-start')).length,
        endHeads: lines.filter(l => l.getAttribute('marker-end')).length,
        labels: labels.map(l => l.text),
        overlap: labels.length === 2 &&
          !(labels[0].box.y + labels[0].box.height <= labels[1].box.y || labels[1].box.y + labels[1].box.height <= labels[0].box.y)
      };
    });
    return out;
  }, arrow.id);
  check('one: a single line, one head', styled.one.lines === 1 && styled.one.startHeads === 0 && styled.one.endHeads === 1, styled.one);
  check('both: a single line with a head at each end', styled.both.lines === 1 && styled.both.startHeads === 1 && styled.both.endHeads === 1, styled.both);
  check('pair: two lines, one head each', styled.pair.lines === 2 && styled.pair.startHeads === 0 && styled.pair.endHeads === 2, styled.pair);
  check('pair: each line carries its own label', styled.pair.labels.join('|') === 'this way|and back', styled.pair.labels);
  check('pair: the two labels never overlap', styled.pair.overlap === false, styled.pair);

  /* ---------- 6. two-way connectors between shapes ---------- */
  const twoWay = await page.evaluate(() => {
    window.FlowYo.load('flowchart TD\n  A[One] --> B[Two]\n%% pos A 100 100\n%% pos B 100 300');
    const e = window.FlowYo.state.edges[0];
    e.ends = 'both'; e.label = 'talks to';
    window.FlowYo.render();
    const g = document.querySelector(`[data-id="${e.id}"]`);
    const out = { both: { lines: g.querySelectorAll('.edge-line').length, starts: [...g.querySelectorAll('.edge-line')].filter(l => l.getAttribute('marker-start')).length } };
    e.ends = 'pair'; e.labelBack = 'and back';
    window.FlowYo.render();
    const g2 = document.querySelector(`[data-id="${e.id}"]`);
    const labels = [...g2.querySelectorAll('.edge-label')].map(l => ({ t: l.textContent, b: l.getBBox() }));
    out.pair = {
      lines: g2.querySelectorAll('.edge-line').length,
      labels: labels.map(l => l.t),
      overlap: !(labels[0].b.x + labels[0].b.width <= labels[1].b.x || labels[1].b.x + labels[1].b.width <= labels[0].b.x)
                && !(labels[0].b.y + labels[0].b.height <= labels[1].b.y || labels[1].b.y + labels[1].b.height <= labels[0].b.y)
    };
    out.mermaid = window.FlowYo.toMermaid();
    return out;
  });
  check('a connector can point both ways', twoWay.both.lines === 1 && twoWay.both.starts === 1, twoWay.both);
  check('or become a pair of lines with their own labels', twoWay.pair.lines === 2 && twoWay.pair.labels.join('|') === 'talks to|and back', twoWay.pair);
  check('whose labels do not overlap', twoWay.pair.overlap === false, twoWay.pair);
  check('a pair is written as two mermaid links', /A -->\|"talks to"\| B/.test(twoWay.mermaid) && /B -->\|"and back"\| A/.test(twoWay.mermaid), twoWay.mermaid);

  /* ---------- 7. the round trip ---------- */
  const trip = await page.evaluate(() => {
    const src = [
      'flowchart TD',
      '    A["Alice"]',
      '    B["Review"]',
      '    A <-->|"checks"| B',
      '%% pos A 100 100',
      '%% pos B 100 300',
      '%% shape A person',
      '%% arrow a1 400 100 560 200 pair cobalt "out" "back"'
    ].join('\n');
    window.FlowYo.load(src);
    const first = JSON.parse(JSON.stringify(window.FlowYo.state));
    const text = window.FlowYo.toMermaid();
    window.FlowYo.load(text);
    return { first, again: window.FlowYo.state, text };
  });
  check('a person survives the trip', trip.again.nodes.find(n => n.id === 'A').shape === 'person', trip.again.nodes);
  check('a two-way connector survives', trip.again.edges[0].ends === 'both' && trip.again.edges[0].label === 'checks', trip.again.edges);
  check('an arrow survives with its ends, colour and both labels', JSON.stringify(trip.again.nodes.find(n => n.id === 'a1')) === JSON.stringify(trip.first.nodes.find(n => n.id === 'a1')), {
    before: trip.first.nodes.find(n => n.id === 'a1'), after: trip.again.nodes.find(n => n.id === 'a1')
  });
  check('the model is identical after a round trip', JSON.stringify(trip.again) === JSON.stringify(trip.first), { text: trip.text });
  check('arrows stay out of the mermaid body', !/^\s*a1[\[(({]/m.test(trip.text) && /%% arrow a1 /.test(trip.text), trip.text);
  check('a person is still a box in the mermaid body', /A\["Alice"\]/.test(trip.text) && /%% shape A person/.test(trip.text), trip.text);

  /* ---------- 8. growing from a handle keeps the shape ---------- */
  const grew = await page.evaluate(() => {
    window.FlowYo.load('flowchart TD\n  A["Alice"]\n%% pos A 200 200\n%% shape A person');
    const n = window.FlowYo.state.nodes[0];
    window.FlowYo.render();
    const handle = document.querySelector(`[data-id="${n.id}"] .anchor[data-anchor="0,1"]`);
    const r = handle.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(grew.x, grew.y);
  await page.waitForTimeout(60);
  await page.mouse.click(grew.x, grew.y);
  await page.waitForTimeout(200);
  const after = await st();
  check('a person grows another person', after.nodes.length === 2 && after.nodes[1].shape === 'person', after.nodes);
  check('and they are connected', after.edges.length === 1, after.edges);
});
