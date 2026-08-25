const { suite } = require('./harness');

suite('palette colours on shapes and arrows', async (t) => {
  const { page, check } = t;

    /* 1. defaults by shape */
    const defs = await page.evaluate(() => window.FlowYo.state.nodes.map(n => n.shape + ':' + n.color));
    check('shapes get a default colour', defs.join(',') === 'circle:razz,rect:cobalt,diamond:gold,circle:razz', defs);

    const painted = await page.evaluate(() => {
      const n = window.FlowYo.state.nodes[1];
      const sh = document.querySelector(`[data-id="${n.id}"] .node-shape`);
      const cs = getComputedStyle(sh);
      return { stroke: cs.stroke, fill: cs.fill, width: cs.strokeWidth };
    });
    check('border is the bright palette colour', painted.stroke === 'rgb(20, 70, 160)', painted);
    check('fill is a faded wash of it', /^rgba\(20, 70, 160, 0\.\d+\)$/.test(painted.fill), painted);
    check('border is thick enough to read as bright', parseFloat(painted.width) >= 2, painted);

    /* 2. swatches recolour the selection */
    let sw = await page.evaluate(() => [...document.querySelectorAll('.swatch')].map(b => ({ c: b.dataset.color, dis: b.disabled })));
    check('swatches disabled with nothing selected', sw.every(b => b.dis), sw);
    check('four palette swatches', sw.map(b => b.c).join(',') === 'cobalt,razz,gold,gunmetal', sw);

    const nid = await page.evaluate(() => window.FlowYo.state.nodes[1].id);
    const c = await page.evaluate(id => { const r = document.querySelector(`[data-id="${id}"] .node-shape`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, nid);
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(80);
    sw = await page.evaluate(() => [...document.querySelectorAll('.swatch')].map(b => ({ c: b.dataset.color, dis: b.disabled, on: b.getAttribute('aria-pressed') })));
    check('swatches enable on selection', sw.every(b => !b.dis), sw);
    check('current colour shows as pressed', sw.find(b => b.c === 'cobalt').on === 'true' && sw.filter(b => b.on === 'true').length === 1, sw);

    await page.click('.swatch[data-color="razz"]');
    await page.waitForTimeout(120);
    let now = await page.evaluate(id => {
      const n = window.FlowYo.state.nodes.find(x => x.id === id);
      return { color: n.color, stroke: getComputedStyle(document.querySelector(`[data-id="${id}"] .node-shape`)).stroke };
    }, nid);
    check('clicking a swatch recolours the node', now.color === 'razz' && now.stroke === 'rgb(219, 48, 105)', now);

    // clicking the active swatch clears back to the shape default
    await page.click('.swatch[data-color="razz"]');
    await page.waitForTimeout(120);
    check('clicking the active swatch resets to the shape default', await page.evaluate(id => window.FlowYo.state.nodes.find(x => x.id === id).color, nid) === 'cobalt');

    // keyboard 1-4
    await page.keyboard.press('3');
    await page.waitForTimeout(120);
    check('key 3 paints royal gold', await page.evaluate(id => window.FlowYo.state.nodes.find(x => x.id === id).color, nid) === 'gold');
    await page.keyboard.press('4');
    await page.waitForTimeout(120);
    check('key 4 paints gunmetal', await page.evaluate(id => window.FlowYo.state.nodes.find(x => x.id === id).color, nid) === 'gunmetal');

    /* 3. arrows take colour too, arrowhead included */
    const eid = await page.evaluate(() => window.FlowYo.state.edges[0].id);
    await page.evaluate(id => { window.FlowYo.render(); }, eid);
    const ept = await page.evaluate(id => {
      const p = document.querySelector(`[data-id="${id}"] .edge-line`);
      const m = p.getPointAtLength(p.getTotalLength() / 2);
      const pt = document.getElementById('canvas').createSVGPoint(); pt.x = m.x; pt.y = m.y;
      const s = pt.matrixTransform(document.getElementById('view').getScreenCTM());
      return { x: s.x, y: s.y };
    }, eid);
    await page.mouse.click(ept.x, ept.y);
    await page.waitForTimeout(80);
    check('clicking an arrow selects it', await page.evaluate(() => !!document.querySelector('.edge.selected')));
    await page.keyboard.press('2');
    await page.waitForTimeout(120);
    const edgePaint = await page.evaluate(id => {
      const g = document.querySelector(`[data-id="${id}"]`);
      const line = g.querySelector('.edge-line');
      const marker = line.getAttribute('marker-end');
      const mid = marker.replace('url(#', '').replace(')', '');
      return {
        color: window.FlowYo.state.edges.find(e => e.id === id).color,
        stroke: getComputedStyle(line).stroke,
        marker: mid,
        head: document.querySelector('#' + mid + ' path').getAttribute('fill'),
        halo: getComputedStyle(g.querySelector('.edge-hit')).stroke
      };
    }, eid);
    check('arrow takes the colour', edgePaint.color === 'razz' && edgePaint.stroke === 'rgb(219, 48, 105)', edgePaint);
    check('arrowhead matches the line', edgePaint.marker === 'arrow-razz' && edgePaint.head === '#db3069', edgePaint);
    check('selected arrow shows a halo, not a colour swap', /rgba?\(/.test(edgePaint.halo) && edgePaint.halo !== 'rgb(219, 48, 105)', edgePaint);

    /* 4. selection ring is colour-independent */
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(80);
    const ring = await page.evaluate(id => {
      const r = document.querySelector(`[data-id="${id}"] .sel-ring`);
      const cs = getComputedStyle(r);
      return { op: cs.opacity, dash: cs.strokeDasharray, stroke: cs.stroke };
    }, nid);
    check('selected node shows a dashed ink ring', +ring.op > 0.5 && /\d/.test(ring.dash) && ring.stroke === 'rgb(60, 60, 59)', ring);

    /* 5. mermaid round trip */
    await page.waitForTimeout(400);
    const mm = await page.evaluate(() => window.FlowYo.toMermaid());
    check('classDef emitted for used colours', /classDef gunmetal stroke:#3c3c3b,fill:#3c3c3b1a,stroke-width:2px/.test(mm), mm);
    check('class line assigns the node', /class \w+ gunmetal/.test(mm), mm);
    check('linkStyle carries the arrow colour', /linkStyle 0 stroke:#db3069,color:#db3069/.test(mm), mm);
    check('untouched shapes still emit their default class', /class .*razz/.test(mm) && /class .*gold/.test(mm), mm);

    const back = await page.evaluate(m => {
      const s = window.FlowYo.fromMermaid(m);
      return { nodes: s.nodes.map(n => n.id + ':' + n.color), edges: s.edges.map(e => e.id + ':' + e.color) };
    }, mm);
    const live = await page.evaluate(() => ({
      nodes: window.FlowYo.state.nodes.map(n => n.id + ':' + n.color),
      edges: window.FlowYo.state.edges.map(e => e.id + ':' + e.color)
    }));
    check('colours round-trip through mermaid', JSON.stringify(back) === JSON.stringify(live), { back, live });

    await page.reload();
    await page.waitForTimeout(300);
    const afterReload = await page.evaluate(() => ({
      nodes: window.FlowYo.state.nodes.map(n => n.color),
      edges: window.FlowYo.state.edges.map(e => e.color)
    }));
    check('colours survive a reload', afterReload.nodes.includes('gunmetal') && afterReload.edges[0] === 'razz', afterReload);

    /* 6. inline :::class syntax (what someone pasting mermaid might use) */
    const inline = await page.evaluate(() => {
      window.FlowYo.load('flowchart TD\n  A[One]:::cobalt --> B((Two)):::gold\n  classDef cobalt stroke:#1446a0\n  classDef gold stroke:#f5d547\n');
      return window.FlowYo.state.nodes.map(n => n.id + ':' + n.color);
    });
    check('inline :::class colours parse', inline.join(',') === 'A:cobalt,B:gold', inline);

    /* 7. copies keep their colour */
    const copy = await page.evaluate(() => {
      window.FlowYo.load('flowchart TD\n  A[One]\n');
      const n = window.FlowYo.state.nodes[0];
      n.color = 'gold';
      const before = window.FlowYo.state.nodes.length;
      return { before, color: n.color };
    });
    check('setup for copy check', copy.color === 'gold');
});
