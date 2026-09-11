"""AirLabs flight lookup — https://airlabs.co/docs/flight"""

from __future__ import annotations

import re
from typing import Any

import frappe
import requests
from frappe import _
from frappe.utils import get_datetime

KSA_IATA = {"RUH", "JED", "DMM", "MED"}
BASE_URL = "https://airlabs.co/api/v9"


def _settings() -> dict[str, Any]:
	enabled = False
	key = None
	if frappe.db.exists("DocType", "IDO Event Settings"):
		try:
			doc = frappe.get_single("IDO Event Settings")
			enabled = bool(doc.get("airlabs_enabled"))
			if doc.get("airlabs_api_key"):
				key = doc.get_password("airlabs_api_key")
		except Exception:
			frappe.log_error(title="IDO AirLabs settings read failed")

	key = (key or frappe.conf.get("airlabs_api_key") or "").strip() or None
	if key and not enabled and frappe.conf.get("airlabs_api_key"):
		enabled = True
	return {"enabled": bool(enabled and key), "key": key}


def normalize_flight_number(raw: str | None) -> str:
	s = re.sub(r"\s+", "", (raw or "").upper())
	return s.replace("-", "")


def _iata_from_preferred(preferred_airport: str | None) -> str | None:
	if not preferred_airport:
		return None
	m = re.match(r"^([A-Z]{3})\b", preferred_airport.strip().upper())
	return m.group(1) if m else None


def _parse_time(raw: str | None) -> str | None:
	if not raw:
		return None
	try:
		return str(get_datetime(str(raw).replace("T", " ")[:19]))
	except Exception:
		return None


def _airline_name(iata: str | None, key: str) -> str:
	code = (iata or "").upper()
	if not code:
		return ""
	# Lightweight cache in Redis/frappe cache
	cache_key = f"ido_airlabs_airline:{code}"
	cached = frappe.cache().get_value(cache_key)
	if cached:
		return cached
	try:
		resp = requests.get(
			f"{BASE_URL}/airlines",
			params={"api_key": key, "iata_code": code},
			timeout=10,
			proxies={"http": None, "https": None},
		)
		if resp.ok:
			data = resp.json() or {}
			rows = data.get("response") or []
			if isinstance(rows, dict):
				rows = [rows]
			if rows:
				name = rows[0].get("name") or code
				frappe.cache().set_value(cache_key, name, expires_in_sec=86400)
				return name
	except Exception:
		pass
	return code


def map_flight(row: dict, api_key: str | None = None) -> dict[str, Any]:
	"""Map AirLabs flight/schedule row → IDO Flight Request fields."""
	from ido_event.mappers import country_from_iso

	airline_iata = row.get("airline_iata") or ""
	airline = airline_iata
	if api_key and airline_iata:
		airline = _airline_name(airline_iata, api_key) or airline_iata

	dep_time = _parse_time(
		row.get("dep_estimated") or row.get("dep_time") or row.get("dep_actual")
	)
	arr_time = _parse_time(
		row.get("arr_estimated") or row.get("arr_time") or row.get("arr_actual")
	)
	# Some schedule rows use different keys
	if not dep_time:
		dep_time = _parse_time(row.get("dep_time_utc"))
	if not arr_time:
		arr_time = _parse_time(row.get("arr_time_utc"))

	dep_iata = (row.get("dep_iata") or "").upper() or None
	arr_iata = (row.get("arr_iata") or "").upper() or None
	# Country hint sometimes present on live flights as flag (aircraft), skip for country
	dep_country = None
	if row.get("dep_country"):
		dep_country = country_from_iso(row.get("dep_country"))

	return {
		"airline": airline,
		"flight_number": row.get("flight_iata") or row.get("flight_icao") or "",
		"departure_time": dep_time,
		"arrival_time": arr_time,
		"terminal": row.get("arr_terminal") or row.get("dep_terminal") or "",
		"departure_city": dep_iata or "",
		"departure_country": dep_country,
		"departure_airport": dep_iata,
		"arrival_airport": arr_iata,
		"departure_gate": row.get("dep_gate") or "",
		"arrival_gate": row.get("arr_gate") or "",
		"status": row.get("status") or "",
		"call_sign": row.get("flight_icao") or "",
	}


