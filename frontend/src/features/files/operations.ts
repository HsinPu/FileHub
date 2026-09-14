import { z } from "zod";

export const operationSchema = z.object({
  id: z.string(),
  kind: z.enum(["copy", "move", "trash", "restore", "archive"]),
  destination: z.string().nullable(),
  conflict: z.enum(["skip", "keep_both"]),
  status: z.string(),
  cancel_requested: z.boolean(),
  created_at: z.number(),
  updated_at: z.number(),
  items: z.array(
    z.object({
      source: z.string(),
      display_name: z.string().nullable().optional(),
      target: z.string().nullable().optional(),
      status: z.string(),
      message: z.string(),
    }),
  ),
});
export const operationsSchema = z.array(operationSchema);
export type Operation = z.infer<typeof operationSchema>;
export type OperationKind = Operation["kind"];
export const operationNames = {
  archive: "ZIP 打包",
  copy: "複製",
  move: "搬移",
  trash: "移至垃圾桶",
  restore: "還原",
};
export const statusNames: Record<string, string> = {
  queued: "等待中",
  pending: "等待中",
  running: "執行中",
  committing: "正在儲存",
  done: "完成",
  completed: "完成",
  partial: "部分未完成",
  skipped: "略過",
  cancelled: "已取消",
  error: "失敗",
  needs_review: "需檢查",
};
export const isActive = (status: string) =>
  ["queued", "running", "pending", "committing"].includes(status);
