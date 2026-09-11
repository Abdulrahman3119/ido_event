// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Registration (Form)

// --- IDO Registration — IDO Form ---
frappe.ui.form.on("IDO Order Item", {
	package(frm, cdt, cdn) { const r = locals[cdt][cdn];
		if (!r.package) return;
		frappe.db.get_value("IDO Package", r.package, ["price","tier"]).then(v => {
			frappe.model.set_value(cdt, cdn, "rate", v.message.price || 0);
			frappe.model.set_value(cdt, cdn, "package_tier", v.message.tier);
			frappe.model.set_value(cdt, cdn, "amount", (v.message.price||0) * (r.qty||1)); }); },
	qty(frm, cdt, cdn) { const r = locals[cdt][cdn]; frappe.model.set_value(cdt, cdn, "amount", (r.rate||0) * (r.qty||1)); },
	rate(frm, cdt, cdn) { const r = locals[cdt][cdn]; frappe.model.set_value(cdt, cdn, "amount", (r.rate||0) * (r.qty||1)); }
});
frappe.ui.form.on("IDO Registration", {
	validate(frm) {
		let total = 0; (frm.doc.items || []).forEach(r => { r.amount = (r.rate || 0) * (r.qty || 1); total += r.amount; });
		frm.set_value("total_amount", total);
		if (!frm.doc.registered_on) frm.set_value("registered_on", frappe.datetime.now_datetime());
		if (frm.doc.status === "paid" && !frm.doc.paid_at) frm.set_value("paid_at", frappe.datetime.now_datetime());
	},
	async after_save(frm) {
		const n = await frappe.db.count("IDO Registration", { filters: { guest: frm.doc.guest, status: ["in", ["paid","confirmed","pending_payment"]] } });
		await frappe.db.set_value("IDO Guest", frm.doc.guest, "active_registrations", n);
		if (["paid","confirmed"].includes(frm.doc.status) && !frm.doc.tasks_generated) await generate(frm);
	},
	refresh(frm) {
		if (frm.is_new()) return;
		if (["paid","confirmed"].includes(frm.doc.status) && !frm.doc.tasks_generated) generate(frm);
		if (["cart","pending_payment"].includes(frm.doc.status))
			frm.add_custom_button(__("تأكيد الدفع"), () => frappe.prompt([{fieldname:"ref",fieldtype:"Data",label:__("مرجع الدفع"),reqd:1}], v => {
				frm.set_value("payment_reference", v.ref); frm.set_value("status","paid"); frm.save(); }, __("تسجيل الدفع"))).addClass("btn-primary");
		if (frm.doc.order_type !== "package") frm.add_custom_button(__("التذاكر المُصدرة"), () => frappe.set_route("List","IDO Ticket",{registration:frm.doc.name}));
		if (frm.doc.tasks_generated) frm.add_custom_button(__("مهام هذا التسجيل"), () => frappe.set_route("List","IDO Task",{source_name:frm.doc.name}));
		if (frm.doc.status === "paid") frm.add_custom_button(__("إعادة توليد المهام"), () => generate(frm, true), __("العمليات"));
	}
});
async function generate(frm, force) {
	if (frm.doc.tasks_generated && !force) return;
	const mk = (subject, team, details, priority) => frappe.call({ method: "frappe.client.insert", args: { doc: { doctype: "IDO Task", subject, team,
		event: frm.doc.event, guest: frm.doc.guest, status: "open", priority: priority || "Medium", source_type: "package",
		source_doctype: "IDO Registration", source_name: frm.doc.name, details } } });
	const gname = frm.doc.guest_name || frm.doc.guest; let made = 0;
	for (const it of (frm.doc.items || [])) {
		if (!it.package) continue;
		const p = await frappe.db.get_doc("IDO Package", it.package);
		const inc = p.included_services || [];
		if (inc.length) {
			// new model: one task per catalogue service
			for (const row of inc) {
				const svc = await frappe.db.get_doc("IDO Package Service", row.service).catch(() => null);
				if (!svc || svc.is_active === 0) continue;
				const subj = (svc.task_subject || svc.service_name_ar || svc.service_name) + " — " + gname;
				await mk(subj, svc.team || "services", "الباقة: " + p.package_name + (row.notes ? " · " + row.notes : ""),
					row.priority || svc.default_priority || "Medium");
				made++;
			}
		} else {
			// fallback for packages still using the old checkboxes
			const vip = ["VIP", "Delegation", "Sponsor"].includes(p.tier);
			await mk("إصدار بادج (" + (p.inc_badge_type || "Delegate") + ") — " + gname, "badge_team", "الباقة: " + p.package_name, vip ? "High" : "Medium"); made++;
			if (p.inc_hotel) { await mk("حجز إقامة فندقية — " + gname, "hotel_desk", "الباقة: " + p.package_name, vip ? "High" : "Medium"); made++; }
			if (p.inc_transport) { await mk("ترتيب نقل خاص بسائق — " + gname, "driver", "الباقة: " + p.package_name, vip ? "High" : "Medium"); made++; }
			if (p.inc_flight) { await mk("إصدار تذكرة طيران — " + gname, "travel_team", "الباقة: " + p.package_name, vip ? "High" : "Medium"); made++; }
			if (p.inc_bilateral) { await mk("تنسيق الاجتماعات الثنائية — " + gname, "protocol", "الباقة: " + p.package_name, "High"); made++; }
			if (p.inc_gala) { await mk("تأكيد مقعد حفل العشاء — " + gname, "services", "الباقة: " + p.package_name); made++; }
			if (vip) { await mk("بروتوكول استقبال VIP — " + gname, "protocol", "الباقة: " + p.package_name, "Urgent"); made++; }
		}
		await frappe.db.set_value("IDO Package", p.name, "sold", (p.sold || 0) + (it.qty || 1));
	}

	// ---- tickets: issue one IDO Ticket per seat, badge task only ----
	let tix = 0;
	for (const it of (frm.doc.items || [])) {
		if (!it.ticket_type) continue;
		const tt = await frappe.db.get_doc("IDO Ticket Type", it.ticket_type);
		const g = frm.doc.guest ? (await frappe.db.get_value("IDO Guest", frm.doc.guest, ["full_name","email","mobile"])).message : {};
		const rnd = n => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let o = ""; for (let i=0;i<n;i++) o += c[Math.floor(Math.random()*c.length)]; return o; };
		for (let i = 0; i < (it.qty || 1); i++) {
			await frappe.call({ method: "frappe.client.insert", args: { doc: { doctype: "IDO Ticket", ticket_type: it.ticket_type, event: frm.doc.event,
				registration: frm.doc.name, guest: frm.doc.guest, holder_name: g.full_name || gname, holder_email: g.email, holder_mobile: g.mobile,
				status: "issued", price: it.rate, serial: "T-" + rnd(10), qr_token: rnd(28), purchased_at: frappe.datetime.now_datetime() } } });
			tix++;
		}
		await frappe.db.set_value("IDO Ticket Type", tt.name, { quantity_sold: (tt.quantity_sold||0) + (it.qty||1), quantity_available: Math.max(0,(tt.quantity_total||0)-((tt.quantity_sold||0)+(it.qty||1))) });
		await mk("تجهيز بادج " + (tt.badge_type || "Visitor") + " — " + gname, "badge_team", "تذكرة: " + (tt.ticket_name_ar || tt.ticket_name) + " × " + (it.qty||1)); made++;
	}
	if (tix) frappe.show_alert({ message: __("تم إصدار {0} تذكرة", [tix]), indicator: "blue" });
	if ((frm.doc.items||[]).some(i => i.package)) { await mk("متابعة التأشيرة والوصول — " + gname, "operations", "تسجيل: " + frm.doc.name); made++; }
	await frappe.db.set_value("IDO Registration", frm.doc.name, "tasks_generated", 1);
	frappe.show_alert({ message: __("تم توليد {0} مهمة للفرق حسب الباقة", [made]), indicator: "green" });
	frm.reload_doc();
}

