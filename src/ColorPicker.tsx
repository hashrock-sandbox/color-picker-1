import { useState, useRef, useCallback } from "react";

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function useDrag(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);

  const getPos = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      const rect = ref.current!.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      onMove(x, y);
    },
    [onMove]
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      getPos(e);
      const move = (ev: MouseEvent) => getPos(ev);
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [getPos]
  );

  return { ref, onMouseDown };
}

export default function ColorPicker() {
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(1);
  const [val, setVal] = useState(1);

  const svDrag = useDrag(
    useCallback((x: number, y: number) => {
      setSat(x);
      setVal(1 - y);
    }, [])
  );

  const hueDrag = useDrag(
    useCallback((x: number) => {
      setHue(x * 360);
    }, [])
  );

  const [r, g, b] = hsvToRgb(hue, sat, val);
  const hex = rgbToHex(r, g, b);
  const hueColor = rgbToHex(...hsvToRgb(hue, 1, 1));

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 12 }}>
      {/* SV panel */}
      <div
        ref={svDrag.ref}
        onMouseDown={svDrag.onMouseDown}
        style={{
          position: "relative",
          width: 256,
          height: 256,
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
          borderRadius: 8,
          cursor: "crosshair",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${sat * 100}%`,
            top: `${(1 - val) * 100}%`,
            width: 16,
            height: 16,
            borderRadius: "50%",
            border: "3px solid #fff",
            boxShadow: "0 0 3px rgba(0,0,0,0.5)",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Hue slider */}
      <div
        ref={hueDrag.ref}
        onMouseDown={hueDrag.onMouseDown}
        style={{
          position: "relative",
          width: 256,
          height: 20,
          borderRadius: 10,
          background:
            "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
          cursor: "crosshair",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${(hue / 360) * 100}%`,
            top: "50%",
            width: 16,
            height: 16,
            borderRadius: "50%",
            border: "3px solid #fff",
            boxShadow: "0 0 3px rgba(0,0,0,0.5)",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Preview */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            backgroundColor: hex,
            border: "1px solid rgba(255,255,255,0.2)",
          }}
        />
        <span style={{ fontFamily: "monospace", fontSize: 18 }}>{hex}</span>
      </div>
    </div>
  );
}
