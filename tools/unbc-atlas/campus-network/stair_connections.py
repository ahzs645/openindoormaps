"""Reconcile native stair geometry, directional field evidence and the actual public graph."""
from collections import Counter, defaultdict
import csv
import json
import heapq
from math import dist, isclose
import mmap


def read_stair_inputs(path):
    """Decode only the export sections needed for a standalone stair rebuild when msgspec is available."""
    try:
        import msgspec
    except ImportError:
        with path.open("rb") as stream:
            return json.load(stream)

    class Room(msgspec.Struct):
        key: str
        building: str
        number: str
        name: str
        stair: bool = False
        circulation: bool = False

    class StairInputs(msgspec.Struct):
        source: dict
        nativeLevels: list
        walkingSupport: dict
        stairDisplay: dict
        records: list[Room]
        nodes: list
        edges: list
        doors: list

    with path.open("rb") as stream, mmap.mmap(stream.fileno(), 0, access=mmap.ACCESS_READ) as buffer:
        data = msgspec.structs.asdict(msgspec.json.decode(buffer, type=StairInputs))
    data["records"] = [msgspec.structs.asdict(r) for r in data["records"]]
    return data


def matching_levels(height, levels):
    # Native run elevations are in feet; the export rounds some to four decimals.
    return [level["id"] for level in levels
            if isclose(level["elevationFeet"], height, abs_tol=0.0001, rel_tol=0)]


def terminal_runs(flight, levels):
    runs = flight.get("runs", [])
    if not runs:
        return []
    by_run = defaultdict(list)
    for tread in flight.get("treads", []):
        if len(tread.get("ringFeet", [])) >= 3:
            by_run[tread.get("runElementId")].append(tread)
    result = []
    for side, field, outer in (("lower", "bottomElevationFeet", min), ("upper", "topElevationFeet", max)):
        measured = [run for run in runs if run.get(field) is not None]
        if not measured:
            continue
        height = outer(run[field] for run in measured)
        for run in sorted(measured, key=lambda r:r["runElementId"]):
            if abs(run[field] - height) > 0.0001:
                continue
            treads = by_run[run["runElementId"]]
            tread_height = outer(t["elevationFeet"] for t in treads) if treads else None
            # Keep all measured pieces at the terminal tread, including curved/split rings.
            rings = [t["ringFeet"] for t in treads if abs(t["elevationFeet"] - tread_height) <= 0.0001]
            result.append(dict(side=side, runId=run["runElementId"], elevationFeet=height,
                               levels=matching_levels(height, levels), treadElevationFeet=tread_height,
                               treadRings=rings))
    return result


def end_identity(end):
    return {"building":end["b"], "room":end["room"], "level":end["logical"]}


def source_approaches(data):
    """Index original same-level incidents and stair-room doors without snapping to a line."""
    nodes = {n["id"]:n for n in data["nodes"]}
    rooms = {r["key"]:r for r in data["records"]}
    incident = defaultdict(list)
    for edge in data["edges"]:
        if edge["kind"] not in ("walk", "door", "opening") or not edge.get("enabled"):
            continue
        a, b = (nodes[k] for k in (edge["from"],edge["to"]))
        if a["levelId"] == b["levelId"] and abs(a["pointFeet"][2] - b["pointFeet"][2]) < 0.0001:
            incident[a["id"]].append(edge["id"])
            incident[b["id"]].append(edge["id"])
    room_doors = defaultdict(list)
    for door in data["doors"]:
        for key in door.get("roomKeys", []):
            neighbors = sorted({rooms[n]["number"] or rooms[n]["name"] for n in door["roomKeys"] if n != key and n in rooms})
            room_doors[key].append({"door":door["id"],"association":door.get("state"),"neighbors":neighbors})
    return nodes, incident, room_doors


