"""Doc events for IDO QR Pass (migrated from Server Scripts)."""

from __future__ import annotations

import frappe



def before_save(doc, method=None):
	# from Server Script: IDO QR Pass — validate (was disabled=1)
	if not doc.token:
		doc.token=frappe.utils.random_string(32); doc.checksum=frappe.utils.random_string(12); doc.issued_at=frappe.utils.now_datetime()
		doc.expires_at=doc.expires_at or frappe.utils.add_days(frappe.utils.now_datetime(),7)
