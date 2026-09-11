// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Guest (Form)

// --- IDO Guest — IDO Form ---
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

frappe.ui.form.on("IDO Guest", {
	validate(frm) { frm.set_value("full_name", ((frm.doc.first_name||"")+" "+(frm.doc.last_name||"")).trim()); if(frm.doc.nationality==="Saudi Arabia"&&frm.is_new()&&!frm.doc.travel_mode) frm.set_value("travel_mode","local"); if(frm.doc.pdpl_consent&&!frm.doc.consent_at) frm.set_value("consent_at", IDO.now()); },
	async after_save(frm) {
		await frappe.call({
			method: "ido.ensure_invitation",
			args: { guest: frm.doc.name },
			silent: true,
		});
	},
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(__("Advance Stage"), async () => { const t=IDO.next(frm.doc); if(!t) return frappe.msgprint("اكتملت الرحلة — لا توجد مرحلة تالية."); const ev=await frappe.db.get_value("IDO Event",frm.doc.event,"enforce_gates"); if(ev.message.enforce_gates){ const e=await IDO.gate(t,frm.doc); if(e) return frappe.msgprint({message:e,indicator:"red",title:"Gate"}); } await IDO.set({...frm.doc},t,"advance"); frappe.show_alert({message:__("Stage → {0}",[t]),indicator:"green"}); frm.reload_doc(); }, __("Journey"));
		if (frappe.user.has_role(["IDO Owner","IDO Event Manager","System Manager"])) frm.add_custom_button(__("Override Stage"), () => frappe.prompt([
			{fieldname:"to_stage",fieldtype:"Select",label:__("Target stage"),reqd:1,options:frm.fields_dict.stage.df.options},
			{fieldname:"reason",fieldtype:"Small Text",label:__("سبب التجاوز (إلزامي للتدقيق · قاعدة العمل 009)"),reqd:1}], async v => {
			const ev=(await frappe.db.get_value("IDO Event",frm.doc.event,["kyc_strict","require_override_reason"])).message;
			if(ev.require_override_reason&&!(v.reason||"").trim()) return frappe.msgprint("قاعدة العمل 009: التجاوز يتطلب سببًا مُسجّلًا (تدقيق).");
			if(ev.kyc_strict&&IDO.STAGES.indexOf(v.to_stage)>=IDO.STAGES.indexOf("kyc_approved")&&(await IDO.latest("IDO KYC Verification",frm.doc.name))!=="approved") return frappe.msgprint({message:"قاعدة العمل 002: لا يمكن تجاوز اعتماد التحقق من الهوية — حجب صارم (أمان/حماية البيانات).",indicator:"red"});
			await IDO.set({...frm.doc},v.to_stage,"override",v.reason,"BR-009"); frm.reload_doc(); }, __("Override (audited)")), __("Journey"));

		frm.add_custom_button(__("إرسال الدعوة"), async () => {
			if (!frm.doc.email) return frappe.msgprint(__("أضف بريد الضيف أولاً ثم أعد المحاولة"));
			const channel = frm.doc.mobile ? "both" : "email";
			const r = await frappe.call({
				method: "ido.send_invitation",
				args: { guest: frm.doc.name, channel },
				freeze: true,
				freeze_message: __("جاري إرسال الدعوة…"),
			});
			const msg = r.message || {};
			if (msg.whatsapp_url) window.open(msg.whatsapp_url, "_blank");
			frappe.show_alert({
				message: msg.email_sent
					? __("أُرسلت الدعوة إلى {0}", [msg.email || frm.doc.email])
					: __("تم تجهيز الدعوة"),
				indicator: "green",
			});
		}, __("إرسال"));
		frm.add_custom_button(__("فتح الدعوة"), () =>
			frappe.db.get_value("IDO Invitation", { guest: frm.doc.name }, "name").then((r) => {
				if (r.message && r.message.name) frappe.set_route("Form", "IDO Invitation", r.message.name);
				else frappe.msgprint(__("لا توجد دعوة بعد — احفظ الضيف أولاً"));
			}), __("إرسال"));

		frm.add_custom_button(__("Issue QR Pass"), async () => { await frappe.call({method:"frappe.client.insert",args:{doc:{doctype:"IDO QR Pass",guest:frm.doc.name,event:frm.doc.event,token:IDO.rnd(32),checksum:IDO.rnd(12),issued_at:IDO.now(),expires_at:frappe.datetime.add_days(IDO.now(),7)}}}); frm.reload_doc(); }, __("Actions"));
		frm.add_custom_button(__("Refresh statuses"), () => IDO.mirror(frm.doc.name).then(()=>frm.reload_doc()), __("Actions"));
		IDO.timeline(frm.doc.name).then(tl => { const steps=tl.map(s=>`<span class="ido-step ido-${s.state}" title="${s.stage}">${s.label_ar}</span>`).join('<span class="ido-arrow">›</span>'); frm.dashboard.add_section(`<div class="ido-timeline">${steps}</div>`, __("رحلة الضيف")); });
		["IDO KYC Verification","IDO Visa Application","IDO Flight Request","IDO Arrival","IDO Transport Trip","IDO Hotel Stay","IDO Badge","IDO Support Ticket"].forEach(dt => {
			if (dt === "IDO Visa Application" && window.IDO && IDO.isGcc && IDO.isGcc(frm.doc)) return;
			frm.add_custom_button(__(dt.replace("IDO ","")), () => frappe.new_doc(dt,{guest:frm.doc.name,event:frm.doc.event}), __("New"));
		});
		if (window.IDO && IDO.isGcc && IDO.isGcc(frm.doc)) {
			frm.dashboard.set_headline_alert(__("ضيف التعاون الخليجي — لا يلزم مسار التأشيرة"), "blue");
		}
	},
});
frappe.dom.set_style(".ido-timeline{display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:6px 0}.ido-step{padding:3px 9px;border-radius:12px;font-size:11px;background:var(--control-bg);color:var(--text-muted)}.ido-step.ido-completed{background:#E9E1F5;color:#5C2D91}.ido-step.ido-current{background:#5C2D91;color:#fff;font-weight:600}.ido-arrow{color:var(--text-muted);font-size:11px}");

