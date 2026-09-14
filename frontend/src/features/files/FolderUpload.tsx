import { useRef, useState } from "react";
import { Alert, Modal, Select, Space } from "antd";
import { z } from "zod";
import { api, errorMessage, formatSize } from "../../lib/api";

type LocalEntry = { path: string; file?: File };
type Prepared = { file: File; path: string; name: string; skipped: boolean };
const preparedSchema = z.object({
  entries: z.array(
    z.object({
      source: z.string(),
      target: z.string().nullable(),
      status: z.enum(["ready", "skipped"]),
    }),
  ),
});

export async function readDroppedEntries(
  roots: FileSystemEntry[],
): Promise<LocalEntry[]> {
  const entries: LocalEntry[] = [];
  async function visit(entry: FileSystemEntry, parent: string, depth: number) {
    if (entries.length >= 1000 || depth > 32)
      throw new Error("每批最多 1,000 個項目、32 層目錄，請分批上傳。");
    const path = parent ? `${parent}/${entry.name}` : entry.name;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      entries.push({ path, file });
    } else if (entry.isDirectory) {
      entries.push({ path });
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      while (true) {
        const children = await new Promise<FileSystemEntry[]>(
          (resolve, reject) => reader.readEntries(resolve, reject),
        );
        if (!children.length) break;
        for (const child of children) await visit(child, path, depth + 1);
      }
    }
  }
  for (const root of roots) await visit(root, "", 1);
  return entries;
}

export function useFolderUpload(onPrepared: (files: Prepared[]) => void) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [path, setPath] = useState("");
  const [conflict, setConflict] = useState<"skip" | "keep_both">("skip");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const generation = useRef(0);
  function begin(destination: string) {
    generation.current++;
    setPath(destination);
    setEntries([]);
    setError(null);
    setConflict("skip");
    setOpen(true);
    requestId.current = crypto.randomUUID();
    return generation.current;
  }
  function validate(values: LocalEntry[]) {
    if (!values.length || values.length > 1000)
      throw new Error("每批需有 1–1,000 個項目。");
    if (values.some((entry) => (entry.file?.size || 0) > 512 * 1024 ** 2))
      throw new Error("單檔上限為 512 MB。");
    if (
      values.reduce((sum, entry) => sum + (entry.file?.size || 0), 0) >
      5 * 1024 ** 3
    )
      throw new Error("單批上限為 5 GB。");
    setEntries(values);
  }
  function select(files: File[], destination: string) {
    begin(destination);
    try {
      validate(
        files.map((file) => ({
          path: file.webkitRelativePath || file.name,
          file,
        })),
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  async function drop(roots: FileSystemEntry[], destination: string) {
    const current = begin(destination);
    setBusy(true);
    try {
      const values = await readDroppedEntries(roots);
      if (generation.current === current) validate(values);
    } catch (err) {
      if (generation.current === current) setError(errorMessage(err));
    } finally {
      if (generation.current === current) setBusy(false);
    }
  }
  async function submit() {
    if (busy || !entries.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api("/files/upload-batch", preparedSchema, {
        method: "POST",
        body: JSON.stringify({
          request_id: requestId.current,
          destination: path,
          conflict,
          entries: entries.map((entry) => ({
            path: entry.path,
            size: entry.file?.size ?? null,
          })),
        }),
      });
      const targets = new Map(
        result.entries.map((entry) => [entry.source, entry]),
      );
      onPrepared(
        entries
          .filter((entry) => entry.file)
          .map((entry) => {
            const target = targets.get(entry.path)!;
            const targetPath = target.target || `${path}/${entry.path}`;
            return {
              file: entry.file!,
              path: targetPath.split("/").slice(0, -1).join("/"),
              name: targetPath.split("/").at(-1)!,
              skipped: target.status === "skipped",
            };
          }),
      );
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return {
    select,
    drop,
    open,
    panel: (
      <Modal
        title="上傳資料夾"
        open={open}
        confirmLoading={busy}
        onOk={() => void submit()}
        okText="開始上傳"
        cancelText="取消"
        okButtonProps={{ disabled: !entries.length }}
        onCancel={() => {
          if (!busy) {
            generation.current++;
            setOpen(false);
          }
        }}
        closable={!busy}
        maskClosable={!busy}
        cancelButtonProps={{ disabled: busy }}
      >
        <p>目的地：{path || "所有檔案"}</p>
        <p>
          {entries.filter((entry) => entry.file).length} 個檔案 ·{" "}
          {formatSize(
            entries.reduce((sum, entry) => sum + (entry.file?.size || 0), 0),
          )}
        </p>
        <p>
          保留子目錄結構。每批最多 1,000 個項目、5 GB；單檔 512
          MB。資料夾選擇器不會提供空資料夾，拖放則會保留空資料夾。
        </p>
        <Space>
          <span>同名根目錄</span>
          <Select
            aria-label="同名根目錄"
            disabled={busy}
            value={conflict}
            style={{ width: 160 }}
            options={[
              { value: "skip", label: "略過" },
              { value: "keep_both", label: "保留兩者" },
            ]}
            onChange={(value) => {
              setConflict(value);
              requestId.current = crypto.randomUUID();
            }}
          />
        </Space>
        <p>
          已建立的資料夾與上傳成功的檔案會保留；中斷後可在傳輸面板重試未完成的檔案。
        </p>
        {error && <Alert type="error" title={error} />}
      </Modal>
    ),
  };
}
