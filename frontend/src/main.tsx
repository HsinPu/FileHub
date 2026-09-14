import React from "react";
import ReactDOM from "react-dom/client";
import { App, ConfigProvider } from "antd";
import zhTW from "antd/locale/zh_TW";
import { Application } from "./app/App";
import "antd/dist/reset.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhTW}
      button={{ autoInsertSpace: false }}
      theme={{
        token: {
          motion: !window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches,
          colorPrimary: "#236b60",
          colorInfo: "#236b60",
          borderRadius: 6,
          fontSize: 14,
          colorText: "#1f2328",
          colorTextSecondary: "#667085",
          colorBorder: "#dfe3e8",
          colorBorderSecondary: "#eceff3",
          colorBgLayout: "#f8f9fb",
          fontFamily:
            '"Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif',
        },
        components: {
          Button: { primaryShadow: "none", controlHeight: 32 },
          Tree: { nodeSelectedBg: "#edf0f2", nodeSelectedColor: "#1f2328" },
          Table: {
            headerBg: "#f8f9fb",
            headerColor: "#475467",
            rowSelectedBg: "#edf4f0",
            rowSelectedHoverBg: "#e4efe9",
            cellPaddingBlock: 10,
            cellPaddingBlockMD: 10,
            cellPaddingInlineMD: 12,
          },
          Layout: { headerBg: "#ffffff", siderBg: "#ffffff" },
        },
      }}
    >
      <App>
        <Application />
      </App>
    </ConfigProvider>
  </React.StrictMode>,
);
