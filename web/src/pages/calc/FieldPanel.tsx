/* FieldPanel（自 CalcPage.tsx 机械抽出，纯位移） */
import { SideState } from "./model";
import { SideStatusCol } from "./SideStatusCol";

export function FieldPanel({
  field,
  fieldSet,
  sides,
}: {
  field: any;
  fieldSet: (patch: any) => void;
  sides: {
    atk: { side: SideState; set: (which: "A" | "D", patch: any) => void };
    dfd: { side: SideState; set: (which: "A" | "D", patch: any) => void };
  };
}): JSX.Element {
  const WEATHER4 = [
    { v: "sun", t: "晴天" },
    { v: "rain", t: "雨天" },
    { v: "sand", t: "沙暴" },
    { v: "snow", t: "雪天" },
  ];
  const WEATHER3 = [
    { v: "harsh_sun", t: "大日照" },
    { v: "harsh_rain", t: "大雨" },
    { v: "air", t: "乱流" },
  ];
  const TERRAINS = [
    { v: "electric", t: "电气场地" },
    { v: "grassy", t: "青草场地" },
    { v: "psychic", t: "精神场地" },
    { v: "mist", t: "薄雾场地" },
  ];
  const AURAS = [
    { v: "break", t: "气场破坏" },
    { v: "fairy", t: "妖精气场" },
    { v: "dark", t: "暗黑气场" },
  ];
  const RUINS = [
    { v: "sword", t: "灾祸之剑", eff: "(-防御)" },
    { v: "beads", t: "灾祸之玉", eff: "(-特防)" },
    { v: "tablets", t: "灾祸之简", eff: "(-攻击)" },
    { v: "vessel", t: "灾祸之鼎", eff: "(-特攻)" },
  ];

  return (
    <div className="block field-panel">
      <div className="fp-grid5">
        <SideStatusCol side={sides.atk.side} which="A" set={sides.atk.set} />
        <div className="fp-col fp-center">
          <div className="fp-row">
            <div className="fp-seg fp-grow">
              <button
                className={"fp-btn seg" + (field.mode === "singles" ? " on" : "")}
                onClick={() => fieldSet({ mode: "singles" })}
              >
                单打
              </button>
              <button
                className={"fp-btn seg" + (field.mode === "doubles" ? " on" : "")}
                onClick={() => fieldSet({ mode: "doubles" })}
              >
                双打
              </button>
            </div>
          </div>
          <div className="fp-row">
            {WEATHER4.map((w) => (
              <button
                key={w.v}
                className={"fp-btn" + (field.weather === w.v ? " on" : "")}
                onClick={() => fieldSet({ weather: field.weather === w.v ? "" : w.v })}
              >
                {w.t}
              </button>
            ))}
          </div>
          <div className="fp-row fp-inset">
            {WEATHER3.map((w) => (
              <button
                key={w.v}
                className={"fp-btn" + (field.weather === w.v ? " on" : "")}
                onClick={() => fieldSet({ weather: field.weather === w.v ? "" : w.v })}
              >
                {w.t}
              </button>
            ))}
          </div>
          <div className="fp-row">
            {TERRAINS.map((t) => (
              <button
                key={t.v}
                className={"fp-btn" + (field.terrain === t.v ? " on" : "")}
                onClick={() => fieldSet({ terrain: field.terrain === t.v ? "" : t.v })}
              >
                {t.t}
              </button>
            ))}
          </div>
          <div className="fp-row">
            {AURAS.map((a) => (
              <button
                key={a.v}
                className={"fp-btn" + (field.auras[a.v] ? " on" : "")}
                onClick={() => fieldSet({ auras: { ...field.auras, [a.v]: !field.auras[a.v] } })}
              >
                {a.t}
              </button>
            ))}
          </div>
          <div className="fp-row">
            {RUINS.map((r) => (
              <button
                key={r.v}
                className={"fp-btn fp-btn-2l" + (field.ruin[r.v] ? " on" : "")}
                onClick={() => fieldSet({ ruin: { ...field.ruin, [r.v]: !field.ruin[r.v] } })}
              >
                <span className="l1">{r.t}</span>
                <span className="l2">{r.eff}</span>
              </button>
            ))}
          </div>
          <div className="fp-row">
            <button
              className={"fp-btn" + (field.gravity ? " on" : "")}
              onClick={() => fieldSet({ gravity: !field.gravity })}
            >
              重力
            </button>
            <button
              className={"fp-btn" + (field.magic_room ? " on" : "")}
              onClick={() => fieldSet({ magic_room: !field.magic_room })}
            >
              魔法空间
            </button>
            <button
              className={"fp-btn" + (field.wonder_room ? " on" : "")}
              onClick={() => fieldSet({ wonder_room: !field.wonder_room })}
            >
              奇妙空间
            </button>
          </div>
        </div>
        <SideStatusCol side={sides.dfd.side} which="D" set={sides.dfd.set} />
      </div>
    </div>
  );
}
