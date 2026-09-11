"""Map Frappe IDO DocTypes → @ido-events/core JSON shapes."""

from __future__ import annotations

import frappe

# Country name → ISO-2 (best-effort; falls back to SA / XX)
COUNTRY_ISO = {
	"Saudi Arabia": "SA",
	"United Arab Emirates": "AE",
	"United Kingdom": "GB",
	"United States": "US",
	"Egypt": "EG",
	"Jordan": "JO",
	"Kuwait": "KW",
	"Bahrain": "BH",
	"Qatar": "QA",
	"Oman": "OM",
	"Japan": "JP",
	"China": "CN",
	"India": "IN",
	"Germany": "DE",
	"France": "FR",
}

ISO_COUNTRY = {v: k for k, v in COUNTRY_ISO.items()}


def _iso(country: str | None) -> str:
	if not country:
		return "SA"
	if len(country) == 2:
		return country.upper()
	return COUNTRY_ISO.get(country, "XX")


def country_from_iso(code_or_name: str | None) -> str | None:
	"""Map ISO-2 or country name → Frappe Country link value."""
	if not code_or_name:
		return None
	if len(code_or_name) == 2:
		name = ISO_COUNTRY.get(code_or_name.upper())
		if name and frappe.db.exists("Country", name):
			return name
		# fall through: try code as-is
	if frappe.db.exists("Country", code_or_name):
		return code_or_name
	return ISO_COUNTRY.get((code_or_name or "").upper()) or code_or_name


def _gender(g: str | None) -> str:
	if not g:
		return "male"
	return "female" if g.lower().startswith("f") else "male"


def _inv_status(s: str | None) -> str:
	return {
		"draft": "created",
		"sent": "sent",
		"opened": "opened",
		"accepted": "accepted",
		"declined": "accepted",
		"expired": "sent",
	}.get(s or "draft", "created")


def _flight_status(s: str | None) -> str:
	return {
		None: "none",
		"-": "none",
		"requested": "requested",
		"under_review": "requested",
		"approved": "approved",
		"ticket_issued": "ticketed",
		"rejected": "none",
	}.get(s, "none")


def _trip_state(s: str | None) -> str:
	return {
		None: "unassigned",
		"-": "unassigned",
		"assigned": "assigned",
		"en_route": "on_route",
		"picked_up": "start",
		"arrived": "arrived",
		"completed": "completed",
		"cancelled": "unassigned",
	}.get(s, "unassigned")


def _hotel_state(s: str | None) -> str:
	return {
		None: "none",
		"pending": "none",
		"reserved": "room_assigned",
		"completed": "completed",
		"checked_out": "completed",
		"no_show": "none",
	}.get(s, "none")


def _badge_state(s: str | None) -> str:
	return {
		None: "none",
		"pending": "none",
		"queued": "submitted",
		"printed": "printed",
		"ready": "ready",
		"collected": "delivered",
		"revoked": "none",
	}.get(s, "none")


def _latest(doctype: str, guest: str, fields: list[str]):
	rows = frappe.get_all(
		doctype, filters={"guest": guest}, fields=fields, order_by="modified desc", limit=1
	)
	return rows[0] if rows else None


