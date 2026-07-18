# XML export — source of truth (single-camera franken-bite + multicam)

This folder is the **one place** to update whenever a new editor target gets
tested, or a new import problem (and fix) is found. Not a memory note, not a
copy living inside the ButterCut clone — this one, tracked in git. Every
generated `CLAUDE.md` points Claude here directly.

Two scripts, two shapes of job:
- `franken_bit_export.rb` — single V1/A1 track, calls ButterCut's own
  generator directly. Use for single-camera selects/franken-bites.
- `multicam_export.py` — N video-angle tracks + master audio tracks (+
  optional per-camera nat-sound tracks, disabled by default), hand-authored
  because ButterCut core has no multi-track generator. Use for any multi-
  angle cut (the Track Protocol pattern). See "Multicam export" below.

## Single-camera franken-bite — how to use it

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

## Multicam export — how to use it

```
python3 assets/xml-export/multicam_export.py config.json
```

```json
{
  "sequence_name": "My Multicam Edit",
  "output_path": "/abs/path/output.xml",
  "video_tracks": [
    {"path": "/abs/cam-a.mov", "offset": 85.488},
    {"path": "/abs/cam-b.mov", "offset": 91.484}
  ],
  "master_audio_tracks": [
    {"path": "/abs/mic1.wav", "offset": 2.724},
    {"path": "/abs/mic2.wav", "offset": 0.0}
  ],
  "include_nat_sound": true,
  "positions": [
    {"start": 200.94, "end": 205.164, "angle": 0},
    {"start": 253.412, "end": 266.565, "angle": 1}
  ]
}
```

This is the default going forward for any multi-angle cut — one V track per
camera angle (full-duration coverage, `angle` selects which is enabled per
position), one locked A track per master/iso mic (always enabled,
continuous), and — if `include_nat_sound` (default `true`) — one extra
disabled A track per camera carrying that camera's own embedded audio, kept
for reference/re-sync without needing to rebuild the timeline. Width,
height, frame rate, duration, and embedded start timecode are all
auto-probed via ffprobe — no need to hand-supply them.

`offset` on every source is seconds into that file's own elapsed time
corresponding to master-timeline (output sequence) `t=0` — compute this
externally via waveform cross-correlation sync before calling the script;
it isn't done for you. `positions` must already be trimmed/ordered as the
final cut — the script only lays out tracks, it makes no editorial
decisions.

Confirmed working on DaVinci Resolve — first hand-authored attempt broke
(video only; audio was fine) on exactly the two subtle bugs documented in
"Multi-track" below (clipitem `<rate>` position, fabricated embedded
timecode). Verified twice: once against a byte-for-byte diff of a real
`franken_bit_export.rb` output, and once by confirming this generalized
script reproduces an already-working hand-authored file identically
(same enabled counts, in/out frames, timecode, zero `<link>` elements).

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
  elements break Resolve import — they don't; they're required.) **Caveat
  added after the multi-track case below: this is true when the video and
  audio genuinely come from the same paired source (this franken-bite case).
  When tracks are independent by design (separate iso audio, alternate
  camera angles), adding links here re-couples their selection/movement in
  Resolve — omit `<link>` entirely instead. "Required" means "required for a
  real pair," not "always add one."**
- Audio clipitems also get `<channelcount>2</channelcount>` after
  `<sourcetrack>`.
- **Filters:** normally none. A `Basic Motion` filter is not needed — Resolve
  reads source rotation itself. An `Audio Levels` filter (level 0) is only
  added when a clip is explicitly muted.
- pathurl: `file://` + percent-encoded path, `%20` for spaces.
- **Clipitem child order (not obvious from the prose above — this is what
  actually broke the multi-track case below):** `name`, `enabled`,
  `duration`, `start`, `end`, `in`, `out`, **then** `rate`, then `file`, then
  `sourcetrack`, then (audio only) `channelcount`, then `link`s. `<rate>`
  comes **after** `<in>`/`<out>`, not right after `<duration>` — putting it
  earlier is a plausible-looking mistake that still produces well-formed,
  schema-valid-looking XML, so it won't show up as an XML error. Verify
  against a real script-generated file (see below) rather than re-deriving
  this order from memory.

