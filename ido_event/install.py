"""Install / migrate hooks for ido_event."""

from __future__ import annotations

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


def after_install():
	_ensure_module()
	_ensure_roles()
	_adopt_existing_doctypes()
	_drop_merged_custom_fields()
	_purge_ui_scripts()


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
