const { suite } = require('./harness');

/**
 * The stored format is the deliverable: whatever FlowYo saves must be a chart the
 * real mermaid library accepts. This suite builds a few charts, then hands the
 * serialized text to mermaid itself.
 */
suite('output parses as real mermaid', async (t) => {
  const { page, check, server } = t;

  const samples = await page.evaluate(() => {
    const out = {};
    out['the seeded demo'] = window.FlowYo.toMermaid();

    // labels on both shapes and arrows, multi-line, plus every palette colour
    const s = window.FlowYo.state;
    s.nodes[2].label = 'Happy\nwith it?';
    s.edges[0].label = 'always';
    s.edges[2].label = 'yes, ship it\n(finally)';
    s.edges[2].color = 'razz';
    s.nodes[1].color = 'gunmetal';
    out['labels, line breaks and colours'] = window.FlowYo.toMermaid();

    // characters that have to be escaped
    s.nodes[0].label = 'He said "hi" & <b> 100%';
    out['escaped characters'] = window.FlowYo.toMermaid();

    // a chart imported without positions, laid out from scratch
    window.FlowYo.load('flowchart TD\n  A[Order received] --> B{In stock?}\n  B -->|yes| C((Ship))\n  B -->|no| D[Backorder]\n  D --> C\n');
    out['an imported chart'] = window.FlowYo.toMermaid();

    window.FlowYo.load('flowchart TD\n');
    out['an empty chart'] = window.FlowYo.toMermaid();
    return out;
  });

  const val = await t.browser.newPage();
  await val.goto(server.url + '/tests/validator.html');
  await val.waitForFunction(() => document.getElementById('out').textContent === 'ready', null, { timeout: 30000 });

  for (const [name, text] of Object.entries(samples)) {
    const result = await val.evaluate(m => window.validate(m), text);
    check('mermaid parses ' + name, result === 'OK', { result, text });
  }

  // and the colour/layout lines really are comments-or-mermaid, not our own dialect
  const withColour = samples['labels, line breaks and colours'];
  check('colours are written as classDef/class', /classDef gunmetal stroke:#3c3c3b/.test(withColour) && /class \w+ gunmetal/.test(withColour), withColour);
  check('arrow colours are written as linkStyle', /linkStyle 2 stroke:#db3069/.test(withColour), withColour);
  check('layout metadata stays inside %% comments',
    withColour.split('\n').filter(l => /pos n\d/.test(l)).every(l => l.trim().startsWith('%%')), withColour);

  await val.close();
}, { server: true });
