import { useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { FilesPage } from "./FilesPage";
import { useUploads } from "./UploadPanel";
import { useOperations } from "./OperationPanel";
import { useFolderUpload } from "./FolderUpload";
import { useFileClipboard } from "./useFileClipboard";

function useWorkspaceState() {
  const location = useLocation();
  const [params] = useSearchParams();
  const isFiles = location.pathname === "/files";
  const lastPath = useRef("");
  const path = isFiles ? params.get("path") || "" : lastPath.current;
  useEffect(() => {
    if (isFiles) lastPath.current = path;
  }, [isFiles, path]);
  const [revision, setRevision] = useState(0);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTab, setTaskTab] = useState("uploads");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    dirty: false,
    busy: false,
  });
  const uploads = useUploads(() => setRevision((v) => v + 1), true);
  const folders = useFolderUpload(uploads.addPrepared);
  const clipboard = useFileClipboard();
  const operations = useOperations((jobs) => {
    clipboard.reconcile(jobs);
    setRevision((v) => v + 1);
  }, true);
  useEffect(() => {
    if (operations.dialogOpen) setTaskOpen(false);
  }, [operations.dialogOpen]);
  useEffect(() => {
    if (uploads.open) {
      setTaskTab("uploads");
      setTaskOpen(true);
      uploads.setOpen(false);
    }
    if (operations.open) {
      setTaskTab("operations");
      setTaskOpen(true);
      operations.setOpen(false);
    }
  }, [uploads.open, operations.open]);
  return {
    path,
    lastPath,
    revision,
    setRevision,
    taskOpen,
    setTaskOpen,
    taskTab,
    setTaskTab,
    sidebarOpen,
    setSidebarOpen,
    settingsForm,
    setSettingsForm,
    uploads,
    folders,
    clipboard,
    operations,
  };
}

export type WorkspaceState = ReturnType<typeof useWorkspaceState>;

// This owner stays mounted across every authenticated workspace route.
export function FileWorkspace() {
  const workspace = useWorkspaceState();
  return <FilesPage workspace={workspace} />;
}
