# Generates a single-camera franken-bite social clip export, by calling
# ButterCut's own proven XML engine directly instead of hand-authoring XML.
# See EXPORT_NOTES.md in this same folder for per-editor status and why
# hand-authoring is fragile.
#
# Usage:
#   ruby franken_bit_export.rb clip_config.json
#
# clip_config.json shape:
# {
#   "editor": "resolve",                    // optional, defaults to "resolve" — also "premiere", "fcpx"
#   "source": {"path": "/abs/path/to/source.mp4", "width": 3840, "height": 2160,
#              "rate_num": 30000, "rate_den": 1001},
#   "sequence_name": "Creek_Clip1_ChristPursuesUsFirst",
#   "output_path": "/abs/path/to/output.xml",
#   "ranges": [[413.69, 416.13], [454.19, 466.85], ...]   // [in_seconds, out_seconds] pairs, source-file time
# }
#
# rate_num/rate_den only need to be roughly right — ButterCut re-probes the
# actual source file with ffprobe internally and uses that, this is just
# forward-compat with older configs that pre-date this script.
#
# Locates ButterCut at $BUTTERCUT_HOME if set, else ~/Buttercut — no
# hardcoded username, so this script works unchanged on any machine that
# clones ButterCut to the conventional location.

buttercut_home = ENV['BUTTERCUT_HOME'] || File.expand_path('~/Buttercut')
require_relative File.join(buttercut_home, 'lib', 'buttercut')
require 'json'

config_path = ARGV[0]
abort "Usage: ruby franken_bit_export.rb <clip_config.json>" unless config_path

cfg = JSON.parse(File.read(config_path), symbolize_names: true)
editor = (cfg[:editor] || 'resolve').to_sym

clips = cfg[:ranges].map do |(in_sec, out_sec)|
  {
    path: cfg[:source][:path],
    start_at: in_sec,
    duration: out_sec - in_sec
  }
end

generator = ButterCut.new(clips, editor: editor)
xml = generator.to_xml

# Buttercut names the sequence from the source filename + a timestamp; swap in
# the descriptive per-clip name instead (cosmetic only — the exported
# filename already comes from output_path; this just relabels the timeline
# inside the target editor so multiple clips stay distinguishable). Resolve
# and Premiere both output the same xmeml <uuid>/<name> shape this matches;
# fcpx output is structurally different (.fcpxml) and won't match — untested.
if cfg[:sequence_name]
  xml = xml.sub(/(<uuid>[^<]+<\/uuid>\s*<name>)[^<]+(<\/name>)/, "\\1#{cfg[:sequence_name]}\\2")
end

File.write(cfg[:output_path], xml)
puts "Wrote #{cfg[:output_path]} (editor: #{editor})"