// PROFILE_COMPLETION + OTP (per spec §2 Registration, §4 Widget 1)
frappe.ui.form.on("IDO Guest", {
	validate(frm) {
		const req = ["first_name","last_name","email","mobile","nationality","date_of_birth","gender","passport_number","passport_expiry","issue_country"];
		const filled = req.filter(f => frm.doc[f]).length;
		const bonus = (frm.doc.email_verified ? 1 : 0) + (frm.doc.mobile_verified ? 1 : 0) + (frm.doc.pdpl_consent ? 1 : 0);
		frm.set_value("profile_completion", Math.round(((filled + bonus) / (req.length + 3)) * 100));
	},
	refresh(frm) {
		if (frm.is_new()) return;
		const pc = frm.doc.profile_completion || 0;
		frm.dashboard.add_section(`<div style="display:flex;align-items:center;gap:12px">
			<div style="flex:1;height:10px;border-radius:6px;background:var(--control-bg);overflow:hidden">
				<div style="width:${pc}%;height:100%;background:linear-gradient(90deg,#5C2D91,#8B5CF6)"></div></div>
			<b style="color:#5C2D91">${pc}%</b>
			<span style="font-size:11px;color:var(--text-muted)">${frm.doc.email_verified?"✅ Email":"⬜ Email"} · ${frm.doc.mobile_verified?"✅ Mobile":"⬜ Mobile"}</span>
		</div>`, __("اكتمال الملف"));
		if (!frm.doc.email_verified || !frm.doc.mobile_verified) {
			frm.add_custom_button(__("إرسال رمز التحقق"), async () => {
				const code = String(Math.floor(100000 + Math.random() * 900000));
				await frappe.db.set_value("IDO Guest", frm.doc.name, { otp_code: code, otp_expires_at: frappe.datetime.add_days(frappe.datetime.now_datetime(), 0) });
				if (frm.doc.email) await frappe.call({ method: "frappe.core.doctype.communication.email.make", args: { recipients: frm.doc.email, subject: "رمز التحقق · OTP", content: `<p>رمز التحقق الخاص بك: <b style="font-size:22px">${code}</b></p><p>صالح لمدة 10 دقائق.</p>`, doctype: "IDO Guest", name: frm.doc.name, send_email: 1 } });
				frappe.prompt([{ fieldname: "otp", fieldtype: "Data", label: __("أدخل الرمز المرسل"), reqd: 1 }], async v => {
					if (v.otp === code) { await frappe.db.set_value("IDO Guest", frm.doc.name, { email_verified: 1, mobile_verified: 1, otp_code: null });
						frappe.show_alert({ message: __("تم التحقق ✅"), indicator: "green" }); frm.reload_doc(); }
					else frappe.msgprint({ message: __("رمز غير صحيح"), indicator: "red" });
				}, __("التحقق من البريد الإلكتروني والجوال"));
			}, __("Actions"));
		}
	},
});
// PDPL_PURPOSES — granular, per-purpose, withdrawable consent (PDPL)
frappe.ui.form.on("IDO Guest", {
	refresh(frm) {
		if (frm.is_new()) return;
		if (!(frm.doc.consent_purposes || []).length) {
			[["core","تشغيل رحلة المندوب — التسجيل والهوية والتأشيرة والسفر والاعتماد والبادج",1],
			 ["share_erc","المشاركة مع حوكمة ERC — الاعتماد والتحقق الأمني",1],
			 ["comms","تحديثات الفعالية والتذكيرات",0]].forEach(([p,l,req]) =>
				frm.add_child("consent_purposes",{purpose:p,purpose_label:l,required:req,granted:frm.doc.pdpl_consent?1:0,granted_at:frm.doc.pdpl_consent?frm.doc.consent_at:null}));
			frm.refresh_field("consent_purposes");
		}
		const rows = frm.doc.consent_purposes || [];
		const missing = rows.filter(r => r.required && !r.granted && !r.withdrawn);
		frm.dashboard.add_section(`<div style="font-size:12px">${rows.map(r=>`<div style="padding:3px 0">${r.withdrawn?"⛔":r.granted?"✅":"⬜"} ${frappe.utils.escape_html(r.purpose_label||r.purpose)} ${r.required?'<span style="color:#C93A3A">(مطلوب)</span>':""}</div>`).join("")}
			${missing.length?'<div style="color:#C93A3A;margin-top:6px">الموافقة على الأغراض المطلوبة ضرورية للمتابعة</div>':""}</div>`, __("موافقات حماية البيانات الشخصية"));
		if (!frm.doc.consent_withdrawn) frm.add_custom_button(__("سحب الموافقة (حماية البيانات الشخصية)"), () => {
			frappe.confirm(__("سيتم سحب الموافقة وإيقاف معالجة البيانات لهذه الأغراض. متابعة؟"), async () => {
				(frm.doc.consent_purposes||[]).forEach(r => { r.withdrawn = 1; r.granted = 0; r.withdrawn_at = frappe.datetime.now_datetime(); });
				frm.set_value("consent_withdrawn", 1); frm.set_value("pdpl_consent", 0);
				frm.refresh_field("consent_purposes"); await frm.save();
				frappe.show_alert({ message: __("تم سحب الموافقة"), indicator: "orange" });
			});
		}, __("PDPL"));
	},
	validate(frm) {
		const rows = frm.doc.consent_purposes || [];
		rows.forEach(r => { if (r.granted && !r.granted_at) r.granted_at = frappe.datetime.now_datetime(); });
		const missing = rows.filter(r => r.required && !r.granted);
		if (rows.length && missing.length && !frm.doc.consent_withdrawn && frm.doc.stage !== "invited")
			frappe.msgprint({ message: __("الموافقة على الأغراض المطلوبة ضرورية للمتابعة (حماية البيانات الشخصية)"), indicator: "orange", title: "PDPL" });
	}
});

