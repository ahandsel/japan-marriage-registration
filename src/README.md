# Src

The whole implementation of the generator, plus the assets it needs at run time.
There is no build step: [main.js][] is the file that `./start.sh`, every generate and scaffold pnpm script, and the two PDF-building workflows (`pr.yml` and `push.yml`) run directly.

The split between the two JavaScript files is the important thing to know before changing anything here.
[main.js][] only draws, and [layout.js][] owns every number that says where to draw.
Tuning the position of a field therefore means editing YAML in [layout][], never editing JavaScript.


## Contents

| Name          | Description                                                                                                                                                                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [main.js][]   | The entry point and the only implementation. Parses the command line and the YAML config, embeds the template PDF as a page-sized XObject, then draws the text and shapes on top with `pdf-lib`. Each form field is one section function taking the config section, the resolved layout section, and the canvas.                                              |
| [layout.js][] | Loads `layout/<variant>.yaml`, deep-merges an optional `layout:` block from the user config over it, applies the legacy `*_pos` overrides (only when the base layout is `red`), validates the result against a closed schema, and returns the resolved layout. Also exports the `jp-marriage-registration-` template naming convention that `main.js` shares. |
| [fonts][]     | The bundled Japanese fonts and the license files that have to travel with them. See [Fonts](#fonts) below.                                                                                                                                                                                                                                                    |
| [layout][]    | One layout YAML per template, holding every positioning number the generator uses. See [Layout files](#layout-files) below.                                                                                                                                                                                                                                   |
| [template][]  | The blank form PDFs, plus the term-by-term field reference. See [Templates](#templates) below.                                                                                                                                                                                                                                                                |


## Fonts

[fonts][] holds the bundled Japanese fonts, together with the license files that have to travel with them.
[main.js][] reads one font from that folder at run time, subsets it, and embeds it in the produced PDF, which is what makes Japanese text render in the output.
The folder is listed in `.prettierignore`, so nothing in it is reformatted automatically.

* [ipaexm.ttf][] - IPAex Mincho (IPAex明朝) Ver. 003.01, a serif face.
  This is the font the generator uses: `main.js` embeds it with `subset: true`, so only the glyphs actually drawn ship in the PDF.
* [ipaexg.ttf][] - IPAex Gothic (IPAexゴシック) Ver. 003.01, the sans-serif face of the same family.
  No code reads it today; it is kept so a future layout can switch faces without a new download.
* [ipa-font-license-v1.0.txt][] - the IPA Font License v1.0, in Japanese and English.
  This is the license both fonts ship under.
* [ipaexfont-readme.txt][] - the upstream "はじめにお読みください" readme from the IPAex two-face pack.
  It travels with the fonts it describes; the only edit is in its file listing, where the two license and readme filenames were updated to the lowercase names used here.

Do not remove either license file.
Article 3 Paragraph 2 of the IPA Font License requires a copy of the agreement to be attached when the font is redistributed, and the upstream readme is part of the original IPAex package.
The two `.ttf` files are large (7.4 MB and 5.8 MB), so they dominate the size of a fresh clone.
Changing which font the generator embeds means editing `FONT_PATH` in [main.js][], not renaming a file.


## Layout files

[layout][] holds one layout YAML per template.
[layout.js][] loads the file whose name matches the resolved template variant, deep-merges an optional `layout:` block from the user config over it, applies the legacy `*_pos` overrides (only on the `red` base layout), validates the result against a closed schema, and hands the resolved object to [main.js][].
A template with no file there falls back to [red.yaml][], which is meant for user-supplied custom PDFs only: every bundled template must have its own fully tuned file.

| Name                 | Template                                   | Description                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [red.yaml][]         | `jp-marriage-registration-red.pdf`         | The default layout, and the fallback for any template without a file of its own. Names at 24pt and kana at 12pt. The legacy `*_pos` config overrides are red coordinates by definition, so they apply only on this base layout. |
| [black.yaml][]       | `jp-marriage-registration-black.pdf`       | A denser grid, so the sizes are smaller (names at 18pt, kana at 9pt). Its header comment records the measured column and row grid, plus the boxes this form has that the config has no keys for.                                |
| [cinnamoroll.yaml][] | `jp-marriage-registration-cinnamoroll.pdf` | The Shinagawa City (品川区) form. Its header comment records the two fields this form does not have, the pre-printed recipient and the missing 世帯主の氏名 row.                                                                |


### The shape of a layout file

* Coordinates are PDF points measured from the bottom-left corner of the page, so a larger `y` moves the item up.
  `drawString(x, y, ...)` places the text baseline at `(x, y)`.
* `pos: [x, y]` is the baseline of the text, `size` is the font size in points, and `step` is the distance between the lines of a multi-line field.
* Circles are `[x, y, r]`, and ellipses are two opposite corners of the bounding box, `[x1, y1, x2, y2]`.
* Every entry is absolute.
  Nothing is derived from another field, and husband and wife are independent sibling sections with identical keys, as are witness1 and witness2.
* The top-level sections match the config: `husband`, `wife`, `witness1`, `witness2`, `new_legally_domiciled`, `to_live_together`, `national_census`, `notification`, and `other`.


### Working on a layout

* The schema in [layout.js][] is closed.
  It lists every legal key, and both a missing key and an unknown one are reported as an error, so adding one positional entry is a four-file change: the schema plus all three layout YAML files.
  Adding it to only one file breaks the other two templates at generate time.
* `pnpm run <variant>:layout` scaffolds a file for a template that does not have one, and validates an existing one.
  It checks the layout YAML only; a broken `layout:` block inside a private config surfaces on a generate run instead.
* There is no way to check a coordinate except to look at the result, so regenerate the PDF and inspect it.
  Where the template carries a real text layer, `pdftotext -bbox-layout` lists the printed labels with exact coordinates, which lets a field be placed against the label it belongs next to.
  Note that `pdftotext` measures y from the top of the page while these files measure it from the bottom, so `y_layout = page_height - y_pdftotext`.


## Templates

[template][] holds the blank Japanese marriage registration forms (婚姻届) that the generator draws on top of, plus the reference that explains what every box on them means.
[main.js][] embeds the selected PDF as a page-sized XObject and draws the config values over it, so nothing in those files is modified.

| Name                                         | Description                                                                                                                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [jp-marriage-registration-red.pdf][]         | The default template, `red`. A flattened Photoshop image with no text layer, so its grid has to be measured from the raster rather than read out of the PDF.                                               |
| [jp-marriage-registration-black.pdf][]       | The `black` template, an InDesign form with a real text layer, so `pdftotext -bbox-layout` lists its printed labels with exact coordinates. A denser grid than the red one.                                |
| [jp-marriage-registration-cinnamoroll.pdf][] | The `cinnamoroll` template, a Shinagawa City (品川区) form with a character illustration. It carries the rights notice `© 2025 SANRIO CO., LTD. APPROVAL NO. L655975`, which must stay on the PDF.         |
| [marriage-registration-fields.md][]          | The term-by-term field reference: every Japanese label on the form, a plain-language English rendering, what the box means, and the config keys that fill it. Read it before guessing what a field is for. |

All three forms are a single A3 landscape page, 1190 x 842 points.


### Naming and selection

* The filename convention is `jp-marriage-registration-<variant>.pdf`, and `TEMPLATE_PREFIX` in [layout.js][] is the one definition of that prefix.
* A template is selected by short variant name (`red`, `black`, `cinnamoroll`), by full stem, or by a path to any other PDF.
  The `-t`/`--template` flag wins over the `template:` key in the config, and the default is `red`.
* Each bundled template needs a fully tuned `<variant>.yaml` in [layout][] in the same change that adds the PDF.
  The fallback to the red layout exists for user-supplied custom PDFs only, never for a template that ships here.


## Notes

* The test suite in `../test/` (`pnpm test`) checks that every value renders at the position its layout entry names.
  It cannot tell whether that position matches the printed form, so to check a coordinate change, regenerate the PDF and look at it, writing throwaway output somewhere outside the repository with `-o`.

See [AGENTS.md][] for the full architecture guidance, and [README.md][] for how to run the generator.

[main.js]: main.js
[layout.js]: layout.js
[fonts]: fonts
[layout]: layout
[template]: template
[ipaexm.ttf]: fonts/ipaexm.ttf
[ipaexg.ttf]: fonts/ipaexg.ttf
[ipa-font-license-v1.0.txt]: fonts/ipa-font-license-v1.0.txt
[ipaexfont-readme.txt]: fonts/ipaexfont-readme.txt
[red.yaml]: layout/red.yaml
[black.yaml]: layout/black.yaml
[cinnamoroll.yaml]: layout/cinnamoroll.yaml
[jp-marriage-registration-red.pdf]: template/jp-marriage-registration-red.pdf
[jp-marriage-registration-black.pdf]: template/jp-marriage-registration-black.pdf
[jp-marriage-registration-cinnamoroll.pdf]: template/jp-marriage-registration-cinnamoroll.pdf
[marriage-registration-fields.md]: template/marriage-registration-fields.md
[AGENTS.md]: ../AGENTS.md
[README.md]: ../README.md
