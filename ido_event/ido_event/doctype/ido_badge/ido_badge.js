// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Badge (Form)

// --- IDO Badge — IDO Form ---
window.IDO = window.IDO || (() => {
const STAGES=["invited","registered","kyc_approved","visa_processing","visa_approved","flight_requested","ticket_issued","traveling","arrived","in_transit","hotel_checkin","badge_ready","day1","day2","day3","completed"];
const FLY=new Set(["visa_processing","visa_approved","flight_requested","ticket_issued","traveling"]);
const AR={invited:"مدعو",registered:"مسجّل",kyc_approved:"KYC معتمد",visa_processing:"معالجة التأشيرة",visa_approved:"تأشيرة معتمدة",flight_requested:"طلب طيران",ticket_issued:"تذكرة صادرة",traveling:"في الطريق",arrived:"وصل",in_transit:"نقل أرضي",hotel_checkin:"تسجيل فندقي",badge_ready:"بادج جاهز",day1:"اليوم 1",day2:"اليوم 2",day3:"اليوم 3",completed:"اكتملت الرحلة"};
const latest=async(dt,g,f="status")=>{const r=await frappe.db.get_list(dt,{filters:{guest:g},fields:[f],order_by:"modified desc",limit:1});return r[0]?r[0][f]:null;};
const path=g=>g.travel_mode==="local"?STAGES.filter(s=>!FLY.has(s)):STAGES;
const next=g=>{const p=path(g),i=p.indexOf(g.stage);return i>=0&&i<p.length-1?p[i+1]:null;};
const gate=async(t,g)=>{const kyc=await latest("IDO KYC Verification",g.name),visa=await latest("IDO Visa Application",g.name),fl=await latest("IDO Flight Request",g.name),arr=await latest("IDO Arrival",g.name,"confirmed"),trip=await latest("IDO Transport Trip",g.name,"state"),hot=await latest("IDO Hotel Stay",g.name,"check_in_state");
 if(t==="kyc_approved"&&kyc!=="approved")return "قاعدة العمل 001: لا يمكن اعتماد مرحلة KYC قبل أن تصبح حالة التحقق من الهوية = approved.";
 if(t==="visa_processing"&&kyc!=="approved")return "قاعدة العمل 002: لا يمكن بدء التأشيرة قبل اعتماد التحقق من الهوية.";
 if(t==="visa_approved"&&!["approved","issued","not_required"].includes(visa))return "قاعدة العمل 001: لا يمكن الدخول في visa_approved قبل اعتماد/إصدار/إعفاء التأشيرة.";
 if(t==="flight_requested"&&!["approved","issued","not_required"].includes(visa))return "قاعدة العمل 004: لا يمكن طلب الطيران قبل اعتماد التأشيرة.";
 if(["ticket_issued","traveling"].includes(t)&&fl!=="ticket_issued")return "قاعدة العمل 001: لا يمكن بدء السفر قبل وجود تذكرة.";
 if(t==="in_transit"&&!arr)return "قاعدة العمل 005: لا يمكن إسناد السائق قبل تأكيد الوصول.";
 if(t==="hotel_checkin"&&!["arrived","completed"].includes(trip))return "قاعدة العمل 006: لا يمكن تسجيل دخول الفندق قبل وصول رحلة النقل.";
 if(t==="badge_ready"&&hot!=="completed")return "قاعدة العمل 007: لا يمكن إصدار بطاقة الدخول قبل تسجيل دخول الفندق.";
 return null;};
const set=async(g,to,action,reason,rule)=>{await frappe.db.set_value("IDO Guest",g.name,"stage",to);await frappe.call({method:"frappe.client.insert",args:{doc:{doctype:"IDO Stage Log",guest:g.name,from_stage:g.stage,to_stage:to,action,reason:reason||"",rule:rule||"",actor:frappe.session.user,at:frappe.datetime.now_datetime()}},silent:true});g.stage=to;};
const auto=async(gname,up_to)=>{const g=await frappe.db.get_doc("IDO Guest",gname);const p=path(g);if(!p.includes(up_to))return;while(g.stage!==up_to){const t=next(g);if(!t||p.indexOf(t)>p.indexOf(up_to)||await gate(t,g))break;await set(g,t,"auto");}};
const mirror=async(gname)=>{const tm=(await frappe.db.get_value("IDO Guest",gname,"travel_mode")).message.travel_mode;await frappe.db.set_value("IDO Guest",gname,{kyc_status:await latest("IDO KYC Verification",gname)||"pending",visa_status:await latest("IDO Visa Application",gname)||(tm==="local"?"not_required":"not_started"),flight_status:await latest("IDO Flight Request",gname)||"-",arrival_confirmed:await latest("IDO Arrival",gname,"confirmed")||0,trip_state:await latest("IDO Transport Trip",gname,"state")||"-",hotel_checkin_state:await latest("IDO Hotel Stay",gname,"check_in_state")||"pending",badge_state:await latest("IDO Badge",gname,"state")||"pending"});};
const rnd=n=>{const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let s="";for(let i=0;i<n;i++)s+=c[Math.floor(Math.random()*c.length)];return s;};
const timeline=async(gname)=>{const g=await frappe.db.get_doc("IDO Guest",gname);const p=path(g),cur=p.indexOf(g.stage);return p.map((s,i)=>({stage:s,label_ar:AR[s],state:i<cur?"completed":i===cur?"current":"pending"}));};
return {STAGES,AR,latest,path,next,gate,set,auto,mirror,rnd,timeline,now:()=>frappe.datetime.now_datetime()};
})();

