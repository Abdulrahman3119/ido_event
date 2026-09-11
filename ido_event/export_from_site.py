"""
One-shot exporter: dump site `event` IDO Event schema into apps/ido_event as code.

Run:
  bench --site event execute ido_event.export_from_site.run
"""

from __future__ import annotations

from pathlib import Path

import frappe
from frappe.modules import scrub
from frappe.modules.export_file import strip_default_fields


APP = "ido_event"
MODULE = "IDO Event"
MODULE_SCRUB = scrub(MODULE)  # ido_event


def _app_path() -> Path:
	"""Resolve app path even before the app is installed on the site."""
	try:
		return Path(frappe.get_app_path(APP))
	except Exception:
		from frappe.utils import get_bench_path

		return Path(get_bench_path()) / "apps" / APP / APP


def run():
	app_path = _app_path()
	module_path = app_path / MODULE_SCRUB
	doctype_root = module_path / "doctype"
	fixtures_dir = app_path / "fixtures"

	module_path.mkdir(parents=True, exist_ok=True)
	doctype_root.mkdir(parents=True, exist_ok=True)
	fixtures_dir.mkdir(parents=True, exist_ok=True)
	_touch(module_path / "__init__.py")
	_touch(doctype_root / "__init__.py")

	# Point Module Def at this app so future desk exports work
	if frappe.db.exists("Module Def", MODULE):
		frappe.db.set_value(
			"Module Def",
			MODULE,
			{"app_name": APP, "custom": 0},
			update_modified=False,
		)

	doctypes = frappe.get_all(
		"DocType",
		filters={"module": MODULE},
		pluck="name",
		order_by="name",
	)
	print(f"Exporting {len(doctypes)} DocTypes…")

	for name in doctypes:
		_export_doctype(name, doctype_root)

	print("Exporting fixtures…")
	_export_fixtures(fixtures_dir)

	frappe.db.commit()
	print("Done. App path:", app_path)


def _export_doctype(name: str, doctype_root: Path):
	doc = frappe.get_doc("DocType", name)
	export = doc.as_dict(no_nulls=True, ignore_computed_child_tables=True)
	doc.run_method("before_export", export)
	export = strip_default_fields(doc, export)

	# Merge Custom Fields into DocType.fields
	custom_fields = frappe.get_all(
		"Custom Field",
		filters={"dt": name},
		fields=["*"],
		order_by="idx",
	)
	existing_names = {f.get("fieldname") for f in export.get("fields") or []}
	max_idx = max((f.get("idx") or 0 for f in export.get("fields") or []), default=0)

	for cf in custom_fields:
		if cf.fieldname in existing_names:
			continue
		max_idx += 1
		field = _custom_field_to_docfield(cf, max_idx)
		# Insert after insert_after if possible
		fields = export.setdefault("fields", [])
		insert_at = None
		if cf.insert_after:
			for i, f in enumerate(fields):
				if f.get("fieldname") == cf.insert_after:
					insert_at = i + 1
					break
		if insert_at is None:
			fields.append(field)
		else:
			fields.insert(insert_at, field)
		existing_names.add(cf.fieldname)

	# Re-number idx
	for i, f in enumerate(export.get("fields") or [], 1):
		f["idx"] = i

	export["custom"] = 0
	export["module"] = MODULE
	export.pop("migration_hash", None)

	folder = doctype_root / scrub(name)
	folder.mkdir(parents=True, exist_ok=True)
	_touch(folder / "__init__.py")

	# Controller .py — class name must match Frappe get_controller()
	class_name = name.replace(" ", "").replace("-", "")
	py_path = folder / f"{scrub(name)}.py"
	py_path.write_text(
		f'''# Copyright (c) 2026, I Do Holding and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class {class_name}(Document):
	pass
''',
		encoding="utf-8",
	)

	# Empty js stub (client scripts live in fixtures)
	js_path = folder / f"{scrub(name)}.js"
	if not js_path.exists():
		js_path.write_text(
			f'''// Copyright (c) 2026, I Do Holding and contributors
// For license information, please see license.txt

frappe.ui.form.on("{name}", {{
	// refresh(frm) {{}}
}});
''',
			encoding="utf-8",
		)

	json_path = folder / f"{scrub(name)}.json"
	json_path.write_text(frappe.as_json(export) + "\n", encoding="utf-8")
	try:
		rel = json_path.relative_to(_app_path().parent.parent)
	except Exception:
		rel = json_path
	print(f"  ✓ {name} → {rel}")


