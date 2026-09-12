"""Install / migrate hooks for ido_event."""

from __future__ import annotations

import json

import frappe


# Canonical Web Form identity: route → (name, title)
# Old bilingual names must be renamed before fixtures sync, or migrate
# fails with Duplicate entry '<route>' for key 'route'.
WEB_FORM_BY_ROUTE = {
	"ido-feedback": ("تقييم-التجربة", "تقييم التجربة"),
	"ido-support": ("تذكرة-دعم", "تذكرة دعم"),
	"ido-flight-request": ("طلب-طيران", "طلب طيران"),
	"ido-kyc": ("التحقق-من-الهوية", "التحقق من الهوية"),
	"ido-demo-request": ("طلب-عرض-توضيحي", "طلب عرض توضيحي"),
}

WORKSPACE_NAME = "IDO Events"
DESKTOP_LOGO = "/assets/ido_event/icons/desktop_icons/solid/ido_events.svg"


def after_install():
	_ensure_module()
	_ensure_roles()
	_adopt_existing_doctypes()
	_drop_merged_custom_fields()
	_purge_ui_scripts()
	_ensure_workspace_visibility()


def before_migrate():
	"""Align existing Web Forms to fixture names so route uniqueness holds."""
	_normalize_web_forms()


def after_migrate():
	_ensure_module()
	_adopt_existing_doctypes()
	_drop_merged_custom_fields()
	_purge_ui_scripts()
	_normalize_web_forms()
	_backfill_guest_registrations()
	_ensure_workspace_visibility()


def _ensure_workspace_visibility():
	"""Make IDO Events show on Desk (Workspace + Sidebar + Desktop Icon).

	Fixtures sync the Workspace doc, but Frappe 16 also needs a Workspace Sidebar
	and Desktop Icon — those are not created during migrate/fixture import.
	"""
	if not frappe.db.exists("Workspace", WORKSPACE_NAME):
		return

	ws = frappe.get_doc("Workspace", WORKSPACE_NAME)
	changed = False
	if not ws.public:
		ws.public = 1
		changed = True
	if ws.is_hidden:
		ws.is_hidden = 0
		changed = True
	if ws.module != "IDO Event":
		ws.module = "IDO Event"
		changed = True
	if ws.app != "ido_event":
		ws.app = "ido_event"
		changed = True
	# Empty roles = visible to everyone with DocType access
	if ws.roles:
		ws.roles = []
		changed = True
	if changed:
		ws.flags.ignore_permissions = True
		ws.flags.ignore_links = True
		ws.save(ignore_permissions=True)

	_ensure_workspace_sidebar(ws)
	_ensure_desktop_icon()
	_inject_icon_into_desktop_layouts()

	try:
		from frappe.desk.doctype.desktop_icon.desktop_icon import clear_desktop_icons_cache

		clear_desktop_icons_cache()
	except Exception:
		pass
	frappe.clear_cache()


def _ensure_workspace_sidebar(ws):
	"""Create / repair Workspace Sidebar so the desktop icon is permitted."""
	if frappe.db.exists("Workspace Sidebar", WORKSPACE_NAME):
		sidebar = frappe.get_doc("Workspace Sidebar", WORKSPACE_NAME)
	else:
		sidebar = frappe.new_doc("Workspace Sidebar")
		sidebar.title = WORKSPACE_NAME

	sidebar.header_icon = ws.icon or "calendar-days"
	sidebar.for_user = None

	# Keep at least Home → workspace; rebuild from shortcuts if empty
	has_home = any(
		(row.link_type == "Workspace" and row.link_to == WORKSPACE_NAME) for row in (sidebar.items or [])
	)
	if not sidebar.items or not has_home:
		items = [
			{
				"label": "Home",
				"link_to": WORKSPACE_NAME,
				"link_type": "Workspace",
				"type": "Link",
				"idx": 0,
			}
		]
		idx = 1
		for s in ws.shortcuts or []:
			items.append(
				{
					"label": s.label,
					"link_to": s.link_to,
					"link_type": s.type,
					"type": "Link",
					"idx": idx,
				}
			)
			idx += 1
		sidebar.set("items", [])
		for row in items:
			sidebar.append("items", row)

	sidebar.flags.ignore_permissions = True
	if sidebar.is_new():
		sidebar.insert(ignore_permissions=True)
	else:
		sidebar.save(ignore_permissions=True)


def _ensure_desktop_icon():
	"""Create / unhide the Desk icon that opens the IDO Events sidebar."""
	vals = {
		"label": WORKSPACE_NAME,
		"link_type": "Workspace Sidebar",
		"link_to": WORKSPACE_NAME,
		"icon_type": "Link",
		"icon": "calendar-days",
		"logo_url": DESKTOP_LOGO,
		"hidden": 0,
		"standard": 1,
		"app": "ido_event",
		"parent_icon": "",
	}
	if frappe.db.exists("Desktop Icon", WORKSPACE_NAME):
		doc = frappe.get_doc("Desktop Icon", WORKSPACE_NAME)
		for k, v in vals.items():
			doc.set(k, v)
		# No role restriction on the icon
		doc.set("roles", [])
		doc.flags.ignore_permissions = True
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc({"doctype": "Desktop Icon", **vals})
		doc.insert(ignore_permissions=True)