def stair_report(data, transfers, byedge, receipt, observations, history):
    flights = {f["stairElementId"]:f for f in data["stairDisplay"]["sourceFlights"]}
    result = []
    applied = set()
    nodes, incident, room_doors = source_approaches(data)
    for transfer in sorted(transfers.values(), key=lambda t:(str(t["native"]),t["key"])):
        if transfer["type"] not in ("Stair", "Local steps"):
            continue
        native = transfer["native"]
        flight = flights.get(native, {})
        runs = sorted({r["runElementId"] for r in flight.get("runs", [])})
        ends = {e["node"]:e for e in transfer["ends"]}
        approaches = []
        for node_id, end in ends.items():
            node = nodes[node_id]
            approaches.append(dict(node=node_id, room=end["room"], roomKey=node["roomKey"], level=end["l"],
                                   sourceEdges=sorted(incident[node_id]),
                                   roomDoors=sorted(room_doors[node["roomKey"]], key=lambda d:d["door"]),
                                   reachableOrigins=end["in"], reachableDestinations=end["out"]))
        directions = []
        for a, b in transfer["pairs"]:
            # The transfer key is the source edge (a local-step connector may have an alias).
            for first, last in ((a,b), (b,a)):
                frm, to = ends[first], ends[last]
                vertices = tuple(json.dumps([x], separators=(",",":")) for x in (first,last))
                admitted = any((edge["f"],edge["t"]) == vertices for edge in byedge.get(transfer["key"], []))
                field_notes = []
                for i, obs in enumerate(observations):
                    if (obs["modelSha256"] == data["source"]["modelSha256"] and obs["nativeStair"] == native
                            and sorted(obs["nativeRuns"]) == runs and obs["from"] == end_identity(frm)
                            and obs["to"] == end_identity(to)):
                        field_notes.append(obs["description"])
                        applied.add(i)
                directions.append(dict(fromRoom=frm["room"], fromLevel=frm["l"], toRoom=to["room"],
                                       toLevel=to["l"], reachableOrigins=frm["in"], reachableDestinations=to["out"],
                                       graphAllowsFlight=admitted, fieldNotes=field_notes,
                                       connectedToRooms=bool(admitted and frm["in"] and to["out"])))
        terminals = terminal_runs(flight, data["nativeLevels"])
        result.append(dict(nativeStair=native, key=transfer["key"], buildings=transfer["b"],
                           status=transfer["status"], nativeRuns=runs, terminals=terminals, directions=directions, approaches=approaches,
                           lastSourceCheck=(history.get(native) or {}).get("Last detailed source check",""),
                           followUp=transfer["reason"]))
        transfer["stairCheck"] = {"terminals": terminals, "directions": directions}
    checked = {r["nativeStair"] for r in result}
    if checked != set(flights):
        raise ValueError(f"Mismatch between the native stair inventory and transfer records: {checked ^ set(flights)}")
    return dict(modelSha256=data["source"]["modelSha256"], datasetSha256=receipt["datasetSha256"],
                runtimeSha256=receipt["runtimeSha256"], nativeStairs=len(checked),
                statusCounts=dict(Counter(r["status"] for r in result)),
                unappliedObservations=[v for i,v in enumerate(observations) if i not in applied], stairs=result)


