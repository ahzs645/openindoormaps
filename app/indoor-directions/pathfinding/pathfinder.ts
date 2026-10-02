import { Edge, PathfindingOptions, Vertex } from "../types";
import Graph from "./graph";

/** Min-heap of [distance, vertex] for Dijkstra. */
class DistanceHeap {
  private items: [number, Vertex][] = [];

  get size() {
    return this.items.length;
  }

  push(item: [number, Vertex]) {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent][0] <= items[i][0]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop(): [number, Vertex] | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < items.length && items[left][0] < items[smallest][0]) {
          smallest = left;
        }
        if (right < items.length && items[right][0] < items[smallest][0]) {
          smallest = right;
        }
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

export default class Pathfinder {
  private graph: Graph;
  //TODO: private options;

  constructor(graph?: Graph) {
    this.graph = graph ?? new Graph();
  }

  public dijkstra(
    start: Vertex | GeoJSON.Position,
    end: Vertex | GeoJSON.Position,
    options: PathfindingOptions = {},
  ): GeoJSON.Position[] {
    start = JSON.stringify(start);
    end = JSON.stringify(end);

    start = this.validateVertex(start);
    end = this.validateVertex(end);

    // Binary heap with lazy deletion: O(E log V), which matters on
    // campus-sized graphs (thousands of vertices).
    const distances = new Map<Vertex, number>([[start, 0]]);
    const previous = new Map<Vertex, Vertex>();
    const queue = new DistanceHeap();
    queue.push([0, start]);

    while (queue.size > 0) {
      const [distance, current] = queue.pop()!;
      if (current === end) break;
      if (distance > (distances.get(current) ?? Infinity)) continue;

      this.graph.getEdges(current).forEach((edge) => {
        if (!this.canUseEdge(edge, options)) return;

        const { to, weight } = edge;
        const alt = distance + weight;
        if (alt < (distances.get(to) ?? Infinity)) {
          distances.set(to, alt);
          previous.set(to, current);
          queue.push([alt, to]);
        }
      });
    }

    if (!distances.has(end)) {
      throw new Error("No accessible indoor route found between waypoints.");
    }

    const path: Vertex[] = [];
    let current: Vertex | undefined = end;
    while (current !== undefined) {
      path.unshift(current);
      current = previous.get(current);
    }

    const pathCoords = path.map((coord) => JSON.parse(coord));

    return pathCoords;
  }

  private validateVertex(position: Vertex): Vertex {
    if (this.graph.hasVertex(position)) {
      return position;
    } else {
      throw new Error(`Vertex not found in navigation graph: ${position}`);
    }
  }

  private canUseEdge(edge: Edge, options: PathfindingOptions) {
    if (!options.accessibleOnly) return true;
    return edge.metadata?.is_accessible !== false;
  }

  public setGraph(graph: Graph) {
    this.graph = graph;
  }
}