// --- IDO Registration — VIP Agenda ---
const IDO_GA_TYPE = { session:["جلسة","Session"], bilateral:["اجتماع ثنائي","Bilateral"], protocol:["مراسم","Protocol"],
	transport:["نقل","Transport"], meal:["وجبة","Meal"], rest:["راحة","Rest"], private:["خاص","Private"],
	site_visit:["زيارة ميدانية","Site Visit"], media:["إعلام","Media"], other:["أخرى","Other"] };
const IDO_GA_TEAM = { session:"usher", bilateral:"protocol", protocol:"protocol", transport:"driver",
	meal:"services", rest:"services", private:"protocol", site_visit:"operations", media:"services", other:"services" };
const gaMins = v => { const p = String(v || "0:0").split(":"); return (+p[0]) * 60 + (+(p[1] || 0)); };
const gaHm = v => { const p = String(v || "0:0").split(":"); return String(p[0]||"0").padStart(2,"0") + ":" + String(p[1]||"00").padStart(2,"0"); };

// ---- overlap detection ----
function gaConflicts(rows) {
	const out = [];
	const list = (rows || []).filter(r => r.start_time && r.end_time);
	for (let i = 0; i < list.length; i++) {
		for (let j = i + 1; j < list.length; j++) {
			const a = list[i], b = list[j];
			if (String(a.event_day || "") !== String(b.event_day || "")) continue;
			if (gaMins(a.start_time) < gaMins(b.end_time) && gaMins(b.start_time) < gaMins(a.end_time)) {
				out.push({ a: a, b: b,
					overlap: gaHm(gaMins(a.start_time) > gaMins(b.start_time) ? a.start_time : b.start_time)
						+ "–" + gaHm(gaMins(a.end_time) < gaMins(b.end_time) ? a.end_time : b.end_time) });
			}
		}
	}
	return out;
}
function gaConflictHtml(list, lang) {
	const esc = s => frappe.utils.escape_html(String(s == null ? "" : s));
	const nm = r => r.title || (IDO_GA_TYPE[r.item_type] ? IDO_GA_TYPE[r.item_type][lang === "ar" ? 0 : 1] : r.item_type);
	return '<div style="background:#FBE3E3;border:1px solid #e8b4b4;border-radius:10px;padding:12px 14px;margin-bottom:12px">'
		+ '<div style="font-weight:700;color:#8a2b2b;margin-bottom:6px">⚠ ' + __("{0} scheduling conflict(s)", [list.length]) + "</div>"
		+ list.map(c => '<div style="font-size:12.5px;color:#8a2b2b;padding:3px 0">'
			+ __("Day") + " " + esc(c.a.event_day || "?") + " · <b>" + esc(c.overlap) + "</b> — "
			+ esc(nm(c.a)) + " ↔ " + esc(nm(c.b)) + "</div>").join("") + "</div>";
}

