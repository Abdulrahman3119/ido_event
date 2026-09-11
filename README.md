# ido_event

Installable Frappe app for **IDO Event** — all DocTypes, roles, workspaces, dashboards, web forms, client scripts, and lifecycle API as code.

## Install on a new site

```bash
# from bench root
bench get-app /path/to/ido_event   # or place under apps/ido_event
bench --site <site> install-app ido_event
bench --site <site> migrate
```

## Install on a site that already has custom IDO DocTypes

If Module Def `IDO Event` already exists (custom):

```bash
bench --site <site> mariadb -e "UPDATE \`tabModule Def\` SET app_name='ido_event', custom=0 WHERE name='IDO Event';"
bench --site <site> install-app ido_event --force
bench --site <site> migrate
```

`after_install` adopts existing DocTypes (`custom=0`) and drops Custom Fields that were merged into DocType JSON.

## Layout

| Path | Role |
|------|------|
| `ido_event/ido_event/doctype/*` | 54 DocTypes (standard) |
| `ido_event/fixtures/` | Roles, Workspaces, Web Forms, Print Formats, Number Cards, Charts, Dashboards |
| `ido_event/ido_event/doctype/*/*.js` | Form/List JS (migrated from Client Scripts — not in Desk UI) |
| `ido_event/doc_events/` | Python doc hooks (migrated from Server Scripts — not in Desk UI) |
| `ido_event/api.py` | Whitelisted API (`ido.*` via `override_whitelisted_methods`) |
| `ido_event/engine.py` | Lifecycle stages + BR gates |
| `ido_event/mappers.py` | DocType → React JSON |
| `ido_event/export_from_site.py` | Re-export schema from a live site |
| `ido_event/migrate_scripts.py` | One-shot: Client/Server Scripts → code + delete UI docs |

## Arabic UI

Translations live in `ido_event/translations/ar.csv` (no English letters in Arabic targets).

```bash
bench --site <site> execute ido_event.import_translations.run
bench --site <site> clear-cache
```

Set user/system language to **العربية** to see labels without English.# ido_event
