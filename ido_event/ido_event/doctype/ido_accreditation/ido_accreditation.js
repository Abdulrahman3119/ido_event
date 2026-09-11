// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Accreditation (Form)

// --- IDO Accreditation — IDO Form ---
frappe.ui.form.on("IDO Accreditation", { async after_save(frm) { await frappe.db.set_value("IDO Guest", frm.doc.guest, "accreditation_status", frm.doc.status); frappe.show_alert({message:"Guest updated",indicator:"green"}); },
	validate(frm){ if(frm.doc.status!=="submitted" && !frm.doc.reviewed_at){ frm.set_value("reviewed_by",frappe.session.user); frm.set_value("reviewed_at",frappe.datetime.now_datetime()); } if(!frm.doc.submitted_at) frm.set_value("submitted_at",frappe.datetime.now_datetime()); } });
