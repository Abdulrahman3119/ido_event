// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Ticket (Form)

// --- IDO Ticket — IDO Form ---
const rnd=n=>{const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let s="";for(let i=0;i<n;i++)s+=c[Math.floor(Math.random()*c.length)];return s;};
frappe.ui.form.on("IDO Ticket", {
	validate(frm){ if(!frm.doc.serial) frm.set_value("serial","T-"+rnd(10));
		if(!frm.doc.qr_token) frm.set_value("qr_token",rnd(28));
		if(["paid","issued"].includes(frm.doc.status) && !frm.doc.purchased_at) frm.set_value("purchased_at",frappe.datetime.now_datetime());
		if(frm.doc.status==="used" && !frm.doc.used_at){ frm.set_value("used_at",frappe.datetime.now_datetime()); frm.set_value("checked_in_by",frappe.session.user); } },
	refresh(frm){ if(frm.is_new()) return;
		if(frm.doc.qr_token){ const payload="IDOTKT:"+frm.doc.serial+":"+frm.doc.qr_token;
			frm.dashboard.add_section(`<div style="text-align:center"><img src="https://api.qrserver.com/v1/create-qr-code/?size=190x190&data=${encodeURIComponent(payload)}" style="width:190px;height:190px">
				<div style="font-weight:700;margin-top:6px">${frappe.utils.escape_html(frm.doc.holder_name||"")}</div>
				<div style="font-size:11px;color:var(--text-muted)">${payload}</div></div>`, __("رمز الدخول")); }
		if(frm.doc.status==="paid") frm.add_custom_button(__("إصدار التذكرة"), ()=>{ frm.set_value("status","issued"); frm.save(); }).addClass("btn-primary");
		if(frm.doc.status==="issued") frm.add_custom_button(__("تسجيل الدخول (استخدام)"), ()=>{ frm.set_value("status","used"); frm.save(); }).addClass("btn-primary");
		if(["reserved","paid","issued"].includes(frm.doc.status)) frm.add_custom_button(__("إلغاء"), ()=>{ frm.set_value("status","cancelled"); frm.save(); });
	}
});
