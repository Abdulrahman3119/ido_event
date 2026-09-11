"""Doc events for IDO Visa Application (migrated from Server Scripts)."""

from __future__ import annotations

import frappe

from ido_event.engine import (
	auto_advance,
	latest_status,
	mirror_guest,
)


def after_save(doc, method=None):
	# from Server Script: IDO Visa Application — after save (was disabled=1)
	mirror_guest(doc.guest)
	if doc.status in ("processing","docs_required"): auto_advance(doc.guest,"visa_processing")
	elif doc.status in ("approved","issued","not_required"): auto_advance(doc.guest,"visa_approved")


def before_save(doc, method=None):
	# from Server Script: IDO Visa Application — validate (was disabled=1)
	from ido_event.engine import visa_not_required

	if visa_not_required(doc.guest) and doc.status not in ("not_started", "not_required", ""):
		frappe.throw(
			"ضيف التعاون الخليجي / المحلي لا يحتاج تأشيرة — اضبط الحالة على «غير مطلوب» أو احذف الطلب."
		)
	kyc = latest_status("IDO KYC Verification", doc.guest)
	if doc.status not in ("not_started", "not_required") and kyc != "approved":
		frappe.throw("قاعدة العمل 002: لا يمكن بدء التأشيرة قبل اعتماد التحقق من الهوية.")
	if doc.status == "processing" and not doc.submitted_at:
		doc.submitted_at = frappe.utils.now_datetime()
	if doc.status == "issued" and not doc.issued_at:
		doc.issued_at = frappe.utils.now_datetime()