def guest_to_core(guest_name: str) -> dict:
	g = frappe.get_doc("IDO Guest", guest_name)
	inv = _latest(
		"IDO Invitation",
		guest_name,
		["name", "invitation_code", "secure_link", "status", "sent_at"],
	)
	kyc = _latest(
		"IDO KYC Verification",
		guest_name,
		[
			"status",
			"passport_image",
			"face_image",
			"passport_expiry",
			"issue_country",
			"rejection_reason",
		],
	)
	visa = _latest("IDO Visa Application", guest_name, ["status", "modified"])
	flight = _latest(
		"IDO Flight Request",
		guest_name,
		[
			"status",
			"departure_country",
			"departure_city",
			"preferred_airport",
			"preferred_travel_date",
			"preferred_travel_time",
			"return_date",
			"travel_class",
			"special_needs",
			"airline",
			"flight_number",
			"departure_time",
			"arrival_time",
			"terminal",
			"ticket_pdf",
		],
	)
	arrival = _latest(
		"IDO Arrival", guest_name, ["confirmed", "status", "modified", "meeting_point"]
	)
	trip = _latest(
		"IDO Transport Trip",
		guest_name,
		["state", "driver", "pickup_location", "destination", "luggage_notes"],
	)
	hotel = _latest(
		"IDO Hotel Stay", guest_name, ["hotel", "room_number", "check_in_state"]
	)
	badge = _latest(
		"IDO Badge", guest_name, ["state", "badge_type", "qr_enabled", "nfc_enabled"]
	)

	ticket = None
	if flight and flight.get("airline"):
		ticket = {
			"airline": flight.airline or "",
			"flightNumber": flight.flight_number or "",
			"departureTime": str(flight.departure_time or "")[:16],
			"arrivalTime": str(flight.arrival_time or "")[:16],
			"terminal": flight.terminal or "",
			"pdfUrl": flight.ticket_pdf or "",
		}

	visa_status = (visa.status if visa else None) or (
		"not_required" if (g.travel_mode or "flying") == "local" else "not_started"
	)

	hotel_name = ""
	if hotel and hotel.hotel:
		hotel_name = frappe.db.get_value("IDO Hotel", hotel.hotel, "hotel_name") or hotel.hotel

	return {
		"id": g.name,
		"eventId": g.event,
		"stage": g.stage or "invited",
		"status": "active",
		"travelMode": g.travel_mode or "flying",
		"countryCode": _iso(g.nationality),
		"region": g.region or "gcc_me",
		"vip": bool(g.vip),
		"organization": g.organization or "",
		"preferredLocale": g.language or "ar",
		"profile": {
			"firstName": g.first_name or "",
			"lastName": g.last_name or "",
			"email": g.email or "",
			"mobile": g.mobile or "",
			"nationality": _iso(g.nationality),
			"dateOfBirth": str(g.date_of_birth or "")[:10],
			"gender": _gender(g.gender),
			"passportNumber": g.passport_number or "",
			"emergencyContact": g.emergency_contact,
		},
		"invitation": {
			"id": inv.name if inv else f"INV-{g.name}",
			"guestId": g.name,
			"code": (inv.invitation_code if inv else "") or "",
			"secureLink": (inv.secure_link if inv else "") or "",
			"status": _inv_status(inv.status if inv else "draft"),
			"sentAt": str(inv.sent_at)[:16] if inv and inv.sent_at else None,
		},
		"kyc": {
			"status": (kyc.status if kyc else None) or g.kyc_status or "pending",
			"passportImage": bool(kyc and kyc.passport_image),
			"faceImage": bool(kyc and kyc.face_image),
			"passportExpiry": str(kyc.passport_expiry)[:10]
			if kyc and kyc.passport_expiry
			else (str(g.passport_expiry)[:10] if g.passport_expiry else None),
			"issueCountry": _iso(kyc.issue_country if kyc else g.issue_country),
			"rejectionReason": kyc.rejection_reason if kyc else None,
		},
		"visa": {
			"status": visa_status,
			"updatedAt": str(visa.modified)[:16] if visa and visa.modified else None,
			"timeline": [],
		},
		"flight": {
			"status": _flight_status(flight.status if flight else None),
			"departureCountry": _iso(flight.departure_country if flight else None),
			"departureCity": (flight.departure_city if flight else None) or "",
			"preferredAirport": (flight.preferred_airport if flight else None)
			or (g.preferred_airport or ""),
			"preferredTravelDate": str(flight.preferred_travel_date)[:10]
			if flight and flight.preferred_travel_date
			else "",
			"preferredTravelTime": (flight.preferred_travel_time if flight else None)
			or (g.preferred_travel_time or ""),
			"returnDate": str(flight.return_date)[:10]
			if flight and flight.return_date
			else "",
			"travelClass": ((flight.travel_class if flight else None) or "economy").lower(),
			"specialNeeds": flight.special_needs if flight else None,
			"companions": [],
			"ticket": ticket,
		},
		"arrival": {
			"confirmed": bool(
				(arrival and (arrival.confirmed or arrival.status == "confirmed"))
				or g.arrival_confirmed
			),
			"confirmedBy": None,
			"scannedAt": None,
		},
		"trip": {
			"state": _trip_state(trip.state if trip else g.trip_state),
			"driverId": trip.driver if trip else None,
			"pickupLocation": trip.pickup_location if trip else None,
			"hotelDestination": trip.destination if trip else None,
			"luggageNotes": trip.luggage_notes if trip else None,
		},
		"hotel": {
			"hotelId": hotel.hotel if hotel else "",
			"hotelName": hotel_name,
			"checkInState": _hotel_state(
				hotel.check_in_state if hotel else g.hotel_checkin_state
			),
			"roomNumber": int(hotel.room_number)
			if hotel and hotel.room_number and str(hotel.room_number).isdigit()
			else None,
		},
		"badge": {
			"state": _badge_state(badge.state if badge else g.badge_state),
			"language": getattr(g, "language", None) or "ar",
			"organization": g.organization or "",
			"jobTitle": g.job_title or "Delegate",
			"qrEnabled": bool(badge.qr_enabled) if badge and hasattr(badge, "qr_enabled") else False,
			"nfcEnabled": bool(badge.nfc_enabled) if badge and hasattr(badge, "nfc_enabled") else False,
		},
	}


