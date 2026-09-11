"""Migrate Desk Client/Server Scripts into app code, then delete UI docs.

Run:
  bench --site event execute ido_event.migrate_scripts.run
"""

from __future__ import annotations

import re
import textwrap
from collections import defaultdict
from pathlib import Path

import frappe
from frappe.modules import scrub


APP = "ido_event"
MODULE = "IDO Event"

EVENT_MAP = {
	"Before Insert": "before_insert",
	"After Insert": "after_insert",
	"Before Validate": "before_validate",
	"Before Save": "before_save",
	"After Save": "after_save",
	"Before Submit": "before_submit",
	"After Submit": "after_submit",
	"Before Cancel": "before_cancel",
	"After Cancel": "after_cancel",
	"Before Delete": "before_delete",
	"After Delete": "after_delete",
}

# API methods previously exposed as Server Scripts `ido.*`
API_OVERRIDES = {
	"ido.verify_invitation": "ido_event.api.verify_invitation",
	"ido.register": "ido_event.api.register",
	"ido.advance_stage": "ido_event.api.advance_stage",
	"ido.override_stage": "ido_event.api.override_stage",
	"ido.dashboard": "ido_event.api.dashboard",
	"ido.my_journey": "ido_event.api.my_journey",
	"ido.my_tasks": "ido_event.api.my_tasks",
	"ido.scan": "ido_event.api.scan",
	"ido.timeline": "ido_event.api.timeline",
	"ido.get_guest": "ido_event.api.get_guest",
	"ido.list_guests": "ido_event.api.list_guests",
	"ido.get_operator_dataset": "ido_event.api.get_operator_dataset",
	"ido.submit_kyc": "ido_event.api.submit_kyc",
	"ido.submit_flight": "ido_event.api.submit_flight",
	"ido.update_visa": "ido_event.api.update_visa",
	"ido.lookup_flight": "ido_event.api.lookup_flight",
}


def run(delete: bool = True):
	app_path = Path(frappe.get_app_path(APP))
	doctype_root = app_path / scrub(MODULE) / "doctype"
	doc_events_root = app_path / "doc_events"
	doc_events_root.mkdir(parents=True, exist_ok=True)

	print("== Client Scripts → doctype JS ==")
	_migrate_client_scripts(doctype_root)

	print("== Server Script DocType Events → Python ==")
	hooks_map = _migrate_server_doctype_events(doc_events_root)

	print("== Rewrite hooks.py ==")
	_rewrite_hooks(app_path / "hooks.py", hooks_map)

	print("== Update guest stage lock ==")
	_ensure_guest_stage_lock(doc_events_root / "guest.py")

	# Remove client_script fixture
	fx = app_path / "fixtures" / "client_script.json"
	if fx.exists():
		fx.unlink()
		print("  ✕ removed fixtures/client_script.json")

	if delete:
		print("== Delete UI scripts ==")
		_delete_ui_scripts()

	frappe.db.commit()
	print("Done. Run: bench --site event clear-cache && bench restart")


def _migrate_client_scripts(doctype_root: Path):
	rows = frappe.get_all(
		"Client Script",
		filters={"dt": ("like", "IDO%")},
		fields=["name", "dt", "view", "script"],
		order_by="dt, view, name",
	)
	by_key: dict[tuple[str, str], list[tuple[str, str]]] = defaultdict(list)
	for r in rows:
		view = (r.view or "Form").title()
		by_key[(r.dt, view)].append((r.name, r.script or ""))

	for (dt, view), parts in by_key.items():
		folder = doctype_root / scrub(dt)
		folder.mkdir(parents=True, exist_ok=True)
		fname = f"{scrub(dt)}_list.js" if view == "List" else f"{scrub(dt)}.js"
		path = folder / fname
		chunks = [
			f"// Copyright (c) 2026, I Do Holding and contributors",
			f"// Migrated from Desk Client Script(s) — {dt} ({view})",
			"",
		]
		for name, script in parts:
			chunks.append(f"// --- {name} ---")
			chunks.append(script.strip())
			chunks.append("")
		path.write_text("\n".join(chunks).rstrip() + "\n", encoding="utf-8")
		print(f"  ✓ {dt} [{view}] ← {len(parts)} → {fname}")


