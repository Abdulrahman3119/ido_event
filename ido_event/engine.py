"""Shared guest lifecycle engine — single source for stage transitions + BR gates."""

from __future__ import annotations

import frappe
from frappe import _

STAGES = [
	"invited",
	"registered",
	"kyc_approved",
	"visa_processing",
	"visa_approved",
	"flight_requested",
	"ticket_issued",
	"traveling",
	"arrived",
	"in_transit",
	"hotel_checkin",
	"badge_ready",
	"day1",
	"day2",
	"day3",
	"completed",
]

FLY_STAGES = {
	"visa_processing",
	"visa_approved",
	"flight_requested",
	"ticket_issued",
	"traveling",
}

# Visa-only stages skipped for GCC / Gulf Cooperation guests
VISA_STAGES = {
	"visa_processing",
	"visa_approved",
}

GCC_REGIONS = {"gcc", "gcc_me"}

GCC_NATIONALITIES = {
	"Saudi Arabia",
	"United Arab Emirates",
	"Kuwait",
	"Bahrain",
	"Qatar",
	"Oman",
}

STAGE_AR = {
	"invited": "مدعو",
	"registered": "مسجّل",
	"kyc_approved": "الهوية معتمدة",
	"visa_processing": "التأشيرة قيد المعالجة",
	"visa_approved": "التأشيرة معتمدة",
	"flight_requested": "طلب الطيران",
	"ticket_issued": "التذكرة صادرة",
	"traveling": "في الطريق إلى الرياض",
	"arrived": "وصلت",
	"in_transit": "في الطريق إلى الفندق",
	"hotel_checkin": "تسجيل الفندق",
	"badge_ready": "بطاقة الدخول جاهزة",
	"day1": "اليوم الأول",
	"day2": "اليوم الثاني",
	"day3": "اليوم الثالث",
	"completed": "اكتملت الرحلة",
}


def latest_status(doctype: str, guest: str, field: str = "status"):
	rows = frappe.get_all(
		doctype,
		filters={"guest": guest},
		fields=[field],
		order_by="modified desc",
		limit=1,
	)
	return rows[0][field] if rows else None


def is_gcc_guest(guest) -> bool:
	"""Gulf Cooperation Council guests — no visa track."""
	region = getattr(guest, "region", None)
	visa_status = getattr(guest, "visa_status", None)
	if region is None or visa_status is None:
		if isinstance(guest, str):
			row = frappe.db.get_value(
				"IDO Guest", guest, ["region", "visa_status"], as_dict=True
			) or {}
			region = row.get("region")
			visa_status = row.get("visa_status")
		elif hasattr(guest, "name") and (region is None or visa_status is None):
			row = frappe.db.get_value(
				"IDO Guest", guest.name, ["region", "visa_status"], as_dict=True
			) or {}
			region = region or row.get("region")
			visa_status = visa_status or row.get("visa_status")
	if region in GCC_REGIONS:
		return True
	return visa_status == "not_required"


def visa_not_required(guest) -> bool:
	"""Local travelers and GCC / exempt guests do not need a visa."""
	if is_gcc_guest(guest):
		return True
	mode = getattr(guest, "travel_mode", None)
	visa_status = getattr(guest, "visa_status", None)
	if isinstance(guest, str):
		row = frappe.db.get_value(
			"IDO Guest", guest, ["travel_mode", "visa_status"], as_dict=True
		) or {}
		mode = row.get("travel_mode")
		visa_status = row.get("visa_status")
	if visa_status == "not_required":
		return True
	return (mode or "flying") == "local"


def stage_path(guest) -> list[str]:
	mode = getattr(guest, "travel_mode", None) or "flying"
	path = list(STAGES)
	if mode != "flying":
		path = [s for s in path if s not in FLY_STAGES]
	elif is_gcc_guest(guest):
		# Keep flights/travel; drop visa dialogues only
		path = [s for s in path if s not in VISA_STAGES]
	return path


def next_stage(guest) -> str | None:
	path = stage_path(guest)
	try:
		i = path.index(guest.stage)
	except ValueError:
		return None
	return path[i + 1] if i < len(path) - 1 else None


