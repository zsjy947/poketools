import { useEffect, useState } from "react";

const MQ = "(max-width: 768px)";

/** 移动端视口（≤768）检测：为手机专属布局分支提供渲染开关（桌面零影响）。 */
export function useIsMobile(): boolean {
  const [on, setOn] = useState(() =>
    typeof matchMedia === "function" ? matchMedia(MQ).matches : false,
  );
  useEffect(() => {
    const mq = matchMedia(MQ);
    const onChange = () => setOn(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return on;
}
