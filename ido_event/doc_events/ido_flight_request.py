"""Doc events for IDO Flight Request (migrated from Server Scripts)."""

from __future__ import annotations

import frappe

from ido_event.engine import (
	auto_advance,
	latest_status,
	mirror_guest,
)


def after_save(doc, method=None):
	# from Server Script: IDO Flight Request — after save (was disabled=1)
	mirror_guest(doc.guest)
	if doc.status in ("requested","under_review","approved"): auto_advance(doc.guest,"flight_requested")
	elif doc.status=="ticket_issued":
		auto_advance(doc.guest,"ticket_issued")
		if not frappe.db.exists("IDO Arrival",{"guest":doc.guest}):
			frappe.get_doc({"doctype":"IDO Arrival","guest":doc.guest,"flight_number":doc.flight_number,"expected_at":doc.arrival_time,"terminal":doc.terminal}).insert(ignore_permissions=True)


def before_save(doc, method=None):
	# from Server Script: IDO Flight Request — validate (was disabled=1)
	from ido_event.engine import visa_not_required

	visa = latest_status("IDO Visa Application", doc.guest)
	mode = frappe.db.get_value("IDO Guest", doc.guest, "travel_mode")
	if (
		mode == "flying"
		and not visa_not_required(doc.guest)
		and visa not in ("approved", "issued", "not_required")
	):
		frappe.throw("قاعدة العمل 004: لا يمكن طلب الطيران قبل اعتماد التأشيرة.")
	if doc.status == "ticket_issued" and not (doc.flight_number and doc.ticket_pdf):
		frappe.throw("إصدار التذكرة: رقم الرحلة ومستند التذكرة مطلوبان.")
