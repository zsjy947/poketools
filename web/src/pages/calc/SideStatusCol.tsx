/* SideStatusCol（自 CalcPage.tsx 机械抽出，纯位移） */
import { SCREENS, SHOW_STATUSES, SideState } from "./model";

export function SideStatusCol({
  side,
  which,
  set,
}: {
  side: SideState;
  which: "A" | "D";
  set: (which: "A" | "D", patch: any) => void;
}): JSX.Element {
  const s = side;
  const toggleStatus = (st: string) =>
    set(which, (cur: SideState) => ({
      statuses: cur.statuses.includes(st)
        ? cur.statuses.filter((x) => x !== st)
        : [...cur.statuses, st],
    }));
  return (
    <div className="fp-col">
      <div className="fp-row">
        <button
          className={"fp-btn" + (s.burn ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ burn: !cur.burn }))}
        >
          灼伤
        </button>
        {SHOW_STATUSES.map((st) => (
          <button
            key={st}
            className={"fp-btn" + (s.statuses.includes(st) ? " on" : "")}
            onClick={() => toggleStatus(st)}
          >
            {st}
          </button>
        ))}
      </div>
      <div className="fp-row">
        {SCREENS.map((x) => (
          <button
            key={x.v}
            className={"fp-btn" + (s.screen === x.v ? " on" : "")}
            onClick={() =>
              set(which, (cur: SideState) => ({ screen: cur.screen === x.v ? "" : x.v }))
            }
          >
            {x.t}
          </button>
        ))}
        <button
          className={"fp-btn" + (s.friendGuard ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ friendGuard: !cur.friendGuard }))}
        >
          友情防守
        </button>
      </div>
      {/* U16：击中要害回归普通按钮（弹性撑高会让三列高度失衡） */}
      <div className="fp-row">
        <button
          className={"fp-btn" + (s.crit ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ crit: !cur.crit }))}
        >
          击中要害
        </button>
      </div>
      <div className="fp-row">
        <button
          className={"fp-btn" + (s.helping ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ helping: !cur.helping }))}
        >
          帮助
        </button>
        <button
          className={"fp-btn" + (s.steely ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ steely: !cur.steely }))}
        >
          钢之意志
        </button>
        <button
          className={"fp-btn" + (s.battery ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ battery: !cur.battery }))}
        >
          蓄电池
        </button>
        <button
          className={"fp-btn" + (s.powerSpot ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ powerSpot: !cur.powerSpot }))}
        >
          能量点
        </button>
      </div>
      <div className="fp-row">
        <button
          className={"fp-btn fp-w55" + (s.hazards.rocks ? " on" : "")}
          onClick={() =>
            set(which, (cur: SideState) => ({
              hazards: { ...cur.hazards, rocks: !cur.hazards.rocks },
            }))
          }
        >
          隐形岩
        </button>
        <div className="fp-seg fp-grow">
          <span className="fp-seg-label">撒菱</span>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              className={"fp-btn seg" + (s.hazards.spikes === n ? " on" : "")}
              onClick={() =>
                set(which, (cur: SideState) => ({
                  hazards: { ...cur.hazards, spikes: cur.hazards.spikes === n ? 0 : n },
                }))
              }
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="fp-row">
        <button
          className={"fp-btn" + (s.hazards.leechSeed ? " on" : "")}
          onClick={() =>
            set(which, (cur: SideState) => ({
              hazards: { ...cur.hazards, leechSeed: !cur.hazards.leechSeed },
            }))
          }
        >
          寄生种子
        </button>
        <button
          className={"fp-btn" + (s.hazards.saltCure ? " on" : "")}
          onClick={() =>
            set(which, (cur: SideState) => ({
              hazards: { ...cur.hazards, saltCure: !cur.hazards.saltCure },
            }))
          }
        >
          盐淹
        </button>
      </div>
      <div className="fp-row">
        <button
          className={"fp-btn" + (s.powerTrick ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ powerTrick: !cur.powerTrick }))}
        >
          力量戏法
        </button>
        <button
          className={"fp-btn" + (s.foresight ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ foresight: !cur.foresight }))}
        >
          被识破
        </button>
      </div>
      <div className="fp-row">
        <button
          className={"fp-btn" + (s.flowerGift ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ flowerGift: !cur.flowerGift }))}
        >
          花之礼
        </button>
        <button
          className={"fp-btn" + (s.tailwind ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ tailwind: !cur.tailwind }))}
        >
          顺风
        </button>
        <button
          className={"fp-btn" + (s.switching ? " on" : "")}
          onClick={() => set(which, (cur: SideState) => ({ switching: !cur.switching }))}
        >
          切换
        </button>
      </div>
    </div>
  );
}