def list_guest_rows(event: str) -> list[dict]:
	names = frappe.get_all(
		"IDO Guest", filters={"event": event}, pluck="name", order_by="creation"
	)
	return [guest_to_core(n) for n in names]


def build_operator_dataset(event: str) -> dict:
	ev = frappe.get_doc("IDO Event", event)
	venue = None
	halls = []
	if ev.venue:
		v = frappe.get_doc("IDO Venue", ev.venue) if frappe.db.exists("IDO Venue", ev.venue) else None
		if v:
			halls = [
				{"id": h.name if hasattr(h, "name") else f"{v.name}-{i}", "name": h.hall_name or h.name, "capacity": h.capacity or 0}
				for i, h in enumerate(v.get("halls") or [])
			]
			# child table may use different field names
			if not halls and hasattr(v, "as_dict"):
				for i, h in enumerate(frappe.get_all("IDO Venue Hall", filters={"parent": v.name}, fields=["name", "hall_name", "capacity"])):
					halls.append(
						{
							"id": h.name,
							"name": h.hall_name or h.name,
							"capacity": h.capacity or 0,
						}
					)
			venue = {
				"id": v.name,
				"name": getattr(v, "venue_name", None) or v.name,
				"city": getattr(v, "city", None) or "",
				"halls": halls,
			}
	if not venue:
		venue = {
			"id": ev.venue or "VENUE",
			"name": ev.venue or "Venue",
			"city": "",
			"halls": [],
		}

	days = []
	if ev.start_date and ev.end_date:
		from datetime import timedelta

		d = ev.start_date
		while d <= ev.end_date:
			days.append(str(d))
			d += timedelta(days=1)

	sessions = []
	for s in frappe.get_all(
		"IDO Session",
		filters={"event": event},
		fields=[
			"name",
			"title",
			"day",
			"date",
			"start_time",
			"end_time",
			"hall",
			"session_type",
			"track",
		],
		order_by="date,start_time",
	):
		sessions.append(
			{
				"id": s.name,
				"name": s.title or s.name,
				"day": int(s.day or 1),
				"date": str(s.date or "")[:10],
				"startTime": str(s.start_time or "")[:5],
				"endTime": str(s.end_time or "")[:5],
				"hall": s.hall or "",
				"speaker": "",
				"track": (s.track or "general").lower()
				if s.track
				else "general",
				"type": (s.session_type or "panel").lower(),
			}
		)

	drivers = []
	for d in frappe.get_all("IDO Driver", fields=["name", "driver_name", "mobile"], limit=50):
		drivers.append(
			{
				"id": d.name,
				"name": d.driver_name or d.name,
				"phone": d.mobile or "",
			}
		)

	guests = list_guest_rows(event)
	return {
		"event": {
			"id": ev.name,
			"name": ev.event_name or ev.name,
			"city": venue.get("city") or "",
			"venueId": venue["id"],
			"startDate": str(ev.start_date or "")[:10],
			"endDate": str(ev.end_date or "")[:10],
			"days": days,
		},
		"venue": venue,
		"guests": guests,
		"sessions": sessions,
		"speakers": [],
		"drivers": drivers,
		"rooms": [],
		"attendance": [],
		"qrPasses": [],
	}
