# Src

The whole implementation of the generator, plus the assets it needs at run time.
There is no build step: [main.js][] is the file that `./start.sh`, every pnpm script, and all CI workflows run directly.

The split between the two JavaScript files is the important thing to know before changing anything here.
[main.js][] only draws, and [layout.js][] owns every number that says where to draw.
Tuning the position of a field therefore means editing YAML in [layout][], never editing JavaScript.


## Contents

| Name          | Description                                                                                                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [main.js][]   | The entry point and the only implementation. Parses the command line and the YAML config, embeds the template PDF as a page-sized XObject, then draws the text and shapes on top with `pdf-lib`. Each form field is one section function taking the config section, the resolved layout section, and the canvas.         |
| [layout.js][] | Loads `layout/<variant>.yaml`, deep-merges an optional `layout:` block from the user config over it, applies the legacy `*_pos` overrides, validates the result against a closed schema, and returns the resolved layout. Also exports the `jp-marriage-registration-` template naming convention that `main.js` shares. |
| [fonts][]     | The bundled Japanese fonts, IPAex Mincho (`ipaexm.ttf`, the one `main.js` subsets and embeds) and IPAex Gothic (`ipaexg.ttf`), together with the IPA Font License v1.0 and the upstream readme that the license requires be kept with them.                                                                              |
| [layout][]    | One layout YAML per template: `red.yaml`, `black.yaml`, and `cinnamoroll.yaml`. Every entry is an absolute position in PDF points measured from the bottom-left corner, plus a font size and, for multi-line fields, a line step. All three files are fully tuned against their own template's printed grid.             |
| [template][]  | The blank form PDFs, named `jp-marriage-registration-<variant>.pdf` so a short variant name selects them, plus [marriage-registration-fields.md][], a term-by-term reference that maps the Japanese on the form to its English meaning and to the config key that fills it.                                              |


## Notes

* Coordinates are PDF points measured from the bottom-left corner of the page, and `drawString(x, y, ...)` places the text baseline at `(x, y)`, so a larger `y` moves the text up.
* The layout schema in [layout.js][] is closed: it lists every legal key, and both a missing key and an unknown one are reported as errors. Adding one positional entry is therefore a four-file change, the schema plus all three layout YAML files.
* There is no test suite. To check a change, regenerate the PDF and look at it, writing throwaway output somewhere outside the repository with `-o`.
* The Cinnamoroll template carries a character illustration rights notice that must stay on that PDF. See [marriage-registration-fields.md][] for the exact wording.

See [AGENTS.md][] for the full architecture guidance, and [README.md][] for how to run the generator.

[main.js]: main.js
[layout.js]: layout.js
[fonts]: fonts
[layout]: layout
[template]: template
[marriage-registration-fields.md]: template/marriage-registration-fields.md
[AGENTS.md]: ../AGENTS.md
[README.md]: ../README.md
