// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Registration (List)

// --- IDO Registration — List ---
frappe.listview_settings = frappe.listview_settings || {};
frappe.listview_settings["IDO Registration"] = Object.assign(frappe.listview_settings["IDO Registration"] || {}, {
	get_indicator(doc){ const m={cart:["سلة","gray"],pending_payment:["بانتظار الدفع","orange"],paid:["مدفوع","blue"],confirmed:["مؤكّد","green"],cancelled:["ملغى","red"],refunded:["مسترجع","red"]}[doc.status]||[doc.status,"gray"]; return [__(m[0]),m[1],"status,=,"+doc.status]; },
	onload(listview){ listview.page.add_inner_button(__("توليد مهام التسجيلات المدفوعة"), async () => {
		const pend = await frappe.db.get_list("IDO Registration",{filters:{status:["in",["paid","confirmed"]],tasks_generated:0},fields:["name"],limit:50});
		if(!pend.length) return frappe.msgprint(__("لا توجد تسجيلات بانتظار توليد المهام"));
		frappe.set_route("Form","IDO Registration",pend[0].name);
	}).addClass("btn-primary"); }
});
