"""Send IDO Invitation by email (and prepare WhatsApp link) from the server."""

from __future__ import annotations

import re
from urllib.parse import quote

import frappe
from frappe import _
from frappe.utils import get_url, now_datetime


def ensure_invitation(guest: str, event: str | None = None) -> str:
	"""Return existing invitation name for guest, or create one."""
	existing = frappe.db.get_value("IDO Invitation", {"guest": guest}, "name")
	if existing:
		return existing

	guest_doc = frappe.get_doc("IDO Guest", guest)
	event = event or guest_doc.event
	if not event:
		frappe.throw(_("لا يمكن إنشاء دعوة بدون فعالية مرتبطة بالضيف"))

	code = frappe.utils.random_string(8).upper()
	doc = frappe.get_doc(
		{
			"doctype": "IDO Invitation",
			"guest": guest,
			"event": event,
			"invitation_code": code,
			"secure_link": get_url(f"/guest?code={code}"),
			"status": "draft",
			"send_channel": "email",
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def ensure_registration(guest: str, event: str | None = None) -> str:
	"""Register guest on the event (IDO Registration) if missing."""
	existing = frappe.db.get_value("IDO Registration", {"guest": guest}, "name")
	if existing:
		# keep event in sync if empty
		reg_event = frappe.db.get_value("IDO Registration", existing, "event")
		if not reg_event and event:
			frappe.db.set_value("IDO Registration", existing, "event", event)
		return existing

	guest_doc = frappe.get_doc("IDO Guest", guest)
	event = event or guest_doc.event
	if not event:
		frappe.throw(_("لا يمكن تسجيل الضيف بدون فعالية مرتبطة"))

	doc = frappe.get_doc(
		{
			"doctype": "IDO Registration",
			"guest": guest,
			"event": event,
			"status": "confirmed",
			"registered_on": now_datetime(),
			"order_type": "package",
			"notes": _("تسجيل تلقائي عند إنشاء الضيف"),
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def _context(inv) -> dict:
	guest = frappe.get_doc("IDO Guest", inv.guest)
	event = frappe.get_doc("IDO Event", inv.event)
	event_name = event.event_name_ar or event.event_name or inv.event
	return {
		"invitation": inv,
		"guest": guest,
		"event": event,
		"event_name": event_name,
		"secure_link": inv.secure_link or get_url(f"/guest?code={inv.invitation_code}"),
	}


def _default_subject(ctx: dict) -> str:
	return f"دعوة رسمية — {ctx['event_name']}"


def _default_html(ctx: dict) -> str:
	g, e, name, link, code = (
		ctx["guest"],
		ctx["event"],
		ctx["event_name"],
		ctx["secure_link"],
		ctx["invitation"].invitation_code,
	)
	venue = f" · {e.venue}" if getattr(e, "venue", None) else ""
	return f"""<div dir="rtl" style="font-family:Tahoma,sans-serif;line-height:1.7">
		<h2 style="color:#5C2D91;margin:0 0 12px">{frappe.utils.escape_html(str(name))}</h2>
		<p>عزيزي/عزيزتي {frappe.utils.escape_html(g.first_name or "")}،</p>
		<p>يسرّنا دعوتك لحضور <b>{frappe.utils.escape_html(str(name))}</b>
		في الفترة {e.start_date or ""} — {e.end_date or ""}{frappe.utils.escape_html(venue)}.</p>
		<p style="margin:24px 0">
			<a href="{link}" style="background:#5C2D91;color:#fff;padding:12px 26px;border-radius:999px;text-decoration:none;display:inline-block">
				ابدأ التسجيل
			</a>
		</p>
		<p style="font-size:12px;color:#777">رمز الدعوة: <b>{frappe.utils.escape_html(code or "")}</b>
		— الرابط شخصي، لا تشاركه.</p>
	</div>"""


def _default_whatsapp(ctx: dict) -> str:
	g, e, name, link, code = (
		ctx["guest"],
		ctx["event"],
		ctx["event_name"],
		ctx["secure_link"],
		ctx["invitation"].invitation_code,
	)
	venue = f"\n{e.venue}" if getattr(e, "venue", None) else ""
	return (
		f"مرحباً {g.first_name or ''}،\n\n"
		f"يسرّنا دعوتك لحضور *{name}*\n"
		f"{e.start_date or ''} — {e.end_date or ''}{venue}\n\n"
		f"ابدأ التسجيل من الرابط:\n{link}\n\n"
		f"رمز الدعوة: {code}"
	)


def _render_email(inv, ctx: dict) -> tuple[str, str]:
	"""Return (subject, html) from Email Template or default."""
	if inv.email_template and frappe.db.exists("Email Template", inv.email_template):
		tpl = frappe.get_doc("Email Template", inv.email_template)
		subject = frappe.render_template(tpl.subject or "", ctx)
		body = tpl.response_html if getattr(tpl, "use_html", 0) else (tpl.response or "")
		if not body and getattr(tpl, "response_html", None):
			body = tpl.response_html
		message = frappe.render_template(body or "", ctx)
		return subject, message
	return _default_subject(ctx), _default_html(ctx)


def _digits(phone: str | None) -> str:
	return re.sub(r"\D", "", phone or "")


def send_invitation(
	invitation: str | None = None,
	guest: str | None = None,
	channel: str | None = None,
	*,
	force: bool = False,
) -> dict:
	"""Send invitation via email and/or return WhatsApp deep link.

	``channel``: email | whatsapp | both — defaults to invitation.send_channel or email.
	"""
	invitation = invitation or frappe.form_dict.get("invitation")
	guest = guest or frappe.form_dict.get("guest")
	channel = (channel or frappe.form_dict.get("channel") or "").strip().lower() or None
	force = force or frappe.utils.cint(frappe.form_dict.get("force"))

	if not invitation and guest:
		invitation = ensure_invitation(guest)
	if not invitation:
		frappe.throw(_("حدد الدعوة أو الضيف"))

	inv = frappe.get_doc("IDO Invitation", invitation)
	if not frappe.has_permission("IDO Invitation", "write", inv):
		frappe.throw(_("لا تملك صلاحية إرسال هذه الدعوة"), frappe.PermissionError)

	# Refresh secure link
	if not inv.invitation_code:
		inv.invitation_code = frappe.utils.random_string(8).upper()
	inv.secure_link = get_url(f"/guest?code={inv.invitation_code}")
	inv.save(ignore_permissions=True)

	if inv.status in ("accepted", "declined", "expired") and not force:
		frappe.throw(_("لا يمكن إرسال دعوة بحالة «{0}»").format(inv.status))

	channel = channel or (inv.send_channel or "email")
	if channel not in ("email", "whatsapp", "both"):
		channel = "email"

	ctx = _context(inv)
	guest_doc = ctx["guest"]
	result = {
		"ok": True,
		"invitation": inv.name,
		"guest": guest_doc.name,
		"channel": channel,
		"secure_link": ctx["secure_link"],
		"invitation_code": inv.invitation_code,
		"email_sent": False,
		"whatsapp_url": None,
	}

	now = now_datetime()
	updates = {}

	if channel in ("email", "both"):
		if not guest_doc.email:
			frappe.throw(_("لا يوجد بريد إلكتروني لهذا الضيف"))
		subject, message = _render_email(inv, ctx)
		frappe.sendmail(
			recipients=[guest_doc.email],
			subject=subject,
			message=message,
			reference_doctype="IDO Invitation",
			reference_name=inv.name,
			now=True,
		)
		# Timeline entry on Invitation + Guest
		frappe.get_doc(
			{
				"doctype": "Communication",
				"communication_type": "Communication",
				"communication_medium": "Email",
				"sent_or_received": "Sent",
				"subject": subject,
				"content": message,
				"reference_doctype": "IDO Invitation",
				"reference_name": inv.name,
				"recipients": guest_doc.email,
			}
		).insert(ignore_permissions=True)
		result["email_sent"] = True
		result["email"] = guest_doc.email
		updates["sent_at"] = now

	if channel in ("whatsapp", "both"):
		num = _digits(inv.whatsapp_number or guest_doc.mobile)
		if not num:
			if channel == "whatsapp":
				frappe.throw(_("لا يوجد رقم جوال لهذا الضيف"))
		else:
			msg = _default_whatsapp(ctx)
			result["whatsapp_url"] = f"https://wa.me/{num}?text={quote(msg)}"
			result["whatsapp_number"] = num
			updates["whatsapp_sent_at"] = now
			if "sent_at" not in updates:
				updates["sent_at"] = now

	if updates:
		updates["status"] = "sent"
		frappe.db.set_value("IDO Invitation", inv.name, updates, update_modified=True)

	return result


def create_kyc_from_registration(
	guest: str,
	*,
	passport_number: str | None = None,
	passport_expiry: str | None = None,
	issue_country: str | None = None,
	passport_image: str | None = None,
	face_image: str | None = None,
) -> str:
	"""Create or refresh IDO KYC Verification after invitation registration."""
	from ido_event.engine import mirror_guest
	from ido_event.mappers import country_from_iso

	if not guest or not frappe.db.exists("IDO Guest", guest):
		frappe.throw(_("الضيف غير موجود"))

	issue_country = country_from_iso(issue_country)
	passport_image = _maybe_save_data_url(passport_image, guest, "passport")
	face_image = _maybe_save_data_url(face_image, guest, "face")

	existing = frappe.get_all(
		"IDO KYC Verification",
		filters={"guest": guest},
		fields=["name", "status"],
		order_by="creation desc",
		limit=1,
	)

	values = {
		"passport_number": passport_number,
		"passport_expiry": passport_expiry or None,
		"issue_country": issue_country,
		"status": "under_review",
	}
	if passport_image:
		values["passport_image"] = passport_image
	if face_image:
		values["face_image"] = face_image

	if existing:
		name = existing[0].name
		if existing[0].status == "approved":
			return name
		doc = frappe.get_doc("IDO KYC Verification", name)
		doc.update({k: v for k, v in values.items() if v not in (None, "")})
		doc.flags.ignore_mandatory = True
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc({"doctype": "IDO KYC Verification", "guest": guest, **values})
		doc.flags.ignore_mandatory = True
		doc.insert(ignore_permissions=True)
		name = doc.name

	frappe.db.set_value(
		"IDO Guest",
		guest,
		{
			"passport_number": passport_number,
			"passport_expiry": passport_expiry or None,
			"issue_country": issue_country,
		},
		update_modified=False,
	)
	mirror_guest(guest)
	return name


def _maybe_save_data_url(value: str | None, guest: str, kind: str) -> str | None:
	"""Accept existing /files/... path or data:image;...;base64,... and return file URL."""
	if not value:
		return None
	value = value.strip()
	if value.startswith(("/files/", "/private/files/", "http://", "https://")):
		return value
	if not value.startswith("data:"):
		return value

	import base64
	import re

	from frappe.utils.file_manager import save_file

	m = re.match(r"data:(image/[^;]+);base64,(.+)$", value, re.DOTALL)
	if not m:
		return None
	mime, b64 = m.group(1), m.group(2)
	ext = {"image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp"}.get(
		mime, "jpg"
	)
	try:
		content = base64.b64decode(b64)
	except Exception:
		frappe.throw(_("تعذّر قراءة صورة {0}").format(kind))
	if len(content) > 8 * 1024 * 1024:
		frappe.throw(_("حجم صورة {0} كبير جداً (الحد 8MB)").format(kind))

	fname = f"kyc-{kind}-{guest}-{frappe.generate_hash(length=6)}.{ext}"
	f = save_file(fname, content, "IDO Guest", guest, is_private=1)
	return f.file_url
