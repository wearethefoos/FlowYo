const { suite } = require('./harness');

const SAMPLE = [
  'flowchart TD',
  '    A[Order received] --> B{In stock?}',
  '    B -->|yes| C((Ship))',
  '    B -->|no| D[Backorder<br/>the item]',
  '    D --> C',
  '    classDef razz stroke:#db3069,fill:#db30691f',
  '    class C razz'
].join('\n');

suite('importing mermaid', async (t) => {
  const { page, check } = t;

  const sheetUp = () => page.evaluate(() => !document.getElementById('sheet').hidden);
  const note = () => page.evaluate(() => document.getElementById('import-note').textContent);
  const disabled = () => page.evaluate(() => ({
    add: document.getElementById('import-new').disabled,
    replace: document.getElementById('import-replace').disabled
  }));
  const type = async text => {
    await page.evaluate(txt => {
      const el = document.getElementById('import-text');
      el.value = txt;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, text);
    await page.waitForTimeout(80);
  };

  /* ---------- 1. opening it ---------- */
  await page.click('#chart-btn');
  await page.waitForTimeout(80);
  await page.click('#btn-chart-import');
  await page.waitForTimeout(120);
  check('the import sheet opens from the chart menu', await sheetUp());
  check('the chart menu closed behind it', await page.evaluate(() => document.getElementById('chart-menu-panel').hidden));
  check('the paste box has focus', await page.evaluate(() => document.activeElement.id) === 'import-text');
  check('nothing to import yet', JSON.stringify(await disabled()) === '{"add":true,"replace":true}', await disabled());
  check('and it says so', /Paste a mermaid/.test(await note()), await note());

  /* ---------- 2. it tells you what it sees ---------- */
  await type('this is not a flowchart, it is a shopping list');
  check('garbage is refused', JSON.stringify(await disabled()) === '{"add":true,"replace":true}', await disabled());
  check('with a reason', /No shapes found/.test(await note()), await note());

  await type(SAMPLE);
  check('a real chart is accepted', JSON.stringify(await disabled()) === '{"add":false,"replace":false}', await disabled());
  check('and counted', /4 shapes and 4 arrows/.test(await note()), await note());
  check('no saved layout is mentioned', /laid out automatically/.test(await note()), await note());

  await type(SAMPLE + '\n%% pos A 100 100\n%% pos B 100 300\n%% pos C 100 500\n%% pos D 300 300');
  check('a chart with %% pos is recognised as positioned', /with its saved layout/.test(await note()), await note());

  /* ---------- 3. import as a new chart ---------- */
  const before = await page.evaluate(() => window.FlowYo.charts().charts.length);
  await type(SAMPLE);
  await page.click('#import-new');
  await page.waitForTimeout(250);
  check('the sheet closes', !(await sheetUp()));
  const lib = await page.evaluate(() => window.FlowYo.charts());
  check('a chart was added and opened', lib.charts.length === before + 1 && lib.current === lib.charts[before].id, lib);
  check('it is named for what it is', lib.charts[before].name === 'Imported chart', lib);

  const st = await page.evaluate(() => window.FlowYo.state);
  check('every shape came across', st.nodes.map(n => n.id).join(',') === 'A,B,C,D', st.nodes.map(n => n.id));
  check('shapes kept their kind', st.nodes.map(n => n.shape).join(',') === 'rect,diamond,circle,rect', st.nodes.map(n => n.shape));
  check('arrows came across', st.edges.length === 4, st.edges);
  check('arrow labels survived', st.edges.map(e => e.label).filter(Boolean).join(',') === 'yes,no', st.edges.map(e => e.label));
  check('<br/> became a line break', st.nodes.find(n => n.id === 'D').label === 'Backorder\nthe item', st.nodes.find(n => n.id === 'D').label);
  check('classDef colour came across', st.nodes.find(n => n.id === 'C').color === 'razz', st.nodes.find(n => n.id === 'C'));
  check('nothing was left stacked on top of anything else',
    !st.nodes.some(a => st.nodes.some(b => a.id !== b.id && a.x === b.x && a.y === b.y)), st.nodes.map(n => [n.id, n.x, n.y]));
  check('every shape is on the canvas', st.nodes.every(n => n.w > 0 && n.h > 0));

  const stored = await page.evaluate(() => window.FlowYo.stored());
  check('the auto-layout was written back, so it reopens the same', /%% pos A \d+ \d+/.test(stored), stored);
  check('the stored copy is still mermaid', /^flowchart TD/.test(stored), stored.slice(0, 30));

  /* ---------- 4. replace this chart, and undo it ---------- */
  const target = lib.charts[0].id;
  await page.evaluate(id => window.FlowYo.switchChart(id), target);
  await page.waitForTimeout(200);
  const wasNodes = await page.evaluate(() => window.FlowYo.state.nodes.length);
  const wasMermaid = await page.evaluate(() => window.FlowYo.toMermaid());
  await page.evaluate(() => window.FlowYo.openImport());
  await page.waitForTimeout(100);
  await type(SAMPLE);
  await page.click('#import-replace');
  await page.waitForTimeout(250);
  check('the chart was replaced in place', await page.evaluate(() => window.FlowYo.state.nodes.map(n => n.id).join(',')) === 'A,B,C,D');
  check('no extra chart was created', await page.evaluate(() => window.FlowYo.charts().charts.length) === before + 1);
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(200);
  check('one undo puts the old chart back', await page.evaluate(() => window.FlowYo.state.nodes.length) === wasNodes, await page.evaluate(() => window.FlowYo.state.nodes.length));
  check('exactly as it was', await page.evaluate(() => window.FlowYo.toMermaid()) === wasMermaid);

  /* ---------- 5. closing ---------- */
  await page.evaluate(() => window.FlowYo.openImport());
  await page.waitForTimeout(80);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  check('escape closes the sheet', !(await sheetUp()));

  await page.evaluate(() => window.FlowYo.openImport());
  await page.waitForTimeout(80);
  await page.click('#sheet-close');
  await page.waitForTimeout(80);
  check('the ✕ closes it', !(await sheetUp()));

  await page.evaluate(() => window.FlowYo.openImport());
  await page.waitForTimeout(80);
  await page.mouse.click(20, 20);          // the backdrop
  await page.waitForTimeout(80);
  check('clicking outside closes it', !(await sheetUp()));

  await page.evaluate(() => window.FlowYo.openImport());
  await page.waitForTimeout(80);
  await page.mouse.click(640, 430);        // inside the card
  await page.waitForTimeout(80);
  check('clicking inside does not', await sheetUp());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);

  check('the paste box is empty again next time', await page.evaluate(() => {
    window.FlowYo.openImport();
    const v = document.getElementById('import-text').value;
    window.FlowYo.closeSheet();
    return v === '';
  }));

  /* ---------- 6. the sheet swallows canvas keys while it is up ---------- */
  const chartNow = await page.evaluate(() => window.FlowYo.toMermaid());
  await page.evaluate(() => { window.FlowYo.openImport(); });
  await page.waitForTimeout(80);
  await page.keyboard.press('Delete');
  await page.keyboard.press('2');
  await page.waitForTimeout(120);
  await page.evaluate(() => window.FlowYo.closeSheet());
  check('Delete and the colour keys do not reach the canvas', await page.evaluate(() => window.FlowYo.toMermaid()) === chartNow);
});
