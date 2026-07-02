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
    this.adjacencyList.get(from)?.push({ metadata, to, weight });
    this.adjacencyList.get(to)?.push({ metadata, to: from, weight });
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