async function gaDayOptions(frm) {
	if (!frm.doc.event) return [""];
	const ev = await frappe.db.get_doc("IDO Event", frm.doc.event).catch(() => null);
	if (!ev) return [""];
	const days = (ev.days || []).filter(d => !d.is_pre_day).sort((a,b) => (a.day_no||0)-(b.day_no||0));
	window.__gaDays = {}; days.forEach(d => { window.__gaDays[String(d.day_no)] = d.date; });
	return [""].concat(days.map(d => String(d.day_no)));
}
async function gaFillDays(frm) {
	const opts = await gaDayOptions(frm);
	const g = frm.get_field("personal_agenda");
	if (!g || !g.grid) return;
	const str = opts.join("\n");
	g.grid.update_docfield_property("event_day", "options", str);
	const meta = frappe.get_meta("IDO Guest Agenda Item");
	const mf = meta && (meta.fields||[]).find(f => f.fieldname === "event_day");
	if (mf) { mf.fieldtype = "Select"; mf.options = str; }
	g.grid.refresh();
}

frappe.ui.form.on("IDO Guest Agenda Item", {
	async session(frm, cdt, cdn) {
		const r = locals[cdt][cdn];
		if (!r.session) return;
		const s = await frappe.db.get_doc("IDO Session", r.session).catch(() => null);
		if (!s) return;
		frappe.model.set_value(cdt, cdn, "title", s.title_ar || s.title);
		frappe.model.set_value(cdt, cdn, "start_time", s.start_time);
		frappe.model.set_value(cdt, cdn, "end_time", s.end_time);
		frappe.model.set_value(cdt, cdn, "location", s.hall || "");
		if (s.day) frappe.model.set_value(cdt, cdn, "event_day", String(s.day));
	},
	item_type(frm, cdt, cdn) {
		const r = locals[cdt][cdn];
		if (!r.team && IDO_GA_TEAM[r.item_type]) frappe.model.set_value(cdt, cdn, "team", IDO_GA_TEAM[r.item_type]);
	},
	start_time(frm) { gaRender(frm); },
	end_time(frm) { gaRender(frm); },
	event_day(frm) { gaRender(frm); },
	personal_agenda_remove(frm) { gaRender(frm); },
});

