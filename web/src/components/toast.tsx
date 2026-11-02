/* toast 轻提示与宿主组件（自 components/shared.tsx 拆出） */
import { useState } from "react";

/* ---- toast（轻量替代 ElMessage） ---- */
let toastSeq = 0;
type Toast = { id: number; msg: string; type: string };
const toastListeners = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];
export function toast(msg: string, type = "info"): void {
  const t = { id: ++toastSeq, msg, type };
  toasts = [...toasts, t];
  for (const fn of toastListeners) fn(toasts);
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    for (const fn of toastListeners) fn(toasts);
  }, 2200);
}

export function ToastHost(): JSX.Element {
  const [list, setList] = useState<Toast[]>([]);
  useState(() => {
    toastListeners.add(setList);
    return null;
  });
  return (
    <div className="pkt-toast-host">
      {list.map((t) => (
        <div key={t.id} className={"pkt-toast t-" + t.type}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
