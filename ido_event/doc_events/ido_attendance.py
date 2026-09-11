"""Doc events for IDO Attendance (migrated from Server Scripts)."""

from __future__ import annotations

import frappe

from ido_event.engine import (
	auto_advance,
)


def after_insert(doc, method=None):
	# from Server Script: IDO Attendance — after insert (was disabled=1)
	frappe.db.set_value("IDO Session",doc.session,"attendance_count",frappe.db.count("IDO Attendance",{"session":doc.session}))
	day=frappe.db.get_value("IDO Session",doc.session,"day")
	if day in (1,2,3): auto_advance(doc.guest,"day"+str(day))


def before_save(doc, method=None):
	# from Server Script: IDO Attendance — validate (was disabled=1)
	if frappe.db.exists("IDO Attendance",{"guest":doc.guest,"session":doc.session,"name":["!=",doc.name]}): frappe.throw("الضيف مسجّل حضوره في هذه الجلسة مسبقًا.")
	doc.checked_in_at=doc.checked_in_at or frappe.utils.now_datetime(); doc.checked_in_by=doc.checked_in_by or frappe.session.user