frappe.ui.form.on("IDO Registration", {
	refresh(frm) {
		if (frm.is_new()) return;
		gaFillDays(frm);
		frm.add_custom_button(__("Pull Event Sessions"), function () { gaPullSessions(frm); }, __("VIP Agenda"));
		frm.add_custom_button(__("Generate Tasks"), function () { gaGenerateTasks(frm); }, __("VIP Agenda"));
		frm.add_custom_button(__("Check Conflicts"), function () { gaCheck(frm); }, __("VIP Agenda"));
		frm.add_custom_button(__("Agenda Tasks"), function () { frappe.set_route("List","IDO Task",{source_name:frm.doc.name,source_type:"guest_agenda"}); }, __("VIP Agenda"));
		gaRender(frm);
	},
	validate(frm) {
		(frm.doc.personal_agenda || []).forEach(function (r) {
			if (r.end_time && r.start_time && gaMins(r.end_time) <= gaMins(r.start_time))
				frappe.throw(__("Agenda row {0}: To must be after From", [r.idx]));
			if (!r.team && IDO_GA_TEAM[r.item_type]) r.team = IDO_GA_TEAM[r.item_type];
		});
		const c = gaConflicts(frm.doc.personal_agenda);
		if (c.length) frappe.msgprint({ title: __("Scheduling conflicts"), indicator: "orange",
			message: gaConflictHtml(c, frappe.boot.lang === "en" ? "en" : "ar") });
	},
});

function gaCheck(frm) {
	const c = gaConflicts(frm.doc.personal_agenda);
	if (!c.length) return frappe.msgprint({ title: __("Check Conflicts"), indicator: "green", message: __("No overlaps found.") });
	frappe.msgprint({ title: __("Scheduling conflicts"), indicator: "red",
		message: gaConflictHtml(c, frappe.boot.lang === "en" ? "en" : "ar") });
}

async function gaPullSessions(frm) {
	if (!frm.doc.event) return frappe.msgprint(__("This registration has no event."));
	const sessions = await frappe.db.get_list("IDO Session", { filters: { event: frm.doc.event },
		fields: ["name","title","title_ar","day","start_time","end_time","hall","session_type"],
		order_by: "date asc, start_time asc", limit: 200 });
	if (!sessions.length) return frappe.msgprint(__("This event has no sessions yet."));
	const have = new Set((frm.doc.personal_agenda || []).map(r => r.session).filter(Boolean));
	let added = 0;
	sessions.forEach(function (s) {
		if (have.has(s.name)) return;
		const c = frm.add_child("personal_agenda");
		c.event_day = String(s.day || ""); c.start_time = s.start_time; c.end_time = s.end_time;
		c.item_type = "session"; c.session = s.name; c.title = s.title_ar || s.title;
		c.location = s.hall || ""; c.team = "usher"; c.priority = "High";
		added++;
	});
	frm.refresh_field("personal_agenda");
	gaRender(frm);
	const c = gaConflicts(frm.doc.personal_agenda);
	frappe.show_alert({ message: __("{0} session(s) added", [added]), indicator: added ? "green" : "blue" });
	if (c.length) frappe.msgprint({ title: __("Scheduling conflicts"), indicator: "orange",
		message: gaConflictHtml(c, frappe.boot.lang === "en" ? "en" : "ar") });
}

async function gaGenerateTasks(frm) {
	const rows = (frm.doc.personal_agenda || []).filter(r => !r.generated_task && (r.title || r.session));
	if (!rows.length) return frappe.msgprint(__("Nothing new to generate."));
	const conflicts = gaConflicts(frm.doc.personal_agenda);
	const proceed = function () { gaDoGenerate(frm, rows); };
	if (conflicts.length) {
		const d = new frappe.ui.Dialog({ title: __("Scheduling conflicts"), size: "large",
			primary_action_label: __("Generate anyway"),
			primary_action: function () { d.hide(); proceed(); } });
		$(gaConflictHtml(conflicts, frappe.boot.lang === "en" ? "en" : "ar")
			+ '<div style="font-size:12.5px;color:var(--text-muted)">' + __("Fix the overlaps first, or continue if they are intentional.") + "</div>").appendTo(d.body);
		d.show();
		return;
	}
	proceed();
}

