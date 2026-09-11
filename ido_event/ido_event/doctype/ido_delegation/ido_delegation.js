// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Delegation (Form)

// --- IDO Delegation — IDO Form ---
frappe.ui.form.on("IDO Delegation", { async refresh(frm){ if(frm.is_new()) return;
	const n = await frappe.db.count("IDO Guest", { filters: { delegation: frm.doc.name } });
	if (n !== frm.doc.member_count) await frappe.db.set_value("IDO Delegation", frm.doc.name, "member_count", n);
	frm.add_custom_button(__("أعضاء الوفد"), () => frappe.set_route("List","IDO Guest",{delegation:frm.doc.name}));
	frm.add_custom_button(__("الاجتماعات الثنائية"), () => frappe.set_route("List","IDO Bilateral Meeting",{requesting_delegation:frm.doc.name}));
} });
