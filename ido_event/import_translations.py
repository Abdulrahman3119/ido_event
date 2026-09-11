"""Load apps/ido_event/translations/ar.csv into Translation doctype.

Run:
  bench --site event execute ido_event.import_translations.run
"""

from __future__ import annotations

import csv
from pathlib import Path

import frappe


def run():
	path = Path(frappe.get_app_path("ido_event")) / "translations" / "ar.csv"
	count = 0
	with path.open(encoding="utf-8") as f:
		for row in csv.reader(f):
			if len(row) < 2:
				continue
			src, tgt = row[0].strip(), row[1].strip()
			if not src or not tgt:
				continue
			name = frappe.db.get_value(
				"Translation", {"language": "ar", "source_text": src}
			)
			if name:
				frappe.db.set_value(
					"Translation",
					name,
					"translated_text",
					tgt,
					update_modified=False,
				)
			else:
				frappe.get_doc(
					{
						"doctype": "Translation",
						"language": "ar",
						"source_text": src,
						"translated_text": tgt,
					}
				).insert(ignore_permissions=True)
			count += 1
	frappe.clear_cache()
	frappe.db.commit()
	print(f"upserted {count} Arabic translations from {path}")


def restore_fixtures():
	from frappe.utils.fixtures import sync_fixtures

	sync_fixtures("ido_event")
	frappe.db.commit()
	print(
		"workspaces:",
		frappe.get_all("Workspace", filters={"name": ("like", "%IDO%")}, pluck="name"),
	)
	print(
		"web forms:",
		frappe.get_all("Web Form", filters={"doc_type": ("like", "IDO%")}, pluck="name"),
	)
