const { suite } = require('./harness');

suite('arrow labels, soft line breaks and alt-drag copies', async (t) => {
  const { page, check, centre } = t;

    /* ---------- 1. connector labels ---------- */
    let edgePt = await page.evaluate(() => {
      const e = window.FlowYo.state.edges[0];
      const p = document.querySelector(`[data-id="${e.id}"] .edge-line`);
      const l = p.getTotalLength();
      const m = p.getPointAtLength(l / 2);
      const svg = document.getElementById('canvas');
      const pt = svg.createSVGPoint(); pt.x = m.x; pt.y = m.y;
      const s = pt.matrixTransform(document.getElementById('view').getScreenCTM());
      return { id: e.id, x: s.x, y: s.y };
    });
    await page.mouse.dblclick(edgePt.x, edgePt.y);
    await page.waitForTimeout(100);
    let vis = await page.evaluate(() => getComputedStyle(document.getElementById('label-editor')).display);
    check('double-click an arrow opens its editor', vis === 'block', vis);
    await page.keyboard.type('yes');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    let lbl = await page.evaluate(id => window.FlowYo.state.edges.find(e => e.id === id).label, edgePt.id);
    check('arrow label committed', lbl === 'yes', lbl);
    let rendered = await page.evaluate(id => {
      const g = document.querySelector(`[data-id="${id}"]`);
      return { text: g.querySelector('.edge-label') && g.querySelector('.edge-label').textContent, hit: !!g.querySelector('.edge-label-bg') };
    }, edgePt.id);
    check('arrow label renders as svg text', rendered.text === 'yes' && rendered.hit, rendered);
    let mm = await page.evaluate(() => window.FlowYo.toMermaid());
    check('arrow label serialises to mermaid', /-->\|"yes"\|/.test(mm), mm.split('\n').filter(l => l.includes('-->')));

    // double-clicking the label text itself re-opens the editor
    const labelPt = await page.evaluate(id => {
      const r = document.querySelector(`[data-id="${id}"] .edge-label`).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, edgePt.id);
    await page.mouse.dblclick(labelPt.x, labelPt.y);
    await page.waitForTimeout(100);
    vis = await page.evaluate(() => ({ d: getComputedStyle(document.getElementById('label-editor')).display, v: document.getElementById('label-editor').value }));
    check('double-click the label text re-opens it', vis.d === 'block' && vis.v === 'yes', vis);
    // clearing it removes the label
    await t.selectAll();
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    lbl = await page.evaluate(id => window.FlowYo.state.edges.find(e => e.id === id).label, edgePt.id);
    check('clearing an arrow label removes it', lbl === '', lbl);
    // put it back for later checks
    await page.mouse.dblclick(edgePt.x, edgePt.y);
    await page.keyboard.type('yes');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);

    /* ---------- 2. soft line breaks ---------- */
    const nodes = await page.evaluate(() => window.FlowYo.state.nodes.map(n => ({ id: n.id, h: n.h, w: n.w })));
    const target = nodes[1];
    let c = await centre(target.id);
    await page.mouse.dblclick(c.x, c.y);
    await page.waitForTimeout(80);
    await t.selectAll();
    await page.keyboard.type('Draw a box');
    await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift');
    await page.keyboard.type('then another');
    const editorState = await page.evaluate(() => ({ v: document.getElementById('label-editor').value, h: document.getElementById('label-editor').offsetHeight }));
    check('shift+enter inserts a newline in the editor', editorState.v === 'Draw a box\nthen another', editorState);
    check('editor grows with the extra line', editorState.h > 34, editorState);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const after = await page.evaluate(id => {
      const n = window.FlowYo.state.nodes.find(x => x.id === id);
      const g = document.querySelector(`[data-id="${id}"] .node-label`);
      return { label: n.label, h: n.h, w: n.w, tspans: [...g.querySelectorAll('tspan')].map(t => t.textContent) };
    }, target.id);
    check('enter commits a two-line label', after.label === 'Draw a box\nthen another', after);
    check('label renders as two tspans', after.tspans.join('|') === 'Draw a box|then another', after.tspans);
    check('node grew taller for the second line', after.h > target.h, { was: target.h, now: after.h });

    mm = await page.evaluate(() => window.FlowYo.toMermaid());
    check('newline serialises as <br/>', /\["Draw a box<br\/>then another"\]/.test(mm), mm.split('\n')[2]);

    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForTimeout(300);
    const reloaded = await page.evaluate(() => ({
      labels: window.FlowYo.state.nodes.map(n => n.label),
      edge: window.FlowYo.state.edges.map(e => e.label).filter(Boolean),
      tspans: document.querySelectorAll('.node-label tspan').length
    }));
    check('<br/> parses back to a newline', reloaded.labels.includes('Draw a box\nthen another'), reloaded.labels);
    check('arrow label survives a reload', reloaded.edge.join(',') === 'yes', reloaded.edge);
    check('multi-line node still renders 2 tspans + 3 single', reloaded.tspans === 5, reloaded.tspans);

    /* ---------- 3. alt+drag copies ---------- */
    const before = await page.evaluate(() => ({ n: window.FlowYo.state.nodes.length, first: { ...window.FlowYo.state.nodes[0] } }));
    c = await centre(before.first.id);
    await page.keyboard.down('Alt');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 260, c.y + 60, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.waitForTimeout(150);
    const copied = await page.evaluate(orig => {
      const st = window.FlowYo.state;
      const src = st.nodes.find(n => n.id === orig.id);
      const copy = st.nodes[st.nodes.length - 1];
      return { count: st.nodes.length, srcX: src.x, srcY: src.y, copy: { id: copy.id, shape: copy.shape, label: copy.label, x: copy.x, y: copy.y }, edges: st.edges.length, sel: window.FlowYo.state && null };
    }, before.first);
    check('alt+drag adds a node', copied.count === before.n + 1, copied);
    check('copy keeps shape and label', copied.copy.shape === before.first.shape && copied.copy.label === before.first.label, copied.copy);
    check('original stays put', copied.srcX === before.first.x && copied.srcY === before.first.y, copied);
    check('copy lands where it was dropped', Math.abs(copied.copy.x - before.first.x) > 150, copied.copy);
    check('copy carries no connectors of its own', await page.evaluate(id => !window.FlowYo.state.edges.some(e => e.from === id || e.to === id), copied.copy.id), copied);
    check('copy snapped to the grid', copied.copy.x % 10 === 0 && copied.copy.y % 10 === 0, copied.copy);

    // plain drag still moves (does not copy)
    const n0 = await page.evaluate(() => window.FlowYo.state.nodes.length);
    c = await centre(before.first.id);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 30, c.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    check('plain drag still moves rather than copies', await page.evaluate(() => window.FlowYo.state.nodes.length) === n0, n0);

    // ⌘/ctrl+drag ignores the grid (shift is for adding to the selection)
    c = await centre(before.first.id);
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 33, c.y + 7, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    await page.waitForTimeout(100);
    const free = await page.evaluate(id => { const n = window.FlowYo.state.nodes.find(x => x.id === id); return { x: n.x, y: n.y }; }, before.first.id);
    check('cmd/ctrl+drag ignores the grid', free.x % 10 !== 0 || free.y % 10 !== 0, free);
});
