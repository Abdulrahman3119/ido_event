// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Service Request (Form)

// --- IDO Service Request — IDO Form ---
const ROUTE = { car_with_driver:"driver", airport_transfer:"airport_desk", extra_night:"hotel_desk", room_change:"hotel_desk",
	housekeeping:"hotel_desk", meal_request:"hotel_desk", medical:"services", interpreter:"protocol",
	meeting_room:"protocol", badge_reprint:"badge_team", visa_support:"visa_team", other:"services" };
const LABEL = { car_with_driver:"طلب عربية وسائق", airport_transfer:"نقل من/إلى المطار", extra_night:"ليلة إضافية", room_change:"تغيير غرفة",
	housekeeping:"خدمة تنظيف", meal_request:"طلب وجبة", medical:"طلب طبي", interpreter:"مترجم", meeting_room:"قاعة اجتماع",
	badge_reprint:"إعادة طباعة البادج", visa_support:"دعم التأشيرة", other:"طلب آخر" };
frappe.ui.form.on("IDO Service Request", {
	service_type(frm) { if (frm.doc.service_type) frm.set_value("routed_to", ROUTE[frm.doc.service_type]); },
	validate(frm) { if (frm.doc.service_type && !frm.doc.routed_to) frm.set_value("routed_to", ROUTE[frm.doc.service_type]);
		if (!frm.doc.event && frm.doc.guest) frappe.db.get_value("IDO Guest", frm.doc.guest, "event").then(r => r.message && frm.set_value("event", r.message.event)); },
	async after_save(frm) {
		if (frm.doc.task || !frm.doc.routed_to) return;
		const t = await frappe.call({ method: "frappe.client.insert", args: { doc: {
			doctype: "IDO Task", subject: (LABEL[frm.doc.service_type] || frm.doc.service_type) + " — " + (frm.doc.guest_name || frm.doc.guest),
			event: frm.doc.event, guest: frm.doc.guest, team: frm.doc.routed_to, status: "open", priority: frm.doc.priority || "Medium",
			due_date: frm.doc.needed_at, source_type: "service_request", source_doctype: "IDO Service Request", source_name: frm.doc.name,
			details: [frm.doc.details, frm.doc.pickup_location ? "من: " + frm.doc.pickup_location : "", frm.doc.destination ? "إلى: " + frm.doc.destination : "", frm.doc.passengers ? "الركاب: " + frm.doc.passengers : ""].filter(Boolean).join(" · ") } } });
		await frappe.db.set_value("IDO Service Request", frm.doc.name, { task: t.message.name, status: "routed" });
		frappe.show_alert({ message: __("تم توجيه الطلب إلى: {0}", [frm.doc.routed_to]), indicator: "green" });
		frm.reload_doc();
	},
	refresh(frm) { if (frm.is_new()) return;
		if (frm.doc.task) frm.add_custom_button(__("فتح المهمة"), () => frappe.set_route("Form", "IDO Task", frm.doc.task));
		if (["submitted","routed","in_progress"].includes(frm.doc.status))
			frm.add_custom_button(__("إنهاء الطلب"), async () => { frm.set_value("status","fulfilled"); await frm.save();
				if (frm.doc.task) await frappe.db.set_value("IDO Task", frm.doc.task, { status: "done", completed_at: frappe.datetime.now_datetime(), completed_by: frappe.session.user }); }).addClass("btn-primary");
	}
});
