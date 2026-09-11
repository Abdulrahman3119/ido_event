"""Doc events for IDO KYC Verification."""

from __future__ import annotations

import frappe
from frappe import _

from ido_event.engine import STAGES, gate_error, mirror_guest, next_stage, set_stage, stage_path


def on_update(doc, method=None):
	"""Frappe fires on_update after saving an existing KYC doc."""
	_sync_kyc_and_advance(doc)


def after_save(doc, method=None):
	# Back-compat alias
	_sync_kyc_and_advance(doc)


def _sync_kyc_and_advance(doc):
	if not doc.guest:
		return

	if doc.status in ("approved", "rejected") and not doc.reviewed_at:
		frappe.db.set_value(
			doc.doctype,
			doc.name,
			{
				"reviewed_by": frappe.session.user,
				"reviewed_at": frappe.utils.now_datetime(),
			},
			update_modified=False,
		)

	mirror_guest(doc.guest)

	if doc.status == "approved":
		try:
			_advance_guest_after_kyc_approved(doc)
		except Exception:
			frappe.log_error(title="IDO KYC advance failed")
			raise


def _advance_guest_after_kyc_approved(doc):
	"""When KYC is approved, move the guest to stage kyc_approved."""
	guest_name = doc.guest
	guest = frappe.get_doc("IDO Guest", guest_name)
	path = stage_path(guest)

	if "kyc_approved" not in path:
		return

	current = guest.stage or "invited"
	if current in path and path.index(current) >= path.index("kyc_approved"):
		return

	prev = doc.get_doc_before_save()
	just_approved = not prev or prev.status != "approved"

	# Walk invited → registered → … → kyc_approved
	while guest.stage != "kyc_approved":
		target = next_stage(guest)
		if not target or target not in path:
			break
		if path.index(target) > path.index("kyc_approved"):
			break

		# Final KYC step: this doc is already approved — don't re-query status
		if target == "kyc_approved":
			set_stage(
				guest,
				"kyc_approved",
				"auto",
				reason=_("اعتماد التحقق من الهوية"),
				rule="KYC-APPROVE",
			)
			break

		err = gate_error(target, guest)
		if err:
			frappe.log_error(title="IDO KYC advance blocked", message=f"{guest_name}: {err}")
			break
		set_stage(guest, target, "auto", reason=_("اعتماد التحقق من الهوية"), rule="KYC-APPROVE")

	final = frappe.db.get_value("IDO Guest", guest_name, "stage")
	if final == "kyc_approved" and just_approved:
		frappe.msgprint(
			_("تم تقديم رحلة الضيف إلى مرحلة «الهوية معتمدة»"),
			indicator="green",
			alert=True,
		)
	elif final != "kyc_approved" and current in path and path.index(current) < path.index(
		"kyc_approved"
	):
		# Last-resort force (KYC is approved)
		guest.reload()
		set_stage(
			guest,
			"kyc_approved",
			"auto",
			reason=_("اعتماد التحقق من الهوية"),
			rule="KYC-APPROVE-FORCE",
		)
		frappe.msgprint(
			_("تم تقديم رحلة الضيف إلى مرحلة «الهوية معتمدة»"),
			indicator="green",
			alert=True,
		)
