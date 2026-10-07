import type { IndoorDataset } from './contract';
import { pinRecommendationGeometryHash } from './pin-recommendations';
const worker = globalThis as unknown as { onmessage: (e: MessageEvent<IndoorDataset>) => void; postMessage: (value: unknown) => void };
worker.onmessage = ({ data }) => { void pinRecommendationGeometryHash(data).then(geometrySha256 => worker.postMessage({ geometrySha256 })); };
