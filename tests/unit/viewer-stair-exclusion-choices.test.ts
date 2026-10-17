import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { arrivalFixture } from "../fixtures/route-endpoint-fixture";
import {
  StairExclusionSettings,
  stairExclusionChoices,
} from "../../app/indoor-project/stair-exclusions";

test("a saved exclusion missing from displayed source stairs remains individually reversible", () => {
  const data = arrivalFixture(),
    ids = [1842431, 1460777];
  const before = JSON.stringify(data);
  assert.deepEqual(stairExclusionChoices(data, ids), [
    { stairElementId: 1842431, label: "not in displayed stair inventory" },
    { stairElementId: 1460777, label: "not in displayed stair inventory" },
  ]);
  const html = renderToStaticMarkup(
    createElement(StairExclusionSettings, {
      data,
      ids,
      onChange: () => {},
    }),
  );
  for (const id of ids) {
    assert.ok(html.includes(`aria-label="Exclude staircase #${id}"`));
  }
  assert.equal((html.match(/checked=""/g) ?? []).length, 2);
  assert.equal(
    (html.match(/not in displayed stair inventory/g) ?? []).length,
    2,
  );
  assert.equal(JSON.stringify(data), before);
  assert.equal(
    stairExclusionChoices(
      data,
      ids.filter((id) => id !== 1460777),
    ).some((row) => row.stairElementId === 1460777),
    false,
  );
});