def _extract_business_logic(script: str) -> str:
	"""Strip the duplicated engine preamble; keep the business tail."""
	script = script or ""
	# Scripts typically end helpers with `def user_roles(): ...` then business lines
	marker = "def user_roles():"
	idx = script.rfind(marker)
	if idx == -1:
		return script.strip()
	rest = script[idx + len(marker) :]
	# skip the one-liner body of user_roles
	lines = rest.splitlines()
	# first non-empty line after def is usually the return; drop indented lines of that def
	i = 0
	while i < len(lines) and (not lines[i].strip() or lines[i].startswith((" ", "\t"))):
		i += 1
	body = "\n".join(lines[i:]).strip()
	return body


def _migrate_server_doctype_events(doc_events_root: Path) -> dict[str, dict[str, str]]:
	rows = frappe.get_all(
		"Server Script",
		filters={"script_type": "DocType Event"},
		or_filters=[
			["reference_doctype", "like", "IDO%"],
			["name", "like", "IDO%"],
		],
		fields=["name", "reference_doctype", "doctype_event", "script", "disabled"],
		order_by="reference_doctype, doctype_event",
	)

	by_dt: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
	for r in rows:
		dt = r.reference_doctype
		if not dt:
			continue
		hook = EVENT_MAP.get(r.doctype_event or "")
		if not hook:
			print(f"  ! skip unknown event {r.doctype_event!r}: {r.name}")
			continue
		logic = _extract_business_logic(r.script or "")
		by_dt[dt][hook].append((r.name, logic, int(r.disabled or 0)))

	# Special: keep polished guest/invitation, merge extras
	hooks_map: dict[str, dict[str, str]] = {}

	for dt, hooks in sorted(by_dt.items()):
		mod = scrub(dt)
		# Prefer short names for known modules
		if dt == "IDO Guest":
			mod = "guest"
		elif dt == "IDO Invitation":
			mod = "invitation"

		path = doc_events_root / f"{mod}.py"
		if dt == "IDO Guest":
			_write_guest_module(path, hooks)
		elif dt == "IDO Invitation":
			_write_invitation_module(path, hooks)
		else:
			_write_generic_module(path, dt, hooks)

		entry = {}
		text = path.read_text(encoding="utf-8")
		for hook in hooks:
			if re.search(rf"^def {hook}\(", text, re.M):
				entry[hook] = f"ido_event.doc_events.{mod}.{hook}"
		# Always register written hooks
		for hook in hooks:
			entry[hook] = f"ido_event.doc_events.{mod}.{hook}"
		hooks_map[dt] = entry
		print(f"  ✓ {dt} → doc_events/{mod}.py ({', '.join(hooks)})")

	(doc_events_root / "__init__.py").write_text(
		'"""Document event handlers — code, not Server Scripts."""\n',
		encoding="utf-8",
	)
	return hooks_map


def _indent_logic(logic: str, level: int = 1) -> str:
	if not logic.strip():
		return "\t" * level + "pass"
	# Normalize to tabs for consistency
	normalized = textwrap.dedent(logic).strip("\n")
	prefix = "\t" * level
	out_lines = []
	for line in normalized.splitlines():
		if not line.strip():
			out_lines.append("")
		else:
			# convert leading spaces (4) to tabs roughly
			stripped = line.lstrip(" \t")
			lead = len(line) - len(stripped)
			# assume 4-space or already tab
			extra = lead // 4 if "\t" not in line[:lead] else line[:lead].count("\t")
			out_lines.append(prefix + ("\t" * extra) + stripped)
	return "\n".join(out_lines)


ENGINE_IMPORT = """from ido_event.engine import (
	auto_advance,
	gate_error,
	latest_status,
	mirror_guest,
	next_stage,
	set_stage,
	stage_path,
	user_roles,
)"""


def _write_generic_module(path: Path, dt: str, hooks: dict):
	parts = [
		f'"""Doc events for {dt} (migrated from Server Scripts)."""',
		"",
		"from __future__ import annotations",
		"",
		"import frappe",
		"",
		ENGINE_IMPORT,
		"",
	]
	for hook, items in hooks.items():
		parts.append("")
		parts.append(f"def {hook}(doc, method=None):")
		for name, logic, disabled in items:
			parts.append(f"\t# from Server Script: {name} (was disabled={disabled})")
			parts.append(_indent_logic(logic, 1))
		parts.append("")
	path.write_text("\n".join(parts).rstrip() + "\n", encoding="utf-8")


