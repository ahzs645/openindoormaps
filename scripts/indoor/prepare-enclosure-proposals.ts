import { readFileSync, writeFileSync } from "node:fs";
import {
  validateEnclosureProposals,
  type EnclosureProposals,
} from "../../app/indoor-project/enclosure-proposals";

const [ledgerPath, auditPath, outputPath] = process.argv.slice(2);
if (!ledgerPath || !auditPath || !outputPath)
  throw new Error(
    "Usage: prepare-enclosure-proposals.ts suggestions.json volume-audit.json output.json",
  );
const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
const audit = JSON.parse(readFileSync(auditPath, "utf8"));
if (
  ledger.datasetSha256 !== audit.datasetSha256 ||
  ledger.modelSha256 !== audit.source.modelSha256
)
  throw new Error(
    "Ledger and audit belong to different model/geometry revisions.",
  );
const groupId = (r: (typeof ledger.records)[number]) =>
  r.details.sharedGroupId ?? r.details.solutionGroup;
// Agent evidence prose occasionally joins a measurement or native ID to a word.
const prose = (value: string) =>
  value
    .replace(/\s*≤\s*/g, " ≤ ")
    .replace(/\b(cap|support|door|wall|slab|within)(?=\d)/gi, "$1 ")
    .replace(/(\d)(ft|sqft)\b/g, "$1 $2")
    .replace(/\s*→\s*/g, " → ");
const proposals: EnclosureProposals = {
  format: "openindoormaps-enclosure-proposals",
  version: 1,
  title: `Enclosure solutions review · ${ledger.date}`,
  modelSha256: ledger.modelSha256,
  evidenceSha256: audit.reviewEvidenceSha256,
  records: ledger.records.map((r: (typeof ledger.records)[number]) => ({
    key: r.key,
    cause: prose(r.probableCause),
    solution: prose(r.suggestedSolution),
    confidence: r.confidence,
    prerequisites: (Array.isArray(r.prerequisites)
      ? r.prerequisites
      : [r.prerequisites]
    ).map(prose),
    relatedKeys: groupId(r)
      ? ledger.records
          .filter(
            (other: typeof r) =>
              other.key !== r.key &&
              other.nativeLevelId === r.nativeLevelId &&
              groupId(other) === groupId(r),
          )
          .map((other: typeof r) => other.key)
      : [],
  })),
};
validateEnclosureProposals(proposals);
writeFileSync(outputPath, JSON.stringify(proposals, null, 2) + "\n");
process.stdout.write(
  `Prepared ${proposals.records.length} evidence-bound proposals.\n`,
);
