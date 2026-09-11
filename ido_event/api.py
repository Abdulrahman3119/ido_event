"""Whitelisted API methods for the React bridge.

Method names keep the `ido.*` prefix so existing Server Script clients continue
to work after migration. New aggregate helpers use `ido.events.*`.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint

from ido_event.engine import (
	STAGE_AR,
	STAGES,
	default_event,
	gate_error,
	latest_status,
	mirror_guest,
	next_stage,
	require_roles,
	set_stage,
	stage_path,
	user_roles,
)
from ido_event.mappers import guest_to_core, list_guest_rows


# ─── Guest public ───────────────────────────────────────────────────────────


@frappe.whitelist(allow_guest=True)
def verify_invitation(code: str | None = None):
	code = code or frappe.form_dict.get("code")
	inv = frappe.db.get_value(
		"IDO Invitation",
		{"invitation_code": code, "status": ["not in", ["declined", "expired"]]},
		["name", "guest", "event", "status"],
		as_dict=True,
	)
	if not inv:
		return {"ok": False}
	if inv.status == "sent":
		frappe.db.set_value(
			"IDO Invitation",
			inv.name,
			{"status": "opened", "opened_at": frappe.utils.now_datetime()},
		)
	return {
		"ok": True,
		"event": frappe.db.get_value(
			"IDO Event",
			inv.event,
			["event_name", "event_name_ar", "start_date", "end_date", "venue", "host_organization"],
			as_dict=True,
		),
		"guest": frappe.db.get_value(
			"IDO Guest",
			inv.guest,
			[
				"name",
				"first_name",
				"last_name",
				"email",
				"mobile",
				"nationality",
				"gender",
				"date_of_birth",
				"passport_number",
				"passport_expiry",
				"issue_country",
				"preferred_airport",
				"preferred_travel_time",
			],
			as_dict=True,
		),
	}


@frappe.whitelist(allow_guest=True)
def register(**kwargs):
	f = frappe.form_dict
	code = f.get("code") or kwargs.get("code")
	inv = frappe.db.get_value(
		"IDO Invitation", {"invitation_code": code}, ["name", "guest"], as_dict=True
	)
	if not inv:
		frappe.throw(_("رمز الدعوة غير صالح"))
	guest = frappe.get_doc("IDO Guest", inv.guest)
	for k in (
		"first_name",
		"last_name",
		"email",
		"mobile",
		"nationality",
		"date_of_birth",
		"gender",
		"passport_number",
		"passport_expiry",
		"issue_country",
		"preferred_airport",
		"preferred_travel_time",
	):
		val = f.get(k) if f.get(k) not in (None, "") else kwargs.get(k)
		if val not in (None, ""):
			guest.set(k, val)
	guest.pdpl_consent = 1
	# GCC nationality → Gulf Cooperation region (skips visa track)
	from ido_event.engine import GCC_NATIONALITIES

	if guest.nationality in GCC_NATIONALITIES:
		guest.region = "gcc"
		guest.visa_status = "not_required"
	guest.save(ignore_permissions=True)
	frappe.db.set_value("IDO Invitation", inv.name, "status", "accepted")
	if guest.stage == "invited":
		set_stage(guest, "registered", "auto")
	user = frappe.db.get_value("IDO Guest", guest.name, "user")
	if user:
		try:
			frappe.get_doc("User", user).reset_password(send_email=True)
		except Exception:
			frappe.log_error(title="IDO register reset_password failed")

	create_kyc = f.get("create_kyc")
	if create_kyc in (None, "", "1", 1, True, "true"):
		create_kyc = True
	else:
		create_kyc = False

	kyc_name = None
	if create_kyc:
		from ido_event.invitation_send import create_kyc_from_registration

		kyc_name = create_kyc_from_registration(
			guest.name,
			passport_number=guest.passport_number,
			passport_expiry=guest.passport_expiry,
			issue_country=guest.issue_country,
			passport_image=f.get("passport_image") or kwargs.get("passport_image"),
			face_image=f.get("face_image") or kwargs.get("face_image"),
		)

	return {"ok": True, "guest": guest.name, "kyc": kyc_name}


@frappe.whitelist()
def set_guest_stage(
	guest: str | None = None,
	to_stage: str | None = None,
	action: str | None = None,
	reason: str | None = None,
	rule: str | None = None,
):
	"""Desk journey controls — only allowed path to change IDO Guest.stage."""
	gname = guest or frappe.form_dict.get("guest")
	to = to_stage or frappe.form_dict.get("to_stage")
	action = action or frappe.form_dict.get("action") or "advance"
	reason = reason if reason is not None else frappe.form_dict.get("reason")
	rule = rule if rule is not None else frappe.form_dict.get("rule")
	if not gname or not to:
		frappe.throw(_("guest and to_stage required"))
	g = frappe.get_doc("IDO Guest", gname)
	if action == "override":
		require_roles("IDO Owner", "IDO Event Manager", "System Manager")
		ev = frappe.db.get_value(
			"IDO Event", g.event, ["kyc_strict", "require_override_reason"], as_dict=True
		) or {}
		if ev.get("require_override_reason") and not (reason or "").strip():
			frappe.throw(_("قاعدة العمل 009: التجاوز يتطلب سببًا مُسجّلًا (تدقيق)."))
		if (
			ev.get("kyc_strict")
			and to in STAGES
			and "kyc_approved" in STAGES
			and STAGES.index(to) >= STAGES.index("kyc_approved")
			and latest_status("IDO KYC Verification", g.name) != "approved"
		):
			frappe.throw(
				_("قاعدة العمل 002: لا يمكن تجاوز اعتماد التحقق من الهوية — حجب صارم.")
			)
	elif frappe.db.get_value("IDO Event", g.event, "enforce_gates"):
		err = gate_error(to, g)
		if err:
			frappe.throw(err)
	set_stage(g, to, action, reason=reason, rule=rule)
	return {"ok": True, "guest": gname, "stage": to}


@frappe.whitelist()
def auto_advance_guest(guest: str | None = None, up_to: str | None = None):
	"""Advance guest stage up to a target via the journey engine."""
	from ido_event.engine import auto_advance

	gname = guest or frappe.form_dict.get("guest")
	target = up_to or frappe.form_dict.get("up_to")
	if not gname or not target:
		frappe.throw(_("guest and up_to required"))
	auto_advance(gname, target)
	stage = frappe.db.get_value("IDO Guest", gname, "stage")
	return {"ok": True, "guest": gname, "stage": stage}


@frappe.whitelist()
def send_invitation(
	invitation: str | None = None,
	guest: str | None = None,
	channel: str | None = None,
	force: int | None = None,
):
	"""Desk / API: send invitation email and/or return WhatsApp link."""
	from ido_event.invitation_send import send_invitation as _send

	return _send(
		invitation=invitation,
		guest=guest,
		channel=channel,
		force=bool(frappe.utils.cint(force)),
	)


@frappe.whitelist()
def ensure_invitation(guest: str | None = None):
	"""Create invitation + event registration for guest if missing."""
	from ido_event.invitation_send import ensure_invitation as _ensure
	from ido_event.invitation_send import ensure_registration as _ensure_reg

	gname = guest or frappe.form_dict.get("guest")
	if not gname:
		frappe.throw(_("حدد الضيف"))
	reg = _ensure_reg(gname)
	name = _ensure(gname)
	inv = frappe.db.get_value(
		"IDO Invitation",
		name,
		["name", "invitation_code", "secure_link", "status"],
		as_dict=True,
	)
	return {"ok": True, "registration": reg, **inv}


@frappe.whitelist()
def create_session_for_day(
	event: str | None = None,
	day_no: int | None = None,
	title: str | None = None,
	start_time: str | None = None,
	end_time: str | None = None,
	hall: str | None = None,
):
	"""Quick-create an IDO Session under an event plan day."""
	f = frappe.form_dict
	event = event or f.get("event")
	day_no = cint(day_no if day_no is not None else f.get("day_no"))
	title = (title or f.get("title") or "").strip()
	if not event or not title:
		frappe.throw(_("الفعالية وعنوان الجلسة مطلوبان"))
	ev = frappe.get_doc("IDO Event", event)
	day_row = next((d for d in (ev.days or []) if int(d.day_no or 0) == int(day_no or 0)), None)
	if not day_row:
		frappe.throw(_("اليوم غير موجود في خطة الفعالية — أضف الأيام أولًا"))
	doc = frappe.get_doc(
		{
			"doctype": "IDO Session",
			"event": event,
			"title": title,
			"day": int(day_no),
			"date": day_row.date,
			"start_time": start_time or f.get("start_time") or "09:00:00",
			"end_time": end_time or f.get("end_time") or "10:00:00",
			"hall": hall or f.get("hall") or "",
			"session_type": f.get("session_type") or "panel",
			"track": f.get("track") or "general",
		}
	)
	doc.insert()
	return {"ok": True, "name": doc.name}


@frappe.whitelist()
def sync_session_tasks(session: str | None = None):
	"""Push session run-of-show tasks into IDO Task (ops board)."""
	sname = session or frappe.form_dict.get("session")
	if not sname:
		frappe.throw(_("حدد الجلسة"))
	ses = frappe.get_doc("IDO Session", sname)
	created = []
	for row in ses.tasks or []:
		if not row.title or row.status == "cancelled":
			continue
		# avoid duplicates by source
		exists = frappe.db.exists(
			"IDO Task",
			{"source_doctype": "IDO Session", "source_name": ses.name, "subject": row.title},
		)
		if exists:
			continue
		task = frappe.get_doc(
			{
				"doctype": "IDO Task",
				"subject": row.title,
				"event": ses.event,
				"session": ses.name,
				"assigned_to": row.assignee,
				"status": "done" if row.status == "done" else "open",
				"priority": "Medium",
				"event_day": ses.day,
				"due_date": ses.date,
				"source_type": "session",
				"source_doctype": "IDO Session",
				"source_name": ses.name,
				"details": row.notes or "",
			}
		)
		task.insert(ignore_permissions=True)
		created.append(task.name)
	return {"ok": True, "created": created, "count": len(created)}


# ─── Lifecycle ───────────────────────────────────────────────────────────────


@frappe.whitelist()
def advance_stage(guest: str | None = None):
	gname = guest or frappe.form_dict.get("guest")
	g = frappe.get_doc("IDO Guest", gname)
	target = next_stage(g)
	if not target:
		frappe.throw(_("اكتملت الرحلة — لا توجد مرحلة تالية."))
	if frappe.db.get_value("IDO Event", g.event, "enforce_gates"):
		err = gate_error(target, g)
		if err:
			frappe.throw(err)
	set_stage(g, target, "advance")
	return target


@frappe.whitelist()
def override_stage(
	guest: str | None = None, to_stage: str | None = None, reason: str | None = None
):
	gname = guest or frappe.form_dict.get("guest")
	to = to_stage or frappe.form_dict.get("to_stage")
	reason = (reason or frappe.form_dict.get("reason") or "").strip()
	require_roles("IDO Owner", "IDO Event Manager", "System Manager")
	g = frappe.get_doc("IDO Guest", gname)
	if to not in STAGES:
		frappe.throw(_("مرحلة غير معروفة"))
	if frappe.db.get_value("IDO Event", g.event, "require_override_reason") and not reason:
		frappe.throw(_("قاعدة العمل 009: التجاوز يتطلب سببًا مُسجّلًا (تدقيق)."))
	if (
		frappe.db.get_value("IDO Event", g.event, "kyc_strict")
		and STAGES.index(to) >= STAGES.index("kyc_approved")
		and latest_status("IDO KYC Verification", g.name) != "approved"
	):
		frappe.throw(_("قاعدة العمل 002: لا يمكن تجاوز اعتماد التحقق من الهوية — حجب صارم (أمان/حماية البيانات)."))
	set_stage(g, to, "override", reason, "BR-009")
	return to


@frappe.whitelist()
def timeline(guest: str | None = None):
	gname = guest or frappe.form_dict.get("guest")
	g = frappe.get_doc("IDO Guest", gname)
	path = stage_path(g)
	cur = path.index(g.stage) if g.stage in path else 0
	return [
		{
			"stage": s,
			"label_ar": STAGE_AR.get(s, s),
			"state": "completed" if i < cur else "current" if i == cur else "pending",
		}
		for i, s in enumerate(path)
	]


# ─── Dashboards / journey / ops ──────────────────────────────────────────────


@frappe.whitelist()
def dashboard(event: str | None = None):
	ev = event or default_event()
	gs = frappe.get_all(
		"IDO Guest",
		filters={"event": ev},
		fields=[
			"stage",
			"region",
			"nationality",
			"kyc_status",
			"visa_status",
			"badge_state",
			"hotel_checkin_state",
			"arrival_confirmed",
		],
	)
	fun = {s: 0 for s in STAGES}
	reg: dict = {}
	vis: dict = {}
	for g in gs:
		fun[g.stage] = fun.get(g.stage, 0) + 1
		reg[g.region or "other"] = reg.get(g.region or "other", 0) + 1
		vis[g.visa_status] = vis.get(g.visa_status, 0) + 1
	return {
		"event": ev,
		"kpi": {
			"confirmed": len(gs),
			"countries": len({g.nationality: 1 for g in gs if g.nationality}),
			"kyc_approved": len([1 for g in gs if g.kyc_status == "approved"]),
			"visas_issued": len(
				[1 for g in gs if g.visa_status in ("approved", "issued")]
			),
			"tickets": frappe.db.count("IDO Flight Request", {"status": "ticket_issued"}),
			"arrived": len([1 for g in gs if g.arrival_confirmed]),
			"hotel_checkin": len(
				[1 for g in gs if g.hotel_checkin_state == "completed"]
			),
			"badges_ready": len(
				[1 for g in gs if g.badge_state in ("ready", "collected")]
			),
			"open_alerts": frappe.db.count(
				"IDO Emergency Alert", {"status": ["!=", "resolved"]}
			)
			+ frappe.db.count(
				"IDO Support Ticket", {"status": ["in", ["open", "in_progress"]]}
			),
			"arrivals_today": frappe.db.count(
				"IDO Arrival", {"expected_at": [">=", frappe.utils.nowdate()]}
			),
		},
		"funnel": fun,
		"regions": reg,
		"visa": vis,
		"feed": frappe.get_all(
			"IDO Stage Log",
			fields=["guest", "guest_name", "from_stage", "to_stage", "action", "actor", "at"],
			order_by="at desc",
			limit=25,
		),
	}


@frappe.whitelist()
def my_journey():
	gn = frappe.db.get_value("IDO Guest", {"user": frappe.session.user}, "name")
	if not gn:
		frappe.throw(_("لا يوجد ملف ضيف مرتبط بهذا الحساب."))
	g = frappe.get_doc("IDO Guest", gn)

	def L(dt, fields):
		r = frappe.get_all(
			dt, filters={"guest": gn}, fields=fields, order_by="modified desc", limit=1
		)
		return r[0] if r else None

	path = stage_path(g)
	cur = path.index(g.stage) if g.stage in path else 0
	nxt = next_stage(g)
	return {
		"guest": {
			"name": g.name,
			"full_name": g.full_name,
			"first_name": g.first_name,
			"stage": g.stage,
			"stage_ar": STAGE_AR.get(g.stage),
			"travel_mode": g.travel_mode,
			"event": g.event,
		},
		"event": frappe.db.get_value(
			"IDO Event",
			g.event,
			["event_name", "event_name_ar", "start_date", "end_date", "venue"],
			as_dict=True,
		),
		"timeline": [
			{
				"stage": s,
				"label_ar": STAGE_AR[s],
				"state": "completed" if i < cur else "current" if i == cur else "pending",
			}
			for i, s in enumerate(path)
		],
		"next_stage": STAGE_AR.get(nxt) if nxt else None,
		"kyc": L("IDO KYC Verification", ["name", "status", "rejection_reason"]),
		"visa": L("IDO Visa Application", ["status", "docs_request_note"]),
		"flight": L(
			"IDO Flight Request",
			["status", "airline", "flight_number", "arrival_time", "terminal", "ticket_pdf"],
		),
		"arrival": L("IDO Arrival", ["status", "meeting_point"]),
		"trip": L("IDO Transport Trip", ["state", "driver_name", "pickup_location"]),
		"hotel": L(
			"IDO Hotel Stay",
			["hotel", "room_number", "check_in_state", "check_in_date", "check_out_date"],
		),
		"badge": L("IDO Badge", ["state", "badge_type"]),
		"qr": (
			frappe.get_all(
				"IDO QR Pass",
				filters={"guest": gn, "revoked": 0},
				fields=["token", "checksum", "expires_at"],
				limit=1,
			)
			or [None]
		)[0],
		"sessions": frappe.get_all(
			"IDO Session",
			filters={"event": g.event},
			fields=[
				"name",
				"title",
				"title_ar",
				"session_type",
				"day",
				"start_time",
				"end_time",
				"hall",
				"date",
			],
			order_by="date,start_time",
		),
		"core": guest_to_core(gn),
	}


@frappe.whitelist()
def my_tasks():
	roles = user_roles()
	out: dict = {"role": None, "items": []}
	today = frappe.utils.nowdate()
	if "IDO Driver" in roles:
		d = frappe.db.get_value("IDO Driver", {"user": frappe.session.user}, "name")
		out["role"] = "driver"
		out["items"] = frappe.get_all(
			"IDO Transport Trip",
			filters={"driver": d, "state": ["in", ["assigned", "en_route", "picked_up"]]},
			fields=[
				"name",
				"guest_name",
				"state",
				"pickup_location",
				"destination",
				"scheduled_at",
				"luggage_notes",
			],
			order_by="scheduled_at",
		)
	elif "IDO Airport Desk" in roles:
		out["role"] = "airport_desk"
		out["items"] = frappe.get_all(
			"IDO Arrival",
			filters={"status": ["in", ["expected", "landed"]]},
			fields=[
				"name",
				"guest",
				"guest_name",
				"flight_number",
				"expected_at",
				"terminal",
				"status",
				"assigned_driver",
			],
			order_by="expected_at",
		)
	elif "IDO Hotel Desk" in roles:
		out["role"] = "hotel_desk"
		out["items"] = frappe.get_all(
			"IDO Hotel Stay",
			filters={"check_in_state": ["in", ["pending", "reserved"]]},
			fields=[
				"name",
				"guest",
				"guest_name",
				"hotel",
				"room_number",
				"check_in_date",
				"check_in_state",
			],
			order_by="check_in_date",
		)
	elif "IDO Badge Team" in roles:
		out["role"] = "badge_team"
		out["items"] = frappe.get_all(
			"IDO Badge",
			filters={"state": ["in", ["pending", "queued", "printed"]]},
			fields=["name", "guest", "guest_name", "badge_type", "state"],
		)
	elif "IDO Usher" in roles:
		out["role"] = "usher"
		out["items"] = frappe.get_all(
			"IDO Session",
			filters={"date": today},
			fields=[
				"name",
				"title",
				"title_ar",
				"hall",
				"start_time",
				"end_time",
				"attendance_count",
				"capacity",
			],
			order_by="start_time",
		)
	return out


@frappe.whitelist()
def scan(payload: str | None = None, context: str | None = None, session: str | None = None):
	f = frappe.form_dict
	p = (payload or f.get("payload") or "").strip()
	ctx = context or f.get("context")
	sess = session or f.get("session")
	guest = None
	reason = None
	if ctx == "passport":
		guest = frappe.db.get_value("IDO Guest", {"passport_number": p}, "name")
	else:
		parts = p.split(":")
		if len(parts) == 3:
			q = frappe.get_all(
				"IDO QR Pass",
				filters={"token": parts[1], "checksum": parts[2]},
				fields=["guest", "revoked", "expires_at"],
				limit=1,
			)
			if q:
				if q[0].revoked:
					reason = "revoked"
				else:
					guest = q[0].guest
	if not guest:
		return {"ok": False, "reason": reason or "no_match"}

	g = frappe.get_doc("IDO Guest", guest)
	roles = user_roles()
	task = None
	if "IDO Airport Desk" in roles:
		task = {
			"doctype": "IDO Arrival",
			"name": frappe.db.get_value("IDO Arrival", {"guest": guest}, "name"),
			"action": "Arrival.Confirm",
		}
	elif "IDO Hotel Desk" in roles:
		task = {
			"doctype": "IDO Hotel Stay",
			"name": frappe.db.get_value("IDO Hotel Stay", {"guest": guest}, "name"),
			"action": "HotelStay.CheckIn",
		}
	elif "IDO Badge Team" in roles:
		task = {
			"doctype": "IDO Badge",
			"name": frappe.db.get_value("IDO Badge", {"guest": guest}, "name"),
			"action": "Badge.SetState",
		}
	elif "IDO Usher" in roles and sess:
		a = frappe.get_doc(
			{"doctype": "IDO Attendance", "guest": guest, "session": sess, "method": ctx or "qr"}
		).insert(ignore_permissions=True)
		task = {
			"doctype": "IDO Attendance",
			"name": a.name,
			"action": "Session.CheckIn",
			"checked_in": True,
		}
	return {
		"ok": True,
		"guest": {
			"name": g.name,
			"full_name": g.full_name,
			"full_name_ar": g.full_name_ar,
			"stage": g.stage,
			"vip": g.vip,
			"organization": g.organization,
			"nationality": g.nationality,
		},
		"task": task,
	}


# ─── Aggregate APIs for React @core shapes ───────────────────────────────────


@frappe.whitelist()
def get_guest(guest: str | None = None):
	gname = guest or frappe.form_dict.get("guest")
	return guest_to_core(gname)


@frappe.whitelist()
def list_guests(event: str | None = None):
	ev = event or default_event()
	return list_guest_rows(ev)


@frappe.whitelist()
def get_operator_dataset(event: str | None = None):
	"""Full dataset shape for Operator Console (event + venue + guests + sessions)."""
	from ido_event.mappers import build_operator_dataset

	ev = event or default_event()
	return build_operator_dataset(ev)


@frappe.whitelist()
def submit_kyc(**kwargs):
	from ido_event.mappers import country_from_iso

	f = {**frappe.form_dict, **kwargs}
	guest = f.get("guest")
	# Prefer the logged-in portal user's linked IDO Guest (never trust demo ids).
	linked = frappe.db.get_value("IDO Guest", {"user": frappe.session.user}, "name")
	if linked:
		guest = linked
	elif not guest or str(guest).startswith("G-"):
		frappe.throw(_("لا يوجد ملف ضيف مرتبط بهذا الحساب. سجّل الدخول بحساب الضيف أولًا."))

	if not frappe.db.exists("IDO Guest", guest):
		frappe.throw(_("Could not find Guest: {0}").format(guest))

	issue_country = country_from_iso(f.get("issue_country"))
	doc = frappe.get_doc(
		{
			"doctype": "IDO KYC Verification",
			"guest": guest,
			"status": "under_review",
			"passport_number": f.get("passport_number")
			or frappe.db.get_value("IDO Guest", guest, "passport_number"),
			"passport_expiry": f.get("passport_expiry"),
			"issue_country": issue_country,
			"passport_image": f.get("passport_image") or None,
			"face_image": f.get("face_image") or None,
		}
	)
	# Guest app currently confirms capture as a boolean UI step — file upload
	# comes later. Allow create without Attach Image until that lands.
	doc.flags.ignore_mandatory = True
	doc.insert(ignore_permissions=True)
	# Mirror passport fields onto the guest for convenience
	frappe.db.set_value(
		"IDO Guest",
		guest,
		{
			"passport_expiry": f.get("passport_expiry"),
			"issue_country": issue_country,
			"passport_number": doc.passport_number,
		},
		update_modified=False,
	)
	mirror_guest(guest)
	return {"ok": True, "name": doc.name, "guest": guest}


@frappe.whitelist()
def update_kyc(guest: str | None = None, status: str | None = None, **kwargs):
	"""Operator: set KYC status (approve/reject) and advance stage when approved."""
	require_roles("IDO Event Manager", "IDO Owner", "System Manager")
	gname = guest or frappe.form_dict.get("guest")
	st = status or frappe.form_dict.get("status")
	if not gname or not st:
		frappe.throw(_("guest and status required"))
	existing = frappe.get_all(
		"IDO KYC Verification", filters={"guest": gname}, fields=["name"], limit=1,
		order_by="creation desc",
	)
	if existing:
		frappe.db.set_value("IDO KYC Verification", existing[0].name, "status", st)
		name = existing[0].name
	else:
		doc = frappe.get_doc(
			{"doctype": "IDO KYC Verification", "guest": gname, "status": st}
		)
		doc.flags.ignore_mandatory = True
		doc.insert(ignore_permissions=True)
		name = doc.name
	mirror_guest(gname)
	g = frappe.get_doc("IDO Guest", gname)
	if st == "approved" and g.stage in ("invited", "registered"):
		target = "kyc_approved"
		if not gate_error(target, g):
			set_stage(g, target, "auto")
	return {"ok": True, "name": name}


@frappe.whitelist()
def submit_flight(**kwargs):
	from ido_event.mappers import country_from_iso

	f = {**frappe.form_dict, **kwargs}
	guest = f.get("guest")
	linked = frappe.db.get_value("IDO Guest", {"user": frappe.session.user}, "name")
	if linked:
		guest = linked
	if not guest:
		frappe.throw(_("guest required"))
	visa = latest_status("IDO Visa Application", guest)
	g = frappe.get_doc("IDO Guest", guest)
	from ido_event.engine import visa_not_required

	if (
		(g.travel_mode or "flying") == "flying"
		and not visa_not_required(g)
		and visa not in (
			"approved",
			"issued",
			"not_required",
		)
	):
		frappe.throw(_("قاعدة العمل 004: لا يمكن طلب الطيران قبل اعتماد التأشيرة."))
	doc = frappe.get_doc(
		{
			"doctype": "IDO Flight Request",
			"guest": guest,
			"status": "requested",
			"departure_country": country_from_iso(f.get("departure_country")),
			"departure_city": f.get("departure_city"),
			"preferred_airport": f.get("preferred_airport") or g.preferred_airport,
			"preferred_travel_date": f.get("preferred_travel_date"),
			"preferred_travel_time": f.get("preferred_travel_time") or g.preferred_travel_time,
			"return_date": f.get("return_date"),
			"travel_class": f.get("travel_class"),
			"special_needs": f.get("special_needs"),
		}
	)
	doc.insert(ignore_permissions=True)
	if g.stage in ("visa_approved", "kyc_approved", "registered"):
		try:
			if next_stage(g) == "flight_requested" or g.stage == "visa_approved":
				target = "flight_requested"
				if not gate_error(target, g):
					set_stage(g, target, "auto")
		except Exception:
			pass
	mirror_guest(guest)
	return {"ok": True, "name": doc.name}


@frappe.whitelist()
def update_visa(guest: str | None = None, status: str | None = None, **kwargs):
	require_roles("IDO Visa Team", "IDO Event Manager", "IDO Owner", "System Manager")
	gname = guest or frappe.form_dict.get("guest")
	st = status or frappe.form_dict.get("status")
	existing = frappe.get_all(
		"IDO Visa Application", filters={"guest": gname}, fields=["name"], limit=1
	)
	if existing:
		frappe.db.set_value("IDO Visa Application", existing[0].name, "status", st)
		name = existing[0].name
	else:
		doc = frappe.get_doc(
			{"doctype": "IDO Visa Application", "guest": gname, "status": st}
		).insert(ignore_permissions=True)
		name = doc.name
	mirror_guest(gname)
	g = frappe.get_doc("IDO Guest", gname)
	if st in ("approved", "issued", "not_required") and g.stage in (
		"kyc_approved",
		"visa_processing",
	):
		target = "visa_approved"
		if not gate_error(target, g):
			set_stage(g, target, "auto")
	elif st == "processing" and g.stage == "kyc_approved":
		target = "visa_processing"
		if not gate_error(target, g):
			set_stage(g, target, "auto")
	return {"ok": True, "name": name}


@frappe.whitelist()
def lookup_flight(
	flight_number: str | None = None,
	date: str | None = None,
	preferred_airport: str | None = None,
):
	"""Lookup flight details via AirLabs by flight number."""
	from ido_event.airlabs import _iata_from_preferred, _settings, fetch_flights

	f = frappe.form_dict
	number = flight_number or f.get("flight_number")
	date_local = date or f.get("date")
	pref = preferred_airport or f.get("preferred_airport")
	cfg = _settings()
	if not cfg["enabled"]:
		return {
			"ok": False,
			"disabled": True,
			"flights": [],
			"count": 0,
			"message": _(
				"فعّل AirLabs وأضف API Key من إعدادات الفعالية (IDO Event Settings)."
			),
		}
	flights = fetch_flights(
		number,
		date_local=date_local,
		prefer_arrival_iata=_iata_from_preferred(pref),
	)
	return {"ok": True, "flights": flights, "count": len(flights)}


# Compatibility aliases matching Server Script api_method names
# (frappe resolves module paths; we also register thin wrappers below)


@frappe.whitelist(allow_guest=True)
def ido_verify_invitation():
	return verify_invitation()


@frappe.whitelist(allow_guest=True)
def ido_register():
	return register()
