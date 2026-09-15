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
* The top-level sections are `notification`, `husband`, `wife`, `new_legally_domiciled`, `to_live_together`, `national_census`, `other`, `witness1`, and `witness2`.
  `husband` and `wife` share one set of keys, and so do `witness1` and `witness2`, so a key added to one belongs in its sibling.
* A witness `name` stays `''`, because a witness signature has to be handwritten.
* On the cinnamoroll template, `notification.to` and `household_person` stay `''`: the 品川区長殿 recipient is pre-printed, and that 住所 box has no 世帯主の氏名 row.
* A `layout:` block in a config deep-merges over the template's layout file.
  It nudges a coordinate for one user, and it is not the place to fix a layout defect that every user has.
* `src/template/marriage-registration-fields.md` is the term-by-term reference for what each field means.
  A new or renamed config key updates it, along with `config.yaml`, `README.md`, and `README.en.md`.
