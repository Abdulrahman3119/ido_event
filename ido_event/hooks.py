app_name = "ido_event"
app_title = "IDO Event"
app_publisher = "I Do Holding"
app_description = "IDO Event management — DocTypes, fixtures, and lifecycle API"
app_email = "mustafakhaled.dev@gmail.com"
app_license = "mit"

required_apps = ["frappe"]

after_install = "ido_event.install.after_install"
before_migrate = "ido_event.install.before_migrate"
after_migrate = "ido_event.install.after_migrate"

# Workspace event picker + shared journey engine client
app_include_css = ["/assets/ido_event/css/ido_workspace_event.css"]
app_include_js = [
	"/assets/ido_event/js/ido_engine_client.js",
	"/assets/ido_event/js/ido_workspace_event.js",
]

# Document events live in Python (ido_event.doc_events.*) — not Server Scripts
# Frappe runs `on_update` after updating an existing doc (not `after_save`).
doc_events = {
	"IDO Arrival": {
		"on_update": "ido_event.doc_events.ido_arrival.after_save",
		"before_save": "ido_event.doc_events.ido_arrival.before_save",
	},
	"IDO Attendance": {
		"after_insert": "ido_event.doc_events.ido_attendance.after_insert",
		"before_save": "ido_event.doc_events.ido_attendance.before_save",
	},
	"IDO Badge": {
		"on_update": "ido_event.doc_events.ido_badge.after_save",
		"before_save": "ido_event.doc_events.ido_badge.before_save",
	},
	"IDO Flight Request": {
		"on_update": "ido_event.doc_events.ido_flight_request.after_save",
		"before_save": "ido_event.doc_events.ido_flight_request.before_save",
	},
	"IDO Guest": {
		"after_insert": "ido_event.doc_events.guest.after_insert",
		"before_save": "ido_event.doc_events.guest.before_save",
		"on_update": "ido_event.doc_events.guest.on_update",
	},
	"IDO Hotel Stay": {
		"on_update": "ido_event.doc_events.ido_hotel_stay.after_save",
		"before_save": "ido_event.doc_events.ido_hotel_stay.before_save",
	},
	"IDO Invitation": {
		"before_save": "ido_event.doc_events.invitation.before_save",
	},
	"IDO KYC Verification": {
		"on_update": "ido_event.doc_events.ido_kyc_verification.on_update",
		"after_insert": "ido_event.doc_events.ido_kyc_verification.on_update",
	},
	"IDO QR Pass": {
		"before_save": "ido_event.doc_events.ido_qr_pass.before_save",
	},
	"IDO Session": {
		"before_save": "ido_event.doc_events.ido_session.before_save",
	},
	"IDO Transport Trip": {
		"on_update": "ido_event.doc_events.ido_transport_trip.after_save",
		"before_save": "ido_event.doc_events.ido_transport_trip.before_save",
	},
	"IDO Visa Application": {
		"on_update": "ido_event.doc_events.ido_visa_application.after_save",
		"before_save": "ido_event.doc_events.ido_visa_application.before_save",
	},
}

# Desk Client Scripts were migrated into doctype/*.js — not Client Script docs

# Keep legacy `ido.*` API paths working without Server Scripts
# + workspace event filter for Number Cards / Dashboard Charts
override_whitelisted_methods = {
	"ido.verify_invitation": "ido_event.api.verify_invitation",
	"ido.register": "ido_event.api.register",
	"ido.send_invitation": "ido_event.api.send_invitation",
	"ido.ensure_invitation": "ido_event.api.ensure_invitation",
	"ido.advance_stage": "ido_event.api.advance_stage",
	"ido.override_stage": "ido_event.api.override_stage",
	"ido.dashboard": "ido_event.api.dashboard",
	"ido.my_journey": "ido_event.api.my_journey",
	"ido.my_tasks": "ido_event.api.my_tasks",
	"ido.scan": "ido_event.api.scan",
	"ido.timeline": "ido_event.api.timeline",
	"ido.get_guest": "ido_event.api.get_guest",
	"ido.list_guests": "ido_event.api.list_guests",
	"ido.get_operator_dataset": "ido_event.api.get_operator_dataset",
	"ido.submit_kyc": "ido_event.api.submit_kyc",
	"ido.submit_flight": "ido_event.api.submit_flight",
	"ido.update_visa": "ido_event.api.update_visa",
	"ido.lookup_flight": "ido_event.api.lookup_flight",
	"frappe.desk.doctype.number_card.number_card.get_result": "ido_event.workspace_filters.get_number_card_result",
	"frappe.desk.doctype.dashboard_chart.dashboard_chart.get": "ido_event.workspace_filters.get_dashboard_chart",
}

# Fixtures (no Client Script / Server Script)
fixtures = [
	{
		"dt": "Role",
		"filters": [["name", "like", "IDO%"]],
	},
	{
		"dt": "Role Profile",
		"filters": [["name", "like", "IDO%"]],
	},
	{
		"dt": "Workspace",
		"filters": [["name", "in", ["IDO Events", "IDO Play"]]],
	},
	{
		"dt": "Web Form",
		"filters": [["doc_type", "like", "IDO%"]],
	},
	{
		"dt": "Print Format",
		"filters": [["doc_type", "like", "IDO%"]],
	},
	{
		"dt": "Number Card",
		"filters": [["document_type", "like", "IDO%"]],
	},
	{
		"dt": "Dashboard Chart",
		"filters": [["document_type", "like", "IDO%"]],
	},
	{
		"dt": "Dashboard",
		"filters": [["name", "like", "IDO%"]],
	},
]
