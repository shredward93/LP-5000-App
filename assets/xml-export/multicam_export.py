#!/usr/bin/env python3
"""Multicam FCP7/xmeml export for DaVinci Resolve — hand-authored, confirmed-working structure.

Builds an N-video-track + M-audio-track sequence where every video track has
full-duration coverage (one clipitem per position, enabled on exactly the
active angle, disabled elsewhere) and every audio track is continuous and
independent (no <link> grouping between tracks). This is the pattern used
when ButterCut's own generator can't help — ButterCut core is single-track
only (see lib/buttercut/version.rb, EDITION = :core) — for the confirmed
fixes and rationale, see EXPORT_NOTES.md's "Multi-track" section.

Usage:
    python3 multicam_export.py config.json

Config schema:
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

- `offset` on every source is seconds into that file's OWN elapsed time that
  corresponds to master-timeline (output sequence) t=0 — i.e. how the
  waveform sync mapped each source onto one shared timeline. Compute these
  externally (waveform cross-correlation) before calling this script.
- `angle` in each position is the 0-based index into video_tracks that's
  enabled at that position; every other video track gets a disabled clip at
  the same position (full-duration coverage per the Track Protocol).
- `include_nat_sound` (default true): adds one extra disabled audio track
  per video track, carrying that camera's own embedded audio — present for
  reference/re-sync, never played back by default.
- Master audio tracks are always continuous, always enabled, and locked.
"""
import sys
import json
import html
import subprocess
import uuid as uuidlib
from urllib.parse import quote

FFPROBE = "/opt/homebrew/bin/ffprobe"


def probe(path):
    out = subprocess.run(
        [FFPROBE, "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", path],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
    ).stdout
    return json.loads(out)


def probe_video(path):
    data = probe(path)
    vstream = next(s for s in data["streams"] if s["codec_type"] == "video")
    rate_num, rate_den = (int(x) for x in vstream["r_frame_rate"].split("/"))
    duration = float(data["format"]["duration"])
    timecode_str = None
    for s in data["streams"]:
        tc = s.get("tags", {}).get("timecode")
        if tc:
            timecode_str = tc
            break
    return {
        "width": vstream["width"], "height": vstream["height"],
        "rate_num": rate_num, "rate_den": rate_den,
        "duration": duration, "timecode_str": timecode_str,
    }


def probe_audio(path):
    data = probe(path)
    return {"duration": float(data["format"]["duration"])}


def timecode_to_frames(tc, fps_nominal):
    # non-drop-frame only (":", not ";") -- matches EditorBase#clip_timecode_fraction's simple case
    h, m, s, f = (int(x) for x in tc.replace(";", ":").split(":"))
    return ((h * 3600 + m * 60 + s) * fps_nominal) + f


def esc(s):
    return html.escape(s, quote=False)


def file_url(path):
    return "file://" + "/".join(quote(seg) for seg in path.split("/"))