def _inject_icon_into_desktop_layouts():
	"""Saved Desktop Layouts hide new icons — append IDO Events when missing."""
	if not frappe.db.exists("Desktop Icon", WORKSPACE_NAME):
		return
	icon = frappe.get_doc("Desktop Icon", WORKSPACE_NAME)
	payload = {
		"label": icon.label,
		"link_type": icon.link_type,
		"link_to": icon.link_to,
		"icon_type": icon.icon_type,
		"icon": icon.icon,
		"logo_url": icon.logo_url,
		"hidden": 0,
		"standard": icon.standard,
		"app": icon.app,
		"parent_icon": icon.parent_icon or "",
		"name": icon.name,
	}
	for row in frappe.get_all("Desktop Layout", fields=["name", "layout"]):
		try:
			layout = json.loads(row.layout or "[]")
		except Exception:
			continue
		if not isinstance(layout, list):
			continue
		if any((i or {}).get("label") == WORKSPACE_NAME for i in layout):
			# Force unhide if present but hidden in layout
			dirty = False
			for i in layout:
				if (i or {}).get("label") == WORKSPACE_NAME and i.get("hidden"):
					i["hidden"] = 0
					dirty = True
			if dirty:
				frappe.db.set_value("Desktop Layout", row.name, "layout", json.dumps(layout), update_modified=False)
			continue
		layout.append(payload)
		frappe.db.set_value("Desktop Layout", row.name, "layout", json.dumps(layout), update_modified=False)


def _backfill_guest_registrations():
	"""Ensure every guest linked to an event has an IDO Registration."""
	if not frappe.db.exists("DocType", "IDO Registration"):
		return
	from ido_event.invitation_send import ensure_invitation, ensure_registration

	guests = frappe.get_all(
		"IDO Guest",
		filters={"event": ["is", "set"]},
		fields=["name", "event"],
		limit_page_length=2000,
	)
	for g in guests:
		try:
			ensure_registration(g.name, g.event)
			ensure_invitation(g.name, g.event)
		except Exception:
			frappe.log_error(title=f"IDO backfill register {g.name}")


def _normalize_web_forms():
	for route, (canonical_name, title) in WEB_FORM_BY_ROUTE.items():
		existing = frappe.db.get_value("Web Form", {"route": route}, "name")
		if not existing:
			continue

		if existing != canonical_name:
			if frappe.db.exists("Web Form", canonical_name):
				# Stale duplicate with a different route — drop the route holder
				frappe.delete_doc("Web Form", existing, force=1, ignore_permissions=True)
			else:
				frappe.rename_doc("Web Form", existing, canonical_name, force=True)
			existing = canonical_name

		frappe.db.set_value(
			"Web Form",
			existing,
			{"title": title, "route": route},
			update_modified=False,
		)


def _ensure_module():
	"""Keep Module Def pointing at this app (non-custom)."""
	if not frappe.db.exists("Module Def", "IDO Event"):
		frappe.get_doc(
			{
				"doctype": "Module Def",
				"module_name": "IDO Event",
				"app_name": "ido_event",
				"custom": 0,
			}
		).insert(ignore_permissions=True)
		return

	frappe.db.set_value(
		"Module Def",
		"IDO Event",
		{"app_name": "ido_event", "custom": 0},
		update_modified=False,
	)


def _adopt_existing_doctypes():
	"""If DocTypes already lived as custom on this site, claim them for the app."""
	frappe.db.sql(
		"""
		UPDATE `tabDocType`
		SET custom = 0, module = 'IDO Event'
		WHERE module = 'IDO Event' OR name LIKE 'IDO %%'
		"""
	)


def _drop_merged_custom_fields():
	"""Remove Custom Field rows whose fieldnames now live in DocType JSON."""
	rows = frappe.get_all(
		"Custom Field",
		filters={"dt": ("like", "IDO%")},
		fields=["name", "dt", "fieldname"],
	)
	for row in rows:
		if frappe.db.exists("DocField", {"parent": row.dt, "fieldname": row.fieldname}):
			frappe.delete_doc("Custom Field", row.name, force=1, ignore_permissions=True)


def _purge_ui_scripts():
	"""Keep Client Script / Server Script desks empty — logic lives in app code."""
	for name in frappe.get_all("Client Script", filters={"dt": ("like", "IDO%")}, pluck="name"):
		frappe.delete_doc("Client Script", name, force=1, ignore_permissions=True)

	names = set()
	for filters in (
		{"name": ("like", "ido.%")},
		{"api_method": ("like", "ido.%")},
		{"script_type": "DocType Event", "reference_doctype": ("like", "IDO%")},
		{"script_type": "DocType Event", "name": ("like", "IDO%")},
	):
		names.update(frappe.get_all("Server Script", filters=filters, pluck="name"))
	for name in names:
		frappe.delete_doc("Server Script", name, force=1, ignore_permissions=True)


def _ensure_roles():
	"""Safety net if fixtures lag; roles also come from fixtures."""
	roles = [
		"IDO Owner",
		"IDO Event Manager",
		"IDO Event Planner",
		"IDO Organizer",
		"IDO Operations",
		"IDO Venue Manager",
		"IDO Visa Team",
		"IDO Travel Team",
		"IDO Airport Desk",
		"IDO Hotel Desk",
		"IDO Badge Team",
		"IDO Usher",
		"IDO Guest Services",
		"IDO Driver",
		"IDO Guest",
		"IDO Protocol Desk",
		"IDO Liaison Host",
		"IDO Security Vetting",
		"IDO Accreditation Officer",
	]
	for role in roles:
		if not frappe.db.exists("Role", role):
			frappe.get_doc(
				{
					"doctype": "Role",
					"role_name": role,
					"desk_access": 1,
					"is_custom": 1,
				}
			).insert(ignore_permissions=True)