def _custom_field_to_docfield(cf, idx: int) -> dict:
	skip = {
		"name",
		"owner",
		"creation",
		"modified",
		"modified_by",
		"docstatus",
		"idx",
		"dt",
		"is_system_generated",
		"is_standard",
		"insert_after",
		"_user_tags",
		"_comments",
		"_assign",
		"_liked_by",
	}
	field = {k: v for k, v in cf.items() if k not in skip and v not in (None, "")}
	field["doctype"] = "DocField"
	field["idx"] = idx
	# Ensure boolean defaults
	for b in (
		"reqd",
		"search_index",
		"in_list_view",
		"in_standard_filter",
		"in_global_search",
		"bold",
		"hidden",
		"collapsible",
		"unique",
		"no_copy",
		"allow_on_submit",
		"show_preview_popup",
		"permlevel",
		"ignore_user_permissions",
		"allow_bulk_edit",
		"read_only",
		"precision",
		"print_hide",
		"print_hide_if_no_value",
		"report_hide",
		"set_only_once",
		"translatable",
		"hide_border",
		"hide_days",
		"hide_seconds",
		"non_negative",
		"is_virtual",
		"sort_options",
		"show_on_timeline",
		"make_attachment_public",
	):
		if b in field and field[b] in (None,):
			field.pop(b, None)
	return field


def _export_fixtures(fixtures_dir: Path):

	# Roles
	roles = frappe.get_all("Role", filters={"name": ("like", "IDO%")}, pluck="name")
	_dump_docs("Role", roles, fixtures_dir / "role.json")

	# Client Scripts
	cs = frappe.get_all("Client Script", filters={"dt": ("like", "IDO%")}, pluck="name")
	_dump_docs("Client Script", cs, fixtures_dir / "client_script.json")

	# Workspaces
	ws = frappe.get_all(
		"Workspace", filters={"name": ("in", ["IDO Events", "IDO Play"])}, pluck="name"
	)
	_dump_docs("Workspace", ws, fixtures_dir / "workspace.json")

	# Web Forms
	wf = frappe.get_all("Web Form", filters={"doc_type": ("like", "IDO%")}, pluck="name")
	_dump_docs("Web Form", wf, fixtures_dir / "web_form.json")

	# Print Formats
	pf = frappe.get_all("Print Format", filters={"doc_type": ("like", "IDO%")}, pluck="name")
	_dump_docs("Print Format", pf, fixtures_dir / "print_format.json")

	# Number Cards
	nc = frappe.get_all(
		"Number Card", filters={"document_type": ("like", "IDO%")}, pluck="name"
	)
	_dump_docs("Number Card", nc, fixtures_dir / "number_card.json")

	# Dashboard Charts
	dc = frappe.get_all(
		"Dashboard Chart", filters={"document_type": ("like", "IDO%")}, pluck="name"
	)
	_dump_docs("Dashboard Chart", dc, fixtures_dir / "dashboard_chart.json")

	# Dashboards
	db = frappe.get_all("Dashboard", filters={"name": ("like", "IDO%")}, pluck="name")
	_dump_docs("Dashboard", db, fixtures_dir / "dashboard.json")


def _dump_docs(doctype: str, names: list[str], path: Path):
	docs = []
	for name in names:
		d = frappe.get_doc(doctype, name)
		export = d.as_dict(no_nulls=True)
		# Strip system meta noise
		for k in (
			"creation",
			"modified",
			"modified_by",
			"owner",
			"_user_tags",
			"_comments",
			"_assign",
			"_liked_by",
		):
			export.pop(k, None)
		# Strip child default fields
		for key, val in list(export.items()):
			if isinstance(val, list) and val and isinstance(val[0], dict):
				cleaned = []
				for row in val:
					row = dict(row)
					for fk in (
						"name",
						"owner",
						"creation",
						"modified",
						"modified_by",
						"docstatus",
						"parent",
						"parenttype",
						"parentfield",
					):
						row.pop(fk, None)
					cleaned.append(row)
				export[key] = cleaned
		# Mark module / non-custom where applicable
		if "module" in export and export["module"] in (None, "", "IDO Event"):
			export["module"] = MODULE
		if doctype == "Workspace":
			export["module"] = MODULE
			export["public"] = 1
		if doctype in ("Dashboard", "Dashboard Chart", "Number Card"):
			if "module" in d.as_dict():
				export["module"] = MODULE
		if doctype == "Print Format":
			export["standard"] = "Yes"
			export["module"] = MODULE
		if doctype == "Web Form":
			export["module"] = MODULE
		if doctype == "Client Script":
			export["module"] = MODULE
		docs.append(export)

	path.write_text(frappe.as_json(docs) + "\n", encoding="utf-8")
	print(f"  ✓ fixture {doctype}: {len(docs)} → {path.name}")


def _touch(path: Path):
	path.parent.mkdir(parents=True, exist_ok=True)
	if not path.exists():
		path.write_text("", encoding="utf-8")
