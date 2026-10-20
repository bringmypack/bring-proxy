# GP publication

Existing project: `1Wvw2p1Y0PMSEQ2sY5x2dRYzWJ7vSmho6Q1qBR9z28_nRQvxEfv-gxzlE`.

Add `GpPublication.gs` to that Apps Script project. Keep its existing code and
deployment ID. Inside the existing `doPost` action switch, add:

```js
case 'publicationCapabilities': return jsonResponse(publicationCapabilities());
case 'publishGP': return jsonResponse(publishGP(data));
case 'getPublicationStatus': return jsonResponse(getPublicationStatus(data));
```

Update the existing `SuperSayan3` web-app deployment to a new version. Preserve
the existing execution identity and access settings. Do not create a second
web-app URL. The added publication action writes only to the explicit pilot
spreadsheet and `GP_TRANSPORTEURS` tab in the source. Existing actions are kept.

`/api/mcp` adds publication tools alongside the existing catalogue connection.
It checks the script's capabilities and destination before sending a write,
and stays unavailable while the old script version is deployed.

Use `publish_departure` with `dry_run: true` to validate the live integration
without writing. A real publication needs the traveller's reviewed details,
name, contact number and explicit publication request. Reuse `request_id`
after an uncertain response; check `publication_status` before retrying.

Run `npm test` for the local suite. Payments, bookings and Facebook posting
are not provided by this endpoint. No credentials belong in this repository.

## Catalogue route

The installed catalogue app uses `/mcp`, rewritten to `/api/catalogue`.
Keep this rewrite and `lib/catalog.js` when releasing from Git. The catalogue
reader was previously deployed manually on 2026-10-19 and was absent from Git;
releasing only the old repository made `/mcp` return 404.

The reader retains its original public Facebook-announcement projection from
workbook `1Op5k1Leaxjwi0Oa3Ic2t572zaNzdXEyRzFaV3lRmIis`. It never selects
WhatsApp or private request columns. The publication tools keep their separate
pilot workbook. A search failure is an error, not an empty result. Estimated
dates, capacity and availability must still be confirmed with the traveller.

Before release, run the catalogue and publication suites. After release, call
`initialize`, `tools/list`, `service_status` and `search_departures` at `/mcp`,
and verify `/api/mcp` still lists its publication tools. Use the installed chat
connector as the final check, not only a direct HTTP request.
