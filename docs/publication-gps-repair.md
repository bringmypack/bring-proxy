# Publication GPS repair

Status: deployed to original Apps Script HTTP service version 62 on 2026-10-21 at 10:12 Europe/Paris; live row 27 repaired and reread successfully. Deployment ID, URL and access settings preserved.

Before repair, the confirmed GP row (27) retained Paris 18ème and Scat Urbam, but F/G and I/J were blank and AI/AJ indicated A_VERIFIER. Publication already calls the existing Google Maps API key through fbImportGeocode_. The original validator compared literal input tokens against formatted_address only. Google may name the same place differently or put its neighborhood in address_components instead. Live checks using the existing key returned OK: Paris was labeled 18th arrondissement; Scat Urbam returned an establishment in Grand Yoff, with no matching quarter component. A separate Google query confirmed the Grand Yoff commune center. The repair preserves Scat Urbam as the requested quarter and explicitly records commune_approx plus a note when using that parent center.

Fix: request French Google output; validate structured address components and canonical French/English ordinals; require the correct Paris district/postcode; normalize punctuation for named neighborhoods; retain country, partial-match, ambiguity and finite-coordinate checks. Other France/Senegal communes may resolve through Google's country evidence without a fixed city list. When one unresolved result identifies the same requested city and country plus a parent commune, one additional validated parent lookup is allowed. Its precision is commune_approx and its address states the quarter is not precisely located. Multiple depots retain blank GPS. No coordinates are fabricated.

Deploy in the ORIGINAL Apps Script project 1Wvw2p1Y0PMSEQ2sY5x2dRYzWJ7vSmho6Q1qBR9z28_nRQvxEfv-gxzlE:
1. Pause FacebookCloud for the short file update.
2. Replace FacebookImport.gs and ShipmentPublication.gs with these sources. Preserve Code.gs and its existing key.
3. Run diagnosePublicationGps. This logs provider/validation reasons without changing rows, names, contacts or credentials.
4. If responses resolve correctly, run repairMissingPublicationGps. It fills only both-empty GPS pairs on current ACTIF Chat-GP publications with a valid publication request id; it rechecks identity/location before writing. Existing coordinates and historical rows stay intact. Five rows maximum per run.
5. Update the EXISTING SuperSayan3 deployment to a new version, preserving its ID, URL and access settings. Restore the existing hourly worker.
6. Re-read F27:G27, I27:J27 and AI27:AL27. Verify row count unchanged.

Both owner maintenance functions stay outside the public doPost router and MCP tools. If the Google response is denied or quota-limited, fix that cause in the existing Google project rather than substituting a city-center point for an unresolved quarter.

Validation: 70 Node tests pass, including district aliases, Scat Urbam component evidence, wrong country/district, partial/ambiguous results, invalid GPS, provider denial, and idempotent targeted repair.

Live repair: diagnosePublicationGps returned OK for both sides; repairMissingPublicationGps updated only row 27, both previously empty GPS pairs. Sheet reread confirmed Paris 18e at 48.8915575, 2.3496507 (quartier_approx), and Grand Yoff at 14.7328281, -17.4561914 (commune_approx), with Scat Urbam preserved and explicitly marked not precisely located. The existing row 28 GPS remained unchanged. No rows were appended.
