import { useEffect, useState } from "react";

const MQ = "(max-width: 768px)";

/** 移动端视口（≤768）检测：为手机专属布局分支提供渲染开关（桌面零影响）。 */
export function useIsMobile(): boolean {
  const [on, setOn] = useState(() =>
    typeof matchMedia === "function" ? matchMedia(MQ).matches : false,
  );
  useEffect(() => {
    const sync = () => setOn(matchMedia(MQ).matches);
    const mq = matchMedia(MQ);
    /* 挂载即对齐当前视口：bfcache/休眠恢复后 state 可能停留在旧视口且不再触发 change；
       resize 兜底覆盖宿主晚应用视口、change 事件缺失的场景 */
    sync();
    mq.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);
  return on;
}
