import { useState, useRef, useEffect, useCallback } from "react";

const W = 400;
const H = 400;
const PICK_SIZE = 80;

const PALETTE = [
  "#dc2626", "#ea580c", "#d97706", "#65a30d", "#059669",
  "#0891b2", "#2563eb", "#7c3aed", "#db2777", "#1e293b",
  "#f8fafc",
];

function hexToRgba(hex: string): [number, number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
    255,
  ];
}

function sampleBilinear(
  buf: Uint8ClampedArray,
  fx: number,
  fy: number
): [number, number, number, number] {
  fx = Math.max(0, Math.min(W - 1.001, fx));
  fy = Math.max(0, Math.min(H - 1.001, fy));
  const x0 = Math.floor(fx),
    y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, W - 1),
    y1 = Math.min(y0 + 1, H - 1);
  const tx = fx - x0,
    ty = fy - y0;
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    out[c] =
      buf[(y0 * W + x0) * 4 + c] * (1 - tx) * (1 - ty) +
      buf[(y0 * W + x1) * 4 + c] * tx * (1 - ty) +
      buf[(y1 * W + x0) * 4 + c] * (1 - tx) * ty +
      buf[(y1 * W + x1) * 4 + c] * tx * ty;
  }
  return out;
}

function applyDrop(
  buf: Uint8ClampedArray,
  cx: number,
  cy: number,
  radius: number,
  rgba: [number, number, number, number]
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(buf.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx,
        dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const i = (y * W + x) * 4;
      if (d <= radius) {
        out[i] = rgba[0];
        out[i + 1] = rgba[1];
        out[i + 2] = rgba[2];
        out[i + 3] = rgba[3];
      } else {
        const sd = Math.sqrt(d * d - radius * radius);
        const s = sampleBilinear(buf, cx + (dx / d) * sd, cy + (dy / d) * sd);
        out[i] = s[0];
        out[i + 1] = s[1];
        out[i + 2] = s[2];
        out[i + 3] = s[3];
      }
    }
  }
  return out;
}

function applyComb(
  buf: Uint8ClampedArray,
  cx: number,
  cy: number,
  mvx: number,
  mvy: number,
  radius: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(buf.length);
  out.set(buf);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx,
        dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < radius && d > 0) {
        const t = (1 - d / radius) ** 2;
        const s = sampleBilinear(buf, x - mvx * t, y - mvy * t);
        const i = (y * W + x) * 4;
        out[i] = s[0];
        out[i + 1] = s[1];
        out[i + 2] = s[2];
        out[i + 3] = s[3];
      }
    }
  }
  return out;
}

function createWhiteBuf(): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(W * H * 4);
  buf.fill(255);
  return buf;
}

type Mode = "drop" | "pick";

