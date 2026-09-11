// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Session (Form)

// --- IDO Session — IDO Form ---
frappe.ui.form.on("IDO Session", { async validate(frm){ if(frm.doc.hall&&frm.doc.date){ const c=await frappe.db.get_list("IDO Session",{filters:[["event","=",frm.doc.event],["hall","=",frm.doc.hall],["date","=",frm.doc.date],["name","!=",frm.doc.name||""],["start_time","<",frm.doc.end_time],["end_time",">",frm.doc.start_time]],fields:["name"],limit:1}); if(c.length) frappe.throw("تعارض في القاعة "+frm.doc.hall+" مع الجلسة "+c[0].name); } if(!frm.doc.day&&frm.doc.event&&frm.doc.date){ const ev=await frappe.db.get_doc("IDO Event",frm.doc.event).catch(()=>null); const row=ev&&(ev.days||[]).find(x=>String(x.date).slice(0,10)===String(frm.doc.date).slice(0,10)); if(row) frm.set_value("day",row.day_no);} } });

// --- IDO Session — Programme Day ---
// Programme Day on the Session form: options pulled from the selected event
async function idoSessionDays(frm) {
	if (!frm.doc.event) { frm.set_df_property("day", "options", [""]); return; }
	const ev = await frappe.db.get_doc("IDO Event", frm.doc.event);
	const days = (ev.days || []).slice().sort((a, b) => (a.day_no || 0) - (b.day_no || 0));
	const lang = frappe.boot.lang === "en" ? "en" : "ar";
	// keep values numeric; show day + date as the visible option text
	const opts = [""].concat(days.map(d => String(d.day_no)));
	frm.set_df_property("day", "options", opts.join("\n"));
	const map = {};
	days.forEach(function (d) {
		const base = d.is_pre_day ? (lang === "ar" ? "اليوم التمهيدي" : "Day -1") : (lang === "ar" ? "اليوم " : "Day ") + d.day_no;
		map[String(d.day_no)] = base + (d.date ? " · " + frappe.datetime.str_to_user(d.date) : "");
	});
	frm.set_df_property("day", "description",
		days.map(d => d.day_no + " = " + (d.date ? frappe.datetime.str_to_user(d.date) : "—")).join("  ·  "));
	setTimeout(function () {
		$(frm.wrapper).find('select[data-fieldname="day"] option').each(function () {
			if (this.value && map[this.value]) this.text = map[this.value];
		});
	}, 200);
	frm.__ido_days = days;
}
frappe.ui.form.on("IDO Session", {
	refresh(frm) {
		idoSessionDays(frm);
		if (frm.is_new()) return;
		frm.add_custom_button(__("إنشاء مهام تشغيل"), async () => {
			const r = await frappe.call({
				method: "ido_event.api.sync_session_tasks",
				args: { session: frm.doc.name },
			});
			const n = (r.message && r.message.count) || 0;
			frappe.show_alert({
				message: n ? __("تم إنشاء {0} مهمة", [n]) : __("لا مهام جديدة"),
				indicator: n ? "green" : "blue",
			});
			if (n) frappe.set_route("List", "IDO Task", { session: frm.doc.name });
		}, __("المهام"));
		frm.add_custom_button(__("مهام الجلسة"), () => {
			frappe.set_route("List", "IDO Task", { session: frm.doc.name });
		}, __("المهام"));
	},
	event(frm) { frm.set_value("day", ""); idoSessionDays(frm); },
	day(frm) {
		// selecting a day auto-fills its date
		if (!frm.doc.day) return;
		const n = parseInt(String(frm.doc.day));
		const d = (frm.__ido_days || []).find(x => x.day_no === n);
		if (d && d.date && frm.doc.date !== d.date) frm.set_value("date", d.date);
	},
	validate(frm) {
		if (frm.doc.day) frm.set_value("day", String(frm.doc.day).split(" — ")[0].trim());
	},
});