def add_approach_examples(report, transfers, arcs, records, rooms, stops):
    """Find an actual directed walk from a numbered destination's hallway stop to each landing."""
    outgoing = defaultdict(list)
    for arc in arcs:
        if (arc["k"] not in ("walk", "door", "opening") or not arc["p"]
                or any(abs(p[2]-arc["p"][0][2]) > 0.0001 for p in arc["p"])):
            continue
        length = sum(dist(a,b) for a,b in zip(arc["p"],arc["p"][1:]))
        outgoing[arc["f"]].append((arc, length))
    best = {}
    previous = {}
    queue = []
    for key in sorted(rooms):
        room = records[key]
        start = stops[key]["departVertex"]
        if start and room["number"] and not room.get("stair") and not room.get("circulation"):
            cost = (0.0, key)
            if start not in best or cost < best[start]:
                best[start] = cost
                heapq.heappush(queue, (*cost, start))
    while queue:
        distance, key, v = heapq.heappop(queue)
        if best[v] != (distance,key):
            continue
        for arc, length in outgoing.get(v, ()):
            next_v = arc["t"]
            cost = (distance+length, key)
            if next_v in best and best[next_v] <= cost:
                continue
            best[next_v] = cost
            previous[next_v] = arc
            heapq.heappush(queue, (*cost,next_v))
    for stair in report["stairs"]:
        examples = []
        for approach in stair["approaches"]:
            original = json.dumps([approach["node"]],separators=(",",":"))
            targets = [(original, "flight landing")]
            stop = stops.get(approach["roomKey"])
            if stop and stop.get("arrive") and stop.get("arriveVertex") != original:
                if stop["arrive"]["levelId"] == approach["level"]:
                    identity = stop["arrive"].get("terminalNodeId")
                    named_foot = any(identity == f"landing:{stair['nativeStair']}:{t['runId']}:{t['side']}"
                                     and approach["level"] in t["levels"] for t in stair["terminals"])
                    targets.append((stop["arriveVertex"], "stair foot" if named_foot else "directory stop"))
            for target, kind in targets:
                if target not in best or best[target][0] == 0:
                    continue
                length, key = best[target]
                path, v = [], target
                while v != stops[key]["departVertex"]:
                    arc = previous[v]
                    path.append(arc)
                    v = arc["f"]
                path.reverse()
                # Display each original arc separately. Never draw a shortcut at a source seam.
                trace = dict(room=records[key]["number"], roomKey=key, landing=approach["room"], target=kind,
                             level=approach["level"], graphMetres=round(length*0.3048,3),
                             parts=[[p[:2] for p in arc["p"]] for arc in path if len(arc["p"])>1])
                field = "example" if kind=="flight landing" else "directoryExample"
                approach[field] = dict(**trace, edges=[arc["e"] for arc in path])
                if kind=="flight landing" or not approach.get("example"):
                    examples.append(trace)
        transfers[stair["key"]]["stairCheck"]["examples"] = examples


def write_report(folder, report, names):
    (folder/"stair-connections.json").write_text(json.dumps(report, indent=2, allow_nan=False)+"\n")
    with (folder/"stair-connections.csv").open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["native_stair","buildings","status","native_runs","from","from_floor","to","to_floor",
                         "origins_at_start_on_foot","destinations_at_exit_on_foot","flight_in_public_graph",
                         "room_approach_and_exit","field_observation","source_follow_up",
                         "lower_run_level_matches","upper_run_level_matches",
                         "same_floor_example_origin","same_floor_example_target_at_start","same_floor_example_metres"])
        for stair in report["stairs"]:
            floor_matches = [", ".join(sorted({names[level] for t in stair["terminals"] if t["side"] == side
                                              for level in t["levels"]})) for side in ("lower","upper")]
            base = [stair["nativeStair"], "+".join(stair["buildings"]), stair["status"], ",".join(map(str,stair["nativeRuns"]))]
            examples = {}
            for approach in stair["approaches"]:
                example = approach.get("example") or approach.get("directoryExample")
                if example:
                    examples[(approach["room"], approach["level"])] = example
            for d in stair["directions"] or [None]:
                fields = [d["fromRoom"],names[d["fromLevel"]],d["toRoom"],names[d["toLevel"]],
                          d["reachableOrigins"],d["reachableDestinations"],d["graphAllowsFlight"],
                          d["connectedToRooms"]," ".join(d["fieldNotes"])] if d else [""] * 9
                example = examples.get((d["fromRoom"], d["fromLevel"])) if d else None
                approach_fields = [example["room"], example["target"], example["graphMetres"]] if example else [""] * 3
                writer.writerow([*base,*fields,stair["followUp"],*floor_matches,*approach_fields])