// --- IDO Guest — Survey ---
frappe.ui.form.on("IDO Guest", {
	refresh(frm) {
		if (frm.is_new()) return;
		if (["departure","completed","closed_out"].includes(frm.doc.stage))
			frm.add_custom_button(__("إرسال استبيان التقييم"), async () => {
				const ev = (await frappe.db.get_value("IDO Event", frm.doc.event, ["event_name_ar","event_name","survey_link"])).message;
				const link = location.origin + (ev.survey_link || "/ido-feedback") + "/new?guest=" + encodeURIComponent(frm.doc.name) + "&event=" + encodeURIComponent(frm.doc.event);
				const name = ev.event_name_ar || ev.event_name;
				await frappe.call({ method: "frappe.core.doctype.communication.email.make", args: { recipients: frm.doc.email, doctype: "IDO Guest", name: frm.doc.name, send_email: 1,
					subject: "شكرًا لحضورك — شاركنا تقييمك · " + name,
					content: `<div dir="rtl" style="font-family:Tahoma,sans-serif"><p>عزيزي/عزيزتي ${frm.doc.first_name}،</p>
						<p>شكرًا لمشاركتك في <b>${name}</b>. يسعدنا معرفة رأيك في التجربة — دقيقتان فقط.</p>
						<p><a href="${link}" style="background:#5C2D91;color:#fff;padding:12px 26px;border-radius:999px;text-decoration:none">قيّم تجربتك</a></p>
						<p style="font-size:12px;color:#777">نتمنى لك عودة آمنة.</p></div>` } });
				frappe.show_alert({ message: __("أُرسل الاستبيان إلى {0}", [frm.doc.email]), indicator: "green" });
			}, __("Actions"));
		frm.add_custom_button(__("طلب خدمة إضافية"), () => frappe.new_doc("IDO Service Request", { guest: frm.doc.name, event: frm.doc.event }), __("New"));
		frm.add_custom_button(__("تسجيل في فعالية"), () => frappe.new_doc("IDO Registration", { guest: frm.doc.name }), __("New"));
		frm.add_custom_button(__("تسجيلاته"), () => frappe.set_route("List","IDO Registration",{guest:frm.doc.name}), __("Actions"));
	}
});
