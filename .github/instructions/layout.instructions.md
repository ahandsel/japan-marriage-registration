---
applyTo: 'src/layout/**,src/layout.js,src/main.js'
---

# Layout coordinates and the layout schema

Coordinates are PDF points measured from the bottom-left corner of the page.
`drawString(x, y, ...)` places the text baseline at `(x, y)`, so increasing `y` moves the text up.

* **Positions are data, never code.**
  They live in `src/layout/<variant>.yaml`. A change that puts a coordinate in `main.js` is a defect.
* **The schema is closed.**
  `LAYOUT_SCHEMA` in `src/layout.js`, built from `PERSON_SCHEMA` and `WITNESS_SCHEMA`, lists every legal key, and `validateNode` reports a missing key and an unknown key alike as an error.
  Adding one positional entry is a four-file change: `src/layout.js`, `src/layout/red.yaml`, `src/layout/black.yaml`, and `src/layout/cinnamoroll.yaml`.
  Touching fewer than all four breaks the remaining templates at generate time, and no check catches it earlier.
* **Every entry is absolute.**
  `pos: [x, y]` with a per-field `size`, plus a `step` for a multi-line field. A circle is `[x, y, r]`, and an ellipse is two opposite bounding-box corners.
  Nothing is derived from another field's position. Reject a refactor that computes one coordinate from another.
* **No entry is shared between templates.**
  Each of the three layout files was measured against its own printed grid, so a value copied verbatim from another template is a defect even when it renders plausibly.
* **A coordinate change is only verified by looking at the PDF.**
  There is no test suite, and the CI check proves only that the file builds.
  A pull request that changes a coordinate without saying which template was regenerated and inspected has not been verified.
  To derive a coordinate rather than eyeball it, `pdftotext -bbox-layout <template>.pdf out.xhtml` lists the printed labels with exact coordinates on a template that has a text layer, such as `black`; `red` is a flattened image and has none.
  `pdftotext` measures `y` from the top of the page, so `y_layout = page_height - y_pdftotext`.
* Each form field is one section function taking `(cfg, lay, cc)`, and husband and wife share the same function, differing only in their layout data.
* Respect the recorded template quirks, which the header comment of each layout file explains.
  The black form prints no 番地, 番, or 号 on its witness 住所 row, so a witness `is_banchi_address` is `null` there, and it leaves several boxes blank for handwriting.
* Legacy `*_pos` overrides still apply on top of the resolved layout when the base layout is `red`, so moving `address_first_pos` or `legally_domiciled_first_pos` also shifts the fields historically drawn relative to them.
  They hold `red` coordinates by definition, so on any other tuned layout they are ignored with a warning instead of applied.
