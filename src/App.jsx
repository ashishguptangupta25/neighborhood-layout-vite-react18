import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "neighborhoodLayoutV2";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function movePoints(points, dx, dy) {
  const out = [];
  for (let i = 0; i < points.length; i += 2)
    out.push(points[i] + dx, points[i + 1] + dy);
  return out;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function truncateText(text, maxLength = 20) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function runTests() {
  const a = movePoints([0, 0, 10, 10], 5, -5);
  const b = JSON.stringify(a) === JSON.stringify([5, -5, 15, 5]);
  const c =
    clamp(5, 0, 10) === 5 && clamp(-1, 0, 10) === 0 && clamp(11, 0, 10) === 10;
  const d = typeof uid() === "string" && uid().length > 0;
  const pass = b && c && d;
  if (typeof window !== "undefined") {
    console.log("Tests:", { movePoints: b, clamp: c, uid: d, pass });
  }
  return pass;
}

runTests();

export default function App() {
  const [elements, setElements] = useState([]);
  const [history, setHistory] = useState([]);
  const [tool, setTool] = useState("select");
  const [selectedId, setSelectedId] = useState(null);
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [roadDraft, setRoadDraft] = useState(null);
  const svgRef = useRef(null);
  const panRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0,
  });
  const dragRef = useRef({ id: null, dx: 0, dy: 0, mode: null });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.elements))
          setElements(parsed.elements);
      }
    } catch {}
  }, []);

  const saveDebounced = useRef(null);
  useEffect(() => {
    if (saveDebounced.current) clearTimeout(saveDebounced.current);
    saveDebounced.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ elements }));
      } catch {}
    }, 250);
    return () => clearTimeout(saveDebounced.current);
  }, [elements]);

  const selected = useMemo(
    () => elements.find((e) => e.id === selectedId) || null,
    [elements, selectedId]
  );

  function push(newEls) {
    // Save current state to history before making changes
    setHistory(prev => [...prev.slice(-9), elements]); // Keep last 10 states
    setElements(newEls);
  }

  function undo() {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setElements(previousState);
    setSelectedId(null);
  }

  function addBuilding(p) {
    const id = uid();
    push([
      ...elements,
      {
        id,
        type: "building",
        x: p.x - 60,
        y: p.y - 40,
        width: 120,
        height: 80,
        rotation: 0,
        fill: "#60a5fa",
        name: "Building",
        description: "",
      },
    ]);
    setSelectedId(id);
  }

  function addBusiness(p) {
    const id = uid();
    push([
      ...elements,
      {
        id,
        type: "business",
        x: p.x,
        y: p.y,
        radius: 24,
        fill: "#f59e0b",
        name: "Business",
        description: "",
      },
    ]);
    setSelectedId(id);
  }

  function startRoad(p) {
    setRoadDraft({ start: p, end: p });
  }

  function updateRoad(p) {
    setRoadDraft((d) => (d ? { ...d, end: p } : null));
  }

  function commitRoad() {
    if (!roadDraft) return;
    const id = uid();
    push([
      ...elements,
      {
        id,
        type: "road",
        points: [
          roadDraft.start.x,
          roadDraft.start.y,
          roadDraft.end.x,
          roadDraft.end.y,
        ],
        stroke: "#6b7280",
        strokeWidth: 10,
        name: "Road",
      },
    ]);
    setRoadDraft(null);
    setSelectedId(id);
  }

  function updateElement(id, patch) {
    push(elements.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function onCanvasPointerDown(e) {
    const pt = getSvgPoint(e);
    if (!pt) return;
    if (tool === "pan") {
      panRef.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        initX: stagePos.x,
        initY: stagePos.y,
      };
      return;
    }
    if (tool === "building") return addBuilding(pt);
    if (tool === "business") return addBusiness(pt);
    if (tool === "road") return startRoad(pt);
    setSelectedId(null);
  }

  function onCanvasPointerMove(e) {
    const pt = getSvgPoint(e);
    if (!pt) return;
    if (tool === "road" && roadDraft) return updateRoad(pt);
    if (panRef.current.dragging) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      setStagePos({
        x: panRef.current.initX + dx,
        y: panRef.current.initY + dy,
      });
      return;
    }
    if (dragRef.current.mode && dragRef.current.id) {
      const id = dragRef.current.id;
      const el = elements.find((x) => x.id === id);
      if (!el) return;
      if (dragRef.current.mode === "move") {
        if (el.type === "building")
          updateElement(id, {
            x: pt.x - dragRef.current.dx,
            y: pt.y - dragRef.current.dy,
          });
        if (el.type === "business")
          updateElement(id, {
            x: pt.x - dragRef.current.dx,
            y: pt.y - dragRef.current.dy,
          });
        if (el.type === "road")
          updateElement(id, {
            points: movePoints(
              el.points,
              pt.x - dragRef.current.dx,
              pt.y - dragRef.current.dy
            ),
          });
      }
      if (dragRef.current.mode === "resize-building") {
        const w = clamp(pt.x - el.x, 20, 2000);
        const h = clamp(pt.y - el.y, 20, 2000);
        updateElement(id, { width: w, height: h });
      }
      if (dragRef.current.mode === "resize-business") {
        const r = clamp(Math.hypot(pt.x - el.x, pt.y - el.y), 8, 1000);
        updateElement(id, { radius: r });
      }
    }
  }

  function onCanvasPointerUp() {
    panRef.current.dragging = false;
    dragRef.current = { id: null, dx: 0, dy: 0, mode: null };
    if (tool === "road" && roadDraft) commitRoad();
  }

  function getSvgPoint(e) {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const p = pt.matrixTransform(inv);
    return {
      x: (p.x - stagePos.x) / stageScale,
      y: (p.y - stagePos.y) / stageScale,
    };
  }

  function onWheel(e) {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldX = (mouseX - stagePos.x) / stageScale;
    const worldY = (mouseY - stagePos.y) / stageScale;
    const scaleBy = 1.05;
    const direction = e.deltaY > 0 ? 1 : -1;
    const newScale = clamp(
      direction > 0 ? stageScale / scaleBy : stageScale * scaleBy,
      0.3,
      3
    );
    const newPos = {
      x: mouseX - worldX * newScale,
      y: mouseY - worldY * newScale,
    };
    setStageScale(newScale);
    setStagePos(newPos);
  }

  function exportLayout() {
    const blob = new Blob([JSON.stringify({ elements }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "neighborhood-layout.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const importRef = useRef(null);
  function importLayout(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || !Array.isArray(parsed.elements)) throw new Error();
        setElements(parsed.elements);
        setSelectedId(null);
      } catch {
        alert("Invalid layout file");
      }
    };
    reader.readAsText(file);
  }

  function startDrag(el, mode, pt) {
    setSelectedId(el.id);
    if (mode === "move") {
      if (el.type === "road")
        dragRef.current = { id: el.id, dx: pt.x, dy: pt.y, mode };
      if (el.type === "business" || el.type === "building")
        dragRef.current = { id: el.id, dx: pt.x - el.x, dy: pt.y - el.y, mode };
    }
    if (mode === "resize-building")
      dragRef.current = { id: el.id, dx: 0, dy: 0, mode };
    if (mode === "resize-business")
      dragRef.current = { id: el.id, dx: 0, dy: 0, mode };
  }
  const preventPinchZoom = (e) => {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
    }
  };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (e) => {
      e.preventDefault(); // stop browser zoom
      onWheel(e);
    };

    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      svg.removeEventListener("wheel", handleWheel, { passive: false });
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [stagePos, stageScale, history]);
  return (
    <div
      className="min-h-screen w-full bg-slate-50 text-slate-800"
      style={{
        touchAction: "none", // prevents browser panning/zoom
        width: "100vw",
        height: "100vh",
      }}
      onTouchMove={preventPinchZoom}
    >
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">Neighborhood Layout</span>
          <span className="text-xs text-slate-500">
            auto-save, export/import
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`rounded-xl px-3 py-2 text-sm ${
              tool === "select" ? "bg-slate-900 text-white" : "bg-slate-200"
            }`}
            onClick={() => setTool("select")}
          >
            Select
          </button>
          <button
            className={`rounded-xl px-3 py-2 text-sm ${
              tool === "building" ? "bg-slate-900 text-white" : "bg-slate-200"
            }`}
            onClick={() => setTool("building")}
          >
            Building
          </button>
          <button
            className={`rounded-xl px-3 py-2 text-sm ${
              tool === "road" ? "bg-slate-900 text-white" : "bg-slate-200"
            }`}
            onClick={() => setTool("road")}
          >
            Road
          </button>
          <button
            className={`rounded-xl px-3 py-2 text-sm ${
              tool === "business" ? "bg-slate-900 text-white" : "bg-slate-200"
            }`}
            onClick={() => setTool("business")}
          >
            Business
          </button>
          <button
            className={`rounded-xl px-3 py-2 text-sm ${
              tool === "pan" ? "bg-slate-900 text-white" : "bg-slate-200"
            }`}
            onClick={() => setTool("pan")}
          >
            Pan
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-xl bg-slate-200 px-3 py-2 text-sm disabled:opacity-40"
            onClick={undo}
            disabled={history.length === 0}
            title="Undo (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            className="rounded-xl bg-slate-200 px-3 py-2 text-sm"
            onClick={() => setStageScale((s) => clamp(s * 0.9, 0.3, 3))}
          >
            –
          </button>
          <button
            className="rounded-xl bg-slate-200 px-3 py-2 text-sm"
            onClick={() => setStageScale((s) => clamp(s * 1.1, 0.3, 3))}
          >
            +
          </button>
          <button
            className="rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-300"
            onClick={exportLayout}
          >
            Export
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) =>
              e.target.files?.[0] && importLayout(e.target.files[0])
            }
          />
          <button
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white"
            onClick={() => importRef.current?.click()}
          >
            Import
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="relative h-[70vh] w-full md:h-[78vh]">
            <svg
              ref={svgRef}
              className={
                tool === "pan"
                  ? "cursor-grab"
                  : tool === "select"
                  ? "cursor-default"
                  : "cursor-crosshair"
              }
              width="100%"
              height="100%"
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
            >
              <defs>
                <pattern
                  id="grid"
                  width="40"
                  height="40"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 40 0 L 0 0 0 40"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              <rect x="0" y="0" width="100%" height="100%" fill="url(#grid)" />
              <g
                transform={`translate(${stagePos.x},${stagePos.y}) scale(${stageScale})`}
              >
                {elements
                  .filter((e) => e.type === "road")
                  .map((e) => {
                    const midX = (e.points[0] + e.points[2]) / 2;
                    const midY = (e.points[1] + e.points[3]) / 2;
                    return (
                      <g key={e.id}>
                        <polyline
                          points={`${e.points[0]},${e.points[1]} ${e.points[2]},${e.points[3]}`}
                          fill="none"
                          stroke={e.stroke}
                          strokeWidth={e.strokeWidth}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          onPointerDown={(ev) => {
                            ev.stopPropagation();
                            const pt = getSvgPoint(ev);
                            if (!pt) return;
                            startDrag(e, "move", pt);
                          }}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelectedId(e.id);
                          }}
                        />
                        <text
                          x={midX}
                          y={midY - 8}
                          fontSize={12}
                          fill="#374151"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          pointerEvents="none"
                        >
                          {truncateText(e.name || "Road", 15)}
                        </text>
                      </g>
                    );
                  })}
                {elements
                  .filter((e) => e.type === "building")
                  .map((e) => (
                    <g key={e.id} transform={`translate(${e.x},${e.y})`}>
                      <rect
                        width={e.width}
                        height={e.height}
                        rx={8}
                        ry={8}
                        fill={e.fill}
                        onPointerDown={(ev) => {
                          ev.stopPropagation();
                          const pt = getSvgPoint(ev);
                          if (!pt) return;
                          startDrag(e, "move", pt);
                        }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setSelectedId(e.id);
                        }}
                      />
                      <text
                        x={e.width / 2}
                        y={e.height + 14}
                        fontSize={12}
                        fill="#111827"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {truncateText(e.name || "Building", Math.floor(e.width / 8))}
                      </text>
                      {selectedId === e.id && (
                        <rect
                          x={e.width - 10}
                          y={e.height - 10}
                          width={12}
                          height={12}
                          fill="#111827"
                          onPointerDown={(ev) => {
                            ev.stopPropagation();
                            const pt = getSvgPoint(ev);
                            if (!pt) return;
                            startDrag(e, "resize-building", pt);
                          }}
                        />
                      )}
                    </g>
                  ))}
                {elements
                  .filter((e) => e.type === "business")
                  .map((e) => (
                    <g key={e.id} transform={`translate(${e.x},${e.y})`}>
                      <circle
                        r={e.radius}
                        fill={e.fill}
                        onPointerDown={(ev) => {
                          ev.stopPropagation();
                          const pt = getSvgPoint(ev);
                          if (!pt) return;
                          startDrag(e, "move", pt);
                        }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setSelectedId(e.id);
                        }}
                      />
                      <text
                        x={0}
                        y={e.radius + 16}
                        fontSize={12}
                        fill="#111827"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {truncateText(e.name || "Business", Math.floor(e.radius / 3))}
                      </text>
                      {selectedId === e.id && (
                        <circle
                          cx={e.radius}
                          cy={0}
                          r={6}
                          fill="#111827"
                          onPointerDown={(ev) => {
                            ev.stopPropagation();
                            const pt = getSvgPoint(ev);
                            if (!pt) return;
                            startDrag(e, "resize-business", pt);
                          }}
                        />
                      )}
                    </g>
                  ))}
                {roadDraft && (
                  <polyline
                    points={`${roadDraft.start.x},${roadDraft.start.y} ${roadDraft.end.x},${roadDraft.end.y}`}
                    fill="none"
                    stroke="#6b7280"
                    strokeWidth={10}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="12 8"
                  />
                )}
              </g>
            </svg>
          </div>
        </div>
        <div className="rounded-2xl bg-white shadow-sm">
          <div className="space-y-4 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">Inspector</div>
                <div className="text-xs text-slate-500">
                  Edit selected element
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-xl bg-rose-600 px-3 py-2 text-sm text-white disabled:opacity-40"
                  onClick={() => {
                    if (!selectedId) return;
                    setElements(elements.filter((e) => e.id !== selectedId));
                    setSelectedId(null);
                  }}
                  disabled={!selectedId}
                >
                  Delete
                </button>
              </div>
            </div>
            {!selected && (
              <div className="text-sm text-slate-600">
                Select a building, road, or business.
              </div>
            )}
            {selected && (
              <div className="space-y-3">
                <div>
                  <div className="text-xs">Name</div>
                  <input
                    className="w-full rounded-md border px-2 py-1 text-sm"
                    value={selected.name || ""}
                    onChange={(e) =>
                      updateElement(selected.id, { name: e.target.value })
                    }
                  />
                </div>
                {selected.type !== "road" && (
                  <div>
                    <div className="text-xs">Description</div>
                    <input
                      className="w-full rounded-md border px-2 py-1 text-sm"
                      value={selected.description || ""}
                      onChange={(e) =>
                        updateElement(selected.id, {
                          description: e.target.value,
                        })
                      }
                    />
                  </div>
                )}
                {selected.type !== "road" ? (
                  <div>
                    <div className="text-xs">Fill Color</div>
                    <input
                      type="color"
                      className="h-9 w-full rounded-md border"
                      value={selected.fill || "#60a5fa"}
                      onChange={(e) =>
                        updateElement(selected.id, { fill: e.target.value })
                      }
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs">Stroke</div>
                      <input
                        type="color"
                        className="h-9 w-full rounded-md border"
                        value={selected.stroke || "#6b7280"}
                        onChange={(e) =>
                          updateElement(selected.id, { stroke: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <div className="text-xs">Width</div>
                      <input
                        type="number"
                        min={2}
                        max={40}
                        className="w-full rounded-md border px-2 py-1 text-sm"
                        value={selected.strokeWidth || 10}
                        onChange={(e) =>
                          updateElement(selected.id, {
                            strokeWidth: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                )}
                {selected.type === "building" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs">Width</div>
                      <input
                        type="number"
                        min={20}
                        className="w-full rounded-md border px-2 py-1 text-sm"
                        value={selected.width}
                        onChange={(e) =>
                          updateElement(selected.id, {
                            width: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <div className="text-xs">Height</div>
                      <input
                        type="number"
                        min={20}
                        className="w-full rounded-md border px-2 py-1 text-sm"
                        value={selected.height}
                        onChange={(e) =>
                          updateElement(selected.id, {
                            height: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                )}
                {selected.type === "business" && (
                  <div>
                    <div className="text-xs">Radius</div>
                    <input
                      type="number"
                      min={8}
                      className="w-full rounded-md border px-2 py-1 text-sm"
                      value={selected.radius}
                      onChange={(e) =>
                        updateElement(selected.id, {
                          radius: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                )}
              </div>
            )}
            <hr className="my-2" />
            <div className="space-y-2">
              <div className="text-sm font-medium">Tips</div>
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
                <li>Use Pan to move the canvas. Scroll to zoom.</li>
                <li>
                  Use Select to drag items. Drag the small handles to resize.
                </li>
                <li>Everything auto-saves. Use Export/Import for backups.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
