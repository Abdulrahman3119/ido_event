// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Flight Request (Form)

// --- IDO Flight Request — IDO Form ---
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

frappe.ui.form.on("IDO Flight Request", {
	refresh(frm) {
		frm.add_custom_button(__("جلب تفاصيل الرحلة"), () => ido_lookup_and_apply(frm, "outbound"), "AirLabs");
		frm.add_custom_button(__("جلب رحلة العودة"), () => ido_lookup_and_apply(frm, "return"), "AirLabs");
	},
	guest(frm) {
		if (!frm.doc.guest) return;
		frappe.db.get_value(
			"IDO Guest",
			frm.doc.guest,
			["preferred_airport", "preferred_travel_time"],
			(r) => {
				if (!r) return;
				if (r.preferred_airport && !frm.doc.preferred_airport) {
					frm.set_value("preferred_airport", r.preferred_airport);
				}
				if (r.preferred_travel_time && !frm.doc.preferred_travel_time) {
					frm.set_value("preferred_travel_time", r.preferred_travel_time);
				}
			}
		);
	},
	flight_number(frm) {
		ido_debounced_lookup(frm, "outbound");
	},
	return_flight_number(frm) {
		ido_debounced_lookup(frm, "return");
	},
	async validate(frm) {
		const g = (
			await frappe.db.get_value("IDO Guest", frm.doc.guest, [
				"travel_mode",
				"visa_status",
				"region",
			])
		).message;
		const mode = (g && g.travel_mode) || "flying";
		const visaDoc = await IDO.latest("IDO Visa Application", frm.doc.guest);
		const visaOk =
			["approved", "issued", "not_required"].includes(visaDoc) ||
			(g && (g.visa_status === "not_required" || ["gcc", "gcc_me"].includes(g.region))) ||
			(window.IDO && IDO.isGcc && IDO.isGcc(g));
		if (mode === "flying" && !visaOk) {
			frappe.throw("قاعدة العمل 004: لا يمكن طلب الطيران قبل اعتماد التأشيرة.");
		}
		if (frm.doc.status === "ticket_issued" && !(frm.doc.flight_number && frm.doc.ticket_pdf)) {
			frappe.throw("إصدار التذكرة: رقم الرحلة ومستند التذكرة مطلوبان.");
		}
		if (["approved", "ticket_issued"].includes(frm.doc.status) && !frm.doc.approved_by) {
			frm.set_value("approved_by", frappe.session.user);
		}
	},
	async after_save(frm) {
		await IDO.mirror(frm.doc.guest);
		if (["requested", "under_review", "approved"].includes(frm.doc.status)) {
			await IDO.auto(frm.doc.guest, "flight_requested");
		} else if (frm.doc.status === "ticket_issued") {
			await IDO.auto(frm.doc.guest, "ticket_issued");
			if (!(await frappe.db.exists("IDO Arrival", { guest: frm.doc.guest }))) {
				await frappe.call({
					method: "frappe.client.insert",
					args: {
						doc: {
							doctype: "IDO Arrival",
							guest: frm.doc.guest,
							flight_number: frm.doc.flight_number,
							expected_at: frm.doc.arrival_time,
							terminal: frm.doc.terminal,
						},
					},
				});
			}
		}
		frappe.show_alert({ message: "Journey synced", indicator: "green" });
	},
});

const _ido_flight_lookup_timers = {};
let _ido_applying_flight = false;

function ido_debounced_lookup(frm, leg) {
	if (_ido_applying_flight) return;
	const key = leg;
	clearTimeout(_ido_flight_lookup_timers[key]);
	const number =
		leg === "return" ? frm.doc.return_flight_number : frm.doc.flight_number;
	if (!number || String(number).replace(/\s+/g, "").length < 3) return;
	_ido_flight_lookup_timers[key] = setTimeout(() => {
		ido_lookup_and_apply(frm, leg, { silent_empty: true });
	}, 700);
}

async function ido_lookup_and_apply(frm, leg, opts = {}) {
	const number =
		leg === "return" ? frm.doc.return_flight_number : frm.doc.flight_number;
	if (!number) {
		frappe.msgprint(__("أدخل رقم الرحلة أولًا"));
		return;
	}
	const date =
		leg === "return"
			? frm.doc.return_date || frm.doc.preferred_travel_date
			: frm.doc.preferred_travel_date ||
			  (frm.doc.departure_time ? String(frm.doc.departure_time).slice(0, 10) : null);

	frappe.dom.freeze(__("جاري جلب تفاصيل الرحلة من AirLabs…"));
	try {
		const r = await frappe.call({
			method: "ido_event.api.lookup_flight",
			args: {
				flight_number: number,
				date: date || undefined,
				preferred_airport: frm.doc.preferred_airport || undefined,
			},
		});
		const flights = (r.message && r.message.flights) || [];
		if (r.message && r.message.disabled) {
			if (!opts.silent_empty) {
				frappe.msgprint(r.message.message || __("AirLabs غير مفعّل"));
			}
			return;
		}
		if (!flights.length) {
			if (!opts.silent_empty) {
				frappe.msgprint(__("لم يُعثر على رحلة بهذا الرقم"));
			}
			return;
		}
		if (flights.length === 1) {
			await ido_apply_flight(frm, leg, flights[0]);
			return;
		}
		const d = new frappe.ui.Dialog({
			title: __("اختر الرحلة"),
			fields: [
				{
					fieldtype: "Select",
					fieldname: "idx",
					label: __("الرحلة"),
					options: flights
						.map((f, i) => {
							const route = `${f.departure_airport || "?"} → ${f.arrival_airport || "?"}`;
							const when = (f.departure_time || "").slice(0, 16);
							return `${i}, ${f.flight_number || number} · ${route} · ${when} · ${f.airline || ""}`;
						})
						.join("\n"),
					default: "0",
					reqd: 1,
				},
			],
			primary_action_label: __("تطبيق"),
			primary_action(values) {
				const raw = String(values.idx || "0");
				const idx = parseInt(raw.split(",")[0], 10) || 0;
				d.hide();
				ido_apply_flight(frm, leg, flights[idx]);
			},
		});
		d.show();
	} catch (e) {
		// frappe.call already shows server errors
	} finally {
		frappe.dom.unfreeze();
	}
}

async function ido_apply_flight(frm, leg, flight) {
	if (!flight) return;
	_ido_applying_flight = true;
	try {
		if (leg === "return") {
			await frm.set_value(
				"return_flight_number",
				flight.flight_number || frm.doc.return_flight_number
			);
			if (flight.departure_time) {
				await frm.set_value("return_departure_time", flight.departure_time);
			}
		} else {
			if (flight.airline) await frm.set_value("airline", flight.airline);
			if (flight.flight_number) await frm.set_value("flight_number", flight.flight_number);
			if (flight.departure_time) await frm.set_value("departure_time", flight.departure_time);
			if (flight.arrival_time) await frm.set_value("arrival_time", flight.arrival_time);
			if (flight.terminal) await frm.set_value("terminal", flight.terminal);
			if (flight.departure_city) await frm.set_value("departure_city", flight.departure_city);
			if (flight.departure_country) {
				await frm.set_value("departure_country", flight.departure_country);
			}
		}
		const route = `${flight.departure_airport || "?"} → ${flight.arrival_airport || "?"}`;
		frappe.show_alert({
			message: __("تم تعبئة تفاصيل الرحلة: {0}", [route]),
			indicator: "green",
		});
	} finally {
		setTimeout(() => {
			_ido_applying_flight = false;
		}, 800);
	}
}
