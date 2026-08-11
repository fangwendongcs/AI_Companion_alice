#!/usr/bin/env python3
"""Small local HTTP boundary around the official VoxCPM2 Python API.

The process owns the model and MPS memory. Alice only consumes an
OpenAI-compatible complete WAV response through its existing TTS adapter.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import platform
import resource
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import numpy as np
import torch
from voxcpm import VoxCPM


MAX_REQUEST_BYTES = 1024 * 1024
MAX_TEXT_CHARS = 4000


def now_ms() -> float:
    return time.perf_counter() * 1000.0


def env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None or not value.strip():
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_float(name: str, default: float) -> float:
    try:
        value = float(os.environ.get(name, ""))
    except ValueError:
        return default
    return value if value > 0 else default


def env_int(name: str, default: int) -> int:
    try:
        value = int(os.environ.get(name, ""))
    except ValueError:
        return default
    return value if value > 0 else default


def peak_rss_bytes() -> int:
    value = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    return value if platform.system() == "Darwin" else value * 1024


def clean_control_text(value: Any) -> str:
    return str(value or "").replace("(", "").replace(")", "").replace("（", "").replace("）", "").strip()


def encode_wav(samples: np.ndarray, sample_rate: int) -> bytes:
    normalized = np.asarray(samples, dtype=np.float32).reshape(-1)
    normalized = np.nan_to_num(normalized, nan=0.0, posinf=1.0, neginf=-1.0)
    pcm = (np.clip(normalized, -1.0, 1.0) * 32767.0).astype("<i2", copy=False)
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())
    return output.getvalue()


class VoxCPMRuntime:
    def __init__(self, args: argparse.Namespace) -> None:
        self.started_at = time.time()
        self.load_started_at = now_ms()
        self.model_path = args.model
        self.model_name = os.environ.get("VOXCPM2_MODEL", "openbmb/VoxCPM2").strip() or "openbmb/VoxCPM2"
        self.voice_id = os.environ.get("VOXCPM2_VOICE_ID", "default").strip() or "default"
        self.requested_device = args.device
        self.cfg_value = env_float("VOXCPM2_CFG_VALUE", 2.0)
        self.inference_timesteps = env_int("VOXCPM2_INFERENCE_TIMESTEPS", 10)
        self.seed = env_int("VOXCPM2_SEED", 42)
        self.normalize = env_bool("VOXCPM2_NORMALIZE", True)
        self.reference_wav = os.environ.get("VOXCPM2_REFERENCE_WAV", "").strip()
        self.prompt_wav = os.environ.get("VOXCPM2_PROMPT_WAV", "").strip()
        self.prompt_text = os.environ.get("VOXCPM2_PROMPT_TEXT", "").strip()
        optimize = args.device.startswith("cuda") and env_bool("VOXCPM2_OPTIMIZE", True)

        self.model = VoxCPM.from_pretrained(
            self.model_path,
            load_denoiser=False,
            local_files_only=True,
            optimize=optimize,
            device=args.device,
        )
        self.device = str(getattr(self.model.tts_model, "device", args.device))
        self.sample_rate = int(getattr(self.model.tts_model, "sample_rate", 48000))
        self.load_ms = round(now_ms() - self.load_started_at)
        self.lock = threading.Lock()
        self.request_count = 0
        self.failure_count = 0
        self.last_metrics: dict[str, Any] | None = None

    def health(self) -> dict[str, Any]:
        return {
            "ready": True,
            "provider": "voxcpm2",
            "model": self.model_name,
            "voice": self.voice_id,
            "device": self.device,
            "requestedDevice": self.requested_device,
            "mpsAvailable": bool(torch.backends.mps.is_available()),
            "sampleRate": self.sample_rate,
            "loadMs": self.load_ms,
            "uptimeMs": round((time.time() - self.started_at) * 1000.0),
            "peakRssBytes": peak_rss_bytes(),
            "requestCount": self.request_count,
            "failureCount": self.failure_count,
            "lastMetrics": self.last_metrics,
            "voiceCloneConfigured": bool(self.reference_wav or (self.prompt_wav and self.prompt_text)),
            "generationDefaults": {
                "cfgValue": self.cfg_value,
                "inferenceTimesteps": self.inference_timesteps,
                "normalize": self.normalize,
                "seed": self.seed,
                "optimize": self.device.startswith("cuda") and env_bool("VOXCPM2_OPTIMIZE", True),
            },
        }

    def synthesize(self, payload: dict[str, Any]) -> tuple[bytes, dict[str, Any]]:
        text = str(payload.get("input") or payload.get("text") or "").strip()
        if not text:
            raise ValueError("input text is required")
        if len(text) > MAX_TEXT_CHARS:
            raise ValueError(f"input text exceeds {MAX_TEXT_CHARS} characters")
        model = str(payload.get("model") or self.model_name).strip()
        if model != self.model_name:
            raise ValueError(f"unsupported model: {model}")
        voice = str(payload.get("voice") or self.voice_id).strip()
        if voice != self.voice_id:
            raise ValueError(f"unsupported voice: {voice}")
        response_format = str(payload.get("response_format") or "wav").strip().lower()
        if response_format != "wav":
            raise ValueError("VoxCPM2 local runtime currently supports response_format=wav only")

        control = clean_control_text(payload.get("instructions"))
        final_text = f"({control}){text}" if control else text
        generate_kwargs: dict[str, Any] = {
            "text": final_text,
            "cfg_value": self.cfg_value,
            "inference_timesteps": self.inference_timesteps,
            "normalize": self.normalize,
            "denoise": False,
            "seed": self.seed,
        }
        if self.reference_wav:
            generate_kwargs["reference_wav_path"] = self.reference_wav
        if self.prompt_wav and self.prompt_text:
            generate_kwargs["prompt_wav_path"] = self.prompt_wav
            generate_kwargs["prompt_text"] = self.prompt_text

        with self.lock:
            request_started_at = now_ms()
            chunks: list[np.ndarray] = []
            first_chunk_ms: int | None = None
            try:
                for chunk in self.model.generate_streaming(**generate_kwargs):
                    if first_chunk_ms is None:
                        first_chunk_ms = round(now_ms() - request_started_at)
                    chunks.append(np.asarray(chunk, dtype=np.float32).reshape(-1))
                if not chunks:
                    raise RuntimeError("VoxCPM2 returned no audio chunks")
                audio = np.concatenate(chunks)
                generation_ms = round(now_ms() - request_started_at)
                duration_ms = round(audio.size / self.sample_rate * 1000.0)
                rtf = round(generation_ms / duration_ms, 4) if duration_ms > 0 else None
                wav = encode_wav(audio, self.sample_rate)
                self.request_count += 1
                metrics = {
                    "firstChunkMs": first_chunk_ms,
                    "generationMs": generation_ms,
                    "audioDurationMs": duration_ms,
                    "rtf": rtf,
                    "peakRssBytes": peak_rss_bytes(),
                    "chunkCount": len(chunks),
                    "audioBytes": len(wav),
                    "device": self.device,
                    "voiceCloneApplied": bool(self.reference_wav or (self.prompt_wav and self.prompt_text)),
                }
                self.last_metrics = metrics
                return wav, metrics
            except Exception:
                self.failure_count += 1
                raise


class RuntimeServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], runtime: VoxCPMRuntime) -> None:
        super().__init__(address, Handler)
        self.runtime = runtime


class Handler(BaseHTTPRequestHandler):
    server: RuntimeServer

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[voxcpm2:http] {self.address_string()} {fmt % args}", flush=True)

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(200, self.server.runtime.health())
            return
        if self.path == "/v1/audio/voices":
            clone_ready = self.server.runtime.health()["voiceCloneConfigured"]
            self.send_json(200, {
                "voices": [
                    {"id": self.server.runtime.voice_id, "name": "VoxCPM2 runtime voice", "voiceClone": clone_ready}
                ]
            })
            return
        self.send_json(404, {"error": {"code": "not_found", "message": "Not found"}})

    def do_POST(self) -> None:
        if self.path != "/v1/audio/speech":
            self.send_json(404, {"error": {"code": "not_found", "message": "Not found"}})
            return
        try:
            payload = self.read_json()
            audio, metrics = self.server.runtime.synthesize(payload)
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(audio)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-TTS-First-Chunk-Ms", str(metrics["firstChunkMs"] or 0))
            self.send_header("X-TTS-Generation-Ms", str(metrics["generationMs"]))
            self.send_header("X-TTS-Audio-Duration-Ms", str(metrics["audioDurationMs"]))
            self.send_header("X-TTS-RTF", str(metrics["rtf"] or 0))
            self.send_header("X-TTS-Peak-RSS-Bytes", str(metrics["peakRssBytes"]))
            self.send_header("X-TTS-Device", metrics["device"])
            self.send_header("X-TTS-Load-Ms", str(self.server.runtime.load_ms))
            self.send_header("X-TTS-Voice-Clone-Applied", "true" if metrics["voiceCloneApplied"] else "false")
            self.end_headers()
            self.wfile.write(audio)
        except ValueError as error:
            self.send_json(400, {"error": {"code": "invalid_request", "message": str(error)}})
        except (BrokenPipeError, ConnectionResetError):
            print("[voxcpm2:http] client disconnected before audio delivery", flush=True)
        except Exception as error:
            print(f"[voxcpm2:error] {type(error).__name__}: {error}", flush=True)
            self.send_json(500, {"error": {"code": "generation_failed", "message": "VoxCPM2 generation failed"}})

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0 or length > MAX_REQUEST_BYTES:
            raise ValueError("invalid request body size")
        content_type = (self.headers.get("Content-Type") or "").lower()
        if "application/json" not in content_type:
            raise ValueError("Content-Type must be application/json")
        data = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("request body must be a JSON object")
        return data

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Alice VoxCPM2 local MPS runtime")
    parser.add_argument("--host", default=os.environ.get("VOXCPM2_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("VOXCPM2_PORT", "55000")))
    parser.add_argument("--model", default=os.environ.get("VOXCPM2_MODEL_DIR", "openbmb/VoxCPM2"))
    parser.add_argument("--device", default=os.environ.get("VOXCPM2_DEVICE", "auto"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    runtime = VoxCPMRuntime(args)
    server = RuntimeServer((args.host, args.port), runtime)
    print(json.dumps({
        "event": "voxcpm2.runtime.ready",
        "host": args.host,
        "port": args.port,
        "device": runtime.device,
        "sampleRate": runtime.sample_rate,
        "loadMs": runtime.load_ms,
        "peakRssBytes": peak_rss_bytes(),
    }, ensure_ascii=False), flush=True)
    server.serve_forever(poll_interval=0.25)


if __name__ == "__main__":
    main()
