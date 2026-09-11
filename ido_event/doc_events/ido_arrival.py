"""Doc events for IDO Arrival (migrated from Server Scripts)."""

from __future__ import annotations

import frappe

from ido_event.engine import (
	auto_advance,
	mirror_guest,
)


def after_save(doc, method=None):
	# from Server Script: IDO Arrival — after save (was disabled=1)
	mirror_guest(doc.guest)
	if doc.status=="landed": auto_advance(doc.guest,"traveling")
	if doc.confirmed:
		auto_advance(doc.guest,"arrived")
		if doc.assigned_driver and not frappe.db.exists("IDO Transport Trip",{"guest":doc.guest,"state":["not in",["completed","cancelled"]]}):
			frappe.get_doc({"doctype":"IDO Transport Trip","guest":doc.guest,"driver":doc.assigned_driver,"pickup_location":doc.meeting_point or doc.terminal or "Airport","hotel":frappe.db.get_value("IDO Hotel Stay",{"guest":doc.guest},"hotel"),"luggage_notes":doc.luggage_notes,"scheduled_at":frappe.utils.now_datetime()}).insert(ignore_permissions=True)


def before_save(doc, method=None):
	# from Server Script: IDO Arrival — validate (was disabled=1)
	if doc.status=="confirmed" and not doc.confirmed:
		doc.confirmed=1; doc.confirmed_by=frappe.session.user; doc.scanned_at=frappe.utils.now_datetime()
	if doc.status!="confirmed": doc.confirmed=0
