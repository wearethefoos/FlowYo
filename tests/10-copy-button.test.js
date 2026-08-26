const { suite } = require('./harness');

suite('the Copy split-button, and Clear in the chart menu', async (t) => {
  const { page, check } = t;

  const label = () => page.evaluate(() => document.getElementById('btn-export').textContent);
  const status = () => page.evaluate(() => document.getElementById('status').textContent);
  const menuUp = () => page.evaluate(() => !document.getElementById('export-menu').hidden);
  const nodes = () => page.evaluate(() => window.FlowYo.state.nodes.length);

  /** capture whatever the page puts on the clipboard */
  const stubClipboard = (failWrite) => page.evaluate(fail => {
    window.__clip = { text: null, image: null, calls: 0 };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: txt => { window.__clip.calls++; window.__clip.text = txt; return Promise.resolve(); },
        write: async items => {
          window.__clip.calls++;
          if (fail) throw new Error('denied');
          const item = items[0];
          const blob = await item.getType('image/png');
          window.__clip.image = { types: item.types.join(','), size: blob.size, type: blob.type };
        }
      }
    });
  }, !!failWrite);
  const clip = () => page.evaluate(() => window.__clip);

  /* ---------- 1. the toolbar swap ---------- */
  check('Clear is gone from the toolbar', await page.evaluate(() => !document.getElementById('btn-clear')));
  check('a Copy button took its place', await page.evaluate(() => !!document.getElementById('btn-export')));
  check('with a caret beside it', await page.evaluate(() => {
    const s = document.getElementById('export-split');
    return s.children[0].id === 'btn-export' && s.children[1].id === 'btn-export-caret';
  }));
  check('it defaults to Copy image', await label() === 'Copy image', await label());

  /* ---------- 2. Clear now lives in the chart menu ---------- */
  await page.click('#chart-btn');
  await page.waitForTimeout(80);
  check('the chart menu offers Clear this chart', await page.evaluate(() => {
    const b = document.getElementById('btn-chart-clear');
    return !!b && b.textContent === 'Clear this chart';
  }));
  await page.click('#btn-chart-clear');
  await page.waitForTimeout(150);
  check('it empties the chart', await nodes() === 0);
  check('and closes the menu', await page.evaluate(() => document.getElementById('chart-menu-panel').hidden));
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(150);
  check('clearing is undoable', await nodes() === 4, await nodes());

  /* ---------- 3. the caret menu ---------- */
  await page.click('#btn-export-caret');
  await page.waitForTimeout(80);
  check('the caret opens a menu', await menuUp());
  const items = await page.evaluate(() => [...document.querySelectorAll('#export-menu [data-copy]')].map(b => b.textContent.replace('✓', '').trim()));
  check('it lists all four formats', items.join(' / ') === 'Copy image / Copy Markdown / Copy Mermaid / Copy SVG', items);
  check('the current one is ticked', await page.evaluate(() => document.querySelector('#export-menu [data-copy="png"]').classList.contains('current')));
  check('and it offers the full Export sheet too', await page.evaluate(() => !!document.getElementById('btn-export-sheet')));
  await page.mouse.click(400, 500);
  await page.waitForTimeout(80);
  check('clicking away closes it', !(await menuUp()));

  /* ---------- 4. the default action copies an image ---------- */
  await stubClipboard(false);
  await page.click('#btn-export');
  await page.waitForTimeout(600);
  let c = await clip();
  check('a PNG went to the clipboard', c.image && c.image.type === 'image/png' && c.image.types === 'image/png', c);
  check('and it is a real drawing, not an empty one', c.image.size > 2000, c.image);
  check('the button confirms', /Copied/.test(await label()) || /copied/i.test(await status()), { label: await label(), status: await status() });
  check('the status line says what happened', /Image copied/.test(await status()), await status());
  await page.waitForTimeout(1700);
  check('the button goes back to its label', await label() === 'Copy image', await label());

  /* ---------- 5. picking a format copies it and makes it the new default ---------- */
  await stubClipboard(false);
  await page.click('#btn-export-caret');
  await page.waitForTimeout(80);
  await page.click('#export-menu [data-copy="mermaid"]');
  await page.waitForTimeout(300);
  c = await clip();
  check('choosing Copy Mermaid copies the mermaid', c.text === await page.evaluate(() => window.FlowYo.toMermaid()), (c.text || '').slice(0, 40));
  check('the menu closed', !(await menuUp()));
  await page.waitForTimeout(1700);
  check('the button now says Copy Mermaid', await label() === 'Copy Mermaid', await label());
  check('and the tick moved', await page.evaluate(() => document.querySelector('#export-menu [data-copy="mermaid"]').classList.contains('current')
    && !document.querySelector('#export-menu [data-copy="png"]').classList.contains('current')));

  /* ---------- 6. the choice sticks across a reload ---------- */
  check('it was remembered in storage', await page.evaluate(() => localStorage.getItem('flowyo:copy:v1')) === 'mermaid');
  await page.reload();
  await page.waitForTimeout(400);
  check('and comes back that way', await label() === 'Copy Mermaid', await label());
  await stubClipboard(false);
  await page.click('#btn-export');
  await page.waitForTimeout(300);
  c = await clip();
  check('the plain click uses the remembered format', typeof c.text === 'string' && c.text.startsWith('flowchart TD'), (c.text || '').slice(0, 30));

  /* ---------- 7. Markdown and SVG ---------- */
  for (const [format, sniff] of [['markdown', /^# /], ['svg', /^<svg/]]) {
    await stubClipboard(false);
    await page.click('#btn-export-caret');
    await page.waitForTimeout(80);
    await page.click(`#export-menu [data-copy="${format}"]`);
    await page.waitForTimeout(300);
    c = await clip();
    check(`Copy ${format} copies ${format}`, sniff.test(c.text || ''), (c.text || '').slice(0, 40));
  }

  /* ---------- 8. if the clipboard refuses an image, save it instead ---------- */
  await stubClipboard(true);
  await page.evaluate(() => window.FlowYo.setCopyFormat('png'));
  await page.waitForTimeout(80);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#btn-export')
  ]);
  check('a refused image copy falls back to a download', /\.png$/.test(download.suggestedFilename()), download.suggestedFilename());
  check('and the status explains the switch', /saved the PNG instead/i.test(await status()), await status());

  /* ---------- 9. the sheet is still reachable ---------- */
  await page.click('#btn-export-caret');
  await page.waitForTimeout(80);
  await page.click('#btn-export-sheet');
  await page.waitForTimeout(150);
  check('Export… opens the full sheet', await page.evaluate(() => !document.getElementById('sheet').hidden && !document.getElementById('sheet-export').hidden));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  /* ---------- 10. keyboard ---------- */
  await stubClipboard(false);
  await page.evaluate(() => window.FlowYo.setCopyFormat('mermaid'));
  await page.keyboard.press('ControlOrMeta+Shift+c');
  await page.waitForTimeout(300);
  c = await clip();
  check('shift+cmd+C copies with the current format', (c.text || '').startsWith('flowchart TD'), (c.text || '').slice(0, 30));
});
