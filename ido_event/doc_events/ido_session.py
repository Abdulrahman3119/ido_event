"""Doc events for IDO Session (migrated from Server Scripts)."""

from __future__ import annotations

import frappe



def before_save(doc, method=None):
	# from Server Script: IDO Session — validate (was disabled=1)
	if doc.hall and doc.date:
		for s in frappe.get_all("IDO Session",filters={"event":doc.event,"hall":doc.hall,"date":doc.date,"name":["!=",doc.name],"start_time":["<",doc.end_time],"end_time":[">",doc.start_time]},fields=["name"]):
			frappe.throw("تعارض في القاعة "+doc.hall+" مع الجلسة "+s.name)
