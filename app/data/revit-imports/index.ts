import type { RevitImportFixture } from "~/types/revit-import";
import ahszRevitImport from "./ahsz";

const revitImports: Record<string, RevitImportFixture> = {
  [ahszRevitImport.id]: ahszRevitImport,
};

export default revitImports;
