import { Checkbox, Select, Space, Typography } from "antd";

const options = [
  { label: "瀏覽", value: "browse" },
  { label: "讀取內容／下載", value: "read" },
  { label: "上傳／建目錄", value: "upload" },
  { label: "修改／搬移", value: "modify" },
  { label: "移至垃圾桶", value: "delete" },
  { label: "分享", value: "share" },
];

const presets = [
  { value: "read", label: "唯讀", permissions: ["browse", "read"] },
  {
    value: "work",
    label: "一般作業",
    permissions: ["browse", "read", "upload", "modify"],
  },
  {
    value: "full",
    label: "完整作業",
    permissions: ["browse", "read", "upload", "modify", "delete"],
  },
];

export default function PermissionPicker({
  value = [],
  onChange,
}: {
  value?: string[];
  onChange?: (value: string[]) => void;
}) {
  const preset = presets.find(
    (entry) =>
      entry.permissions.length === value.length &&
      entry.permissions.every((permission) => value.includes(permission)),
  );
  return (
    <Space direction="vertical">
      <Select
        aria-label="權限範本"
        value={preset?.value ?? "custom"}
        options={[
          ...presets.map(({ value, label }) => ({ value, label })),
          { value: "custom", label: "自訂", disabled: true },
        ]}
        onChange={(key) => {
          const selected = presets.find((entry) => entry.value === key);
          if (selected) onChange?.([...selected.permissions]);
        }}
      />
      <Checkbox.Group
        className="account-permissions"
        options={options}
        value={value}
        onChange={onChange}
      />
      <Typography.Text type="secondary">
        套用範本會取代目前勾選；分享需另外授權。
      </Typography.Text>
    </Space>
  );
}
