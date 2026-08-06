#!/usr/bin/env python3
"""Measure CosyVoice2 direct Python stream=false/true chunk behavior.

This script intentionally bypasses Alice Node and the official FastAPI wrapper.
It calls the CosyVoice Python API directly so we can tell whether
`stream=True` yields multiple PCM chunks before full audio completion.
"""

import argparse
import json
import os
import resource
import sys
import time
from pathlib import Path

import numpy as np
import torch


DEFAULT_TEXTS = [
    ("4_chars", "你好呀呀"),
    ("8_chars", "今天我们继续聊聊"),
    ("16_chars", "我想听你用温柔声音回应我一下好吗"),
    ("30_chars", "今天我有点累想听你慢慢说几句温柔的话陪我整理一下心情"),
]


def build_parser():
    root = Path.cwd()
    runtime_dir = root / "runtime" / "cosyvoice"
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-dir", default=os.environ.get("COSYVOICE_REPO_DIR", str(runtime_dir / "CosyVoice")))
    parser.add_argument(
        "--model-dir",
        default=os.environ.get("COSYVOICE_MODEL_DIR", str(runtime_dir / "pretrained_models" / "CosyVoice2-0.5B-hf")),
    )
    parser.add_argument("--voice-id", default=os.environ.get("COSYVOICE_VOICE_ID", "中文女"))
    parser.add_argument("--json-out", default=os.environ.get("COSYVOICE_STREAM_PROBE_JSON", ""))
    parser.add_argument("--warmup", action="store_true", default=os.environ.get("COSYVOICE_STREAM_PROBE_WARMUP") == "1")
    parser.add_argument("--repeats", type=int, default=int(os.environ.get("COSYVOICE_STREAM_PROBE_REPEATS", "1")))
    parser.add_argument("--summary-only", action="store_true", default=os.environ.get("COSYVOICE_STREAM_PROBE_SUMMARY_ONLY") == "1")
    parser.add_argument(
        "--reset-token-hop",
        action="store_true",
        default=os.environ.get("COSYVOICE_STREAM_PROBE_RESET_TOKEN_HOP") == "1",
    )
    parser.add_argument(
        "--token-hop-len",
        type=int,
        default=int(os.environ.get("COSYVOICE_STREAM_PROBE_TOKEN_HOP_LEN", "25")),
    )
    parser.add_argument(
        "--stream-scale-factor",
        type=int,
        default=int(os.environ.get("COSYVOICE_STREAM_PROBE_SCALE_FACTOR", "0")),
    )
    parser.add_argument(
        "--labels",
        default=os.environ.get("COSYVOICE_STREAM_PROBE_LABELS", ""),
        help="Comma-separated DEFAULT_TEXTS labels to run.",
    )
    parser.add_argument(
        "--device",
        choices=("auto", "cpu", "mps"),
        default=os.environ.get("COSYVOICE_STREAM_PROBE_DEVICE", "auto"),
    )
    return parser


def main():
    args = build_parser().parse_args()
    runtime_dir = Path.cwd() / "runtime" / "cosyvoice"
    os.environ.setdefault("MODELSCOPE_CACHE", str(runtime_dir / "modelscope-cache"))
    os.environ.setdefault("MPLCONFIGDIR", str(runtime_dir / "matplotlib-cache"))

    repo_dir = Path(args.repo_dir).resolve()
    model_dir = Path(args.model_dir).resolve()
    sys.path.insert(0, str(repo_dir))
    sys.path.insert(0, str(repo_dir / "third_party" / "Matcha-TTS"))

    from cosyvoice.cli.cosyvoice import AutoModel

    started = now_ms()
    model = AutoModel(model_dir=str(model_dir))
    model_load_ms = now_ms() - started
    device_transfer_ms = 0
    if args.device != "auto":
        device_transfer_started = now_ms()
        move_model_to_device(model, args.device)
        device_transfer_ms = now_ms() - device_transfer_started

    result = {
        "modelDir": str(model_dir),
        "voiceId": args.voice_id,
        "sampleRate": model.sample_rate,
        "torch": {
            "cudaAvailable": bool(torch.cuda.is_available()),
            "mpsAvailable": bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available()),
        },
        "modelLoadMs": round_ms(model_load_ms),
        "device": str(model.model.device),
        "deviceTransferMs": round_ms(device_transfer_ms),
        "runtimeTuning": {
            "resetTokenHop": bool(args.reset_token_hop),
            "tokenHopLen": max(1, args.token_hop_len),
            "streamScaleFactor": args.stream_scale_factor if args.stream_scale_factor > 0 else None,
        },
        "warmup": None,
        "cases": [],
    }

    if args.warmup:
        result["warmup"] = run_case(model, "warmup", "你好。", args.voice_id, stream=False, repeat=0, args=args)

    result["repeats"] = max(1, args.repeats)

    requested_labels = {label.strip() for label in args.labels.split(",") if label.strip()}
    selected_texts = [item for item in DEFAULT_TEXTS if not requested_labels or item[0] in requested_labels]
    result["labels"] = [label for label, _text in selected_texts]

    for repeat in range(1, result["repeats"] + 1):
        for label, text in selected_texts:
            for stream in (False, True):
                result["cases"].append(run_case(model, label, text, args.voice_id, stream=stream, repeat=repeat, args=args))

    result["summary"] = summarize_cases(result["cases"])
    if args.json_out:
        Path(args.json_out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json_out).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary_result(result, args) if args.summary_only else result, ensure_ascii=False, indent=2))