## Multi-track (multicam angle tracks + separate iso audio) — now scripted, confirmed working

This project's Track Protocol (V1..VN one per camera angle, all full-duration
with `<enabled>TRUE|FALSE</enabled>` per clip, plus independent locked master
audio tracks, plus optional disabled per-camera nat-sound tracks) has **no
ButterCut generator to call** — `lib/buttercut/` is `EDITION = :core` (see
`version.rb`); there's no `editor_base_pro.rb` or multi-track
`emit_video_tracks`/`emit_audio_tracks` override yet. `multicam_export.py`
(see "Multicam export" above) is the confirmed-working replacement — use it
instead of re-deriving this structure by hand each time; the notes below are
the *why*, kept for whoever next has to touch or debug that script.

First attempt at this failed with "File not found in search directories" —
but only for the video tracks; audio (iso mics, no embedded timecode field)
imported fine, which was the key diagnostic clue. Root causes, found by
generating a real single-clip file with `franken_bit_export.rb` for one of
the actual camera files and diffing byte-for-byte against the hand-authored
version:

- The clipitem child-order bug above (`<rate>` placed right after
  `<duration>` instead of after `<in>`/`<out>`) — present in both video and
  audio clipitems, but only broke video. Order every clipitem exactly per
  the bullet above.
- **Each video file's `<file><timecode><frame>` must be the source's real
  embedded start timecode, in frames at the sequence rate — not `0`.**
  Camera files almost always have a non-zero embedded reel timecode (read
  it via `ffprobe -show_streams`, the stream `tags.timecode` field, e.g.
  `"07:03:08:09"`; convert to frames the same way
  `EditorBase#clip_timecode_fraction` does). This field doesn't affect the
  actual `<in>`/`<out>` frame math (those stay plain 0-based offsets into
  the file — confirmed by reading `build_clip_payload` in
  `fcp7_core.rb`, where `source_in`/`source_out` never touch the asset's
  embedded timecode), but Resolve's importer evidently uses/validates it
  when resolving video media specifically. Audio (wav) sources have no
  timecode field at all, which is exactly why only video broke.
- `<link>` elements: per the caveat added above, **omit them** for this
  layout — there's no single video-to-audio pair (2 video tracks share one
  timeline position with only one enabled at a time; 2 audio tracks are
  both always enabled). Linking them re-couples clip selection/movement
  across tracks in Resolve, which defeats the point of independent angle
  tracks. (One iteration tried linking all clips sharing a timeline
  position as a 4-way group — imported fine, but visibly linked the tracks
  in Resolve's timeline, which is undesired here. Removing `<link>`
  entirely still imports and resolves media correctly — the "required"
  guidance above is specific to a real video+its-own-audio pair, not a
  general xmeml requirement.)
- Track-level `<enabled>TRUE</enabled>` and, for locked master-audio tracks,
  `<locked>TRUE</locked>` as the first children of `<track>` (before its
  clipitems) are valid and import fine — the single-track engine never
  needs them (it only ever writes one unlocked track) but they're normal
  xmeml.
- **Nat-sound tracks** (each camera's own embedded audio, kept for
  reference/re-sync): one extra audio track per camera, `<track-level
  enabled>FALSE</enabled>`, every clipitem also `<enabled>FALSE</enabled>`,
  same in/out per position as that camera's video clip (same file, same
  moment — reuse the computed frame numbers, don't recompute). Disabling at
  both the track level and the clip level is belt-and-suspenders; importer
  behavior on track-level-only vs clip-level-only disable wasn't isolated,
  so both are set. `include_nat_sound: true` in `multicam_export.py`'s
  config does this automatically.
