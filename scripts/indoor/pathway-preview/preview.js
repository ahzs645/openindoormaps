/* This viewer consumes the production display export. It never builds a graph
 * or connects endpoints from coordinates. Native source feet are not rounded. */
(() => {
  const $ = (id) => document.querySelector(`#${id}`);
  const svg = $("map");
  const state = {
    index: null,
    level: null,
    view: [0, 0, 100, 100],
    selected: null,
    features: [],
    request: 0,
    drag: null,
  };
  const ns = "http://www.w3.org/2000/svg";
  const el = (tag, attributes) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes))
      node.setAttribute(key, String(value));
    return node;
  };
  const linePath = (points) =>
    points
      .map((point, i) => `${i ? "L" : "M"}${point[0]},${-point[1]}`)
      .join(" ");
  const ringsPath = (rings) =>
    rings.map((ring) => `${linePath(ring)} Z`).join(" ");
  const json = async (url) => {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Could not load ${url}: HTTP ${response.status}`);
    return response.json();
  };
  function pointsOf(feature) {
    return feature.geometry.type === "Point"
      ? [feature.properties.pointFeet]
      : feature.properties.pointsFeet;
  }
  function setView(view) {
    state.view = view;
    svg.setAttribute("viewBox", view.join(" "));
    renderSelection();
    const radius = (view[2] / Math.max(svg.clientWidth, 1)) * 4;
    for (const circle of $("network").querySelectorAll("circle"))
      circle.setAttribute("r", String(radius));
  }
  function fit(points) {
    if (points.length === 0) {
      setView([0, 0, 100, 100]);
      return;
    }
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point[0]);
      maxX = Math.max(maxX, point[0]);
      minY = Math.min(minY, -point[1]);
      maxY = Math.max(maxY, -point[1]);
    }
    const aspect = svg.clientWidth / Math.max(svg.clientHeight, 1);
    const h = Math.max(
        25,
        (maxY - minY) * 1.16,
        ((maxX - minX) * 1.16) / aspect,
      ),
      w = h * aspect;
    setView([(minX + maxX - w) / 2, (minY + maxY - h) / 2, w, h]);
  }
  function fitLevel() {
    if (!state.level) return;
    const building = $("building").value;
    const rooms = state.level.rooms.filter(
      (room) => building === "all" || room.building === building,
    );
    const points =
      building === "all"
        ? [
            ...state.level.cells.flatMap((cell) => cell.ringsFeet.flat()),
            ...state.features.flatMap((feature) => pointsOf(feature)),
          ]
        : rooms.flatMap((room) => room.ringsFeet.flat());
    fit(
      points.length > 0
        ? points
        : rooms.flatMap((room) => room.ringsFeet.flat()),
    );
  }
  function featureClass(feature) {
    const p = feature.properties;
    if (p.role === "held" || p.role === "gap") return p.role;
    if (p.source === "shared-guide")
      return `shared ${p.role === "approach" ? "approach" : ""}`;
    if (p.source === "saved-walk") return "fallback";
    if (
      ["stairs", "local-steps", "ramp", "elevator", "escalator"].includes(
        p.kind,
      )
    )
      return "transition";
    return "passage";
  }
  function diagnosticFeatures() {
    return state.level.doorDiagnostics.map((door) => ({
      geometry: { type: "Point" },
      properties: {
        role: "gap",
        kind: "door",
        source: "original-door-display",
        nativeElementId: door.nativeElementId,
        sourceDoorId: door.id,
        sourceDoorState: door.state,
        sourceDoorPointFeet: door.pointFeet,
        pointFeet: [...door.pointFeet, state.level.level.elevationFeet],
        elevationSource: "declared-display-level",
        levelId: door.levelId,
        roomKeys: door.roomKeys,
        edgeIds: [],
        routingEdgeCreated: false,
        label: `${door.state === "unmatched" ? "Unmatched" : "Ambiguous"} door · ${door.nativeElementId}`,
      },
    }));
  }
  function render() {
    const level = state.level;
    $("context").replaceChildren();
    for (const room of level.rooms)
      $("context").append(
        el("path", {
          d: ringsPath(room.ringsFeet),
          class: `context-room ${room.access === "staff" ? "staff" : ""}`,
          "fill-rule": "evenodd",
        }),
      );
    for (const cell of level.cells)
      $("context").append(
        el("path", {
          d: ringsPath(cell.ringsFeet),
          class: "context-cell",
          "fill-rule": "evenodd",
        }),
      );
    const sharedOnly = $("mode").value === "guides";
    state.features = sharedOnly
      ? level.network.hallwayPaths.features.filter(
          (feature) => feature.properties.source === "shared-guide",
        )
      : [
          ...level.network.hallwayPaths.features,
          ...level.network.pathConnections.features,
          ...diagnosticFeatures(),
        ];
    $("network").replaceChildren();
    for (const [i, feature] of state.features.entries()) {
      const points = pointsOf(feature);
      const attributes = {
        "data-feature": i,
        "data-edge": feature.properties.edgeId ?? "",
        class: `${feature.geometry.type === "Point" ? "network-point" : "network-line"} ${featureClass(feature)}`,
      };
      const node =
        feature.geometry.type === "Point"
          ? el("circle", {
              ...attributes,
              cx: points[0][0],
              cy: -points[0][1],
              r: 4,
            })
          : el("path", { ...attributes, d: linePath(points) });
      const title = el("title", {});
      title.textContent =
        feature.properties.label ??
        feature.properties.edgeId ??
        feature.properties.nodeId;
      node.append(title);
      $("network").append(node);
    }
    const summary = level.summary;
    $("counts").textContent =
      `${summary.sharedGuideSegments} shared segments · ${summary.savedWalkSegments} saved walk segments · ${summary.connectionLines} connection lines · ${summary.connectionMarkers} stops / gaps · ${summary.unresolvedDoorMarkers} unresolved doors`;
    $("message").textContent = levelMessage(level, sharedOnly);
    setView(state.view);
  }
  function levelMessage(level, sharedOnly) {
    if (sharedOnly)
      return level.summary.sharedGuideSegments
        ? "Guide-only comparison omits original thresholds, fallbacks and floor changes."
        : "This source has no accepted shared guides. Choose Complete saved network to inspect its original paths.";
    if (level.summary.sourceEdges > 0) return "";
    return level.doorDiagnostics.length > 0
      ? "No saved walking network on this physical level; unresolved original doors are marked."
      : "No saved network is displayed on this declared physical level.";
  }
  function renderSelection() {
    $("selection").replaceChildren();
    if (!state.selected) return;
    const points = pointsOf(state.selected);
    $("selection").append(
      state.selected.geometry.type === "Point"
        ? el("circle", {
            cx: points[0][0],
            cy: -points[0][1],
            r: (state.view[2] / Math.max(svg.clientWidth, 1)) * 7,
            class: "selected-point",
          })
        : el("path", { d: linePath(points), class: "selected-line" }),
    );
  }
  function select(feature, focus = false) {
    state.selected = feature;
    const ids = feature.properties.edgeIds ?? [feature.properties.edgeId];
    const sourceEdges = state.level.sourceEdges.filter((edge) =>
      ids.includes(edge.id),
    );
    $("selection-help").textContent =
      feature.properties.label ??
      feature.properties.edgeId ??
      feature.properties.nodeId;
    $("details").textContent = JSON.stringify(
      {
        display: feature.properties,
        sourceEdges,
        routeQualification: "not-performed-by-this-preview",
      },
      null,
      2,
    );
    if (focus) fit(pointsOf(feature));
    else renderSelection();
  }
  async function load(id) {
    const request = ++state.request;
    const meta = state.index.levels.find(
      (level) => String(level.id) === String(id),
    );
    $("message").textContent = "Loading saved source display…";
    try {
      const result = await json(`data/${meta.url}`);
      if (request !== state.request) return;
      state.level = result;
      state.selected = null;
      svg.setAttribute(
        "aria-label",
        `Native source pathway map · ${meta.name} · ${meta.elevationFeet} feet`,
      );
      $("details").textContent = "";
      $("selection-help").textContent =
        "Click a path or stop, or search its original ID.";
      $("building").replaceChildren(new Option("All buildings", "all"));
      for (const building of [
        ...new Set(result.rooms.map((room) => room.building)),
      ]
        .filter(Boolean)
        .sort())
        $("building").add(new Option(`Building ${building}`, building));
      render();
      fitLevel();
    } catch (error) {
      if (request !== state.request) return;
      $("message").textContent = error.message;
    }
  }
  $("controls").addEventListener("submit", (event) => {
    event.preventDefault();
    const query = $("edge").value.trim();
    if (!query || !state.level) return;
    const features = [
      ...state.level.network.hallwayPaths.features,
      ...state.level.network.pathConnections.features,
      ...diagnosticFeatures(),
    ];
    const match =
      features.find(
        (feature) =>
          String(feature.properties.nativeElementId ?? "") === query ||
          (feature.properties.edgeIds ?? [feature.properties.edgeId]).includes(
            query,
          ),
      ) ??
      features.find((feature) =>
        (feature.properties.edgeIds ?? [feature.properties.edgeId]).some((id) =>
          id?.includes(query),
        ),
      );
    if (!match) {
      $("message").textContent =
        "No displayed source edge matches this ID on the selected level.";
      return;
    }
    $("mode").value = "complete";
    render();
    select(match, true);
  });
  $("level").addEventListener("change", () => load($("level").value));
  $("mode").addEventListener("change", () => {
    state.selected = null;
    $("details").textContent = "";
    $("selection-help").textContent =
      "Click a path or stop, or search its original ID.";
    render();
  });
  $("building").addEventListener("change", fitLevel);
  $("fit").addEventListener("click", fitLevel);
  function zoom(factor) {
    const [x, y, w, h] = state.view;
    if (w * factor < 1 || w * factor > 20_000) return;
    setView([
      x + (w * (1 - factor)) / 2,
      y + (h * (1 - factor)) / 2,
      w * factor,
      h * factor,
    ]);
  }
  $("zoom-in").addEventListener("click", () => zoom(0.7));
  $("zoom-out").addEventListener("click", () => zoom(1.4));
  svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoom(event.deltaY > 0 ? 1.15 : 0.87);
    },
    { passive: false },
  );
  svg.addEventListener("pointerdown", (event) => {
    if (event.button > 0) return;
    state.drag = {
      x: event.clientX,
      y: event.clientY,
      view: [...state.view],
      feature: event.target
        .closest("[data-feature]")
        ?.getAttribute("data-feature"),
      moved: false,
    };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener("pointermove", (event) => {
    const drag = state.drag;
    if (!drag) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) {
      svg.classList.add("dragging");
      setView([
        drag.view[0] - (dx / svg.clientWidth) * drag.view[2],
        drag.view[1] - (dy / svg.clientHeight) * drag.view[3],
        drag.view[2],
        drag.view[3],
      ]);
    }
  });
  svg.addEventListener("pointerup", (event) => {
    const drag = state.drag;
    state.drag = null;
    svg.classList.remove("dragging");
    if (svg.hasPointerCapture(event.pointerId))
      svg.releasePointerCapture(event.pointerId);
    if (drag && !drag.moved && drag.feature != null)
      select(state.features[Number(drag.feature)]);
  });
  svg.addEventListener("pointercancel", () => {
    state.drag = null;
    svg.classList.remove("dragging");
  });
  svg.addEventListener("keydown", (event) => {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoom(0.7);
    }
    if (event.key === "-") {
      event.preventDefault();
      zoom(1.4);
    }
  });
  new ResizeObserver(() => {
    const [x, y, w, h] = state.view;
    const nextW = (h * svg.clientWidth) / Math.max(svg.clientHeight, 1);
    setView([x + (w - nextW) / 2, y, nextW, h]);
  }).observe(svg);
  async function boot() {
    try {
      state.index = await json("data/index.json");
      if (state.index.guideExperiment) {
        const experiment = state.index.guideExperiment;
        $("experiment").hidden = false;
        $("experiment").textContent =
          `Local guide experiment: ${experiment.boundGuideCount} guides across ${experiment.nativeCellIds.length} native cells. Other areas show their saved paths.`;
      }
      for (const level of state.index.levels)
        $("level").add(
          new Option(
            `${level.name} · ${Number(level.elevationFeet.toFixed(3))} ft`,
            level.id,
          ),
        );
      $("source").textContent = JSON.stringify(
        {
          inputSha256: state.index.sourceInputSha256,
          modelSha256: state.index.sourceModelSha256,
          implementation: state.index.implementation,
          guideExperiment: state.index.guideExperiment,
          sourceUnchanged: state.index.sourceUnchanged,
          limitations: state.index.limitations,
        },
        null,
        2,
      );
      const first =
        state.index.levels.find((level) => level.sourceEdges > 0) ??
        state.index.levels[0];
      if (!first) throw new Error("This dataset declares no native levels.");
      $("level").value = String(first.id);
      await load(first.id);
    } catch (error) {
      $("message").textContent = error.message;
    }
  }
  boot();
})();
