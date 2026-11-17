# Rebuild from main — November 17, 2026

The first run after the owner's decisions of November 17
([Reviter OWNER-DECISIONS.md](../../../../../reviter/docs/continuation/unbc-20261117/OWNER-DECISIONS.md)).
It answers D12 (rebuild from `main`) and D10 (faster arithmetic in both
repositories). **Not run yet.** Heavy processing runs on Google Colab, started
by the owner from a local chat.

## What this run changes, and what it does not

Same inputs and reviews as the November 17 "A" run, so the result can be
compared with it directly. Only the code changes:

| | November 17 "A" run | This run |
| --- | --- | --- |
| openindoormaps | `7c27b67` + 3 patches | branch `claude/exciting-brown-u1petk` (`main` + the two producer commits + faster arithmetic) |
| Reviter | `cb140e46` + 4 patches | branch `claude/exciting-brown-u1petk` (`main` + r0004 + faster arithmetic) |
| Inputs, gap patches, door reviews | as recorded | identical |

What the branch holds on top of `main`:

- openindoormaps: `0fc7afd`, `7c06daf` (the door-scoped owner review, from
  `unbc/producer-native-door-owners`), `386748f` (export progress lines),
  `c5cef94` (faster exact arithmetic) and `aca2f54` (the correction below).
- Reviter: `9bb1739` (r0004, door-scoped owner review in the compile),
  `f6576a2` (faster exact arithmetic) and `fd6d770` (the same correction).

**Commits to run** (code only; later commits on the branch are documents):

```sh
bash /content/upload/setup.sh aca2f549407920d33110333752a08b87e0c2321b fd6d77073a880064dc77229c83a69b6d49ac790d
```

**Arithmetic correction.** The faster arithmetic (D10) failed three
openindoormaps tests when moved onto `main`:

1. It used `Math.log2`, which the runtime determinism rule forbids. It now reads
   the exponent from the IEEE bits, which is exact.
2. It trusted a number's original IEEE value and its cached approximation even
   after a caller edited the number in place, so an edited value could take a
   wrong fast path (seen as a `SweepLine` failure). Both are now trusted only
   while the value is unchanged since construction.

Both copies of the module stay byte-identical. The three runtime fingerprints
were regenerated with their writer scripts. Exactness of results is unchanged:
the fast paths only decide cases they can prove, and everything else falls to
exact arithmetic as before.

## Expected result

The same as "A" (`A-master-0388.zip`, `f554adc0…`): standard acceptance 33/33,
vestibule cases 11/11 (`ROUTE-CASES-VESTIBULES-A.json`, which already expects
06-313 and 06-207 to be refused). A difference is a finding about the switch to
`main`, not a failure to hide: record it before any later change is added.

Rebuild time should be close to the 143 minutes measured with the faster
arithmetic, plus a faster link step (about 21 instead of 33 minutes).

## Run it (owner, from a local chat)

1. On Colab, start a G4 session (`colab new -s mainrb --gpu G4`). Upload
   `applied-gap-patches-73a765e9.zip` to `/content/upload/` (in Drive under
   `UNBC-sliver-contacts/upload`; split into 24 MB parts and join on the VM,
   as in the November 17 handoff).
2. Copy this folder to `/content/upload/` and run the `setup.sh` line under
   "Commits to run" above.
3. `python3 -I /content/upload/launch.py`. Watch `/content/unbc/run.out` and
   download `compile-result-*.tar.gz` as soon as it appears.
4. `bash /content/upload/jobb.sh main1 /content/unbc/run/output/UNBC.master.reviter.zip`,
   then download `/content/jobb/main1/` (master, guides, acceptance reports,
   preview, visitor package).
5. Stop the session: `colab stop -s mainrb`.

The Colab notes in the Reviter
[November 17 handoff](../../../../../reviter/docs/continuation/unbc-20261117/HANDOFF.md#running-on-colab)
still apply: sessions end after about 6.5 hours, `exec` can hang (start jobs
detached), uploads over 24 MB must be split.

## After this run: the remaining decisions

Each item below needs code or review data that is not in this run. The order
keeps one change per rebuild where possible, so a difference can be traced.

| # | Decision | What is known (November 17) | Work |
| --- | --- | --- | --- |
| D6 | Door 2315416 into 08-316 | 08-316 is a **Corridor** (`rm-400176-e6668d178587`, level 400176). The door has no graph node and no owner. The native-cell owner review re-derives pairs with a 2 ft limit; this door is 2.962 ft from its nearest owner, so that review would refuse it. | An explicit owner pair (08-360 Link `rm-400176-a4b94b10b2f8` ↔ 08-316) that takes precedence over matching, as r0003 allows. |
| D1 | 06-207: open bay to 06-210, and an entrance from outside | No door element in wall 1327847. 06-207 `rm-694-0e3aecab6512`, 06-210 `rm-694-0e0ebcab64ec`. | A reviewed opening without a door element (the drawn-door review needs DWG evidence; this one rests on the owner's answer). |
| D2 | 07-305 suite through the gap between doors 1732467 and 1715768 | Both doors unmatched, no graph nodes. 1732467 belongs to 07-304 Corridor `rm-311-47f103792aec`, 1715768 to `rm-311-8b32069a6165`. | Door-scoped owner reviews for both doors, then a check that the area between them is walkable. |
| D4 | Walk through 06-372 Reception and 06-376 Open Work Area | `rm-1487353-c756fbebb3cf`, `rm-1487353-c015ccebb019`. Through-navigation is a geometry-bound `throughNavigationReview` on the record. | A small tool to add the review to a compiled master, then guides again. |
| D5 | Rotunda is circulation; 04-256/04-257 enclosed | 04-259 `rm-694-07de695d7751` (also 04-124, 04-329, 04-445). Marking `circulation` alone was refused on Oct 31 as an unreviewed edit. | A reviewed circulation decision for the four Rotunda records; the office boundary as a separate boundary review. |
| D9 | One tolerance rule | The November 5 rule closes wall-to-wall slivers (barriers). 10-1300 needs the opposite: a 2.8e-11 ft gap between two walkable pieces bridged. One stated 1e-7 ft tolerance can cover both, in the compiler and the app. The November 5 run stopped at room 09-S302. | New compiler and app code with tests, then its own rebuild. |
| D11 | Link inside the rebuild; per-level mapping | The link step is `add-reviewed-circulation-link.ts` after the rebuild; the export spends 77 % in `compileNativeExploreMapping`, one level at a time. | Code. |
| D8 | Step-free: doors fine, ramps vs stairs | Every edge is `accessible: unknown`. | Owner reading to confirm before any step-free claim is published. |
| D13 | Accept 8 longer routes | `rebase-expectations.py` only allows shorter distances. | Rebase the eight 06-364 ↔ 06-397/06-398 cases when the policy matrix is rerun on the new master. |
| D3, D7 | Staff-only booth; stairs held | No compile change. | — |
