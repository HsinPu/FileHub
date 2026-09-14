import { useEffect } from "react";
import { useBlocker } from "react-router-dom";
import { Modal } from "antd";

export function useUnsavedChanges(dirty: boolean, busy = false) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (dirty || busy) && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty && !busy) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, busy]);
  return (
    <Modal
      title={busy ? "正在儲存" : "放棄尚未儲存的變更？"}
      open={blocker.state === "blocked"}
      okText="放棄變更"
      cancelText="繼續編輯"
      okButtonProps={{ disabled: busy, danger: true }}
      onCancel={() => blocker.state === "blocked" && blocker.reset()}
      onOk={() => blocker.state === "blocked" && !busy && blocker.proceed()}
    >
      {busy ? "請等待儲存完成後再離開。" : "離開後，這次輸入的內容不會保留。"}
    </Modal>
  );
}
