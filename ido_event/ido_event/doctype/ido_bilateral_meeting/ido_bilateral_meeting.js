// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Bilateral Meeting (Form)

// --- IDO Bilateral Meeting — IDO Form ---
frappe.ui.form.on("IDO Bilateral Meeting", {
	async validate(frm) {
		if (frm.doc.requesting_delegation === frm.doc.receiving_delegation) frappe.throw("لا يمكن طلب اجتماع ثنائي مع نفس الوفد.");
		if (frm.doc.status === "confirmed") {
			if (!frm.doc.scheduled_at) frappe.throw("حدّد الموعد المؤكّد قبل التأكيد.");
			const dur = frm.doc.duration_mins || 30;
			const end = frappe.datetime.add_to_date(frm.doc.scheduled_at, { minutes: dur }, true);
			for (const fld of ["requesting_delegation","receiving_delegation"]) {
				const rows = await frappe.db.get_list("IDO Bilateral Meeting", { filters: [["status","=","confirmed"],["name","!=",frm.doc.name||""],[fld,"=",frm.doc[fld]]], fields: ["name","scheduled_at","duration_mins","room"], limit: 100 });
				for (const r of rows) { const rEnd = frappe.datetime.add_to_date(r.scheduled_at, { minutes: r.duration_mins || 30 }, true);
					if (frm.doc.scheduled_at < rEnd && r.scheduled_at < end)
						frappe.throw("تعارض في المواعيد مع الاجتماع " + r.name + " — تُؤكَّد المواعيد الخالية من التعارض فقط."); } }
			if (frm.doc.room) { const rooms = await frappe.db.get_list("IDO Bilateral Meeting", { filters: [["status","=","confirmed"],["room","=",frm.doc.room],["name","!=",frm.doc.name||""]], fields: ["name","scheduled_at","duration_mins"], limit: 100 });
				for (const r of rooms) { const rEnd = frappe.datetime.add_to_date(r.scheduled_at, { minutes: r.duration_mins || 30 }, true);
					if (frm.doc.scheduled_at < rEnd && r.scheduled_at < end) frappe.throw("القاعة " + frm.doc.room + " محجوزة في هذا الوقت (" + r.name + ")"); } }
		}
	},
	refresh(frm) { if (frm.is_new()) return;
		const next = { requested:["availability_checked","التحقق من التوفر"], availability_checked:["confirmed","تأكيد الموعد"], confirmed:["reminded","إرسال تذكير"], reminded:["checked_in","تسجيل الحضور"] }[frm.doc.status];
		if (next) frm.add_custom_button(__(next[1]), () => { frm.set_value("status", next[0]); frm.save(); }).addClass("btn-primary");
		if (["requested","availability_checked"].includes(frm.doc.status))
			frm.add_custom_button(__("رفض الطلب"), () => frappe.prompt([{fieldname:"r",fieldtype:"Small Text",label:__("سبب الرفض"),reqd:1}], v => { frm.set_value("decline_reason", v.r); frm.set_value("status","declined"); frm.save(); }));
	}
});
