import { useEffect, useRef, useState } from "react";
import { Alert, Button, Tree, Spin } from "antd";
import type { DataNode } from "antd/es/tree";
import { FolderOutlined } from "@ant-design/icons";
import { api, errorMessage, listingSchema } from "../../lib/api";

function replaceChildren(
  nodes: DataNode[],
  key: React.Key,
  children: DataNode[],
): DataNode[] {
  return nodes.map((node) =>
    node.key === key
      ? { ...node, children, isLeaf: children.length === 0 }
      : {
          ...node,
          children: node.children
            ? replaceChildren(node.children, key, children)
            : undefined,
        },
  );
}

export function DirectoryTree({
  path,
  onSelect,
}: {
  path?: string;
  onSelect: (path: string) => void;
}) {
  const [nodes, setNodes] = useState<DataNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<React.Key[]>([""]);
  const [expanded, setExpanded] = useState<React.Key[]>([""]);
  const alive = useRef(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    setError(null);
    api("/files/tree", listingSchema, { signal: controller.signal })
      .then((result) =>
        setNodes([
          {
            title: "所有檔案",
            key: "",
            icon: <FolderOutlined />,
            children: result.entries.map((entry) => ({
              title: entry.name,
              key: entry.path,
              icon: <FolderOutlined />,
            })),
          },
        ]),
      )
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [retry]);
  async function loadData(node: DataNode) {
    try {
      const result = await api(
        `/files/tree?path=${encodeURIComponent(String(node.key))}`,
        listingSchema,
      );
      if (alive.current) {
        setNodes((nodes) =>
          replaceChildren(
            nodes,
            node.key,
            result.entries.map((entry) => ({
              key: entry.path,
              title: entry.name,
              icon: <FolderOutlined />,
            })),
          ),
        );
        setLoaded((keys) => [...keys, node.key]);
        setError(null);
      }
    } catch (error) {
      if (alive.current) {
        setError(errorMessage(error));
        setLoaded((keys) => [...keys, node.key]);
      }
    }
  }
  return (
    <div className="directory-tree">
      {error && (
        <Alert
          type="error"
          title="目錄載入失敗"
          description={error}
          action={
            <Button
              size="small"
              onClick={() => {
                setNodes([]);
                setExpanded([""]);
                setLoaded([""]);
                setRetry((v) => v + 1);
              }}
            >
              重試
            </Button>
          }
        />
      )}
      {!nodes.length && !error ? (
        <Spin size="small" />
      ) : (
        <Tree
          showIcon
          blockNode
          treeData={nodes}
          selectedKeys={path === undefined ? [] : [path]}
          expandedKeys={expanded}
          onExpand={(keys) => setExpanded(keys)}
          loadedKeys={loaded}
          loadData={loadData}
          onSelect={(keys) => {
            if (keys.length) onSelect(String(keys[0]));
          }}
        />
      )}
    </div>
  );
}
