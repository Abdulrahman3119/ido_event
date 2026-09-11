// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Security Vetting (Form)

// --- IDO Security Vetting — IDO Form ---
frappe.ui.form.on("IDO Security Vetting", { async after_save(frm) { await frappe.db.set_value("IDO Guest", frm.doc.guest, "vetting_status", frm.doc.status); frappe.show_alert({message:"Guest updated",indicator:"green"}); },
	validate(frm){ if(!frm.doc.submitted_at) frm.set_value("submitted_at",frappe.datetime.now_datetime()); if(frm.doc.status==="cleared" && !frm.doc.cleared_at) frm.set_value("cleared_at",frappe.datetime.now_datetime()); } });
