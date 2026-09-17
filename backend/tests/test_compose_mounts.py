"""Exercise the real POSIX parser and wrapper; Docker is replaced only at invocation."""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SHELL = shutil.which("sh") or ("C:/Program Files/Git/bin/bash.exe" if os.name == "nt" else None)
pytestmark = pytest.mark.skipif(not SHELL or not Path(SHELL).exists(), reason="POSIX shell unavailable")


def parse(text):
    return subprocess.run([SHELL, "-c", 'awk -f "$1"', "test", str(ROOT / "scripts/compose-mounts.awk")],
                          input=text, capture_output=True, text=True, encoding="utf-8")


def test_multiple_mounts_and_literal_quoted_paths():
    result = parse("# comment\nCOOKIE_SECURE=false\nFILEHUB_MOUNT_nfs=/nfs\r\n"
                   "export FILEHUB_MOUNT_shared='/data/shared files #1' # note\nFILEHUB_MOUNT_empty=\n")
    assert result.returncode == 0, result.stderr
    mounts = json.loads(result.stdout)["services"]["filehub"]["volumes"]
    assert [(item["source"], item["target"]) for item in mounts] == [
        ("/nfs", "/files/nfs"), ("/data/shared files #1", "/files/shared")]
    assert all(item["bind"] == {"create_host_path": False} for item in mounts)


def test_no_mounts_preserves_base_volumes():
    result = parse("COOKIE_SECURE=false\n# FILEHUB_MOUNT_nfs=/nfs\n")
    assert result.returncode == 0
    assert json.loads(result.stdout)["services"]["filehub"]["volumes"] == []


@pytest.mark.parametrize("setting", [
    "FILEHUB_MOUNT_nfs=relative/path",
    "FILEHUB_MOUNT_../config=/data",
    "FILEHUB_MOUNT_nfs=/first\nFILEHUB_MOUNT_nfs=/second",
    "FILEHUB_MOUNT_nfs='/unterminated",
    "FILEHUB_MOUNT_nfs='/data' garbage",
    "FILEHUB_MOUNT_nfs=/$HOME",
    "FILEHUB_MOUNT_nfs=/$(touch bad)",
    "FILEHUB_MOUNT_nfs=/`touch bad`",
    "FILEHUB_MOUNT_nfs=/data\tunsafe",
    "FILEHUB_MOUNT_nfs",
])
def test_invalid_mounts_fail_closed(setting):
    result = parse(setting)
    assert result.returncode != 0
    assert result.stdout == ""
    assert "FileHub mount settings" in result.stderr


def test_mount_limit():
    result = parse("\n".join(f"FILEHUB_MOUNT_dir{i}=/data/{i}" for i in range(101)))
    assert result.returncode != 0


@pytest.fixture
def wrapper(tmp_path):
    shutil.copy(ROOT / "filehub.sh", tmp_path)
    shutil.copy(ROOT / "compose.yaml", tmp_path)
    shutil.copytree(ROOT / "scripts", tmp_path / "scripts")
    bindir = tmp_path / "bin"
    bindir.mkdir()
    docker = bindir / "docker"
    docker.write_text("#!/bin/sh\nprintf '%s\\n' \"$@\" > invocation.txt\n"
                      "previous=\nfor arg do\n"
                      "  if [ \"$previous\" = -f ]; then override=$arg; fi\n"
                      "  previous=$arg\ndone\n"
                      "cp \"$override\" captured.json\nprintf '%s' \"$override\" > temporary.txt\n"
                      "exit \"${DOCKER_TEST_EXIT:-0}\"\n", encoding="utf-8")
    docker.chmod(0o755)
    env = {**os.environ, "PATH": str(bindir) + os.pathsep + os.environ.get("PATH", "")}
    return tmp_path, env


def invoke(wrapper, *args):
    directory, env = wrapper
    return subprocess.run([SHELL, str(directory / "filehub.sh"), *args], env=env,
                          capture_output=True, text=True, cwd=ROOT, encoding="utf-8")


def assert_temporary_removed(directory):
    temporary = (directory / "temporary.txt").read_text()
    result = subprocess.run([SHELL, "-c", 'test ! -e "$1" && test ! -d "$(dirname "$1")"',
                             "test", temporary], capture_output=True)
    assert result.returncode == 0


def test_wrapper_defaults_and_regenerates_when_mount_removed(wrapper):
    directory, _ = wrapper
    (directory / ".env").write_text("FILEHUB_MOUNT_nfs=/nfs\n", encoding="utf-8")
    result = invoke(wrapper)
    assert result.returncode == 0, result.stderr
    args = (directory / "invocation.txt").read_text().splitlines()
    assert_temporary_removed(directory)
    assert args[-4:] == ["up", "-d", "--build", "--wait"]
    assert "--env-file" in args
    assert json.loads((directory / "captured.json").read_text())["services"]["filehub"]["volumes"][0]["source"] == "/nfs"
    (directory / ".env").write_text("", encoding="utf-8")
    result = invoke(wrapper, "config")
    assert result.returncode == 0, result.stderr
    assert json.loads((directory / "captured.json").read_text())["services"]["filehub"]["volumes"] == []


def test_wrapper_failure_is_propagated_and_no_env_is_supported(wrapper):
    directory, env = wrapper
    env["DOCKER_TEST_EXIT"] = "17"
    result = invoke(wrapper, "ps")
    assert result.returncode == 17, result.stderr
    assert_temporary_removed(directory)
    assert "--env-file" not in (directory / "invocation.txt").read_text().splitlines()


def test_invalid_configuration_never_invokes_docker(wrapper):
    directory, _ = wrapper
    (directory / ".env").write_text("FILEHUB_MOUNT_bad=relative\n", encoding="utf-8")
    assert invoke(wrapper).returncode != 0
    assert not (directory / "invocation.txt").exists()
