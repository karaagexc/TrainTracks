# Rail Fare Evidence, 2026-10-09

The adjacent JSON fixture records full directed numerical tables. Its rows and
columns use the displayed operator station order, not the station ID's numeric
suffix. A reverse fare is tested independently; it is never used to generate the
forward fare. A diagonal zero is a test sentinel, not an operator fare quote.

## Primary Sources

- [LRMC fare matrices](https://lrmc.ph/our-business-featured/fare-matrix/): both full-resolution matrices effective April 2, 2025, covering 25 stations from Dr. Santos through Fernando Poe Jr. The displayed SJT/SVC titles identify the medium. Correct IDs are `L1-25` for Dr. Santos and `L1-20` for FPJ; the former concession script reversed/misaligned these identities.
- [LRTA original base matrix](https://www.lrta.gov.ph/wp-content/uploads/2023/08/New-Fare-Matrix.jpg), linked by [the fare-adjustment announcement](https://www.lrta.gov.ph/lrt-2-fare-adjustment/): full 13-station regular SJT and stored-value tables effective August 2, 2023.
- [LRTA 2026 second-edition charter](https://www.lrta.gov.ph/wp-content/uploads/2026/03/Citizens-Charter-Handbook-2026-2nd-Edition.pdf): printed p.9 (PDF page 10), Annex A, has current SJT and SVC matrices effective March 23, 2026; printed p.16 (PDF page 17), Annex B, has the 50% discounted SJT matrix. These pages were rendered and visually inspected.
- [LRTA current tickets and fares](https://www.lrta.gov.ph/tickets-and-fares/): confirms March 23, 2026 relief for all LRT-2/MRT-3 passengers and both blue/white Beep cards. The two April 2026 images linked there independently corroborate Annex A. Recto-Legarda is 8 SJT and 7.50 SVC, including white-card SVC. There is no second percentage discount applied to these published amounts.
- [MRT-3 2026 first-edition charter](https://www.dotrmrt3.gov.ph/dotrmrt3-citizen-charter-handbook-2026-1st-edition.pdf): PDF/printed page 93 (zero-based index 92) has the full regular and all-passenger March 23 tables. The regular minimum is 13; the current published minimum is 6, not 7 or 6.50. The table gives 8/10/12/14 for the other fare bands. This page was rendered and visually inspected.
- [MRT-3 discounted matrix](https://www.dotrmrt3.gov.ph/discounted-fare-matrix.pdf) and [July 2, 2025 student matrix](https://www.dotrmrt3.gov.ph/news/updated-fare-matrix-para-sa-mga-estudyante-sa-single-journey-ticket): all 156 directed concession cells are transcribed, including differences from the old generator at GMA-Boni, Cubao-Shaw, Cubao-Guadalupe, and Cubao-Magallanes. The separate current charter table agrees with these numbers.

The LRMC image filenames are reversed relative to their visible titles in the
retrieved assets: `New-SJT-...png` displays the stored-value matrix, and
`New-SVC-...png` displays the single-journey matrix. Transcription follows the
visible title and cells, not the URL filename. The source hashes below identify
the inspected versions.

## Verified Repair

351 numeric cells changed relative to the original tracked matrix:

| Line / Column | Changed Directed Cells |
| --- | ---: |
| LRT-1 SJT | 15 |
| LRT-1 regular SVC (`BEEP`) | 154 |
| LRT-2 discounted SJT (`CONCESSION`) | 10 |
| MRT-3 regular SVC (`BEEP`) | 156 |
| MRT-3 discounted SJT (`CONCESSION`) | 16 |

The test covers 912 directed nontrivial pairs: 600 LRT-1, 156 LRT-2, and 156
MRT-3. It verifies 2,136 base cells and 2,136 current effective cells. The remaining
600 LRT-1 concession cells are explicitly unverified, not passing numeric claims.
Regular SJT/SVC cells and the verified LRT-2/MRT-3 concession tables are symmetric
after independent transcription and comparison; symmetry was not a repair rule.
MRT-3 relief uses the explicit published bands `13 -> 6`, `16 -> 8`, `20 -> 10`,
`24 -> 12`, `28 -> 14`. It does not use a general rounding assumption; a new
unrecognized band is flagged unverified and is not assigned an invented discount.

`node scripts/fare-verification-smoke.mjs` is isolated from journey tests and
backend credentials. `node scripts/add_concession_fares.js` is now read-only,
reports corrections/gaps, and never evaluates TS source as executable data.
`--patch` emits only verified numeric corrections for review via `apply_patch`.
Unverified, bus, future-line, and cross-line cells are never synthesized.

## Unresolved Policy And Integration

[LRMC's August 13, 2025 announcement](https://lrmc.ph/2025/08/13/lrmc-simplifies-discounted-lrt-1-fares-for-students-senior-citizens-and-pwds/)
confirms a 50% discounted SJT for students, senior citizens, and PWDs. It does not
establish a complete numeric concession matrix, integer rounding for half-peso
amounts, or the equivalent white-card table. A retrieved primary source has not
closed that gap. The old matrix's LRT-1 concession numbers are therefore retained
unchanged and explicitly flagged, despite their suspect station mapping. No new
rounding rule, stacking rule, or white-card equivalence is invented for LRT-1.
F14 is not fully closed until that operator evidence is supplied and reconciled.

`getEffectiveFare` retains its arguments. `EffectiveFare` now adds
`verification: 'verified' | 'unverified'` and `verificationNote: string | null`.
`RAIL_FARE_VERIFICATION_GAPS.LRT1` exports the unresolved reason. Outside current
relief, the legacy concession column identifies discounted SJT, not stored value.
During relief, LRT-2 CONCESSION uses the published blue/white SVC amount and MRT-3
uses the one all-passenger table. Parent owns forwarding verification metadata
into canonical fare quotes/UI and updating integration expectations. Historical
fares before these matrices' effective dates are not modeled by this fixture.

## Inspected Source Hashes

SHA-256 hashes of downloaded source artifacts, identified by displayed title:

| Artifact | SHA-256 |
| --- | --- |
| LRMC stored-value image | `4A5FC751B70197A93209E8BD7E01943CFEE0DA2ACECBE717779ABD7761BFA96B` |
| LRMC single-journey image | `3794E31A599D55D92C525D528CB4DE8533A693212C74BE1C13BC2EFAF38E7CF4` |
| LRTA 2026 second-edition charter | `0455699E0CEC896488BAB0E061B4222309F81A766A03F5DC04FED4E5F6758942` |
| MRT-3 2026 first-edition charter | `240903D638B269FC86881C56C7DB5CAE674E5BDF959433993FFED2A4FDA66C87` |

Read-only downloaded PDFs/images and inspection crops are under
`tmp/pdfs/fare-verification/`. The JSON fixture, not those temporary downloads,
is the regression input. No bus changes, commits, deployments, or backend writes
were made by this fare task.