def _score(row: dict, prefer_arrival_iata: str | None) -> int:
	arr = (row.get("arr_iata") or "").upper()
	dep = (row.get("dep_iata") or "").upper()
	score = 0
	if prefer_arrival_iata and arr == prefer_arrival_iata:
		score += 100
	if arr in KSA_IATA:
		score += 40
	if prefer_arrival_iata and dep == prefer_arrival_iata:
		score -= 10
	status = (row.get("status") or "").lower()
	if status in ("scheduled", "en-route", "active"):
		score += 5
	if status == "cancelled":
		score -= 50
	return score


def _request(path: str, params: dict) -> Any:
	url = f"{BASE_URL}/{path.lstrip('/')}"
	try:
		resp = requests.get(
			url,
			params=params,
			timeout=20,
			proxies={"http": None, "https": None},
		)
	except requests.RequestException as e:
		frappe.throw(_("تعذّر الاتصال بـ AirLabs: {0}").format(str(e)))

	if resp.status_code in (401, 403):
		frappe.throw(
			_("مفتاح AirLabs غير صالح أو غير مصرّح له. انسخ API Key من https://airlabs.co/account")
		)
	if resp.status_code >= 400:
		frappe.throw(
			_("خطأ AirLabs ({0}): {1}").format(resp.status_code, (resp.text or "")[:300])
		)

	payload = resp.json() or {}
	err = payload.get("error")
	if err:
		msg = err.get("message") if isinstance(err, dict) else str(err)
		code = err.get("code") if isinstance(err, dict) else ""
		if code in ("unknown_api_key", "expired_api_key", "invalid_api_key", 401, "401"):
			frappe.throw(_("مفتاح AirLabs غير صالح. راجع https://airlabs.co/account"))
		if "month_limit" in str(code) or "limit" in str(msg).lower():
			frappe.throw(_("تم استهلاك حد طلبات AirLabs لهذا الشهر."))
		# empty / not found often comes as error object — treat as no results
		if any(x in str(msg).lower() for x in ("not found", "no data", "unknown flight")):
			return None
		frappe.throw(_("AirLabs: {0}").format(msg or str(err)[:200]))
	return payload.get("response")


def fetch_flights(
	flight_number: str,
	date_local: str | None = None,
	prefer_arrival_iata: str | None = None,
) -> list[dict[str, Any]]:
	cfg = _settings()
	if not cfg["enabled"]:
		frappe.throw(
			_("فعّل AirLabs وأضف API Key من إعدادات الفعالية (IDO Event Settings).")
		)

	number = normalize_flight_number(flight_number)
	if not number or len(number) < 3:
		frappe.throw(_("رقم الرحلة غير صالح"))

	params = {"api_key": cfg["key"], "flight_iata": number}
	rows: list[dict] = []

	# 1) Single nearest flight (live/scheduled/landed)
	single = _request("flight", params)
	if isinstance(single, dict) and (single.get("flight_iata") or single.get("dep_iata")):
		rows.append(single)

	# 2) Schedules for same flight number (multiple legs/days)
	# Soft-fail only when we already have a flight hit; otherwise surface the error.
	try:
		sched = _request("schedules", {**params, "limit": 20})
	except Exception:
		if not rows:
			raise
		sched = None
	if isinstance(sched, list):
		for r in sched:
			if isinstance(r, dict):
				rows.append(r)
	elif isinstance(sched, dict):
		rows.append(sched)

	# Deduplicate by route + dep_time
	seen = set()
	unique = []
	for r in rows:
		key = (
			(r.get("flight_iata") or ""),
			(r.get("dep_iata") or ""),
			(r.get("arr_iata") or ""),
			(r.get("dep_time") or r.get("dep_estimated") or ""),
		)
		if key in seen:
			continue
		seen.add(key)
		unique.append(r)

	if date_local:
		day = str(date_local)[:10]
		dated = [
			r
			for r in unique
			if day
			in str(
				r.get("dep_time")
				or r.get("dep_estimated")
				or r.get("arr_time")
				or ""
			)
		]
		if dated:
			unique = dated

	unique.sort(key=lambda r: _score(r, prefer_arrival_iata), reverse=True)
	return [map_flight(r, cfg["key"]) for r in unique]