export default function MarblingPicker() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufRef = useRef<Uint8ClampedArray>(createWhiteBuf());
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const hasMoved = useRef(false);

  const [mode, setMode] = useState<Mode>("drop");
  const [inkColor, setInkColor] = useState(PALETTE[0]);
  const [dropRadius, setDropRadius] = useState(30);
  const [combRadius, setCombRadius] = useState(50);
  const [pickPos, setPickPos] = useState({ x: W / 2 - PICK_SIZE / 2, y: H / 2 - PICK_SIZE / 2 });
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const imgData = new ImageData(new Uint8ClampedArray(bufRef.current), W, H);
    ctx.putImageData(imgData, 0, 0);
  }, []);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const getCanvasPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const pos = getCanvasPos(e);
    isDraggingRef.current = true;
    hasMoved.current = false;
    lastPosRef.current = pos;

    if (mode === "drop") {
      // Drop ink immediately
      bufRef.current = applyDrop(
        bufRef.current,
        pos.x,
        pos.y,
        dropRadius,
        hexToRgba(inkColor)
      );
      renderCanvas();
      forceUpdate((n) => n + 1);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !lastPosRef.current) return;
    const pos = getCanvasPos(e);
    const dx = pos.x - lastPosRef.current.x;
    const dy = pos.y - lastPosRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (mode === "drop" && dist > 3) {
      hasMoved.current = true;
      bufRef.current = applyComb(
        bufRef.current,
        pos.x,
        pos.y,
        dx,
        dy,
        combRadius
      );
      renderCanvas();
      lastPosRef.current = pos;
      forceUpdate((n) => n + 1);
    } else if (mode === "pick") {
      setPickPos({
        x: Math.max(0, Math.min(W - PICK_SIZE, pos.x - PICK_SIZE / 2)),
        y: Math.max(0, Math.min(H - PICK_SIZE, pos.y - PICK_SIZE / 2)),
      });
      lastPosRef.current = pos;
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    lastPosRef.current = null;
  };

  const handleClear = () => {
    bufRef.current = createWhiteBuf();
    renderCanvas();
    forceUpdate((n) => n + 1);
  };

  const handleCapture = () => {
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = PICK_SIZE;
    tmpCanvas.height = PICK_SIZE;
    const ctx = tmpCanvas.getContext("2d")!;
    const px = Math.round(pickPos.x);
    const py = Math.round(pickPos.y);
    const imgData = ctx.createImageData(PICK_SIZE, PICK_SIZE);
    for (let y = 0; y < PICK_SIZE; y++) {
      for (let x = 0; x < PICK_SIZE; x++) {
        const si = ((py + y) * W + (px + x)) * 4;
        const di = (y * PICK_SIZE + x) * 4;
        imgData.data[di] = bufRef.current[si];
        imgData.data[di + 1] = bufRef.current[si + 1];
        imgData.data[di + 2] = bufRef.current[si + 2];
        imgData.data[di + 3] = bufRef.current[si + 3];
      }
    }
    ctx.putImageData(imgData, 0, 0);
    setBgImage(tmpCanvas.toDataURL());
  };

  const handleApplyBg = () => {
    if (bgImage) {
      document.body.style.backgroundImage = `url(${bgImage})`;
      document.body.style.backgroundRepeat = "repeat";
      document.body.style.backgroundSize = `${PICK_SIZE}px ${PICK_SIZE}px`;
    }
  };

  const handleClearBg = () => {
    document.body.style.backgroundImage = "";
    document.body.style.backgroundRepeat = "";
    document.body.style.backgroundSize = "";
    setBgImage(null);
  };

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 16 }}>
      {/* Canvas area */}
      <div style={{ position: "relative", width: W, height: H }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            display: "block",
            borderRadius: 8,
            cursor: mode === "drop" ? "crosshair" : "move",
            boxShadow: "0 2px 16px rgba(0,0,0,0.3)",
          }}
        />
        {mode === "pick" && (
          <div
            style={{
              position: "absolute",
              left: pickPos.x,
              top: pickPos.y,
              width: PICK_SIZE,
              height: PICK_SIZE,
              border: "2px dashed #fff",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.3)",
              pointerEvents: "none",
              borderRadius: 2,
            }}
          />
        )}
      </div>

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 4 }}>
        <button
          onClick={() => setMode("drop")}
          style={{
            flex: 1,
            padding: "8px 0",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: mode === "drop" ? 700 : 400,
            background: mode === "drop" ? "#3b82f6" : "#334155",
            color: "#fff",
            fontSize: 14,
          }}
        >
          Drop / Comb
        </button>
        <button
          onClick={() => setMode("pick")}
          style={{
            flex: 1,
            padding: "8px 0",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: mode === "pick" ? 700 : 400,
            background: mode === "pick" ? "#3b82f6" : "#334155",
            color: "#fff",
            fontSize: 14,
          }}
        >
          Pick
        </button>
      </div>

      {/* Drop mode controls */}
      {mode === "drop" && (
        <>
          {/* Palette */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setInkColor(c)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: inkColor === c ? "3px solid #fff" : "2px solid rgba(255,255,255,0.2)",
                  background: c,
                  cursor: "pointer",
                  boxShadow: inkColor === c ? "0 0 8px rgba(59,130,246,0.6)" : "none",
                  padding: 0,
                }}
              />
            ))}
          </div>

          {/* Sliders */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#cbd5e1", fontSize: 13 }}>
              Drop size
              <input
                type="range"
                min={10}
                max={60}
                value={dropRadius}
                onChange={(e) => setDropRadius(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ width: 28, textAlign: "right" }}>{dropRadius}</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#cbd5e1", fontSize: 13 }}>
              Comb size
              <input
                type="range"
                min={20}
                max={120}
                value={combRadius}
                onChange={(e) => setCombRadius(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ width: 28, textAlign: "right" }}>{combRadius}</span>
            </label>
          </div>

          <button
            onClick={handleClear}
            style={{
              padding: "8px 16px",
              border: "1px solid #475569",
              borderRadius: 6,
              background: "#1e293b",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Clear
          </button>
        </>
      )}

      {/* Pick mode controls */}
      {mode === "pick" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>
            Drag the rectangle to select a tile area, then capture.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleCapture}
              style={{
                flex: 1,
                padding: "8px 16px",
                border: "none",
                borderRadius: 6,
                background: "#3b82f6",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Capture
            </button>
            {bgImage && (
              <>
                <button
                  onClick={handleApplyBg}
                  style={{
                    flex: 1,
                    padding: "8px 16px",
                    border: "none",
                    borderRadius: 6,
                    background: "#059669",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  Apply BG
                </button>
                <button
                  onClick={handleClearBg}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #475569",
                    borderRadius: 6,
                    background: "#1e293b",
                    color: "#94a3b8",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Reset
                </button>
              </>
            )}
          </div>

          {/* Tile preview */}
          {bgImage && (
            <div>
              <p style={{ margin: "0 0 6px", color: "#94a3b8", fontSize: 13 }}>
                Tile preview:
              </p>
              <div
                style={{
                  width: W,
                  height: 160,
                  borderRadius: 8,
                  backgroundImage: `url(${bgImage})`,
                  backgroundRepeat: "repeat",
                  backgroundSize: `${PICK_SIZE}px ${PICK_SIZE}px`,
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