def run_case(model, label, text, voice_id, stream, repeat, args):
    request_started = now_ms()
    cpu_started = time.process_time()
    rss_started = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss

    output = {
        "label": label,
        "repeat": repeat,
        "text": text,
        "charLength": len(text),
        "stream": bool(stream),
        "textFrontendMs": None,
        "frontendSftMs": 0,
        "runtimeRequestToFirstPcmMs": None,
        "runtimeRequestToAllPcmMs": None,
        "pcmChunkCount": 0,
        "chunkBytes": [],
        "chunkReadyMs": [],
        "chunkAudioDurationMs": [],
        "chunkIntervalsMs": [],
        "totalPcmBytes": 0,
        "totalAudioDurationMs": 0,
        "rtf": None,
        "cpuProcessMs": None,
        "maxRssKbDelta": None,
        "error": None,
    }

    try:
        text_frontend_started = now_ms()
        normalized_texts = list(model.frontend.text_normalize(text, split=True, text_frontend=True))
        output["textFrontendMs"] = round_ms(now_ms() - text_frontend_started)
        output["normalizedTexts"] = normalized_texts

        last_chunk_at = None
        for normalized in normalized_texts:
            frontend_started = now_ms()
            model_input = model.frontend.frontend_sft(normalized, voice_id)
            output["frontendSftMs"] += round_ms(now_ms() - frontend_started)

            if args.reset_token_hop and hasattr(model.model, "token_hop_len"):
                model.model.token_hop_len = max(1, args.token_hop_len)
            if args.stream_scale_factor > 0 and hasattr(model.model, "stream_scale_factor"):
                model.model.stream_scale_factor = max(1, args.stream_scale_factor)

            for model_output in model.model.tts(**model_input, stream=stream, speed=1.0):
                chunk_at = now_ms()
                if output["runtimeRequestToFirstPcmMs"] is None:
                    output["runtimeRequestToFirstPcmMs"] = round_ms(chunk_at - request_started)
                if last_chunk_at is not None:
                    output["chunkIntervalsMs"].append(round_ms(chunk_at - last_chunk_at))
                last_chunk_at = chunk_at

                pcm = tensor_to_pcm(model_output["tts_speech"])
                chunk_audio_duration_ms = round_ms(model_output["tts_speech"].shape[1] / model.sample_rate * 1000)
                output["pcmChunkCount"] += 1
                output["chunkBytes"].append(len(pcm))
                output["chunkReadyMs"].append(round_ms(chunk_at - request_started))
                output["chunkAudioDurationMs"].append(chunk_audio_duration_ms)
                output["totalPcmBytes"] += len(pcm)
                output["totalAudioDurationMs"] += chunk_audio_duration_ms

        output["runtimeRequestToAllPcmMs"] = round_ms(now_ms() - request_started)
        if output["totalAudioDurationMs"]:
            output["rtf"] = round_float(output["runtimeRequestToAllPcmMs"] / output["totalAudioDurationMs"])
    except Exception as error:  # noqa: BLE001 - probe must report exact runtime failure.
        output["error"] = {
            "type": error.__class__.__name__,
            "message": str(error),
        }

    output["cpuProcessMs"] = round_ms((time.process_time() - cpu_started) * 1000)
    output["maxRssKbDelta"] = max(0, resource.getrusage(resource.RUSAGE_SELF).ru_maxrss - rss_started)
    output["continuousPlayback"] = {
        "noBuffer": simulate_continuous_playback(output, 0),
        "buffer500Ms": simulate_continuous_playback(output, 500),
        "buffer1000Ms": simulate_continuous_playback(output, 1000),
    }
    return output


