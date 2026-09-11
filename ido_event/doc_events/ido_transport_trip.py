"""Doc events for IDO Transport Trip (migrated from Server Scripts)."""

from __future__ import annotations

import frappe

from ido_event.engine import (
	auto_advance,
	mirror_guest,
)


def after_save(doc, method=None):
	# from Server Script: IDO Transport Trip — after save (was disabled=1)
	mirror_guest(doc.guest)
	frappe.db.set_value("IDO Driver",doc.driver,"status","on_trip" if doc.state in ("assigned","en_route","picked_up") else "available")
	if doc.state in ("en_route","picked_up","arrived","completed"): auto_advance(doc.guest,"in_transit")


def before_save(doc, method=None):
	# from Server Script: IDO Transport Trip — validate (was disabled=1)
	if doc.trip_type=="Airport → Hotel" and not frappe.db.get_value("IDO Arrival",{"guest":doc.guest},"confirmed"): frappe.throw("قاعدة العمل 005: لا يمكن إسناد السائق قبل تأكيد الوصول.")
	for s,f in (("en_route","started_at"),("picked_up","picked_up_at"),("arrived","arrived_at"),("completed","completed_at")):
		if doc.state==s and not doc.get(f): doc.set(f,frappe.utils.now_datetime())
