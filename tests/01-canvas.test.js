const { suite } = require('./harness');

suite('canvas, shapes, dragging and the mermaid round trip', async (t) => {
  const { page, check } = t;

    // 1. demo chart renders
    let counts = await page.evaluate(() => ({ n: document.querySelectorAll('.node').length, e: document.querySelectorAll('.edge').length }));
    check('demo renders 4 nodes / 3 edges', counts.n === 4 && counts.e === 3, counts);

    // shapes present
    const shapes = await page.evaluate(() => window.FlowYo.state.nodes.map(n => n.shape).join(','));
    check('demo shapes circle,rect,diamond,circle', shapes === 'circle,rect,diamond,circle', shapes);

    // 2. drag a diamond from the palette onto the canvas
    const btn = await page.locator('.shape-btn[data-shape="diamond"]').boundingBox();
    await page.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2);
    await page.mouse.down();
    await page.mouse.move(900, 300, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    counts = await page.evaluate(() => window.FlowYo.state.nodes.length);
    check('palette drag adds a node', counts === 5, counts);

    // 3. click (no drag) on palette adds at centre
    await page.click('.shape-btn[data-shape="circle"]');
    await page.waitForTimeout(100);
    const st1 = await page.evaluate(() => window.FlowYo.state);
    check('palette click adds a node', st1.nodes.length === 6, st1.nodes.length);

    // 4. drag an existing node
    const before = await page.evaluate(() => { const n = window.FlowYo.state.nodes[1]; return { id: n.id, x: n.x, y: n.y }; });
    const box = await page.evaluate(id => {
      const g = document.querySelector(`[data-id="${id}"] .node-shape`);
      const r = g.getBoundingClientRect();
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    }, before.id);
    await page.mouse.move(box.cx, box.cy);
    await page.mouse.down();
    await page.mouse.move(box.cx + 120, box.cy + 40, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    const after = await page.evaluate(id => { const n = window.FlowYo.state.nodes.find(x => x.id === id); return { x: n.x, y: n.y }; }, before.id);
    check('node drag moves the node', Math.abs(after.x - before.x) > 60 && Math.abs(after.y - before.y) > 10, { before, after });
    check('node drag snaps to grid', after.x % 10 === 0 && after.y % 10 === 0, after);

    // 5. connect two nodes by dragging an anchor
    const edgeCountBefore = await page.evaluate(() => window.FlowYo.state.edges.length);
    const conn = await page.evaluate(() => {
      const st = window.FlowYo.state;
      const a = st.nodes[st.nodes.length - 1];   // the circle just added
      const b = st.nodes[st.nodes.length - 2];   // the diamond
      const ael = document.querySelector(`[data-id="${a.id}"] .anchor`);
      const r = ael.getBoundingClientRect();
      const br = document.querySelector(`[data-id="${b.id}"] .node-shape`).getBoundingClientRect();
      return { ax: r.x + r.width / 2, ay: r.y + r.height / 2, bx: br.x + br.width / 2, by: br.y + br.height / 2, from: a.id, to: b.id };
    });
    await page.mouse.move(conn.ax, conn.ay);
    await page.mouse.down();
    await page.mouse.move(conn.bx, conn.by, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    const edges = await page.evaluate(() => window.FlowYo.state.edges.map(e => e.from + '->' + e.to));
    check('anchor drag creates a connector', edges.length === edgeCountBefore + 1 && edges.includes(conn.from + '->' + conn.to), edges);

    // 6. double-click to rename
    const tgt = await page.evaluate(() => {
      const n = window.FlowYo.state.nodes[0];
      const r = document.querySelector(`[data-id="${n.id}"] .node-shape`).getBoundingClientRect();
      return { id: n.id, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    });
    await page.mouse.dblclick(tgt.cx, tgt.cy);
    await page.waitForTimeout(80);
    const editorVisible = await page.evaluate(() => getComputedStyle(document.getElementById('label-editor')).display);
    check('double-click opens the label editor', editorVisible === 'block', editorVisible);
    await t.selectAll();
    await page.keyboard.type('Kick off');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const renamed = await page.evaluate(id => window.FlowYo.state.nodes.find(n => n.id === id).label, tgt.id);
    check('label committed', renamed === 'Kick off', renamed);
    const grew = await page.evaluate(id => window.FlowYo.state.nodes.find(n => n.id === id).w, tgt.id);
    check('node resized to fit label', grew >= 96, grew);

    // 7. delete a node (and its edges)
    await page.mouse.click(tgt.cx, tgt.cy);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(100);
    const st2 = await page.evaluate(() => window.FlowYo.state);
    check('delete removes node', !st2.nodes.some(n => n.id === tgt.id), st2.nodes.map(n => n.id));
    check('delete removes its edges', !st2.edges.some(e => e.from === tgt.id || e.to === tgt.id), st2.edges);

    // 8. mermaid persisted to localStorage
    await page.waitForTimeout(400);
    const stored = await page.evaluate(() => localStorage.getItem('flowyo:chart:v1'));
    check('localStorage holds mermaid', /^flowchart TD/.test(stored || ''), (stored || '').slice(0, 40));
    check('mermaid has circle syntax', /\(\(".*?"\)\)/.test(stored), stored);
    check('mermaid has diamond syntax', /\{".*?"\}/.test(stored), stored);
    check('mermaid has rect syntax', /\[".*?"\]/.test(stored), stored);
    check('mermaid has arrow', /-->/.test(stored), stored);
    check('mermaid has pos metadata', /%% pos \w+ -?\d+ -?\d+/.test(stored), stored);

    // 9. reload -> identical model + identical mermaid (round trip)
    const mermaidBefore = await page.evaluate(() => window.FlowYo.toMermaid());
    const modelBefore = await page.evaluate(() => JSON.stringify(window.FlowYo.state));
    await page.reload();
    await page.waitForTimeout(300);
    const mermaidAfter = await page.evaluate(() => window.FlowYo.toMermaid());
    const modelAfter = await page.evaluate(() => JSON.stringify(window.FlowYo.state));
    check('mermaid round-trips exactly', mermaidBefore === mermaidAfter, { mermaidBefore, mermaidAfter });
    check('model round-trips exactly', modelBefore === modelAfter, { modelBefore, modelAfter });

    // 10. SVG output is real SVG geometry
    const svgInfo = await page.evaluate(() => ({
      ellipse: document.querySelectorAll('#nodes-layer ellipse').length,
      rect: document.querySelectorAll('#nodes-layer rect.node-shape').length,
      poly: document.querySelectorAll('#nodes-layer polygon').length,
      paths: document.querySelectorAll('#edges-layer .edge-line').length,
      marker: (document.querySelector('#edges-layer .edge-line') || {}).getAttribute
        ? document.querySelector('#edges-layer .edge-line').getAttribute('marker-end') : null
    }));
    check('svg shapes rendered', svgInfo.ellipse > 0 && svgInfo.rect > 0 && svgInfo.poly > 0, svgInfo);
    check('edges drawn with arrow marker', svgInfo.paths > 0 && /arrow/.test(svgInfo.marker || ''), svgInfo);

    // 11. importing arbitrary mermaid without positions auto-lays out
    const imported = await page.evaluate(() => {
      window.FlowYo.load('flowchart TD\n  A[Order received] --> B{In stock?}\n  B -->|yes| C((Ship))\n  B -->|no| D[Backorder]\n  D --> C\n');
      const s = window.FlowYo.state;
      return { n: s.nodes.length, e: s.edges.length, overlapping: s.nodes.some(a => s.nodes.some(b => a !== b && a.x === b.x && a.y === b.y)), labels: s.nodes.map(n => n.label), edgeLabels: s.edges.map(e => e.label) };
    });
    check('import: nodes + edges parsed', imported.n === 4 && imported.e === 4, imported);
    check('import: labels parsed', imported.labels.join('|') === 'Order received|In stock?|Ship|Backorder', imported.labels);
    check('import: edge labels kept', imported.edgeLabels.filter(Boolean).join(',') === 'yes,no', imported.edgeLabels);
    check('import: auto-layout spreads nodes', !imported.overlapping, imported);

    // 12. quotes in labels survive
    const qr = await page.evaluate(() => {
      window.FlowYo.load('flowchart TD\n  A --> B((End))\n');
      window.FlowYo.state.nodes[0].label = 'He said "hi" & <b>';
      const m = window.FlowYo.toMermaid();
      const back = window.FlowYo.fromMermaid(m);
      return { m, label: back.nodes[0].label };
    });
    check('quoted labels round-trip', qr.label === 'He said "hi" & <b>' && qr.m.includes('#quot;'), qr);

    // 13. zoom + pan
    const zoomed = await page.evaluate(() => {
      document.getElementById('btn-zoom-reset').click();
      const before = document.getElementById('view').getAttribute('transform');
      document.getElementById('btn-zoom-in').click();
      return { before, after: document.getElementById('view').getAttribute('transform'), pct: document.getElementById('btn-zoom-reset').textContent };
    });
    check('zoom reset -> 100%', /scale\(1\)/.test(zoomed.before), zoomed);
    check('zoom in -> 120%', /scale\(1\.2/.test(zoomed.after) && zoomed.pct === '120%', zoomed);
});
