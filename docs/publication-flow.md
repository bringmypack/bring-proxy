# Chat-GP publication — 0.74.0

One canonical workbook: 1KJL7mAtWvrndgrHX_5NjfUciqVX0uMxL63T6XJnRFmE.

| Component | Where to intervene |
| --- | --- |
| Conversation and consent | plugin/skills/instructions/SKILL.md |
| GP and sender cards | lib/travel-card.js |
| MCP publishing and receipt matching | api/mcp.js; api/catalogue.js exposes the same tools on /mcp |
| Google GP writes | apps-script/GpPublication.gs |
| Google sender writes and matching | apps-script/ShipmentPublication.gs |
| Future Facebook imports | apps-script/FacebookImport.gs |

After explicit confirmation: GP_TRANSPORTEURS or EXPEDITEURS_COLIS, status ACTIF in N, source Chat-GP in P, original columns preserved. Both neighborhoods required, with an explicit city-only choice allowed. Location text retained; GPS only after a validated geocoder result, never an invented point. Facebook source links remain intact.

The confirmed receipt immediately attempts opposite-role matching on direction, date window, known weight/capacity and neighborhood ranking. Failed matching does not invalidate a saved publication. Zero results are distinct from an unavailable service. Matching does not send messages. Contact retrieval requires the owner's explicit opt-in, the requester's private publication key, a current match and an explicit request. Historical records are excluded.

Google deployment: preserve the existing SuperSayan3 deployment ID and URL. Add ShipmentPublication.gs, replace GpPublication.gs and FacebookImport.gs. In the existing Code.gs doPost switch, preserve all existing actions and add publishShipment, getShipmentPublicationStatus, findMatchesForPublication and getMatchContact, each returning jsonResponse of its corresponding function(data). Code.gs contains a live credential and is intentionally not copied into this repository.

Owner-only publicationFlowSelfTest uses dry_run and creates no rows. activateCurrentCatalogAnnouncements updates only eligible current public A_VERIFIER announcements. Neither maintenance function is exposed as an HTTP action. Keep the existing hourly Facebook worker and daily 09:00 Paris Apify schedule.

Validation: node --test tests/*.test.mjs (62 tests). Real spreadsheet GP/sender dry runs must both pass before updating the existing HTTP deployment.
