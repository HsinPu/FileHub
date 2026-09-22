from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from backend.app.services.files import FileService


def test_missing_birthtime_never_launches_process(tmp_path, monkeypatch):
    path = tmp_path / "file.txt"
    path.write_text("hello")
    service = FileService(tmp_path)
    info = path.stat()
    without_birth = SimpleNamespace(st_mode=info.st_mode, st_size=info.st_size, st_mtime=info.st_mtime)
    monkeypatch.setattr(Path, "stat", lambda *args, **kwargs: without_birth)
    with patch("subprocess.Popen", side_effect=AssertionError("unexpected process")) as process:
        entry = service.entry(path)
    assert entry.created is None
    assert entry.modified == datetime.fromtimestamp(info.st_mtime, UTC).isoformat()
    assert entry.size == 5
    process.assert_not_called()


def test_listing_reuses_attributes_and_preserves_order(tmp_path):
    (tmp_path / "z-folder").mkdir()
    (tmp_path / "b.txt").write_text("b")
    (tmp_path / "A.txt").write_text("a")
    service = FileService(tmp_path)
    with patch.object(service, "entry", wraps=service.entry) as entry:
        listing = service.list_directory()
    assert [item.name for item in listing.entries] == ["z-folder", "A.txt", "b.txt"]
    assert all(call.kwargs.get("info") is not None for call in entry.call_args_list)
    assert [item.name for item in service.list_directory(directories_only=True).entries] == ["z-folder"]


def test_disappearing_entry_is_skipped(tmp_path, monkeypatch):
    item = tmp_path / "gone"
    item.write_text("bye")
    service = FileService(tmp_path)
    original = service.resolve
    def resolve(path):
        if path == "gone":
            item.unlink(missing_ok=True)
        return original(path)
    monkeypatch.setattr(service, "resolve", resolve)
    assert service.list_directory().entries == []
