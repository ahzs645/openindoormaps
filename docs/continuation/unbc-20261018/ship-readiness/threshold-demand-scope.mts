/** Independent exact scope containment for the retained original census screen.
 * No cached source capability, standing support or clearance is restored. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { projectStatedTwoFootWalkingVolume } from "../../../../../reviter/lib/reviter/native-source-walking-volume.ts";
import { originalTwoFootStandingSquare } from "../../../../../reviter/lib/reviter/native-source-standing-footprint.ts";
import { Rational, rational } from "../../../../../reviter/lib/reviter/native-rational-overlay.ts";
const [contextPath, output] = process.argv.slice(2);
if (!contextPath || !output) throw Error("Usage: threshold-demand-scope.mts RETAINED-CONTEXT.json NEW-REPORT.json");
const bytes = await readFile(contextPath), context = JSON.parse(bytes.toString());
const requests = JSON.parse((await readFile(new URL("../door-threshold-workflow/five-door-proposals.json", import.meta.url))).toString());
const request = requests.proposals.find((p: { nativeDoorElementId: number }) => p.nativeDoorElementId === context.nativeDoorElementId);
const points = request.proposedPointsFeet as [number, number, number][];
const q = ([n, d]: [string, string]) => new Rational(BigInt(n), BigInt(d));
const lo = q(context.thresholdBody.bottomCap.elevationFeet), hi = q(context.thresholdBody.topCap.elevationFeet);
const cmp = (a: Rational, b: Rational) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
const add = (a: Rational, b: Rational) => new Rational(a.n * b.d + b.n * a.d, a.d * b.d);
const demand = projectStatedTwoFootWalkingVolume(points[0]!, points[1]!, lo, hi, 7);
const scope = context.scopeBoundsFeet;
const inside = (p: readonly Rational[]) => ["x", "y"].every((axis, i) => cmp(p[i]!, rational(scope.min[axis])) >= 0 && cmp(p[i]!, rational(scope.max[axis])) <= 0);
const standing = points.map((p) => originalTwoFootStandingSquare([rational(p[0]), rational(p[1])]).flat(2));
const result = { format: "threshold-stated-demand-scope-containment-v1",
  retainedContextSha256: createHash("sha256").update(bytes).digest("hex"),
  driverSha256: createHash("sha256").update(await readFile(new URL(import.meta.url))).digest("hex"),
  nativeDoorElementId: context.nativeDoorElementId, actualScopeBoundsFeet: scope,
  completeConservativeWalkingStripInsideScope: demand.unclippedStatedStripFeet.every(inside),
  bothTwoFootStandingSquaresInsideScope: standing.every((ring) => ring.every(inside)),
  completeFloorToCapPlusSevenFeetInsideScope: cmp(lo, rational(scope.min.z)) >= 0 && cmp(add(hi, rational(7)), rational(scope.max.z)) <= 0,
  originalScopeUnchanged: true, floorSupportApproved: false, standingClearanceApproved: false, routeApproved: false };
if (!result.completeConservativeWalkingStripInsideScope || !result.bothTwoFootStandingSquaresInsideScope || !result.completeFloorToCapPlusSevenFeetInsideScope) throw Error("Original census scope did not contain the whole stated demand");
await writeFile(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(result));