frappe.ui.form.on("IDO Badge", {
	async validate(frm) { if(["printed","ready","collected"].includes(frm.doc.state)){ const ev=(await frappe.db.get_value("IDO Event",frm.doc.event,"badge_requires_hotel")).message; if(ev.badge_requires_hotel&&(await IDO.latest("IDO Hotel Stay",frm.doc.guest,"check_in_state"))!=="completed") frappe.throw("قاعدة العمل 007: لا يمكن إصدار بطاقة الدخول قبل تسجيل دخول الفندق."); } if(["printed","ready"].includes(frm.doc.state)&&!frm.doc.printed_at){frm.set_value("printed_at",IDO.now());frm.set_value("printed_by",frappe.session.user);} if(frm.doc.state==="collected"&&!frm.doc.collected_at) frm.set_value("collected_at",IDO.now()); },
	async after_save(frm) { await IDO.mirror(frm.doc.guest); if(["ready","collected"].includes(frm.doc.state)){ if(frm.doc.qr_enabled&&!frm.doc.qr_pass){ const q=await frappe.call({method:"frappe.client.insert",args:{doc:{doctype:"IDO QR Pass",guest:frm.doc.guest,event:frm.doc.event,token:IDO.rnd(32),checksum:IDO.rnd(12),issued_at:IDO.now(),expires_at:frappe.datetime.add_days(IDO.now(),7)}}}); await frappe.db.set_value("IDO Badge",frm.doc.name,"qr_pass",q.message.name); } await IDO.auto(frm.doc.guest,"badge_ready"); } if(frm.doc.state==="revoked"&&frm.doc.qr_pass) await frappe.db.set_value("IDO QR Pass",frm.doc.qr_pass,"revoked",1); frappe.show_alert({message:"Journey synced",indicator:"green"}); }
});

async function idoBadgePreview(frm) {
	const d = new frappe.ui.Dialog({ title: __("Badge Preview"), size: "small" });
	d.$wrapper.find(".modal-dialog").css("max-width", "420px");
	$('<div style="text-align:center;padding:10px;color:var(--text-muted)">' + __("Rendering…") + "</div>").appendTo(d.body);
	d.show();
	try {
		const r = await frappe.call({ method: "frappe.www.printview.get_html_and_style",
			args: { doc: frm.doc, print_format: "IDO Badge Card", no_letterhead: 1 } });
		$(d.body).html('<style>' + (r.message.style || "") + '</style>'
			+ '<div style="display:flex;justify-content:center;background:#f2eef8;padding:14px;border-radius:10px">'
			+ '<div style="transform:scale(.92);transform-origin:top center">' + r.message.html + "</div></div>");
		d.set_primary_action(__("Print"), function () {
			window.open("/printview?doctype=IDO%20Badge&name=" + encodeURIComponent(frm.doc.name)
				+ "&format=IDO%20Badge%20Card&no_letterhead=1&trigger_print=1", "_blank");
		});
	} catch (e) {
		$(d.body).html('<div style="padding:16px;color:#c93a3a">' + __("Preview failed: {0}", [String(e.message || e).slice(0, 120)]) + "</div>");
	}
}

frappe.ui.form.on("IDO Badge", {
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(__("Preview Badge"), function () { idoBadgePreview(frm); }, __("Badge"));
		frm.add_custom_button(__("Print Badge"), function () {
			window.open("/printview?doctype=IDO%20Badge&name=" + encodeURIComponent(frm.doc.name)
				+ "&format=IDO%20Badge%20Card&no_letterhead=1&trigger_print=1", "_blank");
		}, __("Badge"));
		frm.add_custom_button(__("Badge PDF"), function () {
			window.open("/api/method/frappe.utils.print_format.download_pdf?doctype=IDO%20Badge&name="
				+ encodeURIComponent(frm.doc.name) + "&format=IDO%20Badge%20Card&no_letterhead=1", "_blank");
		}, __("Badge"));
		if (!frm.doc.photo && frm.doc.guest) {
			frappe.db.get_value("IDO Guest", frm.doc.guest, "photo").then(function (r) {
				if (r.message && r.message.photo) frm.set_value("photo", r.message.photo);
				else frm.dashboard.add_comment(__("No photo on the guest record — the badge will show initials."), "orange", true);
			});
		}
	},
	guest(frm) {
		if (!frm.doc.guest) return;
		frappe.db.get_value("IDO Guest", frm.doc.guest, ["photo", "organization", "job_title"]).then(function (r) {
			const v = r.message || {};
			if (v.photo && !frm.doc.photo) frm.set_value("photo", v.photo);
			if (v.organization && !frm.doc.organization) frm.set_value("organization", v.organization);
			if (v.job_title && !frm.doc.job_title) frm.set_value("job_title", v.job_title);
		});
	},
});
