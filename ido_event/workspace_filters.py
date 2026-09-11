"""Workspace event context — filter Number Cards / Charts by selected IDO Event."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.desk.doctype.dashboard_chart.dashboard_chart import get as _chart_get
from frappe.desk.doctype.number_card.number_card import get_result as _card_get_result
from frappe.utils import cint

USER_DEFAULT_KEY = "ido_selected_event"


def _selected_event(*, for_picker: bool = False) -> str | None:
	"""Resolve the active event.

	- If the client sent ``ido_event`` (even empty), that wins (empty = all events).
	- Else use the user default.
	- For the picker only, fall back to IDO Event Settings.default_event.
	"""
	if "ido_event" in frappe.form_dict:
		ev = frappe.form_dict.get("ido_event")
		if not ev or ev in ("", "null", "undefined", "__all__"):
			return None
		return ev if frappe.db.exists("IDO Event", ev) else None

	ev = frappe.defaults.get_user_default(USER_DEFAULT_KEY)
	if ev and frappe.db.exists("IDO Event", ev):
		return ev

	if for_picker:
		fallback = frappe.db.get_single_value("IDO Event Settings", "default_event")
		if fallback and frappe.db.exists("IDO Event", fallback):
			return fallback
	return None


def apply_event_filter(doctype: str | None, filters, event: str | None = None):
	"""Append event (or guest-in-event) filter for IDO DocTypes."""
	if not doctype or not doctype.startswith("IDO "):
		return filters
	# Never filter the Event DocType itself by event name as a field
	if doctype == "IDO Event":
		return filters

	event = event or _selected_event()
	if not event:
		return filters

	filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or [])
	if not isinstance(filters, list):
		# dict-style filters — convert loosely not supported; skip
		return filters

	# Drop previous event/guest-in filters we may have injected
	cleaned = []
	for f in filters:
		if not isinstance(f, (list, tuple)) or len(f) < 3:
			cleaned.append(f)
			continue
		# [doctype, field, op, val] or [field, op, val]
		field = f[1] if len(f) >= 4 else f[0]
		if field in ("event",) and len(f) >= 3:
			# replace later
			continue
		cleaned.append(f)
	filters = cleaned

	meta = frappe.get_meta(doctype)
	if meta.has_field("event"):
		filters.append([doctype, "event", "=", event])
	elif meta.has_field("guest"):
		guests = frappe.get_all("IDO Guest", filters={"event": event}, pluck="name")
		filters.append([doctype, "guest", "in", guests or ["__none__"]])
	return filters


@frappe.whitelist()
def get_number_card_result(doc, filters, to_date=None):
	doc = frappe.parse_json(doc)
	filters = apply_event_filter(doc.get("document_type"), filters)
	return _card_get_result(doc, filters, to_date=to_date)


@frappe.whitelist()
def get_dashboard_chart(
	chart_name=None,
	chart=None,
	no_cache=None,
	filters=None,
	from_date=None,
	to_date=None,
	timespan=None,
	time_interval=None,
	heatmap_year=None,
	refresh=None,
):
	# Merge client filters with the chart's saved filters, then inject event.
	# Do not force no_cache=1: frappe's @cache_source passes a Document as
	# ``chart=`` without ``chart_name``, and get() then does parse_json(doc)
	# → TypeError: 'DashboardChart' object is not iterable.
	if chart_name:
		chart_doc = frappe.get_doc("Dashboard Chart", chart_name)
		doctype = chart_doc.document_type
		base = filters if filters not in (None, "") else chart_doc.filters_json
	else:
		chart_doc = frappe._dict(frappe.parse_json(chart) or {})
		doctype = chart_doc.get("document_type")
		base = filters if filters not in (None, "") else chart_doc.get("filters_json")

	filters = apply_event_filter(doctype, base)
	return _chart_get(
		chart_name=chart_name,
		chart=chart,
		no_cache=no_cache,
		filters=filters,
		from_date=from_date,
		to_date=to_date,
		timespan=timespan,
		time_interval=time_interval,
		heatmap_year=heatmap_year,
		refresh=refresh,
	)


@frappe.whitelist()
def list_events():
	"""Active/usable events for the workspace picker."""
	rows = frappe.get_all(
		"IDO Event",
		fields=["name", "event_name", "event_name_ar", "status", "start_date", "end_date", "code"],
		filters={"status": ("in", ["Active", "Draft", "Completed"])},
		order_by="start_date desc, modified desc",
		limit_page_length=200,
	)
	selected = _selected_event(for_picker=True)
	return {"events": rows, "selected": selected}


@frappe.whitelist()
def set_selected_event(event: str | None = None):
	"""Persist selected event for the current user (+ optional settings default)."""
	event = event or frappe.form_dict.get("event")
	if event in (None, "", "null", "undefined"):
		frappe.defaults.clear_user_default(USER_DEFAULT_KEY)
		return {"ok": True, "selected": None}

	if not frappe.db.exists("IDO Event", event):
		frappe.throw(_("الفعالية غير موجودة"))

	frappe.defaults.set_user_default(USER_DEFAULT_KEY, event)

	# Keep settings in sync when user can write settings
	if frappe.has_permission("IDO Event Settings", "write"):
		try:
			frappe.db.set_single_value("IDO Event Settings", "default_event", event)
		except Exception:
			pass

	return {"ok": True, "selected": event}


def _smoke_test():
	"""bench --site event execute ido_event.workspace_filters._smoke_test"""
	import frappe

	doc = frappe.get_doc("Number Card", "Confirmed Guests").as_dict()
	frappe.form_dict["ido_event"] = "GIF26"
	a = get_number_card_result(doc, [])
	frappe.form_dict["ido_event"] = "22"
	b = get_number_card_result(doc, [])
	frappe.form_dict["ido_event"] = ""
	frappe.defaults.clear_user_default(USER_DEFAULT_KEY)
	c = get_number_card_result(doc, [])
	print({"GIF26": a, "22": b, "all": c})