def _write_guest_module(path: Path, hooks: dict):
	# Core logic we already own + stage lock from Server Script
	extra_before = ""
	for name, logic, disabled in hooks.get("before_save", []):
		# Prefer the stage-lock snippet if present
		if "المرحلة تُدار" in logic or "ido_engine" in logic:
			extra_before = logic
			break
	# Strip full_name / nationality / consent (already in our code) from extra
	stage_lock = ""
	if extra_before:
		for line in extra_before.splitlines():
			if "ido_engine" in line or "المرحلة" in line or "old=" in line or "old and" in line:
				stage_lock += line + "\n"
		# Also include the block properly
		if "frappe.flags.ido_engine" in extra_before:
			stage_lock = """
if not doc.is_new() and not frappe.flags.ido_engine:
	old = frappe.db.get_value("IDO Guest", doc.name, "stage")
	if old and old != doc.stage:
		frappe.throw("المرحلة تُدار عبر محرك الرحلة فقط (تقديم / تجاوز).")
""".strip()

	parts = [
		'"""Doc events for IDO Guest."""',
		"",
		"from __future__ import annotations",
		"",
		"import frappe",
		"",
		ENGINE_IMPORT,
		"",
		"",
		"def before_save(doc, method=None):",
		'\tdoc.full_name = ((doc.first_name or "") + " " + (doc.last_name or "")).strip()',
		'\tif doc.nationality == "Saudi Arabia" and doc.is_new() and not doc.travel_mode:',
		'\t\tdoc.travel_mode = "local"',
		"\tif doc.pdpl_consent and not doc.consent_at:",
		"\t\tdoc.consent_at = frappe.utils.now_datetime()",
	]
	if stage_lock:
		parts.append(_indent_logic(stage_lock, 1))

	parts += [
		"",
		"",
		"def after_insert(doc, method=None):",
		'\t"""Create portal User when auto_create_portal_user is on and email is set."""',
		"\tif not doc.email or doc.user:",
		"\t\treturn",
		'\tif not frappe.db.get_single_value("IDO Event Settings", "auto_create_portal_user"):',
		"\t\treturn",
		"",
		'\texisting = frappe.db.get_value("User", {"email": doc.email}, "name")',
		"\tif existing:",
		'\t\tfrappe.db.set_value("IDO Guest", doc.name, "user", existing)',
		"\t\treturn",
		"",
		"\tuser = frappe.get_doc(",
		"\t\t{",
		'\t\t\t"doctype": "User",',
		'\t\t\t"email": doc.email,',
		'\t\t\t"first_name": doc.first_name or doc.email.split("@")[0],',
		'\t\t\t"last_name": doc.last_name or "",',
		'\t\t\t"send_welcome_email": 0,',
		'\t\t\t"user_type": "Website User",',
		'\t\t\t"enabled": 1,',
		"\t\t}",
		"\t)",
		"\tuser.insert(ignore_permissions=True)",
		'\tif frappe.db.exists("Role", "IDO Guest"):',
		'\t\tuser.add_roles("IDO Guest")',
		'\tfrappe.db.set_value("IDO Guest", doc.name, "user", user.name)',
		"",
	]

	for hook, items in hooks.items():
		if hook in ("before_save", "after_insert"):
			continue
		parts.append("")
		parts.append(f"def {hook}(doc, method=None):")
		for name, logic, disabled in items:
			parts.append(f"\t# from Server Script: {name} (was disabled={disabled})")
			parts.append(_indent_logic(logic, 1))
		parts.append("")

	path.write_text("\n".join(parts).rstrip() + "\n", encoding="utf-8")


