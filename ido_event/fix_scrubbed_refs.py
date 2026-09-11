"""Fix Web Forms / charts corrupted by Arabic scrub of DocType names."""

from __future__ import annotations

import frappe


FIXES = {
	"IDO التحقق من الهوية Verification": "IDO KYC Verification",
	"IDO Guest تقييم": "IDO Guest Feedback",
	"IDO رمز الدخول Pass": "IDO QR Pass",
}


def run():
	# Web Forms
	for name in frappe.get_all("Web Form", pluck="name"):
		doc = frappe.get_doc("Web Form", name)
		changed = False
		if doc.doc_type in FIXES:
			doc.doc_type = FIXES[doc.doc_type]
			changed = True
		# Rename pure-Arabic routes/names
		renames = {
			"التحقق-من-الهوية-kyc": ("التحقق-من-الهوية", "ido-kyc", "التحقق من الهوية"),
			"تذكرة-دعم-·-support-ticket": ("تذكرة-دعم", "ido-support", "تذكرة دعم"),
			"تقييم-التجربة-·-feedback": ("تقييم-التجربة", "ido-feedback", "تقييم التجربة"),
			"طلب-طيران-·-flight-request": ("طلب-طيران", "ido-flight-request", "طلب طيران"),
			"طلب-عرض-توضيحي-·-request-a-demo": (
				"طلب-عرض-توضيحي",
				"ido-demo-request",
				"طلب عرض توضيحي",
			),
		}
		if name in renames:
			new_name, route, title = renames[name]
			doc.route = route
			doc.title = title
			if changed or doc.route == route:
				doc.save(ignore_permissions=True)
			# rename doc
			if name != new_name and not frappe.db.exists("Web Form", new_name):
				frappe.rename_doc("Web Form", name, new_name, force=True)
			print("fixed web form", name, "→", new_name, doc.doc_type)
			continue
		if changed:
			doc.save(ignore_permissions=True)
			print("fixed web form", name, doc.doc_type)

	# Number cards / charts / dashboards document_type
	for dt in ("Number Card", "Dashboard Chart"):
		for name in frappe.get_all(dt, pluck="name"):
			val = frappe.db.get_value(dt, name, "document_type")
			if val in FIXES:
				frappe.db.set_value(dt, name, "document_type", FIXES[val])
				print("fixed", dt, name)

	# Print formats
	for name in frappe.get_all("Print Format", pluck="name"):
		val = frappe.db.get_value("Print Format", name, "doc_type")
		if val in FIXES:
			frappe.db.set_value("Print Format", name, "doc_type", FIXES[val])
			print("fixed Print Format", name)

	frappe.db.commit()
	print("done")
