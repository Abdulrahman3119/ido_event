// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Broadcast (Form)

// --- IDO Broadcast — IDO Form ---
frappe.ui.form.on("IDO Broadcast", {
	refresh(frm) {
		frm.add_custom_button(__("Build Audience"), async () => {
			const f = { event: frm.doc.event }; if (frm.doc.stage_filter) f.stage = frm.doc.stage_filter; if (frm.doc.region_filter) f.region = frm.doc.region_filter; if (frm.doc.vip_only) f.vip = 1; if (frm.doc.nationality_filter) f.nationality = frm.doc.nationality_filter;
			const gs = await frappe.db.get_list("IDO Guest", { filters: f, fields: ["name"], limit: 5000 });
			frm.clear_table("recipients"); gs.forEach(g => frm.add_child("recipients", { guest: g.name })); frm.set_value("recipient_count", gs.length); frm.refresh_field("recipients"); });
		if (!frm.is_new() && ["draft","scheduled","failed"].includes(frm.doc.status)) frm.add_custom_button(__("Send Now (email)"), async () => {
			const t = (await frappe.db.get_doc("IDO Comms Template", frm.doc.template)); let ok = 0;
			for (const r of frm.doc.recipients) { const g = await frappe.db.get_doc("IDO Guest", r.guest); const ar = (g.language || "ar") === "ar";
				try { await frappe.call({ method: "frappe.core.doctype.communication.email.make", args: { recipients: g.email, subject: frappe.render(ar ? t.subject_ar : t.subject_en, { guest: g }), content: frappe.render(ar ? t.body_ar : t.body_en, { guest: g }), doctype: "IDO Guest", name: g.name, send_email: 1 } }); r.status = "sent"; ok++; } catch (e) { r.status = "failed"; } }
			frm.set_value("status", ok ? "sent" : "failed"); frm.set_value("sent_at", frappe.datetime.now_datetime()); frm.refresh_field("recipients"); frm.save(); }).addClass("btn-primary");
	}
});