def main(config_path):
    cfg = json.load(open(config_path))

    video_defs = cfg["video_tracks"]
    audio_defs = cfg["master_audio_tracks"]
    include_nat_sound = cfg.get("include_nat_sound", True)
    positions = cfg["positions"]

    # Probe every source; sequence rate/format follows the first video track.
    for v in video_defs:
        meta = probe_video(v["path"])
        v.update(meta)
        v["filename"] = v["path"].split("/")[-1]
        v["basename"] = v["filename"].rsplit(".", 1)[0]
        v["file_id"] = f"file-v{video_defs.index(v)}"
    for a in audio_defs:
        meta = probe_audio(a["path"])
        a.update(meta)
        a["filename"] = a["path"].split("/")[-1]
        a["basename"] = a["filename"].rsplit(".", 1)[0]
        a["file_id"] = f"file-a{audio_defs.index(a)}"

    first = video_defs[0]
    fps_num, fps_den = first["rate_num"], first["rate_den"]
    timebase = round(fps_num / fps_den)
    ntsc = "FALSE" if fps_den == 1 else "TRUE"
    drop_frame = (fps_num, fps_den) in [(30000, 1001), (60000, 1001)]
    display = "DF" if drop_frame else "NDF"

    def to_frames(sec):
        return round(sec * fps_num / fps_den)

    for v in video_defs:
        v["timecode_frame"] = (
            timecode_to_frames(v["timecode_str"], timebase) if v["timecode_str"] else 0
        )

    def rate_block(indent):
        return f"{indent}<rate>\n{indent}\t<timebase>{timebase}</timebase>\n{indent}\t<ntsc>{ntsc}</ntsc>\n{indent}</rate>\n"

    def video_clipitem(clip_id, source, enabled, ts_f, te_f, in_f, out_f):
        dur_f = te_f - ts_f
        asset_dur_f = to_frames(source["duration"])
        o = [f'\t\t\t\t<clipitem id="{clip_id}">\n']
        o.append(f'\t\t\t\t\t<name>{esc(source["basename"])}</name>\n')
        o.append(f'\t\t\t\t\t<enabled>{"TRUE" if enabled else "FALSE"}</enabled>\n')
        o.append(f'\t\t\t\t\t<duration>{dur_f}</duration>\n')
        o.append(f'\t\t\t\t\t<start>{ts_f}</start>\n')
        o.append(f'\t\t\t\t\t<end>{te_f}</end>\n')
        o.append(f'\t\t\t\t\t<in>{in_f}</in>\n')
        o.append(f'\t\t\t\t\t<out>{out_f}</out>\n')
        o.append(rate_block("\t\t\t\t\t"))
        o.append(f'\t\t\t\t\t<file id="{source["file_id"]}">\n')
        o.append(f'\t\t\t\t\t\t<name>{esc(source["filename"])}</name>\n')
        o.append(f'\t\t\t\t\t\t<pathurl>{esc(file_url(source["path"]))}</pathurl>\n')
        o.append(rate_block("\t\t\t\t\t\t"))
        o.append(f'\t\t\t\t\t\t<duration>{asset_dur_f}</duration>\n')
        o.append('\t\t\t\t\t\t<timecode>\n')
        o.append(rate_block("\t\t\t\t\t\t\t"))
        o.append(f'\t\t\t\t\t\t\t<frame>{source["timecode_frame"]}</frame>\n')
        o.append(f'\t\t\t\t\t\t\t<displayformat>{display}</displayformat>\n')
        o.append('\t\t\t\t\t\t</timecode>\n')
        o.append('\t\t\t\t\t\t<media>\n')
        o.append('\t\t\t\t\t\t\t<video>\n')
        o.append('\t\t\t\t\t\t\t\t<samplecharacteristics>\n')
        o.append(rate_block("\t\t\t\t\t\t\t\t\t"))
        o.append(f'\t\t\t\t\t\t\t\t\t<width>{source["width"]}</width>\n')
        o.append(f'\t\t\t\t\t\t\t\t\t<height>{source["height"]}</height>\n')
        o.append('\t\t\t\t\t\t\t\t\t<anamorphic>FALSE</anamorphic>\n')
        o.append('\t\t\t\t\t\t\t\t\t<pixelaspectratio>square</pixelaspectratio>\n')
        o.append('\t\t\t\t\t\t\t\t\t<fielddominance>none</fielddominance>\n')
        o.append('\t\t\t\t\t\t\t\t</samplecharacteristics>\n')
        o.append('\t\t\t\t\t\t\t</video>\n')
        o.append('\t\t\t\t\t\t\t<audio>\n')
        o.append('\t\t\t\t\t\t\t\t<samplecharacteristics>\n')
        o.append('\t\t\t\t\t\t\t\t\t<samplerate>48000</samplerate>\n')
        o.append('\t\t\t\t\t\t\t\t\t<sampledepth>16</sampledepth>\n')
        o.append('\t\t\t\t\t\t\t\t</samplecharacteristics>\n')
        o.append('\t\t\t\t\t\t\t</audio>\n')
        o.append('\t\t\t\t\t\t</media>\n')
        o.append('\t\t\t\t\t</file>\n')
        o.append('\t\t\t\t\t<sourcetrack>\n')
        o.append('\t\t\t\t\t\t<mediatype>video</mediatype>\n')
        o.append('\t\t\t\t\t\t<trackindex>1</trackindex>\n')
        o.append('\t\t\t\t\t</sourcetrack>\n')
        o.append('\t\t\t\t</clipitem>\n')
        return "".join(o)

    def audio_clipitem(clip_id, source, enabled, ts_f, te_f, in_f, out_f):
        dur_f = te_f - ts_f
        asset_dur_f = to_frames(source["duration"])
        o = [f'\t\t\t\t<clipitem id="{clip_id}">\n']
        o.append(f'\t\t\t\t\t<name>{esc(source["basename"])}</name>\n')
        o.append(f'\t\t\t\t\t<enabled>{"TRUE" if enabled else "FALSE"}</enabled>\n')
        o.append(f'\t\t\t\t\t<duration>{dur_f}</duration>\n')
        o.append(f'\t\t\t\t\t<start>{ts_f}</start>\n')
        o.append(f'\t\t\t\t\t<end>{te_f}</end>\n')
        o.append(f'\t\t\t\t\t<in>{in_f}</in>\n')
        o.append(f'\t\t\t\t\t<out>{out_f}</out>\n')
        o.append(rate_block("\t\t\t\t\t"))
        o.append(f'\t\t\t\t\t<file id="{source["file_id"]}">\n')
        o.append(f'\t\t\t\t\t\t<name>{esc(source["filename"])}</name>\n')
        o.append(f'\t\t\t\t\t\t<pathurl>{esc(file_url(source["path"]))}</pathurl>\n')
        o.append(rate_block("\t\t\t\t\t\t"))
        o.append(f'\t\t\t\t\t\t<duration>{asset_dur_f}</duration>\n')
        o.append('\t\t\t\t\t\t<media>\n')
        o.append('\t\t\t\t\t\t\t<audio>\n')
        o.append('\t\t\t\t\t\t\t\t<samplecharacteristics>\n')
        o.append('\t\t\t\t\t\t\t\t\t<samplerate>48000</samplerate>\n')
        o.append('\t\t\t\t\t\t\t\t\t<sampledepth>16</sampledepth>\n')
        o.append('\t\t\t\t\t\t\t\t</samplecharacteristics>\n')
        o.append('\t\t\t\t\t\t\t</audio>\n')
        o.append('\t\t\t\t\t\t</media>\n')
        o.append('\t\t\t\t\t</file>\n')
        o.append('\t\t\t\t\t<sourcetrack>\n')
        o.append('\t\t\t\t\t\t<mediatype>audio</mediatype>\n')
        o.append('\t\t\t\t\t\t<trackindex>1</trackindex>\n')
        o.append('\t\t\t\t\t</sourcetrack>\n')
        o.append('\t\t\t\t\t<channelcount>2</channelcount>\n')
        o.append('\t\t\t\t</clipitem>\n')
        return "".join(o)

    # Validate every position falls within every source's actual recorded range.
    for i, p in enumerate(positions):
        for v in video_defs:
            if not (p["start"] - v["offset"] >= 0 and p["end"] - v["offset"] <= v["duration"]):
                raise ValueError(f"position {i} ({p['start']}-{p['end']}) out of range for {v['path']}")
        for a in audio_defs:
            if not (p["start"] - a["offset"] >= 0 and p["end"] - a["offset"] <= a["duration"]):
                raise ValueError(f"position {i} ({p['start']}-{p['end']}) out of range for {a['path']}")

    video_track_clips = [[] for _ in video_defs]
    nat_sound_track_clips = [[] for _ in video_defs]
    audio_track_clips = [[] for _ in audio_defs]

    t = 0.0
    for i, p in enumerate(positions):
        dur = p["end"] - p["start"]
        ts_f = to_frames(t)
        te_f = to_frames(t + dur)
        for vi, v in enumerate(video_defs):
            in_f = to_frames(p["start"] - v["offset"])
            out_f = in_f + (te_f - ts_f)
            enabled = (vi == p["angle"])
            video_track_clips[vi].append(
                video_clipitem(f"clipitem-video-v{vi}-{i+1}", v, enabled, ts_f, te_f, in_f, out_f)
            )
            if include_nat_sound:
                nat_sound_track_clips[vi].append(
                    audio_clipitem(f"clipitem-audio-nat{vi}-{i+1}", v, False, ts_f, te_f, in_f, out_f)
                )
        for ai, a in enumerate(audio_defs):
            in_f = to_frames(p["start"] - a["offset"])
            out_f = in_f + (te_f - ts_f)
            audio_track_clips[ai].append(
                audio_clipitem(f"clipitem-audio-a{ai}-{i+1}", a, True, ts_f, te_f, in_f, out_f)
            )
        t += dur

    total_frames = to_frames(t)
    sequence_uuid = str(uuidlib.uuid4())
    sequence_name = cfg.get("sequence_name", "Multicam Sequence")

    xp = []
    xp.append('<?xml version="1.0" encoding="UTF-8"?>\n')
    xp.append('<!DOCTYPE xmeml>\n')
    xp.append('<xmeml version="5">\n')
    xp.append(f'\t<sequence id="sequence-{sequence_uuid}">\n')
    xp.append(f'\t\t<uuid>{sequence_uuid}</uuid>\n')
    xp.append(f'\t\t<name>{esc(sequence_name)}</name>\n')
    xp.append(f'\t\t<duration>{total_frames}</duration>\n')
    xp.append(rate_block("\t\t"))
    xp.append('\t\t<in>0</in>\n')
    xp.append(f'\t\t<out>{total_frames}</out>\n')
    xp.append('\t\t<timecode>\n')
    xp.append(rate_block("\t\t\t"))
    xp.append('\t\t\t<frame>0</frame>\n')
    xp.append(f'\t\t\t<displayformat>{display}</displayformat>\n')
    xp.append('\t\t</timecode>\n')
    xp.append('\t\t<media>\n')
    xp.append('\t\t\t<video>\n')
    xp.append('\t\t\t\t<format>\n')
    xp.append('\t\t\t\t\t<samplecharacteristics>\n')
    xp.append(rate_block("\t\t\t\t\t\t"))
    xp.append(f'\t\t\t\t\t\t<width>{first["width"]}</width>\n')
    xp.append(f'\t\t\t\t\t\t<height>{first["height"]}</height>\n')
    xp.append('\t\t\t\t\t\t<anamorphic>FALSE</anamorphic>\n')
    xp.append('\t\t\t\t\t\t<pixelaspectratio>square</pixelaspectratio>\n')
    xp.append('\t\t\t\t\t\t<fielddominance>none</fielddominance>\n')
    xp.append('\t\t\t\t\t</samplecharacteristics>\n')
    xp.append('\t\t\t\t</format>\n')
    for vi in range(len(video_defs)):
        xp.append('\t\t\t\t<track>\n')
        xp.append('\t\t\t\t\t<enabled>TRUE</enabled>\n')
        xp.extend(video_track_clips[vi])
        xp.append('\t\t\t\t</track>\n')
    xp.append('\t\t\t</video>\n')
    xp.append('\t\t\t<audio>\n')
    xp.append('\t\t\t\t<numOutputChannels>2</numOutputChannels>\n')
    xp.append('\t\t\t\t<format>\n')
    xp.append('\t\t\t\t\t<samplecharacteristics>\n')
    xp.append('\t\t\t\t\t\t<samplerate>48000</samplerate>\n')
    xp.append('\t\t\t\t\t\t<sampledepth>16</sampledepth>\n')
    xp.append('\t\t\t\t\t</samplecharacteristics>\n')
    xp.append('\t\t\t\t</format>\n')
    for ai in range(len(audio_defs)):
        xp.append('\t\t\t\t<track>\n')
        xp.append('\t\t\t\t\t<enabled>TRUE</enabled>\n')
        xp.append('\t\t\t\t\t<locked>TRUE</locked>\n')
        xp.extend(audio_track_clips[ai])
        xp.append('\t\t\t\t</track>\n')
    if include_nat_sound:
        for vi in range(len(video_defs)):
            xp.append('\t\t\t\t<track>\n')
            xp.append('\t\t\t\t\t<enabled>FALSE</enabled>\n')
            xp.extend(nat_sound_track_clips[vi])
            xp.append('\t\t\t\t</track>\n')
    xp.append('\t\t\t</audio>\n')
    xp.append('\t\t</media>\n')
    xp.append('\t</sequence>\n')
    xp.append('</xmeml>\n')

    xml_str = "".join(xp)
    out_path = cfg["output_path"]
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(xml_str)
    print(f"Wrote {out_path} ({len(positions)} positions, {len(video_defs)} video tracks, "
          f"{len(audio_defs)} master audio tracks{' + nat sound' if include_nat_sound else ''})")


if __name__ == "__main__":
    main(sys.argv[1])
