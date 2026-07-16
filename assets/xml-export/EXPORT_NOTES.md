# Single-camera franken-bite XML export — source of truth

This folder is the **one place** to update whenever a new editor target gets
tested, or a new import problem (and fix) is found. Not a memory note, not a
copy living inside the ButterCut clone — this one, tracked in git. Every
generated `CLAUDE.md` points Claude here directly.

## How to use it

```
ruby assets/xml-export/franken_bit_export.rb clip_config.json
```

```json
{
  "editor": "resolve",
  "source": {"path": "/abs/path/source.mp4", "width": 3840, "height": 2160, "rate_num": 30000, "rate_den": 1001},
  "sequence_name": "Creek_Clip1_ChristPursuesUsFirst",
  "output_path": "/abs/path/output.xml",
  "ranges": [[413.69, 416.13], [454.19, 466.85]]
}
```

`editor` is optional, defaults to `"resolve"` — also accepts `"premiere"` and
`"fcpx"` (the same three targets ButterCut's own `lib/buttercut/export_core.rb`
supports). Each entry in `ranges` is one franken-bit segment —
`[in_seconds, out_seconds]` measured against the source file — laid
consecutively on a single V1/A1 timeline. Same source file repeated across
many ranges (e.g. 10 franken-bit segments) works fine — pass it as one config
with all 10 ranges.

## Status per editor

- **DaVinci Resolve — ✅ confirmed working.** Structure notes below.
- **Adobe Premiere Pro — ⚠️ not yet tested.** ButterCut's own exporter labels
  this output "FCP7 XML + rotation," so it's likely the same xmeml family as
  Resolve below — but don't trust that assumption until it's actually been
  imported into Premiere and confirmed. Update this section (and
  `franken_bit_export.rb` if the call needs to change) once tested.
- **Final Cut Pro X — not attempted.** ButterCut's exporter DTD-validates its
  FCPX output — a real `.fcpxml`, structurally different from the xmeml notes
  below. Untested against this project's needs.

**When you test a new target:** run the script with that `editor`, attempt
the real import, and edit this file with the result — confirmed-working
structure notes, or the specific fix if something broke. That's the whole
update loop: one file, one commit, one push, and every project (and anyone
else running this app) picks up the fix on their next pull.

## Also worth comparing: ButterCut's own built-in exporter

This script calls `ButterCut.new(clips, editor:).to_xml` directly — a
low-level shortcut. ButterCut also ships a higher-level, maintained pipeline —
`Export.perform(roughcut_path:, output_path:, editor:)` in
`lib/buttercut/export_core.rb`, driven by a rough-cut YAML (see
`templates/roughcut_template.yaml` and `skills/cut/` in the ButterCut clone) —
supporting the same three editors. It's not yet confirmed whether that
pipeline fits this single-clip franken-bite case as directly as this script
does, or whether it's simply a better-maintained path worth switching to.
Worth comparing both when testing Premiere.

## Why this exists

A hand-authored FCP7 XML generator failed on Resolve import with "File not
found in search directories" reported for every clip, on a project that
processes 3 sermon sources every week. A memory note from an earlier week
claimed to document the "confirmed working" structure, but it was **wrong**
— likely from a fix that coincidentally worked for a different reason that
week. Trusting it cost two more failed round-trips before the actual
ButterCut Ruby source (`lib/buttercut/fcp7_core.rb`) was read and called
directly. If you ever see a note (or a Claude memory) claiming a specific
custom xmeml structure "works" — verify against the real ButterCut source
before trusting it, or just use the script above and skip verification
entirely.

## Confirmed-correct structure (DaVinci Resolve, from `lib/buttercut/fcp7_core.rb`)

For reference only — if you're using the script above you don't need this.
Useful if ButterCut itself is ever unavailable and XML must be hand-authored
as a fallback.

- **Root:** `<xmeml version="5">`.
- **Sequence:** `<sequence id="sequence-UUID">` **with** a `<uuid>UUID</uuid>`
  child — both are required, not omitted.
- Sequence `<in>0</in>` / `<out>TOTAL_FRAMES</out>` — not `-1`/`-1`.
- Sequence `<timecode>` has `<rate>`, `<frame>0</frame>`, `<displayformat>` —
  **no `<string>` element.**
- **Video section layout:** `<video><format>...</format><track>...clips...</track></video>`
  — `<format>` comes **before** the track, not after. Only one video track;
  no second empty track needed.
- **`<file>` blocks are NOT deduplicated.** Every single clipitem (video and
  audio) gets its own complete, self-contained `<file id="...">` block —
  same `id` value reused across clips of the same source, but the full
  `name`/`pathurl`/`rate`/`duration`/`media` content is repeated every time,
  never a short `<file id="..."/>` reference. Every `<file>` **must include
  `<duration>`** (the source's total frame count) — this was likely the
  single biggest cause of the original "file not found" failures.
  - Video clipitem's `<file>`: `name`, `pathurl`, `rate`, `duration`,
    `timecode` (rate/frame/displayformat, no `<string>`), `media><video>`
    (rate, width, height, anamorphic, pixelaspectratio, fielddominance)
    `</video><audio>` (samplerate, sampledepth) `</audio></media>`.
  - Audio clipitem's `<file>`: same `name`/`pathurl`/`rate`/`duration`, no
    `timecode`, `media><audio>` only (samplerate, sampledepth).
- **`<sourcetrack>` is required on both video and audio clipitems**
  (`<mediatype>video|audio</mediatype><trackindex>1</trackindex>`) — this is
  the stream inside the source file, always track 1 for single-stream
  footage.
- **`<link>` elements are required**, one pair per clipitem (video↔audio),
  each with `linkclipref`, `mediatype`, `trackindex`, `clipindex`, and the
  audio link also has `groupindex`. (An earlier, wrong memory claimed link
  elements break Resolve import — they don't; they're required.)
- Audio clipitems also get `<channelcount>2</channelcount>` after
  `<sourcetrack>`.
- **Filters:** normally none. A `Basic Motion` filter is not needed — Resolve
  reads source rotation itself. An `Audio Levels` filter (level 0) is only
  added when a clip is explicitly muted.
- pathurl: `file://` + percent-encoded path, `%20` for spaces.
