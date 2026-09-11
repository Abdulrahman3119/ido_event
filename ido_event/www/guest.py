"""Guest invitation portal — /guest?code=XXXX."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import formatdate, get_url

from ido_event.api import register as api_register
from ido_event.api import verify_invitation

no_cache = 1


def get_context(context):
	frappe.flags.show_sidebar = False
	context.no_cache = 1
	context.show_sidebar = False
	context.no_header = True
	context.full_width = True

	code = (frappe.form_dict.get("code") or "").strip()
	context.code = code
	context.verified = None
	context.error = None
	context.cover_image = None
	context.date_range = ""
	context.description = ""

	if not code:
		context.error = _("أدخل رمز الدعوة أو افتح الرابط المرسل إليك.")
		return context

	try:
		result = verify_invitation(code)
	except Exception:
		frappe.log_error(title="IDO guest portal verify failed")
		context.error = _("تعذّر التحقق من الدعوة. حاول مرة أخرى.")
		return context

	if not result or not result.get("ok"):
		context.error = _("رمز الدعوة غير صالح أو منتهٍ.")
		return context

	context.verified = result
	event = result.get("event") or {}
	guest = result.get("guest") or {}

	# Enrich event visual fields
	inv = frappe.db.get_value(
		"IDO Invitation",
		{"invitation_code": code},
		["event", "guest"],
		as_dict=True,
	)
	event_name_key = inv.event if inv else None
	if event_name_key:
		fields = ["cover_image", "description_ar", "description"]
		meta = frappe.get_meta("IDO Event")
		if meta.has_field("city"):
			fields.append("city")
		extra = frappe.db.get_value("IDO Event", event_name_key, fields, as_dict=True) or {}
		event = {**event, **extra}

	cover = (event.get("cover_image") or "").strip()
	if cover:
		from urllib.parse import quote, urlsplit, urlunsplit

		if cover.startswith(("http://", "https://")):
			u = urlsplit(cover)
			context.cover_image = urlunsplit(
				(u.scheme, u.netloc, quote(u.path, safe="/"), u.query, u.fragment)
			)
		else:
			if not cover.startswith("/"):
				cover = "/" + cover
			context.cover_image = quote(cover, safe="/")
		context.cover_image_abs = (
			context.cover_image
			if context.cover_image.startswith("http")
			else get_url(context.cover_image)
		)

	start = event.get("start_date")
	end = event.get("end_date")
	parts = []
	if start:
		parts.append(formatdate(start, "dd MMM yyyy"))
	if end and str(end) != str(start):
		parts.append(formatdate(end, "dd MMM yyyy"))
	context.date_range = " — ".join(parts)

	desc = (event.get("description_ar") or event.get("description") or "").strip()
	# Strip HTML lightly for a short teaser
	if desc:
		context.description = frappe.utils.strip_html(desc)[:220]

	context.event_name = event.get("event_name_ar") or event.get("event_name") or ""
	context.event = event
	context.guest = guest
	context.event_key = event_name_key
	context.title = context.event_name or _("بوابة الضيف")
	context.nationalities = _nationality_options(guest.get("nationality"))
	context.countries = _nationality_options(guest.get("issue_country"))
	context.airports = _airport_options(guest.get("preferred_airport"))
	if guest.get("date_of_birth"):
		context.guest_dob = str(guest.get("date_of_birth"))
	else:
		context.guest_dob = ""
	if guest.get("passport_expiry"):
		context.guest_passport_expiry = str(guest.get("passport_expiry"))
	else:
		context.guest_passport_expiry = ""
	return context


# Values must match IDO Guest / IDO Flight Request Select options
_AIRPORTS = [
	("RUH — King Khalid Intl (Riyadh)", "RUH — مطار الملك خالد (الرياض)"),
	("JED — King Abdulaziz Intl (Jeddah)", "JED — مطار الملك عبدالعزيز (جدة)"),
	("DMM — King Fahd Intl (Dammam)", "DMM — مطار الملك فهد (الدمام)"),
	("MED — Prince Mohammad bin Abdulaziz (Madinah)", "MED — مطار الأمير محمد بن عبدالعزيز (المدينة)"),
	("DXB — Dubai Intl", "DXB — مطار دبي"),
	("AUH — Abu Dhabi Intl", "AUH — مطار أبوظبي"),
	("DOH — Hamad Intl (Doha)", "DOH — مطار حمد (الدوحة)"),
	("BAH — Bahrain Intl", "BAH — مطار البحرين"),
	("KWI — Kuwait Intl", "KWI — مطار الكويت"),
	("MCT — Muscat Intl", "MCT — مطار مسقط"),
	("CAI — Cairo Intl", "CAI — مطار القاهرة"),
	("Other", "أخرى"),
]


def _airport_options(selected: str | None = None) -> list[dict]:
	return [
		{
			"value": value,
			"label": label,
			"selected": 1 if selected and selected == value else 0,
		}
		for value, label in _AIRPORTS
	]


def _nationality_options(selected: str | None = None) -> list[dict]:
	"""Countries from Frappe Country DocType for the nationality select."""
	rows = frappe.get_all(
		"Country",
		fields=["name", "country_name", "code"],
		order_by="name asc",
		limit_page_length=500,
	)
	# Pin Saudi Arabia at the top for KSA events
	priority = {"Saudi Arabia": 0}
	rows.sort(key=lambda r: (priority.get(r.name, 1), (r.country_name or r.name or "").lower()))

	options = []
	for r in rows:
		label = r.country_name or r.name
		options.append(
			{
				"name": r.name,
				"label": label,
				"selected": 1 if selected and selected == r.name else 0,
			}
		)
	return options


@frappe.whitelist(allow_guest=True)
def submit_registration(**kwargs):
	"""Thin wrapper used by the portal form (CSRF-safe via frappe.call)."""
	return api_register(**kwargs)
