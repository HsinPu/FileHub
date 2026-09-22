"""Measure isolated fixtures: python -m scripts.benchmark_listing."""
import argparse
import json
import platform
import statistics
import subprocess
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

from backend.app.services.files import FileService


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parent", type=Path, required=True, help="Existing scratch directory on tested filesystem")
    parser.add_argument("--label", required=True, help="Environment label, e.g. windows-local or linux-nfs")
    parser.add_argument("--sizes", type=int, nargs="+", default=[100, 1000, 10000])
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--baseline-ref", help="Trusted Git revision to compare in alternating order")
    args = parser.parse_args()
    if args.runs < 5 or any(size < 1 for size in args.sizes):
        parser.error("Use at least five runs and positive sizes")
    implementations = {"current": FileService}
    if args.baseline_ref:
        source = subprocess.check_output(
            ["git", "show", f"{args.baseline_ref}:backend/app/services/files.py"], text=True, encoding="utf-8"
        )
        namespace = {"__name__": "benchmark_baseline"}
        exec(compile(source, "<trusted-git-baseline>", "exec"), namespace)
        implementations["baseline"] = namespace["FileService"]
    report = {"label": args.label, "platform": platform.platform(), "runs": args.runs, "results": []}
    with tempfile.TemporaryDirectory(prefix="filehub-benchmark-", dir=args.parent.resolve()) as scratch:
        root = Path(scratch)
        for size in args.sizes:
            folder = root / str(size)
            folder.mkdir()
            for index in range(size):
                target = folder / f"entry-{index:05d}"
                if index % 10 == 0:
                    target.mkdir()
                else:
                    target.write_bytes(b"benchmark")
            services = {name: cls(folder) for name, cls in implementations.items()}
            samples = {name: {"seconds": [], "subprocesses": []} for name in services}
            for run in range(args.runs):
                order = list(services) if run % 2 == 0 else list(reversed(services))
                for name in order:
                    with patch("subprocess.Popen", wraps=subprocess.Popen) as launches:
                        started = time.perf_counter()
                        listing = services[name].list_directory()
                        elapsed = time.perf_counter() - started
                    assert len(listing.entries) == size
                    samples[name]["seconds"].append(elapsed)
                    samples[name]["subprocesses"].append(launches.call_count)
                    samples[name]["response_bytes"] = len(listing.model_dump_json().encode())
            for name, sample in samples.items():
                report["results"].append({"implementation": name, "entries": size, **sample,
                    "median_seconds": statistics.median(sample["seconds"])})
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
