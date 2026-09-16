import { z } from "zod";

export const directoryStatusSchema = z.object({
  path: z.string(),
  status: z.enum(["readable", "missing", "not_directory", "unavailable"]),
  writable: z.boolean(),
  cross_device: z.boolean().nullable(),
});
export const directoryStatusLabels = {
  readable: "可讀取",
  missing: "目錄不存在",
  not_directory: "不是資料夾",
  unavailable: "無法存取",
};
export const directoryRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  enabled: z.boolean(),
  revision: z.number(),
  access_revision: z.number(),
  created_at: z.number(),
  updated_at: z.number(),
});
export const directorySchema = directoryRecordSchema.extend({
  ...directoryStatusSchema.shape,
  account_count: z.number(),
});
export const inventorySchema = z.object({
  root: z.string(),
  checked_at: z.string(),
  root_status: directoryStatusSchema,
  items: z.array(directorySchema),
});
export type RegisteredDirectory = z.infer<typeof directorySchema>;
