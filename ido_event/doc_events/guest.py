"""Doc events for IDO Guest."""

from __future__ import annotations

import frappe

from ido_event.engine import GCC_NATIONALITIES, GCC_REGIONS, visa_not_required


def before_save(doc, method=None):
	doc.full_name = ((doc.first_name or "") + " " + (doc.last_name or "")).strip()
	if doc.nationality == "Saudi Arabia" and doc.is_new() and not doc.travel_mode:
		doc.travel_mode = "local"

	# Auto-tag Gulf Cooperation region from GCC nationality
	if doc.nationality in GCC_NATIONALITIES and not doc.region:
		doc.region = "gcc"
	# Normalize legacy value
	if doc.region == "gcc_me":
		doc.region = "gcc"

	if visa_not_required(doc):
		doc.visa_status = "not_required"

	if doc.pdpl_consent and not doc.consent_at:
		doc.consent_at = frappe.utils.now_datetime()
	if not doc.is_new() and not frappe.flags.ido_engine:
		old = frappe.db.get_value("IDO Guest", doc.name, "stage")
		if old and old != doc.stage:
			frappe.throw("المرحلة تُدار عبر محرك الرحلة فقط (تقديم / تجاوز).")


def after_insert(doc, method=None):
	"""Register guest on event + ensure invitation; optionally create portal User."""
	if doc.event:
		try:
			from ido_event.invitation_send import ensure_invitation, ensure_registration

			ensure_registration(doc.name, doc.event)
			ensure_invitation(doc.name, doc.event)
		except Exception:
			frappe.log_error(title="IDO Guest auto-register failed")

	if not doc.email or doc.user:
		return
	if not frappe.db.get_single_value("IDO Event Settings", "auto_create_portal_user"):
		return

	existing = frappe.db.get_value("User", {"email": doc.email}, "name")
	if existing:
		frappe.db.set_value("IDO Guest", doc.name, "user", existing)
		return

	user = frappe.get_doc(
		{
			"doctype": "User",
			"email": doc.email,
			"first_name": doc.first_name or doc.email.split("@")[0],
			"last_name": doc.last_name or "",
			"send_welcome_email": 0,
			"user_type": "Website User",
			"enabled": 1,
		}
	)
	user.insert(ignore_permissions=True)
	if frappe.db.exists("Role", "IDO Guest"):
		user.add_roles("IDO Guest")
	frappe.db.set_value("IDO Guest", doc.name, "user", user.name)


def on_update(doc, method=None):
	"""If region becomes GCC while guest is stuck on a visa stage, jump past visa."""
	if not visa_not_required(doc):
		return
	if doc.stage not in ("visa_processing", "visa_approved"):
		return
	from ido_event.engine import set_stage

	# Land on kyc_approved (or stay) then operator advances to flight — prefer kyc_approved
	# if still early, else flight_requested if KYC done
	target = "kyc_approved"
	if doc.kyc_status == "approved" or frappe.db.get_value(
		"IDO KYC Verification", {"guest": doc.name, "status": "approved"}, "name"
	):
		target = "flight_requested"
	# Only move backward-safe: from visa_* to a non-visa stage
	guest = frappe.get_doc("IDO Guest", doc.name)
	if guest.stage in ("visa_processing", "visa_approved"):
		set_stage(
			guest,
			target if target != guest.stage else "kyc_approved",
			"auto",
			reason="إعفاء تأشيرة — التعاون الخليجي",
			rule="GCC-VISA-SKIP",
		)
