// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Ticket Type (Form)

// --- IDO Ticket Type — IDO Form ---
frappe.ui.form.on("IDO Ticket Type", {
	validate(frm){ frm.set_value("quantity_available", Math.max(0,(frm.doc.quantity_total||0)-(frm.doc.quantity_sold||0)));
		if(frm.doc.sale_start && frm.doc.sale_end && frm.doc.sale_end < frm.doc.sale_start) frappe.throw("نهاية البيع قبل بدايته."); },
	refresh(frm){ if(frm.is_new()) return;
		const left=(frm.doc.quantity_total||0)-(frm.doc.quantity_sold||0);
		const pct=frm.doc.quantity_total?Math.round(((frm.doc.quantity_sold||0)/frm.doc.quantity_total)*100):0;
		frm.dashboard.add_section(`<div style="display:flex;align-items:center;gap:12px"><div style="flex:1;height:10px;border-radius:6px;background:var(--control-bg);overflow:hidden"><div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#5C2D91,#8B5CF6)"></div></div>
			<b style="color:#5C2D91">${frm.doc.quantity_sold||0} / ${frm.doc.quantity_total||0}</b><span style="font-size:12px;color:var(--text-muted)">المتبقي ${left}</span></div>`, __("المبيعات"));
		frm.add_custom_button(__("التذاكر المُصدرة"), () => frappe.set_route("List","IDO Ticket",{ticket_type:frm.doc.name}));
		frm.add_custom_button(frm.doc.is_on_sale?__("إيقاف البيع"):__("طرح للبيع"), () => { frm.set_value("is_on_sale", frm.doc.is_on_sale?0:1); frm.save(); }).addClass("btn-primary");
	}
});
