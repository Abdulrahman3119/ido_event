"""Doc events for IDO Invitation."""

from __future__ import annotations

import frappe


def before_save(doc, method=None):
	if not doc.invitation_code:
		doc.invitation_code = frappe.utils.random_string(8).upper()
	doc.secure_link = frappe.utils.get_url("/guest?code=" + doc.invitation_code)
