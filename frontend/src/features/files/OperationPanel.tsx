import { z } from "zod";
import { useAuth } from "../auth/AuthProvider";
import { PanelSurface } from "../../app/PanelSurface";
import { formatDate } from "../../lib/date";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Checkbox,
  Empty,
  Modal,
  Progress,
  Select,
  Space,
  Tag,
} from "antd";
import {
  api,
  capabilitiesSchema,
  errorMessage,
  type FileEntry,
} from "../../lib/api";
import { DirectoryTree } from "./DirectoryTree";
import { downloadUrl } from "./download";
import {
  isActive,
  operationNames,
  operationSchema,
  operationsSchema,
  statusNames,
  type Operation,
  type OperationKind,
} from "./operations";

type Dialog = {
  kind: OperationKind;
  entries: (Pick<FileEntry, "path" | "type"> & {
    name?: string;
    originalPath?: string;
  })[];
  destination: string | null;
  requestId: string;
};

export function useOperations(
  onChange: (jobs: Operation[]) => void,
  embedded = false,
) {
  const { user } = useAuth();
  const rootLabel = user?.scope_mode === "multiple" ? "所有目錄" : "所有檔案";
  const [destinationCheck, setDestinationCheck] = useState<{
    key: string;
    error: string;
    breadcrumbs?: { name: string; path: string }[];
  } | null>(null);
  const [jobs, setJobs] = useState<Operation[]>([]);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [conflict, setConflict] = useState<"skip" | "keep_both">("skip");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [tick, setTick] = useState(0);
  const changed = useRef(onChange);
  changed.current = onChange;
  const known = useRef(new Map<string, number>());
  const { message } = App.useApp();
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api(
          `/files/operations?offset=${page * 50}`,
          operationsSchema,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const updates = result.filter(
          (job) =>
            known.current.has(job.id) &&
            known.current.get(job.id) !== job.updated_at,
        );
        result.forEach((job) => known.current.set(job.id, job.updated_at));
        setJobs(result);
        setHistoryError(null);
        if (updates.length) changed.current(updates);
      } catch (err) {
        if (!controller.signal.aborted) setHistoryError(errorMessage(err));
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [page, tick]);
  function begin(
    kind: OperationKind,
    entries: Dialog["entries"],
    destination: string | null,
  ) {
    if (!entries.length) return;
    setConflict("skip");
    setError(null);
    setDialog({ kind, entries, destination, requestId: crypto.randomUUID() });
  }
  const destinations =
    dialog && ["copy", "move", "restore"].includes(dialog.kind)
      ? dialog.destination !== null
        ? [dialog.destination]
        : [
            ...new Set(
              dialog.entries.map((entry) =>
                (entry.originalPath ?? "").split("/").slice(0, -1).join("/"),
              ),
            ),
          ]
      : [];
  const destinationKey = destinations.length
    ? JSON.stringify([dialog?.kind, destinations])
    : null;
  useEffect(() => {
    if (!destinationKey || !dialog) {
      setDestinationCheck(null);
      return;
    }
    const controller = new AbortController();
    setDestinationCheck(null);
    const required =
      dialog.kind === "move"
        ? user?.scope_mode === "multiple"
          ? ["modify", "upload"]
          : ["modify"]
        : ["upload"];
    Promise.all(
      destinations.map((path) =>
        api(
          `/files/capabilities?path=${encodeURIComponent(path)}`,
          capabilitiesSchema,
          { signal: controller.signal },
        ),
      ),
    )
      .then((results) => {
        if (!controller.signal.aborted)
          setDestinationCheck({
            key: destinationKey,
            breadcrumbs: results.length === 1 ? results[0].breadcrumbs : [],
            error: results.every(({ permissions }) =>
              required.every((p) => permissions.includes(p)),
            )
              ? ""
              : "此目的地沒有所需權限，請選擇其他目錄。",
          });
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setDestinationCheck({
            key: destinationKey,
            error: errorMessage(reason),
          });
      });
    return () => controller.abort();
  }, [destinationKey, user?.scope_mode]);
  const destinationPending =
    !!destinationKey && destinationCheck?.key !== destinationKey;
  const destinationError =
    destinationCheck?.key === destinationKey ? destinationCheck?.error : "";
  const invalid =
    dialog &&
    dialog.kind !== "trash" &&
    dialog.kind !== "restore" &&
    dialog.kind !== "archive" &&
    dialog.entries.some(
      (entry) =>
        entry.type === "directory" &&
        (dialog.destination === entry.path ||
          dialog.destination?.startsWith(`${entry.path}/`)),
    );
  async function submit() {
    if (!dialog || busy || invalid || destinationPending || destinationError)
      return;
    setBusy(true);
    setError(null);
    try {
      const job = await api(
        dialog.kind === "restore" ? "/trash/restore" : "/files/operations",
        operationSchema,
        {
          method: "POST",
          body: JSON.stringify({
            kind: dialog.kind,
            paths: dialog.entries.map((entry) => entry.path),
            ids:
              dialog.kind === "restore"
                ? dialog.entries.map((entry) => entry.path)
                : undefined,
            destination: dialog.destination,
            conflict,
            request_id: dialog.requestId,
          }),
        },
      );
      known.current.set(job.id, job.updated_at);
      setDialog(null);
      setPage(0);
      setOpen(true);
      setTick((v) => v + 1);
      changed.current([job]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function cancel(job: Operation) {
    try {
      await api(`/files/operations/${job.id}/cancel`, operationSchema, {
        method: "POST",
      });
      setTick((v) => v + 1);
    } catch (err) {
      message.error(errorMessage(err));
    }
  }
  return {
    begin,
    setOpen,
    open,
    dialogOpen: !!dialog,
    dialog: (
      <Modal
        title={dialog ? `${operationNames[dialog.kind]}項目` : "批次操作"}
        open={!!dialog}
        onCancel={() => {
          if (!busy) setDialog(null);
        }}
        onOk={() => void submit()}
        confirmLoading={busy}
        okText="確認執行"
        cancelText="取消"
        okButtonProps={{
          disabled: !!invalid || destinationPending || !!destinationError,
        }}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        maskClosable={!busy}
        destroyOnHidden
      >
        {destinationPending && <p role="status">正在檢查目的地權限…</p>}
        {destinationError && <Alert type="warning" title={destinationError} />}
        {dialog && (
          <>
            <p>
              共 {dialog.entries.length} 個項目。已完成的項目不會因取消而回復。
            </p>
            <p className="operation-path">
              來源：
              {dialog.entries
                .map((entry) => entry.name || entry.path)
                .join("、")}
            </p>
            {dialog.kind === "archive" ? (
              <Alert
                type="info"
                title="背景打包 ZIP：最多 10,000 個項目、來源合計 1 GB，保留工作空間相對路徑。完成後可於一小時內下載。"
              />
            ) : dialog.kind === "trash" ? (
              <Alert
                type="warning"
                title="項目將移至資源回收筒，內容仍占用磁碟空間。查看與還原依帳號權限限制。"
              />
            ) : (
              <>
                {dialog.kind === "restore" && (
                  <Checkbox
                    disabled={busy}
                    checked={dialog.destination === null}
                    onChange={(event) =>
                      setDialog({
                        ...dialog,
                        destination: event.target.checked ? null : "",
                        requestId: crypto.randomUUID(),
                      })
                    }
                  >
                    還原到原位置
                  </Checkbox>
                )}
                {dialog.destination !== null && (
                  <>
                    <Breadcrumb
                      items={[
                        { title: rootLabel },
                        ...(destinationCheck?.key === destinationKey
                          ? (destinationCheck.breadcrumbs ?? [])
                          : []
                        ).map((crumb) => ({ title: crumb.name })),
                      ]}
                    />
                    <p className="operation-path">
                      目的地：{dialog.destination || rootLabel}
                    </p>
                    <div className="destination-tree">
                      <DirectoryTree
                        path={dialog.destination}
                        onSelect={(destination) => {
                          if (busy) return;
                          setDialog({
                            ...dialog,
                            destination,
                            requestId: crypto.randomUUID(),
                          });
                          setError(null);
                        }}
                      />
                    </div>
                  </>
                )}
                {invalid && (
                  <Alert
                    type="warning"
                    title="不能選擇來源資料夾或其子目錄。"
                  />
                )}
                <Space>
                  <span>同名處理</span>
                  <Select
                    aria-label="同名處理"
                    disabled={busy}
                    value={conflict}
                    style={{ width: 160 }}
                    options={[
                      { value: "skip", label: "略過" },
                      { value: "keep_both", label: "保留兩者" },
                    ]}
                    onChange={(value) => {
                      setConflict(value);
                      setDialog({
                        ...dialog,
                        requestId: crypto.randomUUID(),
                      });
                    }}
                  />
                </Space>
              </>
            )}
            {error && <Alert type="error" title={error} showIcon />}
          </>
        )}
      </Modal>
    ),
    active: jobs.filter((job) => isActive(job.status)).length,
    panel: (
      <PanelSurface
        title="整理任務"
        open={open}
        onClose={() => setOpen(false)}
        mode={embedded ? "inline" : "drawer"}
      >
        <p>
          任務會保存在伺服器。取消只停止尚未完成的項目；正在提交的單項操作可能已完成。
        </p>
        {historyError && <Alert type="error" title={historyError} />}
        {!jobs.length && !historyError && <Empty description="尚無整理任務" />}
        {jobs.map((job) => (
          <section
            className="transfer-item"
            key={job.id}
            aria-label={`${operationNames[job.kind]}任務 ${job.id}`}
          >
            <Space wrap>
              <strong>{operationNames[job.kind]}</strong>
              <Tag>{statusNames[job.status] || job.status}</Tag>
              <span>{formatDate(job.created_at)}</span>
            </Space>
            <Progress
              status={
                job.status === "partial" || job.status === "needs_review"
                  ? "exception"
                  : job.status === "completed"
                    ? "success"
                    : "normal"
              }
              percent={Math.round(
                (job.items.filter((item) => !isActive(item.status)).length /
                  job.items.length) *
                  100,
              )}
            />
            {job.items.map((item, index) => (
              <div className="operation-result" key={index}>
                <span>{item.display_name || item.source}</span>
                <Tag>{statusNames[item.status] || item.status}</Tag>
                {item.target && <small>→ {item.target}</small>}
                <small>{item.message}</small>
              </div>
            ))}
            {isActive(job.status) && (
              <Button
                disabled={job.cancel_requested}
                onClick={() => void cancel(job)}
              >
                {job.cancel_requested ? "已要求取消" : "取消任務"}
              </Button>
            )}
            {job.kind === "archive" && job.status === "completed" && (
              <Button
                onClick={() =>
                  downloadUrl(
                    `/api/v1/files/operations/${job.id}/archive`,
                  ).catch((error) => message.error(errorMessage(error)))
                }
              >
                下載 ZIP
              </Button>
            )}
            {job.items.some((item) =>
              ["error", "cancelled"].includes(item.status),
            ) &&
              !isActive(job.status) && (
                <Button
                  onClick={() => {
                    setOpen(false);
                    begin(
                      job.kind,
                      job.items
                        .filter((item) =>
                          ["error", "cancelled"].includes(item.status),
                        )
                        .map((item) => ({
                          path: item.source,
                          name: item.display_name || item.source,
                          type: "directory",
                        })),
                      job.destination,
                    );
                  }}
                >
                  重試未完成項目
                </Button>
              )}
          </section>
        ))}
        <Space>
          <Button disabled={page === 0} onClick={() => setPage((v) => v - 1)}>
            較新任務
          </Button>
          <Button
            disabled={jobs.length < 50}
            onClick={() => setPage((v) => v + 1)}
          >
            較舊任務
          </Button>
        </Space>
      </PanelSurface>
    ),
  };
}