def gate_error(target: str, guest) -> str | None:
	gname = guest.name if hasattr(guest, "name") else guest
	kyc = latest_status("IDO KYC Verification", gname)
	visa = latest_status("IDO Visa Application", gname)
	fl = latest_status("IDO Flight Request", gname)
	arr = latest_status("IDO Arrival", gname, "confirmed")
	trip = latest_status("IDO Transport Trip", gname, "state")
	hot = latest_status("IDO Hotel Stay", gname, "check_in_state")

	if target == "kyc_approved" and kyc != "approved":
		return "قاعدة العمل 001: لا يمكن اعتماد مرحلة التحقق من الهوية قبل أن تصبح الحالة «معتمد»."
	if target == "visa_processing" and kyc != "approved":
		return "قاعدة العمل 002: لا يمكن بدء التأشيرة قبل اعتماد التحقق من الهوية."
	if target == "visa_approved" and visa not in ("approved", "issued", "not_required"):
		return "قاعدة العمل 001: لا يمكن اعتماد التأشيرة قبل اعتمادها أو إصدارها أو إعفائها."
	# GCC / local: treat visa as not required for flight gate
	if target == "flight_requested":
		if visa_not_required(guest):
			pass
		elif visa not in ("approved", "issued", "not_required"):
			return "قاعدة العمل 004: لا يمكن طلب الطيران قبل اعتماد التأشيرة."
	if target in ("ticket_issued", "traveling") and fl != "ticket_issued":
		return "قاعدة العمل 001: لا يمكن بدء السفر قبل وجود تذكرة."
	if target == "in_transit" and not arr:
		return "قاعدة العمل 005: لا يمكن إسناد السائق قبل تأكيد الوصول."
	if target == "hotel_checkin" and trip not in ("arrived", "completed"):
		return "قاعدة العمل 006: لا يمكن تسجيل دخول الفندق قبل وصول رحلة النقل."
	if target == "badge_ready" and hot != "completed":
		return "قاعدة العمل 007: لا يمكن إصدار بطاقة الدخول قبل تسجيل دخول الفندق."
	return None


def set_stage(guest, to: str, action: str, reason: str | None = None, rule: str | None = None):
	frappe.flags.ido_engine = True
	from_stage = guest.stage
	frappe.db.set_value("IDO Guest", guest.name, "stage", to)
	frappe.get_doc(
		{
			"doctype": "IDO Stage Log",
			"guest": guest.name,
			"from_stage": from_stage,
			"to_stage": to,
			"action": action,
			"reason": reason,
			"rule": rule,
			"actor": frappe.session.user,
			"at": frappe.utils.now_datetime(),
		}
	).insert(ignore_permissions=True)

	for tmpl in frappe.get_all(
		"IDO Comms Template",
		filters={"trigger_stage": to, "enabled": 1, "channel": "email"},
		fields=["subject_ar", "subject_en", "body_ar", "body_en"],
	):
		try:
			ev = frappe.get_doc("IDO Event", guest.event)
			inv_name = frappe.db.get_value("IDO Invitation", {"guest": guest.name}, "name")
			invitation = frappe.get_doc("IDO Invitation", inv_name) if inv_name else frappe._dict()
			ctx = {"guest": guest, "event": ev, "invitation": invitation}
			lang = getattr(guest, "language", None) or "ar"
			subj = tmpl.subject_ar if lang == "ar" else tmpl.subject_en
			body = tmpl.body_ar if lang == "ar" else tmpl.body_en
			if guest.email:
				frappe.sendmail(
					recipients=[guest.email],
					subject=frappe.render_template(subj or "", ctx),
					message=frappe.render_template(body or "", ctx),
				)
		except Exception:
			frappe.log_error(title="IDO Comms Template send failed")

	guest.stage = to
	mirror_guest(guest.name)


def auto_advance(guest_name: str, up_to: str):
	guest = frappe.get_doc("IDO Guest", guest_name)
	path = stage_path(guest)
	if up_to not in path:
		return
	while guest.stage != up_to:
		target = next_stage(guest)
		if not target or path.index(target) > path.index(up_to) or gate_error(target, guest):
			break
		set_stage(guest, target, "auto")


def mirror_guest(guest_name: str):
	tm = frappe.db.get_value("IDO Guest", guest_name, "travel_mode")
	region = frappe.db.get_value("IDO Guest", guest_name, "region")
	visa_default = (
		"not_required"
		if (tm == "local" or region in GCC_REGIONS)
		else "not_started"
	)
	frappe.db.set_value(
		"IDO Guest",
		guest_name,
		{
			"kyc_status": latest_status("IDO KYC Verification", guest_name) or "pending",
			"visa_status": latest_status("IDO Visa Application", guest_name) or visa_default,
			"flight_status": latest_status("IDO Flight Request", guest_name) or "-",
			"arrival_confirmed": latest_status("IDO Arrival", guest_name, "confirmed") or 0,
			"trip_state": latest_status("IDO Transport Trip", guest_name, "state") or "-",
			"hotel_checkin_state": latest_status("IDO Hotel Stay", guest_name, "check_in_state")
			or "pending",
			"badge_state": latest_status("IDO Badge", guest_name, "state") or "pending",
		},
	)


def user_roles() -> list[str]:
	return [
		r.role
		for r in frappe.get_all(
			"Has Role", filters={"parent": frappe.session.user}, fields=["role"]
		)
	]


def default_event() -> str | None:
	return frappe.form_dict.get("event") or frappe.db.get_single_value(
		"IDO Event Settings", "default_event"
	)


def require_roles(*roles: str):
	have = set(user_roles())
	if "System Manager" in have or "Administrator" == frappe.session.user:
		return
	if not any(r in have for r in roles):
		frappe.throw(_("Insufficient permission"), frappe.PermissionError)