def summary_result(result, args):
    return {
        "modelDir": result["modelDir"],
        "voiceId": result["voiceId"],
        "sampleRate": result["sampleRate"],
        "torch": result["torch"],
        "modelLoadMs": result["modelLoadMs"],
        "device": result["device"],
        "deviceTransferMs": result["deviceTransferMs"],
        "runtimeTuning": result["runtimeTuning"],
        "warmup": result["warmup"],
        "repeats": result["repeats"],
        "labels": result["labels"],
        "jsonOut": args.json_out or None,
        "summary": result["summary"],
    }


def summarize_cases(cases):
    groups = {}
    for item in cases:
        key = (item["label"], bool(item["stream"]))
        groups.setdefault(key, []).append(item)

    summary = []
    for (label, stream), items in groups.items():
        ok = [item for item in items if not item.get("error")]
        summary.append({
            "label": label,
            "stream": stream,
            "count": len(items),
            "okCount": len(ok),
            "errorCount": len(items) - len(ok),
            "firstP50Ms": percentile([item.get("runtimeRequestToFirstPcmMs") for item in ok], 0.5),
            "firstP90Ms": percentile([item.get("runtimeRequestToFirstPcmMs") for item in ok], 0.9),
            "allP50Ms": percentile([item.get("runtimeRequestToAllPcmMs") for item in ok], 0.5),
            "allP90Ms": percentile([item.get("runtimeRequestToAllPcmMs") for item in ok], 0.9),
            "audioDurationP50Ms": percentile([item.get("totalAudioDurationMs") for item in ok], 0.5),
            "chunkCountP50": percentile([item.get("pcmChunkCount") for item in ok], 0.5),
            "maxGapNoBufferP50Ms": percentile([
                item.get("continuousPlayback", {}).get("noBuffer", {}).get("maxGapMs") for item in ok
            ], 0.5),
            "maxGap500BufferP50Ms": percentile([
                item.get("continuousPlayback", {}).get("buffer500Ms", {}).get("maxGapMs") for item in ok
            ], 0.5),
            "maxGap1000BufferP90Ms": percentile([
                item.get("continuousPlayback", {}).get("buffer1000Ms", {}).get("maxGapMs") for item in ok
            ], 0.9),
            "streamingEvidenceCount": len([
                item for item in ok
                if item.get("pcmChunkCount", 0) > 1
                and item.get("runtimeRequestToFirstPcmMs") is not None
                and item.get("runtimeRequestToAllPcmMs", 0) - item.get("runtimeRequestToFirstPcmMs", 0) > 100
            ]),
        })
    return summary


def percentile(values, p):
    numbers = sorted(value for value in values if isinstance(value, (int, float)))
    if not numbers:
        return None
    index = min(len(numbers) - 1, max(0, int(np.ceil(len(numbers) * p)) - 1))
    return numbers[index]


def tensor_to_pcm(tensor):
    return (tensor.detach().cpu().numpy() * (2**15)).astype(np.int16).tobytes()


def move_model_to_device(model, requested_device):
    if requested_device == "mps" and not (getattr(torch.backends, "mps", None) and torch.backends.mps.is_available()):
        raise RuntimeError("MPS was requested but is unavailable.")
    device = torch.device(requested_device)
    model.model.device = device
    model.model.llm.to(device)
    model.model.flow.to(device)
    model.model.hift.to(device)


def simulate_continuous_playback(output, initial_buffer_ms):
    ready_times = output.get("chunkReadyMs") or []
    durations = output.get("chunkAudioDurationMs") or []
    if not ready_times or len(ready_times) != len(durations):
        return {"initialBufferMs": initial_buffer_ms, "maxGapMs": None, "totalGapMs": None, "gapsMs": []}

    playback_cursor = ready_times[0] + initial_buffer_ms
    gaps = []
    for index, (ready_at, duration_ms) in enumerate(zip(ready_times, durations)):
        if index == 0:
            start_at = playback_cursor
        else:
            gap_ms = max(0, ready_at - playback_cursor)
            gaps.append(round_ms(gap_ms))
            start_at = max(playback_cursor, ready_at)
        playback_cursor = start_at + duration_ms

    return {
        "initialBufferMs": initial_buffer_ms,
        "maxGapMs": max(gaps, default=0),
        "totalGapMs": sum(gaps),
        "gapsMs": gaps,
    }


def now_ms():
    return time.perf_counter() * 1000


def round_ms(value):
    return int(round(value))


def round_float(value):
    return round(float(value), 4)


if __name__ == "__main__":
    main()
