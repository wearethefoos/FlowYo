/**
 * Tiny test harness for FlowYo.
 *
 * Each suite is a standalone script:
 *
 *     const { suite } = require('./harness');
 *     suite('what it covers', async (t) => {
 *       const { page, check } = t;
 *       check('something is true', 1 + 1 === 2);
 *     });
 *
 * Run one directly with `node tests/03-connectors.test.js`, or all of them with
 * `npm test`. A suite exits non-zero if any check fails, so CI just watches the
 * exit code. Set HEADED=1 to watch it happen in a real window.
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..');
const APP = 'file://' + path.join(ROOT, 'index.html');
const SHOTS = path.join(__dirname, 'screenshots');

/* ---------- a static server, for the bits that need a real origin ---------- */
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.map': 'application/json'
};
function startServer(root = ROOT) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const file = path.join(root, rel || 'index.html');
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, body) => {
        if (err) { res.writeHead(404).end('not found'); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(body);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise(r => server.close(r)) });
    });
  });
}

/* ---------- page helpers every suite ends up wanting ---------- */
function helpers(page) {
  const state = () => page.evaluate(() => window.FlowYo.state);
  const fit = async () => { await page.evaluate(() => window.FlowYo.fit()); await page.waitForTimeout(60); };

  /** screen-space centre of a node */
  const centre = id => page.evaluate(i => {
    const r = document.querySelector(`[data-id="${i}"] .node-shape`).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, id);

  /** screen-space midpoint of a connector */
  const edgePoint = id => page.evaluate(i => {
    const p = document.querySelector(`[data-id="${i}"] .edge-line`);
    const m = p.getPointAtLength(p.getTotalLength() / 2);
    const pt = document.getElementById('canvas').createSVGPoint();
    pt.x = m.x; pt.y = m.y;
    const s = pt.matrixTransform(document.getElementById('view').getScreenCTM());
    return { x: s.x, y: s.y };
  }, id);

  /**
   * Park a real pointer on one of a node's anchor handles (0=N 1=E 2=S 3=W).
   * The handles are pointer-events:none until `.node:hover`, and a synthetic
   * mouseover does not set :hover — so the mouse genuinely has to travel there.
   */
  const hoverAnchor = async (id, i) => {
    await fit();                              // keep the target on screen
    const c = await centre(id);
    await page.mouse.move(c.x, c.y);
    await page.waitForTimeout(80);
    const a = await page.evaluate(([id_, i_]) => {
      const el = document.querySelectorAll(`[data-id="${id_}"] .anchor`)[i_];
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, [id, i]);
    await page.mouse.move(a.x, a.y);
    await page.waitForTimeout(50);
    return a;
  };

  /**
   * Select everything in the focused field. Must be ⌘A on macOS — ctrl+A there is
   * "move to start of line", which silently prepends the next thing you type
   * instead of replacing the text.
   */
  const selectAll = () => page.keyboard.press('ControlOrMeta+a');

  return { state, fit, centre, edgePoint, hoverAnchor, selectAll };
}

/* ---------- touch, dispatched as real touch events ---------- */
/**
 * Playwright's page.touchscreen only taps, so drags and pinches go through CDP.
 * The finger radius matters: browsers do fuzzy hit-testing on touch, and bugs that
 * only bite real thumbs disappear if you dispatch a 1px point.
 */
async function touchKit(page, context) {
  const cdp = await context.newCDPSession(page);
  const point = (x, y, id = 1) => ({ x: Math.round(x), y: Math.round(y), id, radiusX: 14, radiusY: 14, force: 1 });
  const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });

  const tap = async (x, y) => {
    await send('touchStart', [point(x, y)]);
    await page.waitForTimeout(40);
    await send('touchEnd', []);
    await page.waitForTimeout(140);
  };
  const doubleTap = async (x, y) => {
    await tap(x, y);
    await page.waitForTimeout(60);
    await send('touchStart', [point(x, y)]);
    await page.waitForTimeout(40);
    await send('touchEnd', []);
    await page.waitForTimeout(180);
  };
  const drag = async (from, to, steps = 8) => {
    await send('touchStart', [point(from.x, from.y)]);
    for (let i = 1; i <= steps; i++) {
      await send('touchMove', [point(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps)]);
      await page.waitForTimeout(16);
    }
    await send('touchEnd', []);
    await page.waitForTimeout(150);
  };
  /** two fingers moving apart (spread > 1) or together (spread < 1) about a centre */
  const pinch = async (centre, spread, steps = 8) => {
    const gap = 60;
    const a = { x: centre.x - gap, y: centre.y - gap }, b = { x: centre.x + gap, y: centre.y + gap };
    await send('touchStart', [point(a.x, a.y, 1), point(b.x, b.y, 2)]);
    for (let i = 1; i <= steps; i++) {
      const f = 1 + (spread - 1) * i / steps;
      await send('touchMove', [
        point(centre.x - gap * f, centre.y - gap * f, 1),
        point(centre.x + gap * f, centre.y + gap * f, 2)
      ]);
      await page.waitForTimeout(16);
    }
    await send('touchEnd', []);
    await page.waitForTimeout(150);
  };
  return { tap, doubleTap, drag, pinch, send, point };
}

/* ---------- the suite wrapper ---------- */
function suite(title, fn, opts = {}) {
  (async () => {
    const t0 = Date.now();
    const browser = await chromium.launch({ headless: !process.env.HEADED });
    // a phone when the suite asks for one, otherwise a desktop window
    const context = await browser.newContext(opts.touch
      ? Object.assign({}, devices['iPhone 13'], { colorScheme: opts.colorScheme || 'light' })
      : { viewport: { width: 1280, height: 860 }, colorScheme: opts.colorScheme || 'light' });
    const page = await context.newPage();
    const touch = opts.touch ? await touchKit(page, context) : null;

    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    let total = 0, fails = 0;
    const check = (name, cond, detail) => {
      total++;
      if (!cond) fails++;
      const tail = !cond && detail !== undefined ? '  -> ' + safe(detail) : '';
      console.log((cond ? '  ok   ' : '  FAIL ') + name + tail);
    };

    console.log('\n• ' + title);
    let server = null;
    try {
      if (opts.server) {
        server = await startServer();
        await page.goto(server.url + '/index.html');
      } else {
        await page.goto(APP);
      }
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForTimeout(300);

      await fn(Object.assign({ page, check, browser, context, errors, server, touch }, helpers(page)));
    } catch (err) {
      fails++; total++;
      console.log('  FAIL suite threw  -> ' + (err && err.stack ? err.stack : err));
    }

    check('no runtime errors', errors.length === 0, errors);

    if (fails) {
      fs.mkdirSync(SHOTS, { recursive: true });
      const shot = path.join(SHOTS, path.basename(process.argv[1], '.js') + '.png');
      try { await page.screenshot({ path: shot }); console.log('  (screenshot: ' + shot + ')'); } catch (e) {}
    }
    if (server) await server.close();
    await browser.close();

    const ms = Date.now() - t0;
    console.log(`  ${fails ? '✗' : '✓'} ${total - fails}/${total} checks in ${(ms / 1000).toFixed(1)}s`);
    process.exitCode = fails ? 1 : 0;
  })();
}

const safe = v => { try { return JSON.stringify(v); } catch (e) { return String(v); } };

module.exports = { suite, startServer, APP, ROOT };
