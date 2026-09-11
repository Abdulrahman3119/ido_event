"""Doc events for IDO Badge (migrated from Server Scripts)."""

from __future__ import annotations

import frappe

from ido_event.engine import (
	auto_advance,
	latest_status,
	mirror_guest,
)


def after_save(doc, method=None):
	# from Server Script: IDO Badge — after save (was disabled=1)
	mirror_guest(doc.guest)
	if doc.state in ("ready","collected"):
		if doc.qr_enabled and not doc.qr_pass:
			for n in frappe.get_all("IDO QR Pass",filters={"guest":doc.guest,"revoked":0},fields=["name"]): frappe.db.set_value("IDO QR Pass",n.name,"revoked",1)
			q=frappe.get_doc({"doctype":"IDO QR Pass","guest":doc.guest,"event":doc.event}).insert(ignore_permissions=True)
			frappe.db.set_value("IDO Badge",doc.name,"qr_pass",q.name)
		auto_advance(doc.guest,"badge_ready")
	if doc.state=="revoked" and doc.qr_pass: frappe.db.set_value("IDO QR Pass",doc.qr_pass,"revoked",1)


def before_save(doc, method=None):
	# from Server Script: IDO Badge — validate (was disabled=1)
	if doc.state in ("printed","ready","collected"):
		if frappe.db.get_value("IDO Event",doc.event,"badge_requires_hotel") and latest_status("IDO Hotel Stay",doc.guest,"check_in_state")!="completed": frappe.throw("قاعدة العمل 007: لا يمكن إصدار بطاقة الدخول قبل تسجيل دخول الفندق.")
	if doc.state in ("printed","ready") and not doc.printed_at: doc.printed_at=frappe.utils.now_datetime(); doc.printed_by=frappe.session.user
	if doc.state=="collected" and not doc.collected_at: doc.collected_at=frappe.utils.now_datetime()
