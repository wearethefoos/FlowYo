const { suite } = require('./harness');
const fs = require('fs');
const os = require('os');
const path = require('path');

suite('exporting mermaid, Markdown, SVG and PNG', async (t) => {
  const { page, check } = t;

  const openExport = async () => { await page.evaluate(() => window.FlowYo.openExport()); await page.waitForTimeout(120); };
  const tab = async format => { await page.click(`#export-tabs .tab[data-format="${format}"]`); await page.waitForTimeout(150); };
  const text = () => page.evaluate(() => document.getElementById('export-text').value);
  const note = () => page.evaluate(() => document.getElementById('export-note').textContent);

  // give the chart a name, a colour and a labelled arrow so the export has something to carry
  await page.evaluate(() => {
    window.FlowYo.renameChart('Release process');
    const s = window.FlowYo.state;
    s.edges[0].label = 'always';
    s.edges[1].color = 'razz';
    window.FlowYo.render();
    window.FlowYo.save();
  });
  await page.waitForTimeout(300);

  /* ---------- 1. the sheet ---------- */
  await page.click('#chart-btn');
  await page.waitForTimeout(80);
  await page.click('#btn-chart-export');
  await page.waitForTimeout(150);
  check('export opens from the chart menu', await page.evaluate(() => !document.getElementById('sheet').hidden));
  check('it is the export side of the sheet', await page.evaluate(() => document.getElementById('sheet-import').hidden && !document.getElementById('sheet-export').hidden));
  check('the title says so', await page.evaluate(() => document.getElementById('sheet-title').textContent) === 'Export');
  check('mermaid is the opening tab', await page.evaluate(() => document.querySelector('#export-tabs .tab[data-format="mermaid"]').getAttribute('aria-selected')) === 'true');

  /* ---------- 2. mermaid ---------- */
  let out = await text();
  check('mermaid export is the chart source', out === await page.evaluate(() => window.FlowYo.toMermaid()), out.slice(0, 40));
  check('it carries the arrow label', /-->\|"always"\|/.test(out), out);
  check('and the colours', /classDef \w+ stroke:#/.test(out) && /linkStyle 1 stroke:#db3069/.test(out), out);

  /* ---------- 3. markdown ---------- */
  await tab('markdown');
  out = await text();
  check('markdown starts with the chart name as a heading', out.startsWith('# Release process'), out.slice(0, 40));
  check('the chart is inside a mermaid fence', /```mermaid\n[\s\S]*```/.test(out), out.slice(0, 80));
  check('the fenced content is the same mermaid', out.includes(await page.evaluate(() => window.FlowYo.toMermaid())));

  /* ---------- 4. svg ---------- */
  await tab('svg');
  out = await text();
  check('svg is a standalone document', /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(out), out.slice(0, 60));
  check('it is sized to the chart, not the window', /width="\d+" height="\d+" viewBox="-?\d+ -?\d+ \d+ \d+"/.test(out), out.slice(0, 200));
  check('the palette is resolved into it', /--n-cobalt:\s*#1446a0/.test(out), out.slice(0, 700));
  check('arrowheads came along', /<marker/.test(out) && /marker-end="url\(#arrow-/.test(out), /<marker/.test(out));
  check('the editing furniture is stripped', !/class="anchor"/.test(out) && !/sel-ring/.test(out) && !/edge-hit/.test(out), {
    anchor: /class="anchor"/.test(out), ring: /sel-ring/.test(out), hit: /edge-hit/.test(out)
  });
  check('labels came across as text', /Draw a box/.test(out) && /always/.test(out));
  check('it has a background', /<rect[^>]*fill="[^"]+"/.test(out));

  // it must actually be parseable XML, and render
  const svgOk = await page.evaluate(txt => {
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return 'parse error: ' + doc.querySelector('parsererror').textContent.slice(0, 120);
    return doc.documentElement.tagName === 'svg' ? 'ok' : doc.documentElement.tagName;
  }, out);
  check('the svg parses as XML', svgOk === 'ok', svgOk);

  const renders = await page.evaluate(() => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ ok: false });
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(window.FlowYo.toSvgString());
  }));
  check('a browser will render it', renders.ok && renders.w > 100 && renders.h > 100, renders);

  /* ---------- 5. png ---------- */
  await tab('png');
  check('png swaps the text box for a preview', await page.evaluate(() => document.getElementById('export-text').hidden && !document.getElementById('export-preview').hidden));
  check('the preview actually loaded', await page.evaluate(() => {
    const i = document.getElementById('export-img');
    return i.complete ? i.naturalWidth > 0 : new Promise(r => { i.onload = () => r(true); i.onerror = () => r(false); });
  }));
  check('copy is off for png, with a reason', await page.evaluate(() => document.getElementById('export-copy').disabled) && /Download only/.test(await note()), await note());
  check('the note gives the pixel size at 2x', /2× — \d+ × \d+ px/.test(await note()), await note());

  const png = await page.evaluate(async () => {
    const blob = await window.FlowYo.toPngBlob();
    const buf = new Uint8Array(await blob.arrayBuffer());
    return { type: blob.type, size: blob.size, head: Array.from(buf.slice(0, 8)) };
  });
  check('the png blob is a real png', png.type === 'image/png' && png.head.join(',') === '137,80,78,71,13,10,26,10', png);
  check('and not empty', png.size > 2000, png.size);

  /* ---------- 6. copy ---------- */
  await tab('mermaid');
  await page.evaluate(() => {
    window.__copied = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: t => { window.__copied = t; return Promise.resolve(); } }
    });
  });
  await page.click('#export-copy');
  await page.waitForTimeout(120);
  check('copy puts the mermaid on the clipboard', await page.evaluate(() => window.__copied) === await page.evaluate(() => window.FlowYo.toMermaid()));
  check('and says it did', /Copied/.test(await note()), await note());
  await tab('svg');
  await page.click('#export-copy');
  await page.waitForTimeout(120);
  check('copy follows the selected tab', /^<svg/.test(await page.evaluate(() => window.__copied)));

  /* ---------- 7. download ---------- */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowyo-'));
  for (const [format, ext, sniff] of [['mermaid', 'mmd', /^flowchart TD/], ['markdown', 'md', /^# Release process/], ['svg', 'svg', /^<svg/], ['png', 'png', null]]) {
    await tab(format);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.click('#export-download')
    ]);
    const name = download.suggestedFilename();
    check(`${format}: downloads as a .${ext} named after the chart`, name === `release-process.${ext}`, name);
    const file = path.join(dir, name);
    await download.saveAs(file);
    const size = fs.statSync(file).size;
    check(`${format}: the file has content`, size > (format === 'png' ? 2000 : 40), size);
    if (sniff) check(`${format}: the file is what it claims`, sniff.test(fs.readFileSync(file, 'utf8')), fs.readFileSync(file, 'utf8').slice(0, 40));
    else check('png: the file is a real png', fs.readFileSync(file).slice(0, 8).toString('hex') === '89504e470d0a1a0a');
  }
  fs.rmSync(dir, { recursive: true, force: true });

  /* ---------- 8. an empty chart does not blow up ---------- */
  await page.evaluate(() => { window.FlowYo.closeSheet(); window.FlowYo.newChart('Blank'); });
  await page.waitForTimeout(200);
  await openExport();
  await tab('svg');
  check('an empty chart still exports an svg', /^<svg/.test(await text()) && /width="320"/.test(await text()), (await text()).slice(0, 80));
  await tab('png');
  const emptyPng = await page.evaluate(async () => (await window.FlowYo.toPngBlob()).size);
  check('and a png', emptyPng > 100, emptyPng);
});