def _write_invitation_module(path: Path, hooks: dict):
	parts = [
		'"""Doc events for IDO Invitation."""',
		"",
		"from __future__ import annotations",
		"",
		"import frappe",
		"",
		"",
		"def before_save(doc, method=None):",
		"\tif not doc.invitation_code:",
		"\t\tdoc.invitation_code = frappe.utils.random_string(8).upper()",
		'\tdoc.secure_link = frappe.utils.get_url("/guest?code=" + doc.invitation_code)',
		"",
	]
	for hook, items in hooks.items():
		if hook == "before_save":
			continue
		parts.append("")
		parts.append(f"def {hook}(doc, method=None):")
		for name, logic, disabled in items:
			parts.append(f"\t# from Server Script: {name} (was disabled={disabled})")
			parts.append(_indent_logic(logic, 1))
		parts.append("")
	path.write_text("\n".join(parts).rstrip() + "\n", encoding="utf-8")


def _ensure_guest_stage_lock(path: Path):
	# already written in _write_guest_module
	pass


def _rewrite_hooks(hooks_path: Path, hooks_map: dict[str, dict[str, str]]):
	# Ensure guest/invitation always present
	hooks_map.setdefault(
		"IDO Guest",
		{
			"before_save": "ido_event.doc_events.guest.before_save",
			"after_insert": "ido_event.doc_events.guest.after_insert",
		},
	)
	hooks_map.setdefault(
		"IDO Invitation",
		{"before_save": "ido_event.doc_events.invitation.before_save"},
	)

	doc_events_lines = ["doc_events = {"]
	for dt in sorted(hooks_map):
		doc_events_lines.append(f'\t"{dt}": {{')
		for hook, path in sorted(hooks_map[dt].items()):
			doc_events_lines.append(f'\t\t"{hook}": "{path}",')
		doc_events_lines.append("\t},")
	doc_events_lines.append("}")
	doc_events_block = "\n".join(doc_events_lines)

	overrides_lines = ["override_whitelisted_methods = {"]
	for k, v in API_OVERRIDES.items():
		overrides_lines.append(f'\t"{k}": "{v}",')
	overrides_lines.append("}")
	overrides_block = "\n".join(overrides_lines)

	fixtures_block = '''fixtures = [
	{
		"dt": "Role",
		"filters": [["name", "like", "IDO%"]],
	},
	{
		"dt": "Workspace",
		"filters": [["name", "in", ["IDO Events", "IDO Play"]]],
	},
	{
		"dt": "Web Form",
		"filters": [["doc_type", "like", "IDO%"]],
	},
	{
		"dt": "Print Format",
		"filters": [["doc_type", "like", "IDO%"]],
	},
	{
		"dt": "Number Card",
		"filters": [["document_type", "like", "IDO%"]],
	},
	{
		"dt": "Dashboard Chart",
		"filters": [["document_type", "like", "IDO%"]],
	},
	{
		"dt": "Dashboard",
		"filters": [["name", "like", "IDO%"]],
	},
]'''

	content = f'''app_name = "ido_event"
app_title = "IDO Event"
app_publisher = "I Do Holding"
app_description = "IDO Event management — DocTypes, fixtures, and lifecycle API"
app_email = "mustafakhaled.dev@gmail.com"
app_license = "mit"

required_apps = ["frappe"]

after_install = "ido_event.install.after_install"
after_migrate = "ido_event.install.after_migrate"

# Document events live in Python (ido_event.doc_events.*) — not Server Scripts
{doc_events_block}

# Desk Client Scripts were migrated into doctype/*.js — not Client Script docs

# Keep legacy `ido.*` API paths working without Server Scripts
{overrides_block}

# Fixtures (no Client Script / Server Script)
{fixtures_block}
'''
	hooks_path.write_text(content, encoding="utf-8")
	print("  ✓ hooks.py updated")


def _delete_ui_scripts():
	cs = frappe.get_all("Client Script", filters={"dt": ("like", "IDO%")}, pluck="name")
	for name in cs:
		frappe.delete_doc("Client Script", name, force=1, ignore_permissions=True)
	print(f"  ✕ Client Scripts: {len(cs)}")

	names = set()
	for filters in (
		{"name": ("like", "ido.%")},
		{"api_method": ("like", "ido.%")},
		{"script_type": "DocType Event", "reference_doctype": ("like", "IDO%")},
		{"script_type": "DocType Event", "name": ("like", "IDO%")},
	):
		names.update(frappe.get_all("Server Script", filters=filters, pluck="name"))
	for name in sorted(names):
		frappe.delete_doc("Server Script", name, force=1, ignore_permissions=True)
	print(f"  ✕ Server Scripts: {len(names)}")
