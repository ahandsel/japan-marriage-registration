---
applyTo: 'config*.yaml,src/template/marriage-registration-fields.md'
---

# Config files and personal information

A tracked config is public.
`push.yml` builds `config.yaml` and publishes the resulting PDF as a public GitHub Release, so anything committed here reaches the internet.

* **Every tracked config carries placeholders only**, never a real name, birthdate, address, phone number, or family register (本籍) value.
  This covers `config.yaml`, `config-black.yaml`, and `config-cinnamoroll.yaml`.
* A file matching `config-private*.yaml` must stay untracked.
  `git ls-files 'config-private*'` printing anything is a defect, and so is a gitignore change that stops covering that pattern.
* Real personal information under a new filename is the worst case, because the gitignore rules cover only `config-private*.yaml`, `save.yaml`, and `p.yaml`.
  Flag any new config filename that could hold real data.
* The top-level sections are `filing`, `husband`, `wife`, `new_domicile`, `living_together_since`, `national_census`, `other`, `witness1`, and `witness2`.
  `husband` and `wife` share one set of keys, and so do `witness1` and `witness2`, so a key added to one belongs in its sibling.
* A witness `name` must be `''`; nonempty values are rejected, including in drafts and samples.
  Each witness must personally handwrite their signature after printing; seals are optional.
* For reviewed foreign-name formatting, use a comma between surname and given names in single full-name fields, and append middle names without spaces.
  Accept `、`, `，`, and `,` as surname/given-name separators during config reviews.
  Do not flag an existing `、` as a missing separator or replace it.
  Keep separate surname and given-name fields separate; the renderer does not infer nationality or name boundaries.
* On the cinnamoroll template, `filing.office` and `head_of_household` stay `''`: the 品川区長殿 recipient is pre-printed, and that 住所 box has no 世帯主の氏名 row.
  Its spouse 住所 and 本籍 rows also pre-print 丁目, so `address_banchi` and `domicile_banchi` leave 丁目 out and hold two full-width spaces in its place (`３　　４`); the witness rows keep the usual `２丁目　８` shape.
* Every top-level section is optional: deleting one leaves that part of the form blank for handwriting.
  A key missing inside a section that is present is an error, and so is a `household_work_type` outside 1-6 (`0` and `''` leave the box blank).
  The one exception is a witness `address_building`, which was added after the witness box shipped: a missing one prints nothing.
* `address_banchi_type` and `domicile_banchi_type` take `banchi`, `ban`, or `null`, and `null` skips the 番地/番 mark in every section.
  Any other value, or a missing key, is an error.
* A `layout:` block in a config deep-merges over the template's layout file.
  It nudges a coordinate for one user, and it is not the place to fix a layout defect that every user has.
* `src/template/marriage-registration-fields.md` is the term-by-term reference for what each field means.
  A new or renamed config key updates it, along with `config.yaml`, `README.md`, and `README.en.md`.
  A renamed key also gets an entry in `src/renamed-keys.js`, which is how `main.js` refuses the old name and `pnpm run migrate-config` rewrites it.