async function gaDoGenerate(frm, rows) {
	const gname = frm.doc.guest_name || frm.doc.guest;
	let ok = 0; const failed = [];
	for (const r of rows) {
		const label = IDO_GA_TYPE[r.item_type] ? IDO_GA_TYPE[r.item_type][0] : (r.item_type || "");
		const date = (window.__gaDays || {})[String(r.event_day)] || null;
		try {
			const res = await frappe.call({ method: "frappe.client.insert", args: { doc: {
				doctype: "IDO Task",
				subject: "مرافقة " + gname + " — " + (r.title || label),
				event: frm.doc.event, guest: frm.doc.guest,
				team: r.team || IDO_GA_TEAM[r.item_type] || "protocol",
				assigned_to: r.owner_user || null,
				status: "open", priority: r.priority || "High",
				due_date: date, full_day: 0, due_from: r.start_time, due_to: r.end_time,
				event_day: parseInt(r.event_day) || null,
				source_type: "guest_agenda", source_doctype: "IDO Registration", source_name: frm.doc.name,
				details: [label, r.location ? "المكان: " + r.location : "", r.notes || ""].filter(Boolean).join(" · ")
			} } });
			r.generated_task = res.message.name;
			if (r.owner_user) {
				try { await frappe.call({ method: "frappe.desk.form.assign_to.add", args: { doctype: "IDO Task",
					name: res.message.name, assign_to: JSON.stringify([r.owner_user]), description: res.message.subject } }); } catch (e) {}
			}
			ok++;
		} catch (e) {
			let m = ""; try { m = JSON.parse(e.responseJSON._server_messages).map(x => JSON.parse(x).message).join(" "); }
			catch (_) { m = String((e.responseJSON && e.responseJSON.exception) || e.message || ""); }
			failed.push((r.title || label) + ": " + m.replace(/<[^>]+>/g, "").slice(0, 80));
		}
	}
	frm.refresh_field("personal_agenda");
	if (ok) await frm.save();
	gaRender(frm);
	frappe.msgprint({ title: __("Agenda tasks"), indicator: ok ? "green" : "red",
		message: __("Created: {0} · Failed: {1}", [ok, failed.length]) + (failed.length ? "<br><br>" + failed.join("<br>") : "") });
}

function gaRender(frm) {
	const w = frm.get_field("agenda_html_guest");
	if (!w) return;
	const lang = frappe.boot.lang === "en" ? "en" : "ar";
	const rows = (frm.doc.personal_agenda || []).slice().sort(function (a, b) {
		return (parseInt(a.event_day||0) - parseInt(b.event_day||0)) || (gaMins(a.start_time) - gaMins(b.start_time));
	});
	const esc = s => frappe.utils.escape_html(String(s == null ? "" : s));
	if (!rows.length) { w.$wrapper.html('<div style="padding:20px;text-align:center;color:var(--text-muted)">' + __("No agenda items yet — use Pull Event Sessions or add rows manually.") + "</div>"); return; }
	const conflicts = gaConflicts(rows);
	const clash = new Set();
	conflicts.forEach(c => { clash.add(c.a.name); clash.add(c.b.name); });
	let html = conflicts.length ? gaConflictHtml(conflicts, lang) : "";
	const days = [...new Set(rows.map(r => String(r.event_day || "")))];
	days.forEach(function (d) {
		const items = rows.filter(r => String(r.event_day || "") === d);
		const date = (window.__gaDays || {})[d];
		html += '<div style="margin-bottom:12px;border:1px solid var(--border-color);border-radius:10px;overflow:hidden">'
			+ '<div style="background:linear-gradient(135deg,#7A4AB8,#3B1A63);color:#fff;padding:8px 13px;font-size:13px;font-weight:700;display:flex;justify-content:space-between">'
			+ "<span>" + (d ? __("Day") + " " + esc(d) : __("Unscheduled")) + (date ? " · " + esc(frappe.datetime.str_to_user(date)) : "") + "</span>"
			+ '<span style="opacity:.85;font-weight:500">' + items.length + "</span></div>"
			+ '<table class="table table-sm" style="margin:0;font-size:12.5px"><tbody>';
		items.forEach(function (r) {
			const label = IDO_GA_TYPE[r.item_type] ? IDO_GA_TYPE[r.item_type][lang === "ar" ? 0 : 1] : (r.item_type || "");
			const bad = clash.has(r.name);
			html += '<tr' + (bad ? ' style="background:#fdf2f2"' : "") + ">"
				+ '<td style="white-space:nowrap;color:' + (bad ? "#c93a3a" : "#5C2D91") + ';font-weight:600;width:112px">'
				+ (bad ? "⚠ " : "") + gaHm(r.start_time) + (r.end_time ? "–" + gaHm(r.end_time) : "") + "</td>"
				+ "<td><b>" + esc(r.title || label) + "</b>"
				+ (r.location ? '<div style="font-size:11px;color:var(--text-muted)">' + esc(r.location) + "</div>" : "") + "</td>"
				+ '<td style="width:100px;font-size:11.5px;color:var(--text-muted)">' + esc(label) + "</td>"
				+ '<td style="width:150px;font-size:11.5px">' + (r.owner_user ? esc(r.owner_user) : '<span style="color:#c93a3a">' + __("unassigned") + "</span>") + "</td>"
				+ '<td style="width:70px">' + (r.generated_task ? '<span style="color:#1F9D63;font-size:11px">✓ ' + __("task") + "</span>" : '<span style="color:#B4770F;font-size:11px">—</span>') + "</td></tr>";
		});
		html += "</tbody></table></div>";
	});
	w.$wrapper.html('<div style="max-height:460px;overflow:auto">' + html + "</div>");
}
