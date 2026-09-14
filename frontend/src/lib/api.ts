import { z } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "Files-App",
      ...init.headers,
    },
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = z
      .object({ error: z.object({ code: z.string(), message: z.string() }) })
      .safeParse(body);
    if (
      (response.status === 401 ||
        (parsed.success && parsed.data.error.code === "ACCOUNT_DISABLED")) &&
      path !== "/auth/login"
    )
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.error.code : "UNKNOWN",
      parsed.success ? parsed.data.error.message : "無法完成要求，請稍後再試。",
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("伺服器回應格式不正確，請重新整理。");
  return parsed.data;
}

export const userSchema = z.object({
  username: z.string(),
  full_name: z.string().nullable(),
  role: z.enum(["admin", "user"]),
  permissions: z.array(z.string()),
  must_change_password: z.boolean(),
});
export const messageSchema = z.object({ message: z.string() });
export type User = z.infer<typeof userSchema>;
export const entrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["directory", "file"]),
  size: z.number().nullable(),
  modified: z.string(),
});
export const listingSchema = z.object({
  path: z.string(),
  entries: z.array(entrySchema),
});
export const previewSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["text", "image"]),
  size: z.number(),
  content: z.string(),
  mime_type: z.string(),
});
export type FileEntry = z.infer<typeof entrySchema>;
export type FilePreview = z.infer<typeof previewSchema>;
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "操作失敗，請稍後重試。";

export function formatSize(size: number | null): string {
  if (size === null) return "—";
  if (size === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(size) / Math.log(1024)),
    units.length - 1,
  );
  return `${(size / 1024 ** exponent).toLocaleString("zh-TW", { maximumFractionDigits: 1 })} ${units[exponent]}`;
}
