const { suite } = require('./harness');

suite('growing connected shapes from a handle, centred connector labels', async (t) => {
  const { page, check } = t;

    // helper: screen point of one of a node's anchors (0=N,1=E,2=S,3=W)
    const anchorPt = (id, i) => page.evaluate(([id, i]) => {
      const a = document.querySelectorAll(`[data-id="${id}"] .anchor`)[i];
      const r = a.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, [id, i]);

    const hoverAnchor = async (id, i) => {
      await page.evaluate(() => window.FlowYo.fit());   // keep the target on screen
      await page.waitForTimeout(60);
      const c = await page.evaluate(id => {
        const r = document.querySelector(`[data-id="${id}"] .node-shape`).getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, id);
      await page.mouse.move(c.x, c.y);
      await page.waitForTimeout(80);
      const a = await page.evaluate(([id, i]) => {
        const el = document.querySelectorAll(`[data-id="${id}"] .anchor`)[i];
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, [id, i]);
      await page.mouse.move(a.x, a.y);
      await page.waitForTimeout(50);
      return a;
    };

    /* ---------- 1. click a handle -> new connected node + editor ---------- */
    const src = await page.evaluate(() => window.FlowYo.state.nodes[3].id);   // "Done", bottom of the chart
    const before = await page.evaluate(() => ({ n: window.FlowYo.state.nodes.length, e: window.FlowYo.state.edges.length }));
    let pt = await hoverAnchor(src, 2);                                       // south handle
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(150);
    let st = await page.evaluate(() => window.FlowYo.state);
    const grown = st.nodes[st.nodes.length - 1];
    check('handle click adds a node', st.nodes.length === before.n + 1, { before, now: st.nodes.length });
    check('handle click connects it', st.edges.length === before.e + 1 && st.edges.some(e => e.from === src && e.to === grown.id), st.edges);
    const source = st.nodes.find(n => n.id === src);
    check('the new shape takes after the one it grew from', grown.shape === source.shape, { src: source.shape, grown: grown.shape });
    const srcNode = st.nodes.find(n => n.id === src);
    check('new node sits below the source (handle direction)', grown.y > srcNode.y + 60 && Math.abs(grown.x - srcNode.x) < 40, { src: srcNode, grown });
    let ed = await page.evaluate(() => ({ d: getComputedStyle(document.getElementById('label-editor')).display, v: document.getElementById('label-editor').value, focused: document.activeElement.id }));
    check('label editor opens on the new node', ed.d === 'block' && ed.focused === 'label-editor', ed);
    check('editor is pre-filled and selected', ed.v === 'Start', ed);   // the circle's own default label
    await page.keyboard.type('Follow up');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    check('typing replaces the placeholder', await page.evaluate(id => window.FlowYo.state.nodes.find(n => n.id === id).label, grown.id) === 'Follow up');

    /* ---------- 2. drag a handle onto empty canvas -> node at the drop point ---------- */
    const before2 = await page.evaluate(() => window.FlowYo.state.nodes.length);
    pt = await hoverAnchor(grown.id, 1);                 // east handle
    await page.mouse.down();
    await page.mouse.move(pt.x + 240, pt.y - 120, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    st = await page.evaluate(() => window.FlowYo.state);
    const dropped = st.nodes[st.nodes.length - 1];
    check('drop on empty canvas adds a node', st.nodes.length === before2 + 1, st.nodes.length);
    check('drop on empty canvas connects it', st.edges.some(e => e.from === grown.id && e.to === dropped.id), st.edges);
    check('dropped node lands right of + above its source', dropped.x > st.nodes.find(n => n.id === grown.id).x + 100 && dropped.y < st.nodes.find(n => n.id === grown.id).y, dropped);
    check('editor opens for the dropped node too', await page.evaluate(() => getComputedStyle(document.getElementById('label-editor')).display) === 'block');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    /* ---------- 3. dragging onto a real node still just connects ---------- */
    const before3 = await page.evaluate(() => ({ n: window.FlowYo.state.nodes.length, e: window.FlowYo.state.edges.length }));
    const anc = await hoverAnchor(dropped.id, 3);
    const conn = Object.assign({ ax: anc.x, ay: anc.y }, await page.evaluate(b => {
      const t = document.querySelector(`[data-id="${b}"] .node-shape`).getBoundingClientRect();
      return { bx: t.x + t.width / 2, by: t.y + t.height / 2 };
    }, src));
    await page.mouse.move(conn.ax, conn.ay);
    await page.mouse.down();
    await page.mouse.move(conn.bx, conn.by, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    st = await page.evaluate(() => window.FlowYo.state);
    check('drop on a node connects without adding one', st.nodes.length === before3.n && st.edges.length === before3.e + 1, { before3, now: { n: st.nodes.length, e: st.edges.length } });

    /* ---------- 4. releasing back on the source does nothing ---------- */
    const before4 = await page.evaluate(() => ({ n: window.FlowYo.state.nodes.length, e: window.FlowYo.state.edges.length }));
    const selfA = await hoverAnchor(src, 0);
    const selfPt = Object.assign({ ax: selfA.x, ay: selfA.y }, await page.evaluate(id => {
      const c = document.querySelector(`[data-id="${id}"] .node-shape`).getBoundingClientRect();
      return { cx: c.x + c.width / 2, cy: c.y + c.height / 2 };
    }, src));
    await page.mouse.move(selfPt.ax, selfPt.ay);
    await page.mouse.down();
    await page.mouse.move(selfPt.cx, selfPt.cy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    st = await page.evaluate(() => window.FlowYo.state);
    check('releasing on the source is a no-op', st.nodes.length === before4.n && st.edges.length === before4.e, { before4, now: { n: st.nodes.length, e: st.edges.length } });

    /* ---------- 5. connector labels centred on the line ---------- */
    const centred = await page.evaluate(() => {
      const e = window.FlowYo.state.edges[0];
      e.label = 'yes';
      window.FlowYo.render();
      const g = document.querySelector(`[data-id="${e.id}"]`);
      const line = g.querySelector('.edge-line');
      const mid = line.getPointAtLength(line.getTotalLength() / 2);
      const t = g.querySelector('.edge-label').getBBox();
      const bg = g.querySelector('.edge-label-bg').getBBox();
      return {
        dx: Math.abs((t.x + t.width / 2) - mid.x),
        dy: Math.abs((t.y + t.height / 2) - mid.y),
        bgdx: Math.abs((bg.x + bg.width / 2) - mid.x),
        bgdy: Math.abs((bg.y + bg.height / 2) - mid.y),
        covers: bg.width > t.width && bg.height > t.height,
        bgFill: getComputedStyle(g.querySelector('.edge-label-bg')).fill
      };
    });
    check('label centred horizontally on the line', centred.dx < 1.5, centred);
    check('label centred vertically on the line', centred.dy < 1.5, centred);
    check('backing box centred too and covers the text', centred.bgdx < 1.5 && centred.bgdy < 1.5 && centred.covers, centred);
    check('backing box is opaque (line reads as broken, not struck through)', /rgb/.test(centred.bgFill) && !/rgba\(0, 0, 0, 0\)/.test(centred.bgFill), centred.bgFill);

    const multi = await page.evaluate(() => {
      const e = window.FlowYo.state.edges[0];
      e.label = 'yes, ship it\n(finally)';
      window.FlowYo.render();
      const g = document.querySelector(`[data-id="${e.id}"]`);
      const line = g.querySelector('.edge-line');
      const mid = line.getPointAtLength(line.getTotalLength() / 2);
      const t = g.querySelector('.edge-label').getBBox();
      const xs = [...g.querySelectorAll('.edge-label tspan')].map(s => +s.getAttribute('x'));
      return { dx: Math.abs((t.x + t.width / 2) - mid.x), dy: Math.abs((t.y + t.height / 2) - mid.y), xs, mid: mid.x };
    });
    check('two-line label stays centred on the line', multi.dx < 1.5 && multi.dy < 1.5, multi);
    check('both lines share the same centre x', new Set(multi.xs).size === 1 && Math.abs(multi.xs[0] - multi.mid) < 1.5, multi);

    // and it stays centred after a node move
    const moved = await page.evaluate(() => {
      const e = window.FlowYo.state.edges[0];
      const n = window.FlowYo.state.nodes.find(x => x.id === e.to);
      n.x += 130; n.y += 40;
      const g = document.querySelector(`[data-id="${n.id}"]`);
      g.setAttribute('transform', `translate(${n.x},${n.y})`);
      // trigger the incremental edge redraw the drag handler uses
      document.querySelector('#canvas').dispatchEvent(new Event('noop'));
      window.FlowYo.render();
      const eg = document.querySelector(`[data-id="${e.id}"]`);
      const line = eg.querySelector('.edge-line');
      const mid = line.getPointAtLength(line.getTotalLength() / 2);
      const t = eg.querySelector('.edge-label').getBBox();
      return { dx: Math.abs((t.x + t.width / 2) - mid.x), dy: Math.abs((t.y + t.height / 2) - mid.y) };
    });
    check('still centred after the nodes move', moved.dx < 1.5 && moved.dy < 1.5, moved);
});
