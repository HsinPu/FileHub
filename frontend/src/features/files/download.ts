export async function downloadFile(path: string) {
  return downloadUrl(`/api/v1/files/download?path=${encodeURIComponent(path)}`);
}

export async function downloadUrl(url: string) {
  const check = await fetch(url, {
    method: "HEAD",
    credentials: "same-origin",
  });
  if (!check.ok) {
    if (check.status === 401)
      window.dispatchEvent(new Event("session-expired"));
    throw new Error(
      check.status === 401
        ? "登入已失效，請重新登入。"
        : check.status === 410
          ? "打包檔案已到期，請重新打包。"
          : "無法下載，檔案可能已移除或沒有權限。",
    );
  }
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
