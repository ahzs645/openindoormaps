import { Vertex, Edge, RouteEdgeMetadata } from "../types";

export default class Graph {
  adjacencyList: Map<Vertex, Edge[]> = new Map();

  addVertex(Vertex: Vertex) {
    if (!this.adjacencyList.has(Vertex)) {
      this.adjacencyList.set(Vertex, []);
    }
  }

  addEdge(
    from: Vertex,
    to: Vertex,
    weight: number,
    metadata?: RouteEdgeMetadata,
  ) {
    this.addVertex(from);
    this.addVertex(to);

    const direction = metadata?.direction ?? "both";
    if (direction !== "backward") {
      this.adjacencyList.get(from)?.push({ metadata, to, weight });
    }
    if (direction !== "forward") {
      this.adjacencyList.get(to)?.push({ metadata, to: from, weight });
    }
  }

  getEdgeBetween(from: Vertex, to: Vertex): Edge | undefined {
    const edges = this.adjacencyList.get(from);
    if (!edges) return undefined;

    return edges
      .filter((edge) => edge.to === to)
      .sort((a, b) => a.weight - b.weight)[0];
  }

  getVertexs() {
    return [...this.adjacencyList.keys()];
  }

  getEdges(Vertex: Vertex): Edge[] {
    return this.adjacencyList.get(Vertex) || [];
  }

  hasVertex(Vertex: Vertex) {
    return this.adjacencyList.has(Vertex);
  }
}
