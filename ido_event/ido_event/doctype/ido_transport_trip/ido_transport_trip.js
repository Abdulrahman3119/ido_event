// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Transport Trip (Form)

// --- IDO Transport Trip — IDO Form ---
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

frappe.ui.form.on("IDO Transport Trip", {
	async validate(frm) { if(frm.doc.trip_type==="Airport → Hotel"&&!(await IDO.latest("IDO Arrival",frm.doc.guest,"confirmed"))) frappe.throw("قاعدة العمل 005: لا يمكن إسناد السائق قبل تأكيد الوصول."); for(const [s,f] of [["en_route","started_at"],["picked_up","picked_up_at"],["arrived","arrived_at"],["completed","completed_at"]]) if(frm.doc.state===s&&!frm.doc[f]) frm.set_value(f,IDO.now()); if(!frm.doc.destination&&frm.doc.hotel) frm.set_value("destination",frm.doc.hotel); },
	async after_save(frm) { await IDO.mirror(frm.doc.guest); await frappe.db.set_value("IDO Driver",frm.doc.driver,"status",["assigned","en_route","picked_up"].includes(frm.doc.state)?"on_trip":"available"); if(["en_route","picked_up","arrived","completed"].includes(frm.doc.state)) await IDO.auto(frm.doc.guest,"in_transit"); frappe.show_alert({message:"Journey synced",indicator:"green"}); }
});
