/* 确认框与弹层容器（自 components/shared.tsx 拆出） */
import type { ReactNode } from "react";

/* 简易确认（替代 ElMessageBox.confirm；返回 true=确认） */
export function confirmBox(message: string, title = "确认操作"): boolean {
  return window.confirm(`${title}\n\n${message}`);
}

/* 弹层容器（替代 el-dialog） */
export function Modal({
  open,
  title,
  width,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  width?: number;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element | null {
  if (!open) return null;
  return (
    <div className="pkt-modal-mask" onClick={onClose}>
      <div
        className="pkt-modal"
        style={{ width: (width || 560) + "px", maxWidth: "94vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pkt-modal-head">
          <span>{title}</span>
          <button className="pkt-modal-x" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="pkt-modal-body">{children}</div>
      </div>
    </div>
  );
}
