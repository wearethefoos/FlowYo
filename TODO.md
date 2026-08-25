# FlowYo — backlog

Shipped so far (`index.html`):

- SVG canvas with pan (drag empty space), zoom (⌘/ctrl + scroll, or the toolbar), fit-to-screen
- Place circles, squares and diamonds by dragging from the toolbar (or clicking to drop one in the middle)
- Drag nodes around, snapped to a 10px grid — hold **shift** for free placement
- **⌥/alt + drag** on a shape pulls off a copy of it (same shape and label, no connectors)
- Draw connectors by dragging one of the four blue handles onto another shape
- **Click a blue handle** (or drop it on empty canvas) to add a new connected square and jump
  straight into its label editor — the placeholder is preselected, so just type
- Connector labels sit centred on the line, knocking the line out behind them
- **Colour**: bright border + faded fill from the palette — cobalt, razzmatazz, royal gold and
  gunmetal. Shapes get a default (circle = razzmatazz, square = cobalt, diamond = gold); the four
  dots in the toolbar (or keys **1**–**4**) recolour the selected shape *or* arrow, and clicking the
  active dot resets it. Beige is the canvas paper and gunmetal the ink; both flip for dark mode.
  Colours are stored as real mermaid — `classDef`/`class` for shapes, `linkStyle` for arrows
- Double-click a shape **or an arrow** to label it; **shift + enter** puts in a soft line break,
  enter commits, escape cancels. Shapes resize to fit; clearing an arrow's label removes it
- Select a shape or a connector and remove it with the Delete button or the Delete/Backspace key
- **Undo / redo** over every mutation — ⌘Z / ⇧⌘Z (or ctrl), plus toolbar buttons that disable at
  the ends of the stack. Snapshot-based, capped at 200 steps; a drag is one step, and ⌘Z inside the
  label editor stays the browser's own text undo
- **Several charts side by side** — the name button in the toolbar switches between them, and
  adds, renames, duplicates or deletes (two taps, no modal). Each chart is its own mermaid
  document; an install from the single-chart days is migrated on first open
- Autosave to `localStorage` as mermaid (`flowyo:charts:v1` index + `flowyo:chart:<id>` per chart),
  with node positions kept in `%% pos` comments and line breaks written as `<br/>`. The last edit is
  flushed on tab close

## Next up

- [ ] **Import mermaid** — paste a mermaid flowchart and lay it out (the parser and auto-layout already
      handle this; `FlowYo.load(text)` works from the console — it just needs UI)
- [ ] **Export** — copy/download as:
  - [ ] mermaid (`.mmd`)
  - [ ] Markdown (mermaid fenced in a ```mermaid block)
  - [ ] SVG (serialize the `<g id="view">` contents into a standalone sized SVG)
  - [ ] PNG (rasterize that SVG onto a canvas at 2x)

## Ideas parked for later

- [ ] More shapes: rounded/stadium `([ ])`, subroutine `[[ ]]`, cylinder `[( )]`
- [ ] Custom colours beyond the four palette slots, and per-chart theming
- [ ] Orthogonal / elbow connector routing instead of straight lines
- [ ] Drag an arrow's endpoint onto a different shape to re-route it
- [ ] Let a spawned shape inherit the source's shape (or pick one) instead of always a square
- [ ] Multi-select with a rubber band, plus align and distribute
- [ ] Auto-arrange the whole chart (top-down / left-right)
- [ ] Copy-paste and duplicate via the keyboard (⌘C/⌘V, ⌘D) alongside alt-drag
