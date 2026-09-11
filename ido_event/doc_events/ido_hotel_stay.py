"""Doc events for IDO Hotel Stay (migrated from Server Scripts)."""

from __future__ import annotations

import frappe

from ido_event.engine import (
	auto_advance,
	latest_status,
	mirror_guest,
)


def after_save(doc, method=None):
	# from Server Script: IDO Hotel Stay — after save (was disabled=1)
	mirror_guest(doc.guest)
	if doc.room_number:
		for r in frappe.get_all("IDO Hotel Room",filters={"parent":doc.hotel,"room_number":doc.room_number},fields=["name"]):
			frappe.db.set_value("IDO Hotel Room",r.name,{"guest":doc.guest,"status":{"reserved":"reserved","completed":"occupied","checked_out":"available","pending":"reserved","no_show":"available"}[doc.check_in_state]})
	if doc.check_in_state=="completed": auto_advance(doc.guest,"hotel_checkin")


def before_save(doc, method=None):
	# from Server Script: IDO Hotel Stay — validate (was disabled=1)
	if doc.check_in_state=="completed":
		trip=latest_status("IDO Transport Trip",doc.guest,"state")
		if frappe.db.get_value("IDO Guest",doc.guest,"travel_mode")=="flying" and trip not in ("arrived","completed"): frappe.throw("قاعدة العمل 006: لا يمكن تسجيل دخول الفندق قبل وصول رحلة النقل.")
		if not doc.checked_in_at: doc.checked_in_by=frappe.session.user; doc.checked_in_at=frappe.utils.now_datetime()
